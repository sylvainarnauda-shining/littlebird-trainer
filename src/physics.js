/* Flight model v6: reduced-order model identified on two reference recordings
   of the game (docs/analyse/vol.md). Original code; it contains no game code or
   data files. Values marked "measured" were fitted on the HUD of the recordings;
   the others are assumptions or playability choices, marked as such. */
(function(root) {
  const T = typeof module !== 'undefined' ? require('./vendor/three.min.js') : root.THREE;
  const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
  const G = 9.81;
  // Individual hit values read on the recordings (42 hits, 5 passes on light
  // vehicles, some with an occupant). "Observed distribution" draws from it.
  const OBSERVED_HITS = [36.01,36.02,85.81,36.02,150.02,18.01,36.01,
    78.01,36.01,78.02,150.01,150.02,36.01,74.12,30.01,54.02,36.01,36.01,
    30.01,78.01,36.01,85.82,85.81,30.01,85.81,54.02,36.01,36.01,30.02,30.02,36.02,74.12,36.01,85.82,36.02,
    36.02,36.01,30.02,150.02,36.02,30.02,85.81];
  const defaults = {
    // Player settings of the game's helicopter mouse control (sensitivities in %, air-vehicle multiplier, inverted
    // Y axis, axis isolation), with the same names and units as the game's settings page. Public defaults
    // (docs/REGLAGES.md): multiplier 0.5 as a guide gives the game's default (read); Y axis not inverted,
    // sensitivities 50 % and isolation 0 (chosen: the guides do not document the game's defaults).
    pitchSens:50, yawSens:50, vehicleMultiplier:0.5, gain:0.05, invertY:false,
    isolation:0, mouseReturn:2.4,
    // Mouse law (v13, docs/analyse/souris.md). 'rate' (default): the pointer movement of a frame commands a rotation
    // rate, K = mouseRateScale x (sens/100) x vehicleMultiplier x mouseFine deg per cursor px. Measured on 43 fast
    // crossings of the aim point in the reference recordings (pitch key never pressed): K 0.0271 deg/px at their
    // pitch sensitivity product (sens/100 x multiplier) of 0.08 (CI90 0.0221-0.0343), so scale 0.339 = K / 0.08
    // (CI90 0.276-0.429; the first v13 build used 0.271, from a wrong reading of that product). Assumed: the game's
    // K is proportional to its settings (not checked in the game yet). Lag mouseLag 0.10 s (CI90 0.05-0.20, not
    // identified); crossing-curve rms 17.1 (v12 stick replayed at the recordings' settings) -> 2.4 deg/s, peak
    // 0.20 s (game 0.22 s). mouseYawScale assumed equal to pitch (13 horizontal crossings: not identifiable).
    // mouseClamp: mouse + keys capped at the key rates 52/36 deg/s (assumed). mouseFine: fine factor limited to
    // x0.7-1.4 (chosen; covers the K CI90, x0.81-1.26). K is per accelerated cursor px: pointer lock without
    // unadjustedMovement. 'stick' = the v12 leaky virtual stick (gain, mouseReturn, boosts below).
    mouseLaw:'rate', mouseRateScale:0.339, mouseYawScale:0.339, mouseLag:0.10, mouseFine:1, mouseClamp:true,
    // Rotation, measured: rate command, two first-order lags, attitude held.
    // Roll 80 deg/s (clicks), yaw 36 deg/s (D key), pitch ~52 deg/s (S key,
    // triangle scale 0.40 deg/px); lags 0.30 s + 0.40 s on pitch and roll; no auto-levelling.
    pitchRate:52, rollRate:80, yawRate:36, cyclicResponse:0.30, response:0.40,
    // Yaw lags (v13, measured): the chase-view tape is the camera (0.30 s behind the airframe), so the v6
    // fit 0.30 + 0.40 s already held the camera lag: the airframe keeps one lag (cyclic lag skipped).
    // 8 chase D presses: rms 5.90 -> 4.64 deg/s with 0.40 (gain 1.24 +- 0.56, 2.2 SE). responseYaw 0.35 chosen
    // inside the measured CI90 0.35-0.70 for M6 (chase heading after D from hover, game 7.4-9.0 / 31.1-32.5 deg
    // at 0.73 / 1.47 s, n=3): 8.4 / 30.5 (0.40 gave 7.8 / 29.1, 29.0 as rendered, under the 29.1 bound; v12
    // 3.7 / 20.4); chase D rms 4.72 (+0.07, bootstrap SE 0.56: no measurable cost). Free single-lag fit
    // 0.55-0.6 s: to be confirmed by cockpit yaw steps, which the reference recordings lack. null = v12 lags.
    cyclicYaw:0, responseYaw:0.35,
    // Mouse amplification keeps the v3 small-movement mouse feel while the
    // maximum rate stays the measured one (v12 virtual stick only).
    mouseYawBoost:1.8, mousePitchBoost:1.65, stability:0,
    // Collective lever (HUD arcs, -1..1), measured: Z +3/s, Shift -1/s, and an
    // automatic hold when released: lever' = -0.098*Vz - 0.075*Az. v13 measured
    // 0.886/s under Shift (27 presses, CI90 0.814-0.984) but it gives no held-out
    // gain: 1/s kept until the Shift steps are recorded.
    altitudeHold:true, collectiveUpRate:3, collectiveDownRate:1, holdGain:0.098, holdDamping:0.075,
    // Lever at hover thrust (v13, measured): steady-hover median -0.133 (n=653 frames), -0.14 in level flight
    // at 0-15 km/h (n=194); held-out gain 0.84 +- 0.19 (4.4 SE, 15/18 blocks). The authorities are rescaled
    // (7.02 above, 4.07 below) so that lever +-1 keeps the 8.9 / 3.9 m/s hover climb / descent limits.
    leverHover:-0.14,
    // Translation, fitted on speed and vertical speed: tilt-compensated thrust
    // g + 8*(lever-h)/(1-h) above hover, g + 3.5*(lever-h)/(1+h) below, h = leverHover
    // (asymmetric authority: 8.9 m/s climb, 3.9 m/s descent in hover at lever +-1;
    // v12: h = 0), quadratic drag, vertical damping and damping of the airflow along
    // the rotor axis.
    collectiveAccel:8, collectiveDownAccel:3.5, verticalDamping:0.3, drag:0, quadraticDrag:0.0003,
    bodyFlowDrag:0.6, lateralDrag:0.12, weathervane:1, hoverAssist:0,
    // View: horizontal fields of view, as the game's settings give them (first and third person
    // vehicle fields of view; public default 90 as a guide gives the game's, read, low confidence;
    // the recordings measured about 89, i.e. 58 deg vertical at 16:9). No
    // camera vibration and no widening in the pilot view: the cockpit stays still on the recordings
    // from 42 to 272 km/h (docs/analyse/graphismes.md). The chase view widens and backs off with
    // speed (v13, measured, app.js CHASE_ZOOM): chaseSpeedView.
    fovCockpit:90, fovChase:90, cameraMotion:0, speedFov:0, chaseSpeedView:true,
    // Weapons: 25 rounds/s and 0.35 s spin-up measured; ballistics not measured.
    bulletSpeed:800, rpm:1500, spinUp:0.35, spread:0.35, gunConvergence:300, impactDamage:0,
    targetSpeed:65, targetDistance:220, targetSize:1, targetCount:4,
    targetAltitude:70, trajectory:'evasive', scenario:'air', volume:0.22,
    showMarkers:true, duration:120, dpi:800, airHealth:120, groundHealth:180,
    indestructible:false, baseHealth:60
  };
  // Ground height of the practice valley (world.js); y = 0 on the helipad.
  const World = typeof module !== 'undefined' ? require('./world.js') : root.HeliWorld;
  function terrain(x,z) { return World.height(x,z); }
  const X=new T.Vector3(1,0,0), Y=new T.Vector3(0,1,0), Z=new T.Vector3(0,0,-1), DEG=Math.PI/180;
  // First-order lag factor over dt; tau null/undefined falls back to the shared value, tau <= 0 = no lag.
  const lagFactor=(dt,tau,fallback)=>{const t=tau===null||tau===undefined?fallback:tau;return t<=0?1:1-Math.exp(-dt/Math.max(.001,t));};
  class Flight {
    // ground(x,z) defaults to the valley; flight-dynamics tests pass flat ground.
    constructor(cfg,ground=terrain) { this.cfg=cfg; this.ground=ground; this.reset(); }
    reset(height=70) {
      this.position=new T.Vector3(0,height,130); this.velocity=new T.Vector3();
      this.quaternion=new T.Quaternion(); this.angular=new T.Vector3(); this.cyclic=new T.Vector3(); this.mouseRate=new T.Vector3();
      // Lever at hover thrust: the HUD arc sits leverHover below its centre mark in hover (v13, measured).
      this.collective=this.cfg.leverHover||0; this.verticalAccel=0; this.lift=G; this.sideslip=0;
      this.onGround=false; this.crashed=false; this.time=0;
    }
    // Nose drawn toward the horizontal flight path. Time constant 1.1 s at
    // 200 km/h, scaling with 1/V^2: negligible in hover, firm at top speed.
    // Estimated from heading rate vs bank; mouse inputs blur this estimate.
    weathervaneRate() {
      const c=this.cfg,v=this.velocity,vh=Math.hypot(v.x,v.z);
      this.sideslip=0;
      if(!(c.weathervane>0)||vh<8) return 0;
      const f=Z.clone().applyQuaternion(this.quaternion);
      if(Math.hypot(f.x,f.z)<.2) return 0;
      const nose=Math.atan2(-f.x,-f.z),path=Math.atan2(-v.x,-v.z);
      const beta=Math.atan2(Math.sin(path-nose),Math.cos(path-nose));
      this.sideslip=beta;
      const tau=1.1*((55.6/vh)*(55.6/vh));
      return clamp(beta*c.weathervane/tau,-.6,.6);
    }
    step(dt,input) {
      if(this.crashed) return;
      const c=this.cfg; this.time+=dt;
      // 1. Collective lever. Released in flight: automatic hold on vertical
      // speed and acceleration (identified law). On the ground: idle (-1).
      // A joystick axis bound to the collective (joystickMix) gives the lever position itself: input.lever, or null to
      // keep the lever where it is until that stick has reported; the keys then do not move it (law L, SUPPOSED).
      const command=input.collective||0;
      if(input.lever!==undefined){if(input.lever!==null)this.collective=clamp(input.lever,-1,1);}
      else if(command>0) this.collective=Math.min(1,this.collective+c.collectiveUpRate*dt);
      else if(command<0) this.collective=Math.max(-1,this.collective-c.collectiveDownRate*dt);
      else if(this.onGround) this.collective=Math.max(-1,this.collective-c.collectiveDownRate*dt);
      else if(c.altitudeHold) this.collective=clamp(this.collective-(c.holdGain*this.velocity.y+c.holdDamping*this.verticalAccel)*dt,-1,1);
      // 2. Rotation: key rate command through the cyclic lag (yaw: cyclicYaw, v13), the mouse rate of the
      // 'rate' law through its own lag, added after the cyclic lag and capped with the keys at the key rates,
      // then the airframe lag (yaw: responseYaw). Per-axis lags equal to the shared ones give v12 exactly.
      const inverse=this.quaternion.clone().invert();
      const desired=new T.Vector3(input.pitch*c.pitchRate,input.yaw*c.yawRate,input.roll*c.rollRate).multiplyScalar(Math.PI/180);
      if(c.stability>0) {
        const u=Y.clone().applyQuaternion(inverse);
        desired.x+=u.z*c.stability*(1-Math.abs(input.pitch));
        desired.z-=u.x*c.stability*(1-Math.abs(input.roll));
      }
      const cy=this.cyclic,ac=lagFactor(dt,c.cyclicResponse,.3),ay=lagFactor(dt,c.cyclicYaw,c.cyclicResponse);
      cy.x+=(desired.x-cy.x)*ac; cy.y+=(desired.y-cy.y)*ay; cy.z+=(desired.z-cy.z)*ac;
      const target=this.cyclic.clone(),vane=this.weathervaneRate();
      if(input.mousePitchRate!==undefined||input.mouseYawRate!==undefined) {
        const a=lagFactor(dt,c.mouseLag,.1),m=this.mouseRate;
        m.x+=((input.mousePitchRate||0)*DEG-m.x)*a; m.y+=((input.mouseYawRate||0)*DEG-m.y)*a;
        target.x+=m.x; target.y+=m.y;
        if(c.mouseClamp!==false){target.x=clamp(target.x,-c.pitchRate*DEG,c.pitchRate*DEG);target.y=clamp(target.y,-c.yawRate*DEG,c.yawRate*DEG);}
      }
      if(vane) target.add(new T.Vector3(0,vane,0).applyQuaternion(inverse));
      const an=this.angular,ar=lagFactor(dt,c.response,.4),ayr=lagFactor(dt,c.responseYaw,c.response);
      an.x+=(target.x-an.x)*ar; an.y+=(target.y-an.y)*ayr; an.z+=(target.z-an.z)*ar;
      const rate=this.angular.length();
      if(rate>1e-8) this.quaternion.multiply(new T.Quaternion().setFromAxisAngle(this.angular.clone().divideScalar(rate),rate*dt)).normalize();
      // 3. Translation. Thrust along the rotor axis, scaled so that its vertical
      // part is g + authority*(lever - leverHover) (no altitude loss from bank alone,
      // limited to 60 deg). Airflow across the airframe's vertical axis is
      // damped: at speed the path follows the nose (zoom climbs, dives).
      const up=Y.clone().applyQuaternion(this.quaternion),right=X.clone().applyQuaternion(this.quaternion);
      const lh=c.leverHover||0,l=this.collective-lh;
      const authority=l>0?c.collectiveAccel/(1-lh):(c.collectiveDownAccel??c.collectiveAccel)/(1+lh);
      const thrust=Math.max(0,G+authority*l)/Math.max(up.y,.5);
      const v=this.velocity,speed=v.length();
      const accel=up.clone().multiplyScalar(thrust);
      accel.y-=G;
      accel.addScaledVector(v,-(c.drag+c.quadraticDrag*speed));
      accel.y-=c.verticalDamping*v.y;
      accel.addScaledVector(up,-c.bodyFlowDrag*v.dot(up));
      accel.addScaledVector(right,-c.lateralDrag*v.dot(right));
      if(c.hoverAssist>0&&Math.abs(input.pitch)+Math.abs(input.roll)<.12) {
        accel.x-=v.x*c.hoverAssist; accel.z-=v.z*c.hoverAssist;
      }
      this.lift=thrust; this.verticalAccel=accel.y;
      v.addScaledVector(accel,dt); this.position.addScaledVector(v,dt);
      // 4. Ground contact (unchanged criteria): hard landing or tilt crashes.
      const floor=this.ground(this.position.x,this.position.z)+1.25;
      if(this.position.y<floor) {
        if(v.y<-4.5||up.y<.85||Math.hypot(v.x,v.z)>12) this.crashed=true;
        this.position.y=floor; v.y=Math.max(0,v.y);
        v.x*=Math.exp(-3*dt); v.z*=Math.exp(-3*dt);
        this.onGround=true; this.verticalAccel=0;
      } else if(this.position.y>floor+.05) this.onGround=false;
    }
    // Instrument angles in degrees (YXZ Euler: heading, pitch nose-up +, bank right +).
    attitude() { return attitudeOf(this.quaternion); }
  }
  function attitudeOf(q) {
    const e=new T.Euler().setFromQuaternion(q,'YXZ');
    const heading=((-e.y*180/Math.PI)%360+360)%360;
    return {heading,pitch:e.x*180/Math.PI,bank:-e.z*180/Math.PI};
  }
  // ---- Input path (v13): pure functions of an input state, shared by app.js and the replay engine of the
  // fidelity tests (tests/fidelity/lib/replay.js: same operations, checked step for step).
  // mouseMove: one pointer-locked mousemove (movementX/Y, px). Stick law = v12 app.js (accumulated deflection,
  // +-1); rate law = the movement is summed until the frame starts.
  function createInputState(){return {mousePitch:0,mouseYaw:0,accX:0,accY:0,accT:0,ratePitch:0,rateYaw:0};}
  function resetInput(s){s.mousePitch=0;s.mouseYaw=0;s.accX=0;s.accY=0;s.accT=0;s.ratePitch=0;s.rateYaw=0;return s;}
  function mouseMove(s,cfg,dx,dy){
    if(cfg.isolation){if(Math.abs(dx)>Math.abs(dy))dy*=1-cfg.isolation;else dx*=1-cfg.isolation;}
    if(cfg.mouseLaw==='rate'){s.accX+=dx;s.accY+=dy;return s;}
    s.mouseYaw=clamp(s.mouseYaw-dx*cfg.yawSens/100*cfg.vehicleMultiplier*cfg.gain,-1,1);
    s.mousePitch=clamp(s.mousePitch+dy*(cfg.invertY?1:-1)*cfg.pitchSens/100*cfg.vehicleMultiplier*cfg.gain,-1,1);
    return s;
  }
  // Pointer without capture (compatibility mode): the offset from the anchor is the stick deflection.
  function mouseStick(s,cfg,dx,dy){
    if(cfg.isolation){if(Math.abs(dx)>Math.abs(dy))dy*=1-cfg.isolation;else dx*=1-cfg.isolation;}
    s.mouseYaw=clamp(0-dx*cfg.yawSens/100*cfg.vehicleMultiplier*cfg.gain,-1,1);
    s.mousePitch=clamp(0+dy*(cfg.invertY?1:-1)*cfg.pitchSens/100*cfg.vehicleMultiplier*cfg.gain,-1,1);
    return s;
  }
  // Start of a rendered frame (rate law): the movement summed since the last consumed frame becomes the commanded
  // rate (deg/s), held over the frame's 1/120 s steps. steps = number of steps this frame runs (app.js animate): the
  // rate is the movement over their simulated time, so a flick turns exactly K x px whatever the frame/step phase
  // (the wall-clock frame time gave -18 % / +12 % on 4-frame flicks, measured). true: one frame of
  // known duration (frame time = step time, e.g. 1/60 s and 2 steps). 0 / false: no step, the movement is kept for the
  // next frame (display above 120 Hz), so no movement is lost.
  function frameStart(s,cfg,frameDt,steps=true){
    if(cfg.mouseLaw!=='rate')return s;
    s.accT+=frameDt;if(!steps)return s;
    const span=typeof steps==='number'?steps/120:s.accT,k=cfg.vehicleMultiplier*clamp(cfg.mouseFine??1,.7,1.4)/Math.max(span,1e-4);
    s.ratePitch=s.accY*(cfg.invertY?1:-1)*cfg.mouseRateScale*cfg.pitchSens/100*k;
    s.rateYaw=-s.accX*cfg.mouseYawScale*cfg.yawSens/100*k;
    s.accX=0;s.accY=0;s.accT=0;return s;
  }
  // One physics step: keys = function(action) or {action: 0/1}. Rate law: the frame's rates go to
  // Flight.step as mousePitchRate/mouseYawRate. Stick law (and compatibility mode): v12 app.js input,
  // the captured stick decaying at exp(-mouseReturn t).
  function inputStep(s,cfg,keys,dt,fuelOut=false,compat=false){
    const k=typeof keys==='function'?keys:n=>keys[n]?1:0;
    const input={pitch:clamp(s.mousePitch*cfg.mousePitchBoost+k('pitchUp')-k('pitchDown'),-1,1),yaw:clamp(s.mouseYaw*cfg.mouseYawBoost+k('yawLeft')-k('yawRight'),-1,1),roll:k('rollLeft')-k('rollRight'),collective:fuelOut?-1:k('collectiveUp')-k('collectiveDown')};
    if(cfg.mouseLaw==='rate'&&!compat){input.mousePitchRate=s.ratePitch;input.mouseYawRate=s.rateYaw;}
    else if(!compat){s.mousePitch*=Math.exp(-cfg.mouseReturn*dt);s.mouseYaw*=Math.exp(-cfg.mouseReturn*dt);}
    return input;
  }
  // ---- Joystick input path (J1). Pure functions of the pads one frame read (navigator.getGamepads(), copied by
  // snapshotPads), of the player's joystick profile and of a small state: no DOM, no clock, no Math.pow. app.js polls
  // once per rendered frame, and only while a session flies with the HOTAS on or while the joystick test view of the
  // menu reads; the keyboard and mouse path above stays as it is, and joystickMix touches an input field only for a
  // non-zero stick command (or a bound collective axis), so that keys and mouse fly bit for bit the same without a stick.
  // Devices: 'main' is the one device the game reads (a virtual device such as vJoy fed by a remapper, a single stick,
  // any HID joystick); 'left' and 'right' are two physical sticks, told apart by a trigger press (two identical sticks
  // have the same Gamepad id and no serial number). Response laws: baseline B0, every part SUPPOSED until measured in
  // the game (shown "supposé" in the page): the processed deflection goes into the key channel (rate command, full
  // deflection = the key rate), dead zone rescaled over the half axis, sensitivity as a gain then a clamp, the
  // collective axis gives the lever position (law L), the look axes give the view angle within the free-look limits,
  // stick commands are added to the keys and mouse and clamped to +-1 (sumClamp).
  // Signs: the game's convention (+ = nose up, right bank, nose right, collective up, look right, look up) up to the
  // bridge at the end of joyFrame; the trainer's roll and yaw are +1 = LEFT (inputStep), and its free look yaw too.
  const JOY_AXES=['Pitch','Throttle','Roll','Yaw','LookYaw','LookPitch'];   // the game's settings file order (read)
  const JOY_REFS=['main','left','right'];
  // Trainer actions a joystick button may drive (the key-binding actions of app.js).
  const JOY_ACTIONS=['fire','flares','freeLook','view','shop','reset','neutral','collectiveUp','collectiveDown','pitchUp','pitchDown','yawLeft','yawRight','rollLeft','rollRight'];
  // Action names of the game's joystick section -> trainer action (read in a game settings file; the game's other
  // actions have no trainer counterpart and are listed by the import preview).
  const GAME_ACTIONS={Fire:'fire',Flares:'flares',ToggleCameraMode:'view'};
  // Bounds (chosen until the game's slider ranges are captured); Chromium exposes at most 16 axes and 128 buttons.
  const JOY_BOUNDS={sensitivity:[.1,3],deadZone:[0,.95],axis:15,button:127,slot:7,name:64,pads:8};
  // B0 (SUPPOSED, zero fitted parameter): the free-look limits are the mouse free look's (app.js, chosen).
  const JOY_LAW={status:'supposé',deadZone:'scaled',reference:'half',stick:'rate',collective:'absolute',look:'absolute',mix:'sumClamp',merge:'largest',lookYaw:2.6,lookPitch:1.1};
  // Factory values read in the game's settings file: no device, sensitivity 1.0, dead zone 0.05, no inversion; the
  // unassigned axes keep indices 2 (collective) and 5 (yaw); Pitch 1 / Roll 0 (the classic X / Y template) assumed.
  const JOY_AXIS_INDEX={Pitch:1,Throttle:2,Roll:0,Yaw:5,LookYaw:-1,LookPitch:-1};
  // vJoy's virtual device (read: the vJoy project's HID vendor and product) is the main device when none is named.
  const VJOY={vendor:'1234',product:'bead'};
  // Thrustmaster T.16000M FCS (USB 044F:B10A; B10B = the left-handed identity of its TARGET software): hat switch on
  // axis 9 (HID usage 0x39 - 0x30, read in Chromium's source); its zero-initialised hat tells a stick that has not
  // reported yet (freshness).
  const HAT_PRESETS=[{vendor:'044f',products:['b10a','b10b'],hat:9}];
  const HAT_DIRS=['up','upRight','right','downRight','down','downLeft','left','upLeft'];
  const HAT_HAS={up:['upLeft','up','upRight'],right:['upRight','right','downRight'],down:['downRight','down','downLeft'],left:['downLeft','left','upLeft']};
  // Freshness fallback: after this many reports with the hat still at exactly 0 (Chromium's sanitiser may keep a hat at
  // 0 for ever), the timestamp rule applies and the pad is reported with a mute hat (chosen).
  const HAT_MUTE=8;
  const hex4=h=>h.toLowerCase().padStart(4,'0');
  const cleanName=n=>String(n==null?'':n).replace(/[^\x20-\x7e\u00a0-\u024f]/g,'').trim().slice(0,JOY_BOUNDS.name);
  // Chromium: "Name (Vendor: 044f Product: b10a)" (standard pads: "Name (STANDARD GAMEPAD Vendor: 045e Product: 028e)");
  // Firefox: "44f-b10a-Name". Neither carries a serial number.
  function parseGamepadId(id){
    const s=String(id==null?'':id).slice(0,200),open=s.lastIndexOf('(');
    const m=open>=0?/(?:^|\s)Vendor: ([0-9a-f]{1,4}) Product: ([0-9a-f]{1,4})\)\s*$/i.exec(s.slice(open+1)):null;
    if(m)return {name:cleanName(s.slice(0,open)),vendor:hex4(m[1]),product:hex4(m[2]),format:'chromium'};
    const f=/^([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i.exec(s);
    if(f)return {name:cleanName(s.slice(f[0].length)),vendor:hex4(f[1]),product:hex4(f[2]),format:'firefox'};
    return {name:cleanName(s),vendor:null,product:null,format:'unknown'};
  }
  // The game's DeviceIdentifier "VVVV:PPPP:Name" (no instance either); "" = no device.
  function parseGameIdentifier(s){
    const m=/^([0-9a-f]{4}):([0-9a-f]{4}):([^"\r\n]{0,64})$/i.exec(String(s==null?'':s));
    return m?{vendor:m[1].toLowerCase(),product:m[2].toLowerCase(),name:cleanName(m[3])}:null;
  }
  const gameIdentifier=d=>d&&d.vendor&&d.product?`${d.vendor.toUpperCase()}:${d.product.toUpperCase()}:${d.name||''}`:'';
  const sameModel=(a,b)=>!!(a&&b&&a.vendor&&a.vendor===b.vendor&&a.product===b.product);
  const isVirtual=p=>sameModel(p,VJOY);
  // Axis of a pad's hat switch for the freshness rule: the presets only (another device may have no hat at all).
  function presetHat(p){const h=HAT_PRESETS.find(x=>x.vendor===p.vendor&&x.products.includes(p.product));return h&&p.axes.length>h.hat?h.hat:-1;}
  // A device model of the profile, from a pad or from the game's identifier: Chromium puts any HID hat on axis 9.
  const modelOf=p=>({vendor:p.vendor,product:p.product,name:cleanName(p.name),slotHint:Number.isInteger(p.index)&&p.index>=0&&p.index<=JOY_BOUNDS.slot?p.index:0,hatAxis:9});
  // navigator.getGamepads() -> plain copies (another browser may hand out live objects): at most 8 pads, 16 axes, 128
  // buttons; a non-finite value reads 0; disconnected entries are skipped.
  function snapshotPads(list){
    const out=[],n=list&&typeof list.length==='number'?Math.min(list.length,16):0;
    for(let i=0;i<n&&out.length<JOY_BOUNDS.pads;i++){
      const g=list[i];if(!g||typeof g!=='object'||g.connected===false)continue;
      const d=parseGamepadId(g.id),axes=[],buttons=[],ga=g.axes||[],gb=g.buttons||[];
      for(let k=0;k<Math.min(ga.length|0,16);k++){const v=ga[k];axes.push(typeof v==='number'&&Number.isFinite(v)?v:0);}
      for(let k=0;k<Math.min(gb.length|0,128);k++){const b=gb[k];buttons.push(b&&typeof b==='object'?!!b.pressed:!!b);}
      out.push({index:Number.isInteger(g.index)?g.index:i,id:String(g.id==null?'':g.id).slice(0,200),name:d.name,vendor:d.vendor,product:d.product,format:d.format,
        mapping:String(g.mapping||'').slice(0,20),timestamp:Number.isFinite(g.timestamp)?g.timestamp:0,axes,buttons});
    }
    return out;
  }
  // ---- Axis processing (B0, SUPPOSED order: invert, dead zone, sensitivity as a gain, clamp) ----
  // Exactly +0 inside the dead zone (a centred stick adds nothing), exactly +-1 at the stops. A value beyond 1.05 is a
  // hat's null state (9/7 or 23/7), not an axis position: it reads 0; a rounding just past +-1 is the stop.
  const AXIS_LIMIT=1.05;
  function axisValue(raw,b){
    let v=typeof raw==='number'&&Math.abs(raw)<=AXIS_LIMIT?clamp(raw,-1,1):0;
    if(b.invert)v=-v;
    const dz=Number.isFinite(b.deadZone)?clamp(b.deadZone,0,JOY_BOUNDS.deadZone[1]):0,a=Math.abs(v);
    if(a<=dz)return 0;
    const m=Math.min(1,(a-dz)/(1-dz)*(b.sensitivity>0?b.sensitivity:1));
    return v<0?-m:m;
  }
  // Hat axis value -> direction, or null: centred (above 1: 1.2857 or 3.2857), not reported yet (exactly 0) or invalid.
  // Directions read 2k/7 - 1 for k = 0 (up) to 7 (up-left), clockwise.
  function decodeHat(v){
    if(typeof v!=='number'||!Number.isFinite(v)||v===0||v>1.05||v<-1.05)return null;
    const k=Math.round((v+1)*3.5);
    return k>=0&&k<=7&&Math.abs(v-(2*k/7-1))<.05?HAT_DIRS[k]:null;
  }
  const hatHas=(dir,want)=>!!dir&&Object.hasOwn(HAT_HAS,want)&&HAT_HAS[want].includes(dir);
  // ---- Freshness: until a pad has reported, Chromium shows zeros (a throttle wheel at mid-travel, a hat at exactly 0,
  // which no hat state gives); after the page was hidden its values stay stale until its timestamp changes. A preset
  // device (hat known) is live once its hat is no longer exactly 0; any other device once its timestamp has changed
  // since it was first seen. markStale (page shown again): stale until the timestamp changes.
  function createFreshness(){return new Map();}
  function freshStep(f,pads){
    const live=new Set();
    for(const p of pads){
      let s=f.get(p.index);
      if(!s||s.id!==p.id){s={id:p.id,t:p.timestamp,changes:0,stale:false,mute:false};f.set(p.index,s);}
      else if(p.timestamp!==s.t){s.t=p.timestamp;s.changes++;s.stale=false;}
      const hat=presetHat(p);let ok;
      if(hat>=0&&!s.mute){ok=p.axes[hat]!==0;if(!ok&&s.changes>=HAT_MUTE)s.mute=true;}
      if(hat<0||s.mute)ok=s.changes>0;
      if(ok&&!s.stale)live.add(p.index);
    }
    for(const i of [...f.keys()])if(!pads.some(p=>p.index===i))f.delete(i);
    return live;
  }
  function markStale(f){for(const s of f.values())s.stale=true;return f;}
  const hatMute=(f,index)=>!!(f.get(index)&&f.get(index).mute);
  // ---- Roles of two physical sticks (players without a virtual device). Identification: the first pad pressed takes
  // the role asked for ('left' first); with exactly one other pad of the same model, that one takes the other role,
  // so one press identifies a pair. Next launch: the saved slots are only a proposal; with twins the first trigger press
  // confirms or swaps it (confirm option). A stick that comes back alone takes the free role by elimination. The press
  // used for identification or confirmation is reported in 'consumed' (it must not fire).
  function createRoles(){return {left:null,right:null,confirmed:false,identify:null,prev:new Map()};}
  function startIdentify(r){r.identify='left';r.left=null;r.right=null;r.confirmed=false;return r;}
  function cancelIdentify(r){r.identify=null;return r;}
  function swapRoles(r,devices){
    [r.left,r.right]=[r.right,r.left];[devices.left,devices.right]=[devices.right,devices.left];
    for(const role of ['left','right'])if(devices[role]&&r[role]!==null)devices[role]={...devices[role],slotHint:r[role]};
    r.confirmed=r.left!==null&&r.right!==null;return r;
  }
  function rolesStep(r,devices,pads,confirm=true){
    const usable=pads.filter(p=>p.mapping!=='standard'),idx=usable.map(p=>p.index),events=[],edges=[];
    for(const p of usable){const was=r.prev.get(p.index);if(was&&p.buttons.some((b,i)=>b&&!was[i]))edges.push(p.index);r.prev.set(p.index,p.buttons.slice());}
    for(const i of [...r.prev.keys()])if(!idx.includes(i))r.prev.delete(i);
    const out=(phase,extra={})=>({phase,left:r.left,right:r.right,confirmed:r.confirmed,prompt:null,consumed:null,events,changed:false,...extra});
    for(const role of ['left','right'])if(r[role]!==null&&!idx.includes(r[role])){events.push('lost-'+role);r[role]=null;}
    const padAt=i=>usable.find(p=>p.index===i);
    if(r.identify){
      const role=r.identify,other=role==='left'?'right':'left',hit=edges.find(i=>i!==r[other]);
      if(hit===undefined)return out('identify',{prompt:'press-'+role});
      const p=padAt(hit);r[role]=hit;devices[role]=modelOf(p);
      if(role==='left'){
        const twins=usable.filter(q=>q.index!==hit&&sameModel(q,p));
        if(twins.length!==1){r.identify='right';events.push('left-identified');return out('identify',{prompt:'press-right',consumed:hit,changed:true});}
        r.right=twins[0].index;devices.right=modelOf(twins[0]);
      }
      r.identify=null;r.confirmed=true;events.push('identified');return out('ready',{consumed:hit,changed:true});
    }
    if(!devices.left&&!devices.right)return out('none');
    const twins=sameModel(devices.left,devices.right);
    for(const role of ['left','right']){
      const other=role==='left'?'right':'left';
      if(r[role]!==null||!devices[role])continue;
      const free=usable.filter(p=>sameModel(p,devices[role])&&p.index!==r[other]);
      if(!free.length)continue;
      if(free.length===1&&(!twins||r[other]!==null)){r[role]=free[0].index;events.push('found-'+role);continue;}
      // Several candidates (twins, or more pads of that model): the saved slot is a presumption only.
      const hint=free.find(p=>p.index===devices[role].slotHint)||(twins&&r[other]===null&&free.length<2?null:free[0]);
      if(hint){r[role]=hint.index;r.confirmed=false;events.push('proposed-'+role);}
    }
    const want=['left','right'].filter(role=>devices[role]),vacant=want.find(role=>r[role]===null);
    if(vacant)return out('missing',{prompt:'reconnect-'+vacant});
    if(twins&&confirm&&!r.confirmed){
      const hit=edges.find(i=>i===r.left||i===r.right);
      if(hit===undefined)return out('provisional',{prompt:'confirm-left'});
      if(hit===r.right){[r.left,r.right]=[r.right,r.left];events.push('swapped');}else events.push('confirmed');
      r.confirmed=true;
      for(const role of want)devices[role]={...devices[role],slotHint:r[role]};
      return out('ready',{consumed:hit,changed:true});
    }
    r.confirmed=true;
    let changed=false;
    for(const role of want)if(devices[role].slotHint!==r[role]&&r[role]<=JOY_BOUNDS.slot){devices[role]={...devices[role],slotHint:r[role]};changed=true;}
    return out('ready',{changed});
  }
  // The pads each device reference stands for (indices, lowest first). main: the model the profile names (an imported
  // game file names one), or with none named a vJoy device, else every joystick the page sees. deviceMatch (how the
  // game treats several pads of one model, to be measured): 'role' (default) = the first pad for main, the identified
  // roles for left and right; 'first' = the first pad of each model, roles ignored; 'any' = every pad of the model,
  // merged by joyFrame. Gamepads with the standard mapping (XInput pads) are not joysticks here.
  function resolveDevices(profile,pads,r){
    const usable=pads.filter(p=>p.mapping!=='standard').sort((a,b)=>a.index-b.index),d=profile.devices,match=profile.deviceMatch;
    const of=m=>usable.filter(p=>sameModel(p,m)).map(p=>p.index),pick=list=>match==='any'?list:list.slice(0,1);
    let main=d.main?of(d.main):usable.filter(isVirtual).map(p=>p.index);
    if(!d.main&&!main.length)main=usable.map(p=>p.index);
    const role=k=>match==='role'?(r&&r[k]!==null&&usable.some(p=>p.index===r[k])?[r[k]]:[]):d[k]?pick(of(d[k])):[];
    return {main:pick(main),left:role('left'),right:role('right')};
  }
  // The references a profile uses (bound axes, Positive / Negative sources, action buttons).
  function usedRefs(profile){
    const used=new Set(),src=s=>{if(s)used.add(s.device);};
    for(const n of JOY_AXES){const b=profile.axes[n];if(b.device&&b.axis>=0)used.add(b.device);src(b.positive);src(b.negative);}
    for(const a of Object.keys(profile.actions))for(const s of profile.actions[a])src(s);
    return used;
  }
  // ---- One frame: the six axes processed (B0), the commands in the trainer's convention, the actions held by buttons,
  // and those newly pressed or released. res: resolveDevices; live: freshStep. An axis whose device has no pad reads 0
  // ('missing'); one whose pad has not reported reads 0 too ('stale'): what it drives is held. The collective: a bound
  // axis gives the lever position while its pad is live (lever), keeps the lever where it is while it is stale (null),
  // and leaves the keys in charge while its device is absent (undefined); Positive / Negative buttons alone act like the
  // collective keys.
  function createJoyState(){return {held:new Set(),latched:new Set(),latchNext:false};}
  const flip=x=>x===0?0:-x;
  function joyFrame(state,profile,pads,res,live){
    const byIndex=new Map(pads.map(p=>[p.index,p])),padsOf=ref=>(res[ref]||[]).map(i=>byIndex.get(i)).filter(Boolean);
    const srcOn=s=>{if(!s)return 0;const m=profile.devices[s.device],hat=m&&Number.isInteger(m.hatAxis)?m.hatAxis:9;
      for(const p of padsOf(s.device)){if(!live.has(p.index))continue;if(Number.isInteger(s.button)?!!p.buttons[s.button]:hatHas(decodeHat(p.axes[hat]),s.dir))return 1;}return 0;};
    const axes={};
    for(const name of JOY_AXES){
      const b=profile.axes[name],bound=!!b.device&&b.axis>=0;let v=0,raw=null,pad=null,status='unbound';
      if(bound){
        const ps=padsOf(b.device),fresh=ps.filter(p=>live.has(p.index));
        status=!ps.length?'missing':!fresh.length?'stale':'live';
        // Several pads ('any'): the largest processed deflection wins (merge rule SUPPOSED).
        for(const p of fresh){const u=axisValue(p.axes[b.axis],b);if(raw===null||Math.abs(u)>Math.abs(v)){v=u;raw=p.axes[b.axis]===undefined?null:p.axes[b.axis];pad=p.index;}}
      }
      const pn=srcOn(b.positive)-srcOn(b.negative);
      if(pn)v=clamp(v+pn,-1,1);
      axes[name]={status,raw,value:v,pad};
    }
    const cmd={pitch:axes.Pitch.value,roll:flip(axes.Roll.value),yaw:flip(axes.Yaw.value),collective:0,lever:undefined,lookYaw:flip(axes.LookYaw.value),lookPitch:axes.LookPitch.value};
    const th=axes.Throttle;
    if(th.status==='live')cmd.lever=th.value;else if(th.status==='stale')cmd.lever=null;else cmd.collective=th.value;
    const refs={};for(const ref of usedRefs(profile))refs[ref]=padsOf(ref).length?'present':'missing';
    const raw=new Set();
    for(const a of JOY_ACTIONS){const list=Object.hasOwn(profile.actions,a)?profile.actions[a]:null;if(list&&list.some(s=>srcOn(s)))raw.add(a);}
    if(state.latchNext){state.latched=new Set(raw);state.latchNext=false;}
    for(const a of [...state.latched])if(!raw.has(a))state.latched.delete(a);
    const held=new Set([...raw].filter(a=>!state.latched.has(a))),pressed=[...held].filter(a=>!state.held.has(a)),released=[...state.held].filter(a=>!held.has(a));
    state.held=held;
    return {cmd,axes,refs,held,pressed,released};
  }
  // After a pause, at every resume and after a press used to identify the sticks: the buttons still held are ignored until
  // released (no restart, view change or burst on resume). Axes are positions: they apply at once.
  function latchButtons(state){state.latchNext=true;return state;}
  // One physics step (sumClamp, SUPPOSED): the stick commands added to the input of inputStep, each only when non-zero
  // (a centred stick leaves every field untouched, -0 included), clamped to +-1. A bound collective axis sets the lever
  // (Flight.step). Out of fuel the collective stays at -1, as with the keys.
  function joystickMix(input,cmd,fuelOut=false){
    if(cmd.pitch)input.pitch=clamp(input.pitch+cmd.pitch,-1,1);
    if(cmd.roll)input.roll=clamp(input.roll+cmd.roll,-1,1);
    if(cmd.yaw)input.yaw=clamp(input.yaw+cmd.yaw,-1,1);
    if(!fuelOut){if(cmd.lever!==undefined)input.lever=cmd.lever;else if(cmd.collective)input.collective=clamp(input.collective+cmd.collective,-1,1);}
    return input;
  }
  // "Move the axis you want": the axis of a live pad that moved more than half its travel since that pad was first seen
  // during the learning (base: Map filled here), the largest move first; null while none did. Hat null states (above 1)
  // are not axis positions.
  function learnAxis(base,pads,live){
    let best=null;
    for(const p of pads){
      if(p.mapping==='standard'||!live.has(p.index))continue;
      const b=base.get(p.index);
      if(!b||b.id!==p.id){base.set(p.index,{id:p.id,axes:p.axes.slice()});continue;}
      p.axes.forEach((v,i)=>{const w=b.axes[i];if(w===undefined||Math.abs(v)>AXIS_LIMIT||Math.abs(w)>AXIS_LIMIT)return;const d=Math.abs(v-w);if(d>.5&&(!best||d>best.delta))best={index:p.index,axis:i,delta:d};});
    }
    return best;
  }
  // ---- Profile block profile.joystick (schema 1), stored apart from settings and bindings and written only when it
  // differs from the defaults (a player without a joystick keeps byte-identical saves and exports). Public defaults =
  // the game's factory values: HOTAS off, no device.
  function defaultJoystickProfile(){
    const axes={};for(const n of JOY_AXES)axes[n]={device:null,axis:JOY_AXIS_INDEX[n],invert:false,sensitivity:1,deadZone:.05,positive:null,negative:null};
    return {schema:1,useHotas:false,deviceMatch:'role',confirmRoles:true,devices:{main:null,left:null,right:null},axes,actions:{}};
  }
  const own=(o,k)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.hasOwn(o,k)?o[k]:undefined;
  const intIn=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
  const numIn=(v,[lo,hi],d)=>typeof v==='number'&&Number.isFinite(v)?clamp(v,lo,hi):d;
  function validDevice(d){
    const vendor=own(d,'vendor'),product=own(d,'product');
    if(typeof vendor!=='string'||!/^[0-9a-f]{4}$/.test(vendor)||typeof product!=='string'||!/^[0-9a-f]{4}$/.test(product))return null;
    const slot=own(d,'slotHint'),hat=own(d,'hatAxis');
    return {vendor,product,name:cleanName(typeof own(d,'name')==='string'?own(d,'name'):''),slotHint:intIn(slot,0,JOY_BOUNDS.slot)?slot:0,hatAxis:intIn(hat,-1,JOY_BOUNDS.axis)?hat:9};
  }
  function validSource(s){
    const device=own(s,'device'),button=own(s,'button'),dir=own(s,'dir');
    if(!JOY_REFS.includes(device))return null;
    if(intIn(button,0,JOY_BOUNDS.button))return {device,button};
    if(typeof dir==='string'&&Object.hasOwn(HAT_HAS,dir))return {device,dir};
    return null;
  }
  const sourceKey=s=>s.device+':'+(Number.isInteger(s.button)?'b'+s.button:'h'+s.dir);
  // Own keys only, enums, integer ranges, clamps; one button serves one action (a later duplicate is dropped), two
  // sources per action at most. codes receives 'invalid', 'schema' or 'duplicate-button'; an absent block (undefined or
  // null) gives the defaults with no code.
  function validateJoystickProfile(x,codes=[]){
    const out=defaultJoystickProfile();
    if(x===undefined||x===null)return out;
    if(typeof x!=='object'||Array.isArray(x)){codes.push('invalid');return out;}
    if(own(x,'schema')!==1){codes.push('schema');return out;}
    if(typeof own(x,'useHotas')==='boolean')out.useHotas=own(x,'useHotas');
    if(typeof own(x,'confirmRoles')==='boolean')out.confirmRoles=own(x,'confirmRoles');
    if(['role','first','any'].includes(own(x,'deviceMatch')))out.deviceMatch=own(x,'deviceMatch');
    for(const ref of JOY_REFS)out.devices[ref]=validDevice(own(own(x,'devices'),ref));
    for(const name of JOY_AXES){
      const b=own(own(x,'axes'),name),d=out.axes[name];
      if(!b||typeof b!=='object'||Array.isArray(b))continue;
      d.device=JOY_REFS.includes(own(b,'device'))?own(b,'device'):null;
      if(intIn(own(b,'axis'),-1,JOY_BOUNDS.axis))d.axis=own(b,'axis');
      if(typeof own(b,'invert')==='boolean')d.invert=own(b,'invert');
      d.sensitivity=numIn(own(b,'sensitivity'),JOY_BOUNDS.sensitivity,d.sensitivity);
      d.deadZone=numIn(own(b,'deadZone'),JOY_BOUNDS.deadZone,d.deadZone);
      d.positive=validSource(own(b,'positive'));d.negative=validSource(own(b,'negative'));
    }
    const seen=new Set();let dup=false;
    for(const a of JOY_ACTIONS){
      const list=own(own(x,'actions'),a);if(!Array.isArray(list))continue;
      const kept=[];
      for(const s of list.slice(0,2).map(validSource)){if(!s)continue;const k=sourceKey(s);if(seen.has(k)){dup=true;continue;}seen.add(k);kept.push(s);}
      if(kept.length)out.actions[a]=kept;
    }
    if(dup)codes.push('duplicate-button');
    return out;
  }
  const isDefaultJoystickProfile=p=>JSON.stringify(p)===JSON.stringify(defaultJoystickProfile());
  // ---- The game's joystick section ([/Script/WDJoystick.WDJoystickSettings]) and its HOTAS switch. Only the named
  // fields are interpreted (DeviceIdentifier, bInvert, Sensitivity, DeadZone, Positive, Negative, Action, Binding); the
  // axis, button and hat indices have no readable name in the file and are read by position (the first and second
  // integers after DeviceIdentifier), which the import preview says. Nothing is ever written back. Limits: 400 kB,
  // lines of 20 000 characters, structures 6 deep, 4 000 fields per line, strings of 200 characters.
  function iniSection(lines,name){
    const head=lines.findIndex(l=>l.trim()==='['+name+']');if(head<0)return null;
    const body=lines.slice(head+1),end=body.findIndex(l=>/^\s*\[/.test(l));
    return end<0?body:body.slice(0,end);
  }
  function parseStruct(s){
    let i=0,depth=0,fields=0;
    const value=()=>{
      if(s[i]==='(')return struct();
      if(s[i]==='"'){const j=s.indexOf('"',i+1);if(j<0)throw Error('unterminated string');const t=s.slice(i+1,j);if(t.length>200)throw Error('string too long');i=j+1;return t;}
      let j=i;while(j<s.length&&s[j]!==','&&s[j]!==')')j++;
      const t=s.slice(i,j).trim();i=j;if(t.length>200)throw Error('value too long');return t;
    };
    const struct=()=>{
      if(s[i]!=='(')throw Error('"(" expected');if(++depth>6)throw Error('too deep');i++;
      const out=[];
      while(i<s.length&&s[i]!==')'){
        const m=/^([A-Za-z_][A-Za-z0-9_]{0,63})=/.exec(s.slice(i,i+72));let name=null;
        if(m){name=m[1];i+=m[0].length;}
        out.push([name,value()]);
        if(++fields>4000)throw Error('too many fields');
        if(s[i]===',')i++;else if(s[i]!==')')throw Error('unexpected character');
      }
      if(s[i]!==')')throw Error('unterminated structure');i++;depth--;return out;
    };
    const r=struct();if(s.slice(i).trim())throw Error('trailing text');return r;
  }
  const field=(f,n)=>{const e=f.find(([k])=>k===n);return e?e[1]:undefined;};
  const isInt=v=>typeof v==='string'&&/^-?\d{1,4}$/.test(v);
  // The integer fields right after DeviceIdentifier, in order (unnamed fields: positional).
  const intsAfter=(f,n)=>{const out=[];for(let i=f.findIndex(([k])=>k===n)+1;i>0&&i<f.length&&isInt(f[i][1]);i++)out.push(parseInt(f[i][1],10));return out;};
  function gameSource(g){
    if(!Array.isArray(g))return null;
    const device=parseGameIdentifier(field(g,'DeviceIdentifier'));if(!device)return null;
    const [button=-1,hat=-1]=intsAfter(g,'DeviceIdentifier'),token=g.find(([k,v])=>k!=='DeviceIdentifier'&&typeof v==='string'&&/^(Up|Right|Down|Left)$/.test(v));
    return {device,button,hat,dir:token?token[1].toLowerCase():null};
  }
  // -> {found, useHotas, selfCentering, axes: {Name: {device, axis, invert, sensitivity, deadZone, positive, negative}},
  //    actions: [{gameAction, action, device, button}], notes: [{code, name}]}. Throws 'too-large' over 400 kB.
  function parseGameJoystick(text){
    const t=String(text);if(t.length>400000)throw Error('too-large');
    const lines=t.replace(/^\uFEFF/,'').split(/\r?\n/),out={found:false,useHotas:null,selfCentering:null,axes:{},actions:[],notes:[]};
    const user=iniSection(lines,'/Script/WDGame.WDUserSettings');
    if(user)for(const l of user){const m=/^(bUseHOTASHelicopters|bCollectiveSelfCentering)=(True|False)\s*$/.exec(l);if(m)out[m[1]==='bUseHOTASHelicopters'?'useHotas':'selfCentering']=m[2]==='True';}
    const sec=iniSection(lines,'/Script/WDJoystick.WDJoystickSettings');
    if(!sec)return out;
    out.found=true;let positional=false;
    for(const line of sec){
      if(line.length>20000){out.notes.push({code:'line-too-long',name:null});continue;}
      const m=/^\+?([A-Za-z]{1,32})=(.*)$/.exec(line);if(!m)continue;
      const key=m[1];if(!JOY_AXES.includes(key)&&key!=='ActionBindings')continue;
      let f;try{f=parseStruct(m[2].trim());}catch(e){out.notes.push({code:'unreadable',name:key});continue;}
      if(key==='ActionBindings'){
        const action=field(f,'Action'),b=field(f,'Binding');if(typeof action!=='string'||!Array.isArray(b))continue;
        const device=parseGameIdentifier(field(b,'DeviceIdentifier')),[button=-1]=intsAfter(b,'DeviceIdentifier');positional=true;
        out.actions.push({gameAction:action.slice(0,40),action:Object.hasOwn(GAME_ACTIONS,action)?GAME_ACTIONS[action]:null,device,button});
        continue;
      }
      const num=n=>{const v=parseFloat(field(f,n));return Number.isFinite(v)?v:null;},bool=n=>{const v=field(f,n);return v==='True'?true:v==='False'?false:null;};
      const [axis=null]=intsAfter(f,'DeviceIdentifier');if(axis!==null)positional=true;
      out.axes[key]={device:parseGameIdentifier(field(f,'DeviceIdentifier')),axis,invert:bool('bInvert'),sensitivity:num('Sensitivity'),deadZone:num('DeadZone'),positive:gameSource(field(f,'Positive')),negative:gameSource(field(f,'Negative'))};
    }
    if(positional)out.notes.push({code:'positional',name:null});
    return out;
  }
  // The distinct devices a parsed section names (the import asks what each one is: main device, left or right stick).
  function gameDevices(parsed){
    const list=[],add=d=>{if(d&&!list.some(x=>sameModel(x,d)))list.push(d);};
    for(const n of JOY_AXES){const a=parsed.axes[n];if(!a)continue;add(a.device);if(a.positive)add(a.positive.device);if(a.negative)add(a.negative.device);}
    for(const x of parsed.actions)add(x.device);
    return list;
  }
  // Parsed section -> next profile. refOf(model) answers 'main' | 'left' | 'right' | null (the player's answer for each
  // device of gameDevices). The import mirrors the game: the axes it lists, its HOTAS switch, and its button actions
  // (the actions it does not list are cleared). Two devices given the same reference are refused ('conflict').
  function importGameJoystick(parsed,profile,refOf){
    const next=JSON.parse(JSON.stringify(profile)),skipped=[],conflict=[],given=new Map();
    const ref=d=>{if(!d)return null;const r=refOf(d);if(!JOY_REFS.includes(r))return null;const prev=given.get(r);
      if(prev&&!sameModel(prev,d)){if(!conflict.includes(r))conflict.push(r);return null;}
      given.set(r,d);const old=sameModel(next.devices[r],d)?next.devices[r]:null;
      next.devices[r]={...modelOf({...d,index:0}),slotHint:old?old.slotHint:0,hatAxis:old?old.hatAxis:9};return r;};
    const source=g=>{if(!g)return null;const r=ref(g.device);if(!r)return null;if(g.button>=0&&g.button<=JOY_BOUNDS.button)return {device:r,button:g.button};return g.hat>=0&&g.dir?{device:r,dir:g.dir}:null;};
    if(parsed.useHotas!==null)next.useHotas=parsed.useHotas;
    for(const n of JOY_AXES){
      const a=parsed.axes[n];if(!a)continue;const b=next.axes[n];
      if(a.axis!==null&&a.axis>=-1&&a.axis<=JOY_BOUNDS.axis)b.axis=a.axis;
      if(a.invert!==null)b.invert=a.invert;
      if(a.sensitivity!==null)b.sensitivity=clamp(a.sensitivity,...JOY_BOUNDS.sensitivity);
      if(a.deadZone!==null)b.deadZone=clamp(a.deadZone,...JOY_BOUNDS.deadZone);
      b.device=ref(a.device);b.positive=source(a.positive);b.negative=source(a.negative);
    }
    if(parsed.found)next.actions={};
    for(const x of parsed.actions){
      if(!x.action){skipped.push(x.gameAction);continue;}
      const r=ref(x.device);if(!r||x.button<0||x.button>JOY_BOUNDS.button)continue;
      next.actions[x.action]=[{device:r,button:x.button}];
    }
    const codes=[];return {profile:validateJoystickProfile(next,codes),skipped,conflict,codes};
  }
  const joystick={AXES:JOY_AXES,REFS:JOY_REFS,ACTIONS:JOY_ACTIONS,GAME_ACTIONS,BOUNDS:JOY_BOUNDS,LAW:JOY_LAW,VJOY,HAT_DIRS,
    parseGamepadId,parseGameIdentifier,gameIdentifier,sameModel,isVirtual,presetHat,modelOf,snapshotPads,axisValue,decodeHat,hatHas,
    createFreshness,freshStep,markStale,hatMute,createRoles,startIdentify,cancelIdentify,swapRoles,rolesStep,resolveDevices,usedRefs,
    createJoyState,joyFrame,latchButtons,joystickMix,learnAxis,defaultProfile:defaultJoystickProfile,validateProfile:validateJoystickProfile,
    isDefaultProfile:isDefaultJoystickProfile,iniSection,parseStruct,parseGameJoystick,gameDevices,importGameJoystick};
  // Minigun: barrels spin up before the first round (0.35 s measured), then
  // fire at the set rate while held; they spin down twice as slowly.
  class Minigun {
    constructor(cfg){this.cfg=cfg;this.reset();}
    reset(){this.spin=0;this.clock=60/Math.max(1,this.cfg.rpm);}
    step(dt,firing){
      const c=this.cfg,spinTime=Math.max(0,c.spinUp),period=60/c.rpm;
      if(firing) this.spin=spinTime>0?Math.min(1,this.spin+dt/spinTime):1;
      else this.spin=spinTime>0?Math.max(0,this.spin-dt/(2*spinTime)):0;
      if(!firing||this.spin<1){this.clock=period;return 0;}
      // The first round leaves as soon as the barrels reach firing speed.
      this.clock+=dt;let rounds=0;
      while(this.clock>=period){this.clock-=period;rounds++;}
      return rounds;
    }
  }
  function hitDamage(cfg,random=Math.random) {
    return cfg.impactDamage>0?cfg.impactDamage:OBSERVED_HITS[Math.floor(random()*OBSERVED_HITS.length)];
  }
  // Swept collision in the moving target's frame, so fast rounds cannot tunnel.
  function sweptSphere(a,b,oldCenter,center,radius) {
    const p=a.clone().sub(oldCenter), d=b.clone().sub(center).sub(p);
    const dd=d.lengthSq(), t=dd ? clamp(-p.dot(d)/dd,0,1) : 0;
    return p.addScaledVector(d,t).lengthSq()<=radius*radius;
  }
  // Broad phase only rejects distant objects. Damage uses actual model triangles.
  // Translate the old endpoint into the target's current frame to sweep its motion.
  function sweptMesh(a,b,previousPosition,object,boundRadius) {
    if(!sweptSphere(a,b,previousPosition,object.position,boundRadius))return null;
    const start=a.clone().add(object.position).sub(previousPosition);
    const direction=b.clone().sub(start),length=direction.length();
    if(length<1e-9)return null;
    const ray=new T.Raycaster(start,direction.divideScalar(length),0,length);
    const hits=ray.intersectObject(object,true);
    if(!hits.length)return null;
    const fraction=clamp(hits[0].distance/length,0,1);
    return {fraction,point:a.clone().lerp(b,fraction)};
  }
  // Continuous segment/box test, also used for scenery shielding projectiles.
  function segmentBox(a,b,box,padding=0) {
    let entry=0,exit=1;
    for(const axis of ['x','y','z']) {
      const lo=box.min[axis]-padding,hi=box.max[axis]+padding,d=b[axis]-a[axis];
      if(Math.abs(d)<1e-10){if(a[axis]<lo||a[axis]>hi)return null;continue;}
      let t0=(lo-a[axis])/d,t1=(hi-a[axis])/d;
      if(t0>t1)[t0,t1]=[t1,t0];entry=Math.max(entry,t0);exit=Math.min(exit,t1);
      if(entry>exit)return null;
    }
    return entry;
  }
  class ObstacleField {
    // Layers: compact collision sets with their own index (the forest), each
    // with a kind and hit(a,b,padding) -> {fraction,kind,owner} or null.
    constructor(){this.cells=new Map();this.items=[];this.cellSize=64;this.layers=[];}
    addLayer(layer){this.layers.push(layer);return layer;}
    add(x,y,z,w,h,d,kind='obstacle'){
      const o={min:new T.Vector3(x-w/2,y-h/2,z-d/2),max:new T.Vector3(x+w/2,y+h/2,z+d/2),kind};
      this.items.push(o);
      for(let ix=Math.floor(o.min.x/64);ix<=Math.floor(o.max.x/64);ix++)for(let iz=Math.floor(o.min.z/64);iz<=Math.floor(o.max.z/64);iz++){
        const key=ix+','+iz;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(o);
      }return o;
    }
    // ignore: optional Set of kinds to pass through (e.g. trees for missiles).
    hit(a,b,padding=0,ignore=null){
      const seen=new Set();let best=null;
      for(let ix=Math.floor((Math.min(a.x,b.x)-padding)/64);ix<=Math.floor((Math.max(a.x,b.x)+padding)/64);ix++)for(let iz=Math.floor((Math.min(a.z,b.z)-padding)/64);iz<=Math.floor((Math.max(a.z,b.z)+padding)/64);iz++){
        for(const o of this.cells.get(ix+','+iz)||[]){if(o.off||seen.has(o)||ignore&&ignore.has(o.kind))continue;seen.add(o);const fraction=segmentBox(a,b,o,padding);if(fraction!==null&&(!best||fraction<best.fraction))best={fraction,kind:o.kind,owner:o.owner||null};}
      }
      for(const layer of this.layers){if(ignore&&ignore.has(layer.kind))continue;const hit=layer.hit(a,b,padding);if(hit&&(!best||hit.fraction<best.fraction))best=hit;}
      return best;
    }
  }
  class EvasiveMotion {
    constructor(position,center,air,speed,seed=1){
      this.position=position.clone();this.center=center.clone();this.air=air;this.speed=speed;
      this.velocity=new T.Vector3();this.goal=position.clone();this.next=0;this.seed=seed>>>0;this.acceleration=new T.Vector3();
    }
    random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
    step(dt,field){
      if(this.speed<=0){this.velocity.set(0,0,0);return this.position;}
      this.next-=dt;
      if(this.next<=0||this.position.distanceTo(this.goal)<10){
        this.next=.9+this.random()*3.8;this.pace=.35+this.random()*.85;
        for(let i=0;i<16;i++){
          this.goal.set(this.center.x+(this.random()-.5)*340,this.air?Math.max(18,this.center.y+(this.random()-.5)*90):.9,this.center.z+(this.random()-.5)*220);
          this.goal.y=Math.max(this.goal.y,terrain(this.goal.x,this.goal.z)+(this.air?18:.9));
          if(!field?.hit(this.position,this.goal,this.air?7:3))break;
        }
      }
      const desired=this.goal.clone().sub(this.position).normalize().multiplyScalar(this.speed*this.pace);
      const change=desired.sub(this.velocity);const max=(this.air?10:5)*dt;
      if(change.length()>max)change.setLength(max);
      this.acceleration.copy(change).divideScalar(dt);this.velocity.add(change);
      const proposed=this.position.clone().addScaledVector(this.velocity,dt);
      if(!this.air)proposed.y=terrain(proposed.x,proposed.z)+.9;
      if(field?.hit(this.position,proposed,this.air?6:2.8)){
        // Remain outside solid scenery, choose a new route without teleporting.
        this.velocity.multiplyScalar(Math.exp(-8*dt));this.next=0;
      }else this.position.copy(proposed);
      return this.position;
    }
  }
  const api={Flight,Minigun,defaults,terrain,sweptSphere,sweptMesh,clamp,segmentBox,ObstacleField,EvasiveMotion,OBSERVED_HITS,hitDamage,G,
    attitudeOf,createInputState,resetInput,mouseMove,mouseStick,frameStart,inputStep,joystick};
  if(typeof module!=='undefined') module.exports=api; else root.HeliPhysics=api;
})(typeof window!=='undefined'?window:globalThis);
