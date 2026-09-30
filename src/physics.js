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
      const command=input.collective||0;
      if(command>0) this.collective=Math.min(1,this.collective+c.collectiveUpRate*dt);
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
    attitudeOf,createInputState,resetInput,mouseMove,mouseStick,frameStart,inputStep};
  if(typeof module!=='undefined') module.exports=api; else root.HeliPhysics=api;
})(typeof window!=='undefined'?window:globalThis);
