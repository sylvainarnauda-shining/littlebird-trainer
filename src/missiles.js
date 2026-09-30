/* Surface-to-air threats: lock tones, IR missiles and flares (original code).
   Rules from public guides and player reports (docs/SOURCES.md). The two
   reference recordings contain no lock, so none of this is measured in the game:
   - a launcher needs a continuous line of sight to lock: beeping while it
     acquires, steady tone once locked and while a missile guides on you;
   - no lock close to the ground (guides: about 10 m);
   - flares on V, 2 charges (on-screen count "002" in both recordings) and a
     cooldown between salvos; guides advise firing 1-2 s before impact;
   - missiles are very agile (players report right-angle turns).
   Seeker model: IR seeker with a 30 deg field that follows the brightest
   source in view. A flare outshines the helicopter for about 1.7 s: fired
   1-2 s before impact it drags the missile past the helicopter, which is then
   outside the seeker's field; fired earlier it fades while the helicopter is
   still in view and the missile turns back onto it.
   Launchers are physical (v9): a launcher can be tied to a unit (a soldier
   with a 9K333 Verba on his shoulder, or a crewed SAM emplacement with its
   operator) that the trainer moves and that can be shot. The unit supplies the
   eye, the tube muzzle and axis; the operator leads the target, the missile
   is ejected from the tube and its motor ignites a few metres out. Verba:
   range about 1 000 m and minimum 100 m (community wiki and guides).
   v12, values published by community databases (docs/SOURCES.md; not checked
   in the game): the Verba and the SAM emplacement fire the same 72 mm missile:
   20 m/s out of the tube, 450 m/s in flight, arming after 0.13 s, 200 damage
   on a direct hit, blast of 10.8 m with full damage within 2 m. The Little
   Bird's hull has 400 points: a direct hit takes half of it, so it usually
   takes two missiles (players say the same). The SAM emplacement holds one
   missile and reloads it in about 3 s (2 s plus delays; players report about
   3 s) and cannot aim straight up (guides: a safe cone above it). */
