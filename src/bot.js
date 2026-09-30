/* Bot helicopter pilot (original code). It flies the same flight model as the
   player (physics.js Flight with the same settings and limits) through the
   same four controls: pitch, yaw and roll rate commands in -1..1 and the
   collective lever (up, down or released with its automatic hold). It aims
   with the same fixed miniguns (rounds at 800 m/s plus its own speed) and
   fires the same rounds. Behaviours and skill levels are training choices:
   - it sees what a pilot could see: the target's state `reaction` seconds
     ago, nothing behind a ridge (it then flies to where the target was going);
   - attack: nose on the lead point (aim noise of the skill), bursts when the
     gun line is within the fire cone; it keeps a little height above the
     target so that aiming down also pulls it forward (the rotor tilts with
     the nose), and side-slips to be harder to hit;
   - pursuit: bank-to-turn toward an intercept point at cruise speed;
   - extend: after a close pass, fly away before turning back;
   - evade: when the target aims at it and fires, or after a hit, break
     across the line of fire and change height for a couple of seconds;
   - terrain and obstacles: climbs early for the ground ahead, slows down
     when the climb needed is steeper than the collective can give, zooms
     (nose up) when the ground or a structure is less than 2 s away. */
(function(root){
  const T=typeof module!=='undefined'?require('./vendor/three.min.js'):root.THREE;
  const G=9.81,DEG=Math.PI/180;
  // reaction: perception delay (s); aimNoise: error on the lead point it believes in;
  // fireCone: how close to that point the guns must be to open fire; burst: longest
  // burst (s); pause: pause after a long burst (s, min-max); breakRate: breaks per
  // second while under fire without a firing solution of its own; strafe: side-slip
  // while attacking; range: firing range (m); cruise: pursuit speed (m/s); standoff:
  // distance it closes to while firing (a good pilot stays out of the overshoot).
  const SKILL={
    easy:{reaction:.55,aimNoise:2.8*DEG,fireCone:3.5*DEG,burst:2,pause:[1.2,2.2],breakRate:.25,strafe:4*DEG,maxTilt:38*DEG,range:500,cruise:50,standoff:150},
    normal:{reaction:.35,aimNoise:1.1*DEG,fireCone:2.6*DEG,burst:3,pause:[.5,1.1],breakRate:.55,strafe:10*DEG,maxTilt:48*DEG,range:650,cruise:58,standoff:180},
    real:{reaction:.2,aimNoise:.45*DEG,fireCone:2.2*DEG,burst:3.5,pause:[.4,.8],breakRate:.9,strafe:15*DEG,maxTilt:55*DEG,range:650,cruise:62,standoff:250}};
  // Height kept over the ground (trees reach about 20 m), climb rate planned with
  // the collective (8.9 m/s at full lever in hover), look-ahead times along the path.
  const CLEAR=28,TREETOP=18,CLIMB=6,LOOK=[.5,1,1.5,2,3,4,5,6,8];
  const IGNORE_TREES=new Set(['arbre']);
  const _v=()=>new T.Vector3(),Y_AXIS=new T.Vector3(0,1,0);
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  class BotPilot{
    // flight: a physics.js Flight. env: terrain(x,z), obstacles (ObstacleField),
    // wires(a,b) -> {fraction} or null (power-line wires near the segment), lineOfSight(a,b)
    // -> boolean (optional), bulletSpeed, detectRange (m: farther targets are not
    // noticed), home {x,z,radius} (patrol area), others (flights of friendly
    // helicopters to keep clear of).
    // v12: weapon 'rockets' (AH-6R): drop is the projectile's net fall (m/s2, rockets 4.9 in the
    // trainer against 9.81 for rounds); a rocket pilot settles the aim before a salvo (less aim
    // noise, a tighter cone) and closes in to 70 % of the minigun range (training choice).
    constructor(flight,{skill='normal',seed=1,terrain,obstacles=null,wires=null,lineOfSight=null,bulletSpeed=800,drop=G,weapon='miniguns',detectRange=Infinity,home=null,others=[]}={}){
      this.flight=flight;this.skill=SKILL[skill]||SKILL.normal;this.skillName=SKILL[skill]?skill:'normal';this.drop=drop;this.weapon=weapon;
      if(weapon==='rockets'){const k=this.skill;this.skill={...k,aimNoise:k.aimNoise*.35,fireCone:k.fireCone*.3,range:Math.round(k.range*.7),standoff:k.standoff*.8};}
      this.terrain=terrain;this.obstacles=obstacles;this.wires=wires;this.lineOfSight=lineOfSight;this.bulletSpeed=bulletSpeed;
      this.detectRange=detectRange;this.home=home;this.others=others;this.flank=0;
      this.seed=(seed>>>0)||1;this.reset();
    }
    // Forget what was seen (the target was destroyed and came back elsewhere).
    forget(){this.history.length=0;this.visible=false;this.losClock=0;}
    random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
    reset(){
      this.mode='pursuit';this.modeTime=0;this.modeUntil=0;this.time=0;this.history=[];this.noise=_v();this.noiseTarget=_v();this.noiseClock=0;
      this.firing=false;this.burst=0;this.cooldown=0;this.breakSide=1;this.lastHit=-99;this.strafePhase=this.random()*6.28;this.evadeClimb=1;this.evadeReady=0;this.steady=0;
      this.lead=_v();this.aimError=Math.PI;this.distance=Infinity;this.input={pitch:0,yaw:0,roll:0,collective:0};
      this.desiredHeight=this.flight.position.y;this.safety=false;this.braking=false;this.avoiding=false;this.speedCap=Infinity;
      this.visible=false;this.losClock=0;this.lastVisible=-99;this.qdPrev=null;this.feed=_v();this.patrolGoal=null;
    }
    hit(){this.lastHit=this.time;}
    // What the bot perceives of the target: its state `reaction` seconds ago,
    // extrapolated; behind terrain, the last state seen (extrapolated 3 s at most).
    perceive(target){
      this.losClock-=1;
      if(this.losClock<=0){
        // Noticed within the detection range, or anywhere in sight right after being hit.
        // Once engaged it keeps track out to twice that range.
        const p=this.flight.position,d=p.distanceTo(target.position),engaged=this.history.length>0&&this.time-this.lastVisible<4;
        const near=d<this.detectRange||engaged&&d<this.detectRange*2||this.time-this.lastHit<3;
        this.losClock=12;this.visible=near&&(!this.lineOfSight||this.lineOfSight(p,target.position));
      }
      if(this.visible){this.history.push({t:this.time,p:target.position.clone(),v:target.velocity.clone()});this.lastVisible=this.time;}
      while(this.history.length>2&&this.history[1].t<=this.time-this.skill.reaction)this.history.shift();
      if(!this.history.length)return null;
      const h=this.history[0],lag=this.time-h.t;
      if(lag>10){this.history.length=0;return null;}
      return {p:h.p.clone().addScaledVector(h.v,Math.min(lag,3)),v:lag>3?_v():h.v.clone(),lag};
    }
    setMode(m,duration=0){if(this.mode!==m){this.mode=m;this.modeTime=0;}this.modeUntil=this.time+duration;}
    // target: {position, velocity, forward (unit), alive, firing}. Returns {input, fire}.
    step(dt,target){
      const f=this.flight,s=this.skill;this.time+=dt;this.modeTime+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
      const p=f.position,v=f.velocity,q=f.quaternion,fwd=_v().set(0,0,-1).applyQuaternion(q);
      const seen=target&&target.alive?this.perceive(target):null;
      const toT=seen?seen.p.clone().sub(p):_v().set(0,0,-1),dist=toT.length();this.distance=seen?dist:Infinity;
      const vh=Math.hypot(v.x,v.z),g0=this.terrain(p.x,p.z),horizV=_v().set(v.x,0,v.z);
      const horiz=w=>{const h=w.clone();h.y=0;return h.lengthSq()>1e-9?h.normalize():_v().set(0,0,-1);};
      const accel=a=>{const t=Math.min(a.length(),G*Math.tan(s.maxTilt));const dir=a.lengthSq()>1e-9?a.clone().setLength(t):_v();return dir.add(_v().set(0,G,0)).normalize();};

      // ---- Terrain and obstacles ahead: height floor, speed cap, danger ----
      // The floor rises CLIMB m/s ahead of the ground so that the climb starts early;
      // the cap is the speed at which that climb can still be made with the collective.
      let floor=g0+CLEAR,cap=Infinity,danger=false;
      for(const t of LOOK){
        const ground=this.terrain(p.x+v.x*t,p.z+v.z*t),need=ground+CLEAR,rise=need-p.y;
        floor=Math.max(floor,need-CLIMB*t);
        if(rise>0)cap=Math.min(cap,Math.max(12,vh*t*CLIMB/rise));
        if(t<=2&&p.y+Math.min(0,v.y)*t<ground+TREETOP)danger=true;
      }
      // Structures (not trees) and power-line wires within 3.5 s along the path.
      const blocked=(a,b)=>this.obstacles&&this.obstacles.hit(a,b,10,IGNORE_TREES)||this.wires&&this.wires(a,b)||null;
      if((this.obstacles||this.wires)&&vh>3){
        const ahead=p.clone().addScaledVector(v,3.5),hit=blocked(p,ahead);
        if(hit){
          // Height that clears it: test the same path higher up.
          let over=90;for(const dy of [15,30,45,65]){if(!blocked(_v().set(p.x,p.y+dy,p.z),_v().set(ahead.x,ahead.y+dy,ahead.z))){over=dy;break;}}
          floor=Math.max(floor,p.y+over+8);cap=Math.min(cap,Math.max(10,vh*3.5*hit.fraction*CLIMB/(over+8)));
          if(hit.fraction*3.5<1.6)danger=true;
        }
      }
      this.speedCap=cap;

      // ---- Mode choice ----
      if(!seen)this.setMode('patrol');
      else{
        // Under fire it breaks away, unless it has its own firing solution (then it trades
        // shots) or has just broken; a hit makes it break much more readily.
        const threat=target.forward&&target.firing&&dist<650&&target.forward.dot(p.clone().sub(target.position).normalize())>Math.cos(7*DEG);
        const recentlyHit=this.time-this.lastHit<1,solution=this.mode==='attack'&&this.aimError<s.fireCone*2.5&&dist<s.range;
        if(this.mode==='evade'&&this.time<this.modeUntil);
        else if(this.mode==='extend'&&this.time<this.modeUntil&&dist<450);
        else if((threat&&!solution&&this.time>this.evadeReady||recentlyHit)&&this.random()<s.breakRate*dt*(recentlyHit?3:1)){
          this.breakSide=this.random()<.5?-1:1;this.evadeClimb=this.random()<.5?-1:1;const d=1.4+this.random()*1.6;this.setMode('evade',d);this.evadeReady=this.time+d+2.5;}
        else if(dist<110)this.setMode('extend',2.5+this.random()*1.5);
        else{
          // Attack inside 450 m, or up to the firing range when closing in; otherwise pursue.
          const ahead=fwd.dot(toT)/Math.max(1,dist),closing=-toT.dot(seen.v.clone().sub(v))/Math.max(1,dist),near=this.mode==='attack'?520:450;
          this.setMode(seen.lag<1.5&&ahead>-.2&&(dist<near||dist<s.range&&closing>5)?'attack':'pursuit');
        }
      }

      // ---- Guidance: desired rotor axis (up), nose direction and height ----
      const up=_v().set(0,1,0),nose=fwd.clone();let primaryNose=false,height=p.y,fire=false;
      if(this.mode==='attack'){
        // Lead point: the rounds leave at bulletSpeed plus the bot's own velocity; their drop compensated.
        const tFlight=dist/this.bulletSpeed;this.lead.copy(seen.p).addScaledVector(seen.v.clone().sub(v),tFlight);this.lead.y+=.5*this.drop*tFlight*tFlight;
        // Slowly wandering aim error (skill).
        this.noiseClock-=dt;if(this.noiseClock<=0){this.noiseClock=.4+this.random()*.5;this.noiseTarget.set(this.random()-.5,this.random()-.5,this.random()-.5).multiplyScalar(2*s.aimNoise*dist);}
        this.noise.lerp(this.noiseTarget,1-Math.exp(-dt/.35));
        // Speed: a dive angle held with the collective (aiming down tilts the rotor
        // forward), plus extra nose-down out of range; inside the range the nose stays
        // on the lead point.
        const closing=-toT.dot(seen.v.clone().sub(v))/Math.max(1,dist),wanted=clamp((dist-s.standoff)*.12,-10,35),short=wanted-closing;
        const dive=clamp((2+short*.35)*DEG,0,9*DEG);
        height=seen.p.y+Math.min(80,dist*Math.tan(dive));
        // In range a rocket pilot puts the nose right on the point (no speed-keeping offset: 1 deg is
        // 6 m at 350 m for a salvo; the minigun's spray absorbs it).
        const bias=dist>s.range*.95?clamp(short*.5,-4,10)*DEG:this.weapon==='rockets'?0:clamp(short*.08,-1,1)*DEG;
        // aimPoint: where the bot believes the rounds must go (lead point plus its error).
        const aimPoint=this.lead.clone().add(this.noise),aim=aimPoint.clone();aim.y-=Math.tan(bias)*dist;
        nose.copy(aim).sub(p).normalize();primaryNose=true;
        // At speed the nose follows the flight path (as for the player): bank toward the aim
        // heading to turn the path, as well as yawing; plus the side-slip of the skill.
        // The side-slip eases off during a burst (steady guns) and resumes between bursts.
        const side=_v().crossVectors(nose,_v().set(0,1,0));if(side.lengthSq()>1e-6)side.normalize();
        this.steady+=((this.firing?1:0)-this.steady)*(1-Math.exp(-dt/.4));
        let tilt=s.strafe*(1-.8*this.steady)*Math.sin(this.time*.9+this.strafePhase);
        if(vh>8){let d=Math.atan2(-nose.x,-nose.z)-Math.atan2(-v.x,-v.z);d=Math.atan2(Math.sin(d),Math.cos(d));tilt+=clamp(-d*1.8,-s.maxTilt,s.maxTilt)*Math.min(1,vh/35);}
        up.set(0,1,0).addScaledVector(side,Math.tan(clamp(tilt,-s.maxTilt,s.maxTilt)));
        this.aimError=Math.acos(clamp(fwd.dot(aimPoint.sub(p).normalize()),-1,1));
        fire=this.aimError<s.fireCone&&dist<s.range&&seen.lag<s.reaction+.3;
      }else if(this.mode==='pursuit'||this.mode==='patrol'){
        let goal;
        // v12: in a pair or a trio, the wingmen swing wide (flank -1 or +1) so that the attacks
        // come from several bearings; they converge inside 700 m.
        if(seen){goal=seen.p.clone().addScaledVector(seen.v,Math.min(8,dist/70));
          if(this.flank&&dist>700){const side=_v().crossVectors(horiz(toT),Y_AXIS).multiplyScalar(this.flank*Math.min(380,(dist-600)*.45));goal.add(side);}}
        else{
          // Patrol: random points of the home area (or ahead when it has none).
          const h=this.home,far=h&&Math.hypot(p.x-h.x,p.z-h.z)>h.radius*1.3;
          if(!this.patrolGoal||Math.hypot(this.patrolGoal.x-p.x,this.patrolGoal.z-p.z)<150||far&&Math.hypot(this.patrolGoal.x-h.x,this.patrolGoal.z-h.z)>h.radius){
            if(h){const a=this.random()*6.2832,r=Math.sqrt(this.random())*h.radius;this.patrolGoal=_v().set(h.x+Math.cos(a)*r,p.y,h.z+Math.sin(a)*r);}
            else this.patrolGoal=p.clone().addScaledVector(horiz(fwd),600).add(_v().set((this.random()-.5)*400,0,(this.random()-.5)*400));
          }
          goal=this.patrolGoal;
        }
        // Cruise toward the intercept point (below the terrain cap); moderate tilt,
        // as the player cruises nose 12 deg down.
        const dir=horiz(goal.clone().sub(p)),want=dir.clone().multiplyScalar(Math.min(seen?s.cruise:35,cap));
        const a=want.sub(horizV).multiplyScalar(.25),lim=G*Math.tan(Math.min(s.maxTilt,24*DEG));if(a.length()>lim)a.setLength(lim);
        up.copy(a.add(_v().set(0,G,0)).normalize());nose.copy(dir);
        // Some height above the target before the attack run.
        height=seen?seen.p.y+Math.min(60,dist*Math.tan(5*DEG)):g0+CLEAR+15;
      }else if(this.mode==='extend'){
        const away=horiz(p.clone().sub(seen?seen.p:p.clone().add(fwd)));
        up.copy(accel(away.clone().multiplyScalar(Math.min(60,cap)).sub(horizV).multiplyScalar(.6)));nose.copy(away);height=Math.max(p.y+8,g0+CLEAR+10);
      }else if(this.mode==='evade'){
        // Break across the line of fire, change height, keep flying.
        const line=seen?horiz(p.clone().sub(target.position)):horiz(fwd),across=_v().crossVectors(_v().set(0,1,0),line).multiplyScalar(this.breakSide);
        up.copy(accel(across.multiplyScalar(G*Math.tan(s.maxTilt)*1.2)));nose.copy(horiz(fwd.clone().add(across.clone().normalize().multiplyScalar(.6))));
        height=p.y+this.evadeClimb*25;
      }
      // ---- Mid-air collision: when the closest approach within 3 s is under 30 m
      // (true positions: a pilot sees that coming), break right and split heights.
      // Same with the friendly helicopters.
      this.avoiding=false;
      for(const o of [target&&target.alive?target:null,...this.others]){
        if(!o||o===f||o.crashed)continue;
        const r=o.position.clone().sub(p),vr=o.velocity.clone().sub(v),vv=vr.lengthSq(),tc=vv>1?-r.dot(vr)/vv:0;
        if(tc>0&&tc<3&&r.clone().addScaledVector(vr,tc).length()<30||r.length()<25){
          this.avoiding=true;fire=false;primaryNose=false;
          const right=_v().crossVectors(horiz(vr.lengthSq()>1?vr.clone().negate():fwd),_v().set(0,1,0)).normalize();
          up.copy(accel(right.multiplyScalar(G*Math.tan(s.maxTilt))));nose.copy(horiz(fwd));
          height=o.position.y+(p.y>=o.position.y?35:-35);break;
        }
      }
      height=Math.max(height,floor);this.desiredHeight=height;

      // ---- Safety overrides: zoom when the ground is less than 2 s away, flare when
      // too fast for the climb ahead. Guns off in both.
      this.safety=danger;this.braking=!danger&&vh>cap+6;
      if(danger||this.braking){
        fire=false;const dirv=vh>2?horizV.clone().normalize():horiz(fwd);
        if(danger){
          primaryNose=true;nose.copy(dirv).multiplyScalar(Math.cos(28*DEG)).add(_v().set(0,Math.sin(28*DEG),0));
          up.set(0,1,0).addScaledVector(dirv,-Math.min(.6,vh/60));
        }else{
          primaryNose=false;nose.copy(dirv);up.set(0,1,0).addScaledVector(dirv,-Math.tan(clamp((vh-cap)*1.2,4,25)*DEG));
        }
      }

      // ---- Attitude: rate commands toward the desired orientation ----
      let F,U;
      // Unusual attitude (bank or pitch beyond about 70 deg): level the rotor first.
      const upNow=_v().set(0,1,0).applyQuaternion(q);this.recovering=upNow.y<Math.cos(70*DEG);
      if(this.recovering){fire=false;primaryNose=false;up.set(0,1,0);nose.copy(vh>5?horizV.clone().normalize():horiz(fwd));}
      if(primaryNose){F=nose.clone().normalize();U=up.clone().addScaledVector(F,-up.dot(F));if(U.lengthSq()<1e-6)U.set(0,1,0).addScaledVector(F,-F.y);U.normalize();}
      else{U=up.clone().normalize();F=nose.clone().addScaledVector(U,-nose.dot(U));if(F.lengthSq()<1e-6)F.copy(fwd).addScaledVector(U,-fwd.dot(U));F.normalize();}
      // Turn progressively: the heading asked for stays within 70 deg of the current one
      // (a larger step would make the shortest rotation roll the helicopter over).
      if(Math.hypot(F.x,F.z)>.05&&Math.hypot(fwd.x,fwd.z)>.05){
        const dh=Math.atan2(-F.x,-F.z)-Math.atan2(-fwd.x,-fwd.z),d=Math.atan2(Math.sin(dh),Math.cos(dh)),lim=70*DEG;
        if(Math.abs(d)>lim){const turn=Math.sign(d)*lim-d;F.applyAxisAngle(Y_AXIS,turn);U.applyAxisAngle(Y_AXIS,turn);}
      }
      const R=_v().crossVectors(F,U).normalize(),m=new T.Matrix4().makeBasis(R,U,F.clone().negate()),qd=new T.Quaternion().setFromRotationMatrix(m);
      // Feed-forward: rotation rate of the desired attitude (following a moving target
      // without lagging behind it), filtered; skipped on jumps (mode changes).
      const feed=_v();
      if(this.qdPrev){const dq=this.qdPrev.clone().invert().multiply(qd);if(dq.w<0){dq.x=-dq.x;dq.y=-dq.y;dq.z=-dq.z;dq.w=-dq.w;}const a=2*Math.acos(Math.min(1,dq.w));if(a>1e-7&&a<.05){const sn=Math.sqrt(Math.max(1e-12,1-dq.w*dq.w));feed.set(dq.x/sn,dq.y/sn,dq.z/sn).multiplyScalar(a/dt);}}
      this.qdPrev=qd.clone();this.feed.lerp(feed,1-Math.exp(-dt/.25));
      const qe=q.clone().invert().multiply(qd);if(qe.w<0){qe.x=-qe.x;qe.y=-qe.y;qe.z=-qe.z;qe.w=-qe.w;}
      const angle=2*Math.acos(Math.min(1,qe.w)),sn=Math.sqrt(Math.max(1e-12,1-qe.w*qe.w)),axis=_v().set(qe.x/sn,qe.y/sn,qe.z/sn);
      const K=1.6,rates=axis.multiplyScalar(K*angle).add(this.feed);
      // Damping on the body rates already built up (the flight model lags the commands).
      rates.addScaledVector(f.angular.clone().sub(this.feed),-.35);
      const c=f.cfg;
      this.input.pitch=clamp(rates.x/(c.pitchRate*DEG),-1,1);this.input.yaw=clamp(rates.y/(c.yawRate*DEG),-1,1);this.input.roll=clamp(rates.z/(c.rollRate*DEG),-1,1);

      // ---- Collective: vertical speed from the height error, lever from the vertical
      // speed error, plus the lever that carries the airflow load at speed, around the hover
      // lever leverHover with the flight model's authorities (physics.js: 8/(1-h) above, 3.5/(1+h)
      // below; h = 0 in v12, -0.14 in v13, whose bots otherwise settled ~0.9 m above their height).
      const flow=c.bodyFlowDrag*v.dot(upNow)*upNow.y,lh=c.leverHover||0;
      const vyWanted=clamp(.45*(height-p.y),-9,9),hold=flow/(flow>0?c.collectiveAccel/(1-lh):(c.collectiveDownAccel??c.collectiveAccel)/(1+lh));
      const lever=clamp(lh+hold+.35*(vyWanted-v.y)+(danger?.4:0),-1,1);
      this.input.collective=f.collective<lever-.05?1:f.collective>lever+.05?-1:0;

      // ---- Trigger: bursts of 0.6 s to the skill's longest, pauses; only with the target in sight ----
      if(fire&&!this.visible)fire=false;
      if(fire&&this.cooldown<=0){this.burst+=dt;if(this.burst>s.burst){this.burst=0;this.cooldown=s.pause[0]+this.random()*(s.pause[1]-s.pause[0]);fire=false;}}
      else if(this.firing&&this.burst<.6&&this.aimError<s.fireCone*2&&this.visible&&!danger){fire=true;this.burst+=dt;}
      else{this.burst=0;fire=false;}
      this.firing=fire;
      return {input:this.input,fire};
    }
  }
  const api={BotPilot,SKILL};
  if(typeof module!=='undefined')module.exports=api;else root.HeliBot=api;
})(typeof window!=='undefined'?window:globalThis);