(function(root){
  const T=typeof module!=='undefined'?require('./vendor/three.min.js'):root.THREE;
  const G=9.81,NAV=4,SEEKER_COS=Math.cos(30*Math.PI/180),HELI_IR=1,FLARE_LIFE=4,FLARES_PER_SALVO=6,MISSILE_LIFE=10;
  // Ejection out of the tube (20 m/s, community database), then flight motor (ignites a few metres out);
  // the warhead arms after 0.13 s (community database). The SAM emplacement fires the Verba's missile (same range).
  const EJECT_SPEED=20,IGNITION=.22,ARMING=.13,SAM_RANGE=1,SAM_CYCLE=3,SAM_MAX_ELEVATION=77*Math.PI/180;
  // Damage on the Little Bird (percent of its 400-point hull) at the missile's closest approach.
  const HULL=400,DIRECT=200,BLAST=10.8,FULL=2;
  const missileDamage=d=>100*DIRECT/HULL*(d<=FULL?1:Math.max(0,(BLAST-d)/(BLAST-FULL)));
  // Dodging without flares (v9). Players report that a good dodge or flying very low
  // can beat a missile in the game; the rules below are a training model, not measured:
  // - hard maneuver: a helicopter pulling more than DODGE_G0 g across the missile's line of
  //   sight while it closes in (DODGE_T0-DODGE_T1 s before impact) can make the seeker's
  //   tracking loop lose it; the chance grows with the g pulled (a missile out-turns a
  //   helicopter by far, so pure kinematics would leave no chance at all);
  // - ground clutter: close to the ground the seeker loses a low helicopter against the
  //   background and cannot find it again while it stays under 7 m (guides: below about
  //   10 m a lock does not hold);
  // - graded warhead: fatal within LETHAL m, fragments only (damage) out to the fuse radius;
  // - the motor burns out after BURN s, then drag saps speed and agility (long shots);
  // - the airframe answers its guidance with a short lag.
  const LAG=.15,LETHAL=2.5,BURN=2.6,DRAG=.0005,INDUCED=.05,MIN_SPEED=150,
    DODGE_G0=.5,DODGE_K=.2,DODGE_T0=.45,DODGE_T1=2.2,CLUTTER_AGL=10,CLUTTER_RATE=1.2,CLUTTER_BLIND=.8,CLUTTER_HIDE=7;
  // aaHitsToKill 0: damage of the community databases (above); 1-3: that many hits bring the helicopter down.
  const defaults={aaObjective:'survive',aaLaunchers:3,aaLockRange:1000,aaMinRange:100,aaLockTime:2.5,aaMinAltitude:10,aaLaunchDelay:.8,aaReload:12,
    aaMissileSpeed:450,aaAgility:25,aaFuse:5,aaMaxConcurrent:2,aaTreesBlock:false,aaAssist:true,aaEverywhere:false,aaRespawn:true,aaHitsToKill:0,
    flareCharges:2,flareUnlimited:false,flareCooldown:12,aaToneHz:1000,aaBeepRate:4};
  // Flare IR intensity relative to the helicopter: 6x at ejection, 1x after 1.6 s.
  const flareIntensity=age=>6*Math.exp(-age/.9);
  const HOLD=1.25;   // the source being tracked keeps priority until another is 25 % brighter
  class Random{constructor(seed){this.s=(seed>>>0)||1;}next(){this.s=(Math.imul(this.s,1664525)+1013904223)>>>0;return this.s/4294967296;}}
  const tmpA=new T.Vector3(),tmpB=new T.Vector3(),tmpC=new T.Vector3(),tmpD=new T.Vector3(),tmpE=new T.Vector3();
  function segmentDistance(p,a,b){
    const ab=tmpA.copy(b).sub(a),l=ab.lengthSq(),t=l?Math.max(0,Math.min(1,tmpB.copy(p).sub(a).dot(ab)/l)):0;
    return tmpC.copy(a).addScaledVector(ab,t).distanceTo(p);
  }
  // Time to go of a missile toward the helicopter (null when not closing).
  // While the motor still accelerates, the expected cruise speed is used.
  function timeToGo(m,heli){
    const v=m.velocity.length(),early=m.age===undefined||m.age<IGNITION+1.2;
    const R=tmpA.copy(heli.position).sub(m.position),dist=R.length(),speed=early?Math.max(v,(m.speedMax||0)*.85):Math.max(v,1);
    const closing=-R.dot(tmpB.copy(heli.velocity).sub(tmpC.copy(m.velocity).setLength(speed)))/Math.max(dist,1e-6);
    return closing>1?dist/closing:null;
  }
  class AirDefense{
    // env: {terrain(x,z), los(a,b,purpose) -> bool, hit(a,b) -> obstacle or null}
    constructor(cfg,env){this.cfg=cfg;this.env=env;this.reset([],1);}
    reset(sites,seed=1){
      this.random=new Random(seed);this.missiles=[];this.flares=[];this.pending=[];this.events=[];this.nextId=1;
      this.charges=this.cfg.flareCharges;this.cooldown=0;this.grace=0;this.time=0;this.heliAlive=true;this.heliAccel=new T.Vector3();this.lastHeliV=null;
      this.stats={acquisitions:0,locks:0,brokenAcquisitions:0,brokenLocks:0,launches:0,hits:0,grazes:0,dodged:{flare:0,terrain:0,maneuver:0,clutter:0},flaresUsed:0,flareTiming:[],launchersKilled:0,killedWhileEngaging:0};
      this.launchers=[];for(const s of sites)this.addLauncher(s);
    }
    // site: {x,y,z,kind:'manpads'|'sam', unit?, ammo?}. A unit is {alive, ready, eye, muzzle, axis, aligned}
    // kept up to date by the code that moves it; without one the launcher is a fixed point (tests, legacy).
    addLauncher(site){
      const l={id:this.launchers.length,site,kind:site.kind,unit:site.unit||null,position:new T.Vector3(site.x,site.y,site.z),eye:new T.Vector3(site.x,site.y+1.6,site.z),lead:new T.Vector3(site.x,site.y+50,site.z),
        state:'idle',progress:0,lost:0,attention:0,reaction:this.reactionTime(),launchTimer:0,reload:0,ammo:site.ammo??(site.kind==='sam'?4:3),dead:false,revealed:0,visible:false,check:0};
      if(l.unit)l.eye.copy(l.unit.eye);
      this.launchers.push(l);return l;
    }
    reactionTime(){return .4+1.1*this.random.next();}
    emit(type,launcher=null,missile=null,data={}){this.events.push({type,launcher,missile,...data});}
    lockTime(l){return this.cfg.aaLockTime*(l.kind==='sam'?.8:1);}
    range(l){return this.cfg.aaLockRange*(l.kind==='sam'?SAM_RANGE:1);}
    minRange(){return this.cfg.aaMinRange??0;}
    // Aim point: operators lead a crossing target (proportional navigation does the rest).
    updateLead(l,heli){
      const dist=l.eye.distanceTo(heli.position),t=dist/(.55*this.cfg.aaMissileSpeed);
      l.lead.copy(heli.position).addScaledVector(heli.velocity,.7*t);
    }
    engaged(){let n=0;for(const l of this.launchers)if(l.state!=='idle')n++;for(const m of this.missiles)if(m.alive&&m.target==='heli')n++;return n;}
    // 0: silent, 1: beeping (acquiring), 2: steady tone (locked or missile guiding).
    get warning(){
      let w=0;for(const l of this.launchers){if(l.state==='locked')return 2;if(l.state==='acquiring')w=1;}
      for(const m of this.missiles)if(m.alive&&m.target==='heli')return 2;return w;
    }
    step(dt,heli){
      this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.grace=Math.max(0,this.grace-dt);this.heliAlive=!!heli.alive;
      // Helicopter acceleration seen by the seekers (smoothed over about 0.15 s).
      if(this.lastHeliV&&dt>0)this.heliAccel.lerp(tmpE.copy(heli.velocity).sub(this.lastHeliV).divideScalar(dt),1-Math.exp(-dt/.15));
      (this.lastHeliV||(this.lastHeliV=new T.Vector3())).copy(heli.velocity);
      for(const l of this.launchers)this.stepLauncher(l,dt,heli);
      this.spawnFlares(dt,heli);
      for(const f of this.flares)this.stepFlare(f,dt);
      for(const m of this.missiles)if(m.alive)this.stepMissile(m,dt,heli);
      this.flares=this.flares.filter(f=>f.alive);this.missiles=this.missiles.filter(m=>m.alive);
    }
    stepLauncher(l,dt,heli){
      if(l.dead)return;
      const c=this.cfg,u=l.unit;
      // The operator or the emplacement was destroyed: the launcher is gone.
      if(u&&!u.alive){this.killLauncher(l);return;}
      if(u)l.eye.copy(u.eye);
      l.reload=Math.max(0,l.reload-dt);l.revealed=Math.max(0,l.revealed-dt);l.check-=dt;
      if(l.check<=0){
        l.check=.1;const d=l.eye.distanceTo(heli.position);
        // The SAM emplacement cannot aim straight up: a helicopter in the cone above it is out of reach.
        const steep=l.kind==='sam'&&Math.atan2(heli.position.y-l.eye.y,Math.hypot(heli.position.x-l.eye.x,heli.position.z-l.eye.z))>SAM_MAX_ELEVATION;
        l.visible=!!heli.alive&&!steep&&heli.agl>=c.aaMinAltitude&&d<=this.range(l)&&d>=this.minRange()&&this.env.los(l.eye,heli.position,'lock');
      }
      if(heli.alive)this.updateLead(l,heli);
      // A soldier must stand with the tube shouldered, a crew must be seated.
      const can=l.visible&&this.grace<=0&&(!u||u.ready);
      if(l.state==='idle'){
        if(!can||l.reload>0||l.ammo<=0){l.attention=0;return;}
        l.attention+=dt;   // operator reaction before aiming
        if(l.attention>=l.reaction&&this.engaged()<c.aaMaxConcurrent){l.state='acquiring';l.progress=0;l.lost=0;this.stats.acquisitions++;this.emit('acquire',l);}
        return;
      }
      if(!can){
        l.lost+=dt;
        if(l.lost>.35){
          const was=l.state;l.state='idle';l.attention=0;l.reaction=this.reactionTime();
          if(was==='acquiring'){this.stats.brokenAcquisitions++;this.emit('acquireLost',l);}else{this.stats.brokenLocks++;this.emit('lockLost',l);}
        }
        return;
      }
      l.lost=0;
      if(l.state==='acquiring'){
        l.progress+=dt;
        if(l.progress>=this.lockTime(l)){l.state='locked';l.launchTimer=c.aaLaunchDelay*(.6+.8*this.random.next());this.stats.locks++;this.emit('lock',l);}
      }else if(l.state==='locked'){l.launchTimer-=dt;if(l.launchTimer<=0&&(!u||u.aligned!==false))this.launch(l,heli);}
    }
    launch(l,heli){
      // Out of the unit's tube along its axis; fixed points fire straight at the aim point.
      const u=l.unit,muzzle=u&&u.muzzle?u.muzzle.clone():l.eye.clone(),axis=u&&u.axis?u.axis.clone().normalize():l.lead.clone().sub(muzzle).normalize();
      if(!u||!u.muzzle)muzzle.addScaledVector(axis,1.2);
      const m={id:this.nextId++,launcher:l,kind:l.kind,position:muzzle,previous:new T.Vector3(),velocity:axis.clone().multiplyScalar(EJECT_SPEED),axis,acc:new T.Vector3(0,G,0),
        age:0,ignited:false,target:'heli',flare:null,lostAt:0,lostFor:0,losTimer:0,losOK:true,seek:0,alive:true,decoyed:false,masked:false,clutter:false,dodged:false,blindUntil:0,fuseMin:Infinity,
        ignoresFlares:this.random.next()<.05,speedMax:this.cfg.aaMissileSpeed,origin:muzzle.clone()};
      m.previous.copy(m.position);this.missiles.push(m);
      // A Verba gunner needs a new tube (training delay); the SAM emplacement reloads its single missile in ~3 s.
      l.state='idle';l.attention=0;l.reaction=this.reactionTime();l.reload=l.kind==='sam'?SAM_CYCLE:this.cfg.aaReload;l.ammo--;l.revealed=8;
      this.stats.launches++;this.emit('launch',l,m,{muzzle:m.origin.clone(),axis:axis.clone()});
    }
    stepMissile(m,dt,heli){
      const c=this.cfg;m.age+=dt;m.previous.copy(m.position);
      // Ejection: no thrust, no guidance until the flight motor ignites.
      if(!m.ignited){
        // Cover struck in the first 2.6 m (before arming, 0.13 s at 20 m/s): a dud.
        if(m.age<IGNITION){m.velocity.y-=G*dt;m.position.addScaledVector(m.velocity,dt);
          if(m.position.y<this.env.terrain(m.position.x,m.position.z))this.end(m,m.age<ARMING?'dud':'ground');
          else if(this.env.hit&&this.env.hit(m.previous,m.position))this.end(m,m.age<ARMING?'dud':'obstacle');
          return;}
        // The motor pushes along the body, which still points along the tube: at 20 m/s the ejection
        // sag has turned the velocity ~6 deg down, and boosting that direction flew low shots into the ground.
        m.ignited=true;m.acc.set(0,G,0);m.velocity.copy(m.axis).multiplyScalar(m.velocity.length());this.emit('ignite',m.launcher,m);
      }
      this.seek(m,dt,heli);
      const speed=m.velocity.length(),cmd=tmpD.set(0,G,0);   // gravity compensated
      const aim=m.target==='heli'?heli:m.target==='flare'?m.flare:null;
      if(aim){
        // Proportional navigation: acceleration = N * (line-of-sight rate x velocity).
        const R=tmpA.copy(aim.position).sub(m.position),Vr=tmpB.copy(aim.velocity).sub(m.velocity);
        const omega=R.clone().cross(Vr).divideScalar(Math.max(R.lengthSq(),1));
        cmd.add(omega.cross(m.velocity).multiplyScalar(NAV));
      }
      // Agility falls with the dynamic pressure once the motor has burnt out.
      const max=c.aaAgility*G*Math.min(1,(speed/m.speedMax)*(speed/m.speedMax));if(cmd.length()>max)cmd.setLength(max);
      m.acc.lerp(cmd,1-Math.exp(-dt/LAG));
      m.velocity.addScaledVector(m.acc,dt);m.velocity.y-=G*dt;
      // Motor: full speed about 1 s after ignition, burn-out after BURN s, then drag and turn losses.
      const burning=m.age<IGNITION+BURN,lateral=m.acc.length();
      m.velocity.setLength(burning?Math.min(m.speedMax,speed+m.speedMax*1.1*dt):Math.max(1,speed-(DRAG*speed*speed+INDUCED*lateral*lateral/Math.max(speed,1))*dt));
      m.position.addScaledVector(m.velocity,dt);
      // Proximity fuse: armed inside the fuse radius, it fires at the closest point of approach.
      if(heli.alive){
        const d=segmentDistance(heli.position,m.previous,m.position);
        if(d<c.aaFuse||m.fuseMin<c.aaFuse){
          // Closest point inside this step (target now behind), or already passed on the previous one.
          const behind=tmpA.copy(heli.position).sub(m.position).dot(m.velocity)<0,receding=m.fuseMin<c.aaFuse&&d>m.fuseMin;
          m.fuseMin=Math.min(m.fuseMin,d);
          if(behind||receding||m.fuseMin<.3){m.missDistance=m.fuseMin;this.end(m,m.fuseMin<LETHAL?'hit':'graze');return;}
        }
      }
      // Past the flare it followed (unless the helicopter is already inside the fuse radius).
      if(m.target==='flare'&&m.flare.alive&&!(m.fuseMin<c.aaFuse)&&segmentDistance(m.flare.position,m.previous,m.position)<3&&!(heli.alive&&heli.position.distanceTo(m.position)<c.aaFuse*2)){this.end(m,'flare');return;}
      // Before arming (0.13 s) a missile that strikes cover does not explode.
      if(m.position.y<this.env.terrain(m.position.x,m.position.z)){this.end(m,m.age<ARMING?'dud':'ground');return;}
      if(this.env.hit&&this.env.hit(m.previous,m.position)){this.end(m,m.age<ARMING?'dud':'obstacle');return;}
      if(m.age>MISSILE_LIFE||!burning&&m.velocity.length()<MIN_SPEED)this.end(m,'expired');
    }
    seek(m,dt,heli){
      const speed=m.velocity.length()||1;
      const inField=p=>{const d=tmpC.copy(p).sub(m.position),L=d.length();return L<3||d.dot(m.velocity)/(L*speed)>SEEKER_COS;};
      // Helicopter visibility: in the field and not masked for 0.25 s.
      let heliSeen=false;
      if(heli.alive&&inField(heli.position)){
        m.losTimer-=dt;if(m.losTimer<=0){m.losTimer=.1;m.losOK=this.env.los(m.position,heli.position,'missile');}
        m.lostFor=m.losOK?0:m.lostFor+dt;heliSeen=m.lostFor<.25;
      }
      if(m.target==='heli'&&!heliSeen){this.lose(m,!heli.alive?'lost':m.lostFor>=.25?'masked':'field');return;}
      // Ground clutter: a helicopter hugging the ground can vanish into the background.
      if(m.target==='heli'&&heli.agl<CLUTTER_AGL){const low=1-Math.max(0,heli.agl)/CLUTTER_AGL;if(this.random.next()<CLUTTER_RATE*low*low*dt){m.clutter=true;m.blindUntil=m.age+CLUTTER_BLIND;this.lose(m,'clutter');return;}}
      // Hard maneuver across the line of sight as the missile closes in: the tracking loop can lose it.
      if(m.target==='heli'&&m.ignited){
        const ttg=timeToGo(m,heli);
        if(ttg!==null&&ttg>DODGE_T0&&ttg<DODGE_T1){
          const los=tmpC.copy(heli.position).sub(m.position).normalize(),a=this.heliAccel,g=tmpE.copy(a).addScaledVector(los,-a.dot(los)).length()/G;
          if(g>DODGE_G0&&this.random.next()<DODGE_K*((g-DODGE_G0)*(g-DODGE_G0))*dt){m.dodged=true;m.blindUntil=m.age+1.5;this.lose(m,'maneuver');return;}
        }
      }
      if(m.target==='flare'&&(!m.flare.alive||!inField(m.flare.position))){m.target=null;m.flare=null;m.lostAt=m.age;}
      m.seek-=dt;if(m.seek>0)return;m.seek=1/30;
      // Brightest source in the field; the current one keeps priority (HOLD).
      const current=m.target==='heli'?HELI_IR*HOLD:m.target==='flare'?flareIntensity(m.flare.age)*HOLD:0;
      let best=null,bestI=current;
      if(!m.ignoresFlares)for(const f of this.flares){if(f===m.flare)continue;const I=flareIntensity(f.age);if(I>bestI&&I>.2&&inField(f.position)){best=f;bestI=I;}}
      if(best){
        // Seduction away from the helicopter is not instantaneous.
        if(m.target==='heli'&&this.random.next()>=Math.min(.8,.35*(bestI/HELI_IR-1)))return;
        if(m.target==='heli'){m.decoyed=true;this.emit('decoyed',m.launcher,m);}
        m.target='flare';m.flare=best;return;
      }
      if(m.target!=='heli'&&heliSeen&&HELI_IR>current&&m.age-m.lostAt>.1&&m.age>=m.blindUntil&&!(m.clutter&&heli.agl<CLUTTER_HIDE)){m.target='heli';m.flare=null;this.emit('reacquired',m.launcher,m);}
    }
    lose(m,reason){m.target=null;m.flare=null;m.lostAt=m.age;if(reason==='masked')m.masked=true;this.emit('trackLost',m.launcher,m,{reason});}
    end(m,how){
      m.alive=false;m.endReason=how;
      if(how==='hit'){this.stats.hits++;this.emit('hit',m.launcher,m,{distance:m.missDistance});return;}
      // Fragments only: the helicopter is damaged, not downed (unless already weak).
      if(how==='graze'){this.stats.grazes++;this.emit('graze',m.launcher,m,{distance:m.missDistance});return;}
      // Missiles still flying after the helicopter was destroyed are not dodges.
      if(!this.heliAlive){this.emit('miss',m.launcher,m,{reason:'none',how});return;}
      const reason=m.decoyed?'flare':m.clutter?'clutter':m.dodged?'maneuver':m.masked||how==='ground'||how==='obstacle'||how==='dud'?'terrain':'maneuver';
      this.stats.dodged[reason]++;this.emit('miss',m.launcher,m,{reason,how});
    }
    deployFlares(heli){
      const c=this.cfg;
      if(this.cooldown>0){this.emit('flareCooling');return false;}
      if(!c.flareUnlimited&&this.charges<=0){this.emit('flareEmpty');return false;}
      if(!c.flareUnlimited)this.charges--;
      this.cooldown=c.flareCooldown;this.stats.flaresUsed++;
      let ttg=null;for(const m of this.missiles)if(m.alive&&m.target==='heli'){const t=timeToGo(m,heli);if(t!==null)ttg=ttg===null?t:Math.min(ttg,t);}
      this.stats.flareTiming.push(ttg);
      for(let i=0;i<FLARES_PER_SALVO;i++)this.pending.push({delay:i*.06,side:i%2?1:-1});
      this.emit('flares',null,null,{ttg});return true;
    }
    spawnFlares(dt,heli){
      if(!this.pending.length)return;
      const right=new T.Vector3(1,0,0).applyQuaternion(heli.quaternion),back=new T.Vector3(0,0,1).applyQuaternion(heli.quaternion);
      for(const p of this.pending){
        p.delay-=dt;if(p.delay>0)continue;
        const v=heli.velocity.clone().addScaledVector(right,p.side*(9+4*this.random.next())).addScaledVector(back,5+3*this.random.next());v.y-=6+4*this.random.next();
        this.flares.push({position:heli.position.clone().addScaledVector(back,1.2).add(new T.Vector3(0,-.6,0)),velocity:v,age:0,alive:true});
      }
      this.pending=this.pending.filter(p=>p.delay>0);
    }
    stepFlare(f,dt){
      f.age+=dt;f.velocity.multiplyScalar(Math.exp(-.9*dt));f.velocity.y-=G*.55*dt;f.position.addScaledVector(f.velocity,dt);
      if(f.age>FLARE_LIFE||f.position.y<this.env.terrain(f.position.x,f.position.z))f.alive=false;
    }
    refill(){this.charges=this.cfg.flareCharges;this.cooldown=0;}
    killLauncher(l){if(l.dead)return;const was=l.state;l.dead=true;l.state='idle';this.stats.launchersKilled++;
      if(was!=='idle')this.stats.killedWhileEngaging=(this.stats.killedWhileEngaging||0)+1;
      this.emit('launcherKilled',l,null,{interrupted:was});}
    reviveLauncher(l,site){
      Object.assign(l,{site,kind:site.kind,unit:site.unit||null,dead:false,state:'idle',progress:0,lost:0,attention:0,reaction:this.reactionTime(),reload:6,ammo:site.ammo??(site.kind==='sam'?4:3),revealed:0,visible:false,check:0});
      l.position.set(site.x,site.y,site.z);if(l.unit)l.eye.copy(l.unit.eye);else l.eye.set(site.x,site.y+1.6,site.z);
    }
    // After a respawn: missiles vanish, launchers start over after a grace delay.
    clearThreats(grace=4){this.missiles=[];this.pending=[];for(const l of this.launchers){l.state='idle';l.attention=0;l.lost=0;}this.grace=grace;}
    // Details for the optional visual aids.
    threats(heli){
      const out=[];
      for(const l of this.launchers)if(!l.dead&&l.state!=='idle')out.push({type:l.state,position:l.eye,progress:l.state==='acquiring'?Math.min(1,l.progress/this.lockTime(l)):1,kind:l.kind});
      for(const m of this.missiles)if(m.alive)out.push({type:m.target==='heli'?'missile':'decoyed',position:m.position,distance:m.position.distanceTo(heli.position),ttg:m.target==='heli'?timeToGo(m,heli):null});
      return out;
    }
  }
  const api={AirDefense,defaults,flareIntensity,timeToGo,segmentDistance,missileDamage,constants:{G,NAV,SEEKER_DEG:30,HELI_IR,FLARE_LIFE,FLARES_PER_SALVO,MISSILE_LIFE,EJECT_SPEED,IGNITION,ARMING,SAM_RANGE,SAM_CYCLE,SAM_MAX_ELEVATION,HULL,DIRECT,BLAST,FULL,LAG,LETHAL,BURN,DRAG,INDUCED,MIN_SPEED,DODGE_G0,DODGE_K,DODGE_T0,DODGE_T1,CLUTTER_AGL,CLUTTER_RATE,CLUTTER_BLIND,CLUTTER_HIDE}};
  if(typeof module!=='undefined')module.exports=api;else root.HeliMissiles=api;
})(typeof window!=='undefined'?window:globalThis);
