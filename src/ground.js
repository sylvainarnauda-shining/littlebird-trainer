/* Ground battle for the assault and full-match modes (original logic).
   Destructible structures placed at random in the valley (watchtowers,
   huts, bunkers, tents, fuel and ammunition dumps, radio masts), infantry
   that patrols, spots the helicopter, runs to shelter inside buildings and
   comes out later, may return fire in the full match, and trucks driving
   the valley road. Damage in reference hits (36.02 points, as the targets).
   Nothing here is measured in the game: sizes are real-world orders of
   magnitude, behaviours are training choices.
   v9: the air defence is carried by soldiers. A Verba gunner (role 'verba')
   shoulders his tube when he sees the helicopter in range, holds still
   while the launcher acquires and locks, kneels to reload after a shot and
   walks to his camp's ammunition dump when empty. He can be shot, scared off
   by rounds landing close (which breaks the lock) or killed in a blast. A
   SAM emplacement has a seated crew (role 'crew'); when the crew is
   killed, a rifleman of the same camp runs to the seat. */
(function(root){
  const T=typeof module!=='undefined'?require('./vendor/three.min.js'):root.THREE;
  const W=typeof module!=='undefined'?require('./world.js'):root.HeliWorld;
  const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
  // Local collision boxes [cx, cy, cz, w, h, d], shelter capacity and door.
  const TYPES={
    mirador:{label:'Mirador',health:14,points:100,shelter:0,boxes:[[-1.1,3.7,-1.1,.3,7.4,.3],[1.1,3.7,-1.1,.3,7.4,.3],[-1.1,3.7,1.1,.3,7.4,.3],[1.1,3.7,1.1,.3,7.4,.3],[0,8.6,0,3.3,2.5,3.3]],radius:3},
    cabane:{label:'Cabane',health:10,points:80,shelter:3,door:[1.2,0,-2.6],boxes:[[0,1.5,0,5,3,4],[0,3.3,0,5.3,.8,4.2]],radius:3.4},
    bunker:{label:'Bunker',health:30,points:150,shelter:4,door:[0,0,-3.1],boxes:[[0,1,0,5.4,2,5.4]],radius:3.5},
    tente:{label:'Tente',health:4,points:40,shelter:2,door:[0,0,-3.3],boxes:[[0,1.1,0,4.2,2.2,5.6]],radius:3.3},
    carburant:{label:'Dépôt de carburant',health:8,points:120,shelter:0,explode:18,boxes:[[0,1.15,0,6.4,2.3,2.4],[0,.45,2.6,4.8,.9,.7]],radius:3.6},
    munitions:{label:'Munitions',health:6,points:120,shelter:0,explode:14,boxes:[[0,.6,0,5.4,1.25,1.1]],radius:3},
    antenne:{label:'Antenne radio',health:8,points:90,shelter:0,boxes:[[0,8,0,.9,16,.9],[2,.7,1.5,1.5,1.4,1.2]],radius:2.5}};
  const CAMP_LAYOUT=['mirador','cabane','cabane','tente','carburant','munitions','bunker','antenne','tente'];
  // v12: rocket gunners (role 'rpg'), unguided, with values published by community databases (docs/SOURCES.md):
  // RPG-7 93 mm, 100 m/s out of the tube, 300 m effective, 110 damage on a direct hit, blast
  // 12 m with full damage within 2.5 m; MAAWS 84 mm, 230 m/s, 400 m, 100 damage. The RPG-7's
  // sustainer (up to 190 m/s) and the reload times are the trainer's choice.
  const ROCKETS={rpg7:{label:'RPG-7',speed:100,boost:190,range:330,direct:110,blast:12,full:2.5,reload:5},maaws:{label:'MAAWS',speed:230,boost:230,range:420,direct:100,blast:10,full:2,reload:6}};
  const defaults={enemyFire:false,infantryPerCamp:6,camps:4,convoy:3,rpgPerCamp:1,aaRockets:1};
  function rng(seed){let s=(seed>>>0)||1;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
  // Closest distance between segments p1-q1 and p2-q2; s = parameter on the first.
  function segSeg(p1,q1,p2,q2){
    const d1=q1.clone().sub(p1),d2=q2.clone().sub(p2),r=p1.clone().sub(p2),a=d1.dot(d1),e=d2.dot(d2),f=d2.dot(r);let s,t;
    if(a<1e-9&&e<1e-9)return {dist:r.length(),s:0};
    if(a<1e-9){s=0;t=Math.min(1,Math.max(0,f/e));}
    else{const c=d1.dot(r);if(e<1e-9){t=0;s=Math.min(1,Math.max(0,-c/a));}else{const b=d1.dot(d2),den=a*e-b*b;s=den>1e-9?Math.min(1,Math.max(0,(b*f-c*e)/den)):0;t=(b*s+f)/e;if(t<0){t=0;s=Math.min(1,Math.max(0,-c/a));}else if(t>1){t=1;s=Math.min(1,Math.max(0,(b-c)/a));}}}
    const c1=p1.clone().addScaledVector(d1,s),c2=p2.clone().addScaledVector(d2,t);return {dist:c1.distanceTo(c2),s};
  }
  class Battlefield{
    // env: {terrain(x,z), field: ObstacleField, los(a,b) -> bool}
    constructor(cfg,env){this.cfg=cfg;this.env=env;this.reset();}
    reset(){
      for(const s of this.structures||[])for(const b of s.boxes)b.off=true;
      this.structures=[];this.soldiers=[];this.vehicles=[];this.camps=[];this.emplacements=[];this.events=[];this.time=0;this.nextId=1;
      this.stats={structuresDestroyed:0,soldiersKilled:0,vehiclesDestroyed:0,shotsAtHeli:0,hitsOnHeli:0,shelterEntries:0};
      this.shelters=[];
      // Permanent shelters: factory buildings (doors on each side), objective towers (at the foot
      // of their outside stairs, v12) and village houses.
      for(const b of W.BUILDINGS)for(const [dx,dz] of [[0,-1],[0,1],[-1,0],[1,0]]){const x=b.x+dx*(b.w/2+1.6),z=b.z+dz*(b.d/2+1.6);this.shelters.push({kind:'building',label:'Usine',door:V(x,b.base??W.factoryLevel,z),capacity:6,occupants:0,alive:true});}
      for(const t of W.TOWERS)this.shelters.push({kind:'tower',label:'Tour',door:V(t.x+10.6,t.base,t.z-4.6),capacity:8,occupants:0,alive:true});
      for(const h of W.HOUSES||[]){const z=h.z+(h.d/2+1.6);this.shelters.push({kind:'house',label:h.kind==='block'?'Immeuble':'Maison',door:V(h.x,this.env.terrain(h.x,z),z),capacity:h.kind==='block'?10:4,occupants:0,alive:true});}
    }
    emit(type,data){this.events.push({type,...data});}
    addStructure(type,x,z,yaw,camp=null){
      const def=TYPES[type],ground=Math.min(...[[0,0],[2,2],[-2,2],[2,-2],[-2,-2]].map(([dx,dz])=>this.env.terrain(x+dx,z+dz))),c=Math.cos(yaw),s=Math.sin(yaw);
      const st={id:this.nextId++,type,label:def.label,position:V(x,ground,z),yaw,health:def.health,maxHealth:def.health,points:def.points,alive:true,camp,boxes:[],occupants:0,capacity:def.shelter,burning:0,fall:0};
      for(const [bx,by,bz,w,h,d] of def.boxes){
        // Axis-aligned bounds of the rotated local box.
        const wx=Math.abs(c)*w+Math.abs(s)*d,wz=Math.abs(s)*w+Math.abs(c)*d,cx=x+bx*c+bz*s,cz=z-bx*s+bz*c;
        const o=this.env.field.add(cx,ground+by,cz,wx,h,wz,'cible');o.owner=st;st.boxes.push(o);
      }
      if(def.door){const [dx,,dz]=def.door;st.door=V(x+dx*c+dz*s,ground,z-dx*s+dz*c);this.shelters.push({kind:'structure',structure:st,label:def.label,door:st.door,capacity:def.shelter,occupants:0,get alive(){return st.alive;}});}
      this.structures.push(st);return st;
    }
    // Camps on open, gentle ground away from the helipad and from each other.
    generate(seed,{camps=4,soldiersPerCamp=6,vehicles=3,center=null,spread=1400}={}){
      this.reset();const r=rng(seed);let tries=0;
      while(this.camps.length<camps&&tries++<4000){
        const z=center?center.z+(r()-.5)*spread:-2600+r()*3000,x=center?center.x+(r()-.5)*spread:W.valleyX(z)+(r()*2-1)*(W.halfWidth(z)+250);
        if(Math.hypot(x-W.PAD.x,z-W.PAD.z)<450||W.reserved(x,z)||W.forestDensity(x,z)>.35)continue;
        const h0=this.env.terrain(x,z);if([[25,0],[-25,0],[0,25],[0,-25]].some(([dx,dz])=>Math.abs(this.env.terrain(x+dx,z+dz)-h0)>4))continue;
        if(this.camps.some(c=>Math.hypot(c.x-x,c.z-z)<260))continue;
        if(this.env.field.hit(V(x,h0+.5,z),V(x,h0+12,z),16))continue;
        const camp={id:this.camps.length,x,z,y:h0,structures:[]};this.camps.push(camp);
        const kinds=CAMP_LAYOUT.slice().sort(()=>r()-.5).slice(0,4+Math.floor(r()*3));
        let a=r()*6.28;
        for(const kind of kinds){
          for(let k=0;k<8;k++){
            const rad=12+r()*16,px=x+Math.cos(a)*rad,pz=z+Math.sin(a)*rad,def=TYPES[kind],yaw=Math.round(r()*4)*Math.PI/2+(r()-.5)*.3;a+=.9+r()*.6;
            const g=this.env.terrain(px,pz);if(this.env.field.hit(V(px,g+.3,pz),V(px,g+8,pz),def.radius+1.5))continue;
            camp.structures.push(this.addStructure(kind,px,pz,yaw,camp));break;
          }
        }
        // v12: each camp belongs to one of the two opposing factions; rocket gunners among its infantry.
        camp.faction=this.factions?this.factions[this.camps.length%this.factions.length]:'black';
        for(let i=0;i<soldiersPerCamp;i++){const a2=r()*6.28,rad=4+r()*14;this.addSoldier(x+Math.cos(a2)*rad,z+Math.sin(a2)*rad,camp,r,{role:i<Math.min(this.cfg.rpgPerCamp??1,Math.floor(soldiersPerCamp/2))?'rpg':'rifle'});}
      }
      // v12: armed vehicles among the convoy, as in the game: Humvee with a ring-mounted minigun
      // (1 500 rounds/min, community databases) and pickups with a machine gun (M249, 850 rounds/min).
      for(let i=0;i<vehicles;i++){const z=-2400+r()*2800,u=r(),kind=u<.3?'humvee':u<.65?'pickup':'truck';
        this.vehicles.push({id:this.nextId++,z,dir:r()<.5?-1:1,speed:11+r()*5,kind,armed:kind==='humvee'?'minigun':kind==='pickup'?'m249':null,health:kind==='humvee'?22:kind==='pickup'?12:18,maxHealth:0,alive:true,position:V(),heading:0,points:kind==='humvee'?120:70,burning:0,fire:1+r()*2,burst:0,sees:false,look:0,firing:false,faction:this.factions?this.factions[i%this.factions.length]:'black'});}
      for(const v of this.vehicles){v.maxHealth=v.health;this.placeVehicle(v,0);}
      return this;
    }
    // opts: {role:'rifle'|'verba'|'crew', roof:{y,x0,x1,z0,z1} (stays on a roof), home:true (patrols around its spawn point)}
    addSoldier(x,z,camp,r=Math.random,opts={}){
      const role=opts.role||'rifle',s={id:this.nextId++,position:V(x,0,z),yaw:r()*6.28,state:role==='crew'?'crew':'patrol',pose:role==='crew'?'sit':'stand',phase:r()*6,target:null,wait:r()*3,health:1.6,alive:true,camp,shelter:null,
        calm:0,panic:0,think:r()*.2,fire:1+r()*2,burst:0,sees:false,brave:role==='verba'||role==='rpg'?r()<.5:r()<.4,color:['#5f6448','#6a5f45','#55604a'][Math.floor(r()*3)],dead:0,random:r,
        role,weapon:role==='verba'?'tube':role==='rpg'?'rpg':role==='crew'?'none':'rifle',launcher:null,raise:0,roof:opts.roof||null,home:opts.home?V(x,0,z):null,emplacement:null,
        faction:opts.faction||(camp&&camp.faction)||this.faction||'black'};
      if(role==='rpg'){s.rocketKind=opts.rocketKind||(r()<.7?'rpg7':'maaws');s.rockets=opts.rockets??3;s.loaded=true;s.aimTime=0;s.aimDelay=.5+r()*.7;}
      s.position.y=this.groundAt(s,x,z);if(s.home)s.home.y=s.position.y;
      this.soldiers.push(s);return s;
    }
    groundAt(s,x,z){return s.roof?s.roof.y:this.env.terrain(x,z);}
    // SAM emplacement: the trainer keeps its seat position up to date.
    addEmplacement(x,z,camp=null,yaw=0){
      const e={id:this.nextId++,position:V(x,this.env.terrain(x,z),z),yaw,camp,crew:null,runner:null,alive:true,seat:V(x,this.env.terrain(x,z)+1.5,z),remanTimer:0};
      this.emplacements.push(e);return e;
    }
    addCrew(e){const s=this.addSoldier(e.seat.x,e.seat.z,e.camp,Math.random,{role:'crew'});s.position.copy(e.seat);s.emplacement=e;e.crew=s;return s;}
    placeVehicle(v,dt){
      v.z+=v.dir*v.speed*dt;if(v.z<-3000||v.z>2200){v.dir*=-1;v.z=Math.max(-3000,Math.min(2200,v.z));}
      const lane=v.dir>0?2:-2,x=W.roadX(v.z)+lane,ahead=W.roadX(v.z+v.dir*5)+lane;v.position.set(x,this.env.terrain(x,v.z)+.9,v.z);v.heading=Math.atan2(-(ahead-x),-(v.dir*5));
    }
    // AI and motion. heli: {position, velocity, firing, alive}
    step(dt,heli){
      this.time+=dt;
      for(const v of this.vehicles){if(!v.alive){v.burning=Math.max(0,v.burning-dt);v.firing=false;continue;}this.placeVehicle(v,v.health<v.maxHealth*.4?0:dt);if(v.armed)this.vehicleGun(v,dt,heli);}
      for(const st of this.structures)if(!st.alive){st.fall=Math.min(1,st.fall+dt/1.4);st.burning=Math.max(0,st.burning-dt);}
      for(const s of this.soldiers){if(s.alive)this.think(s,dt,heli);else s.dead+=dt;}
      // A rifleman of the camp runs to an emplacement whose crew was killed.
      for(const e of this.emplacements){
        if(!e.alive||!e.camp||e.crew&&e.crew.alive)continue;
        if(e.runner){if(!e.runner.alive||e.runner.state!=='toSeat')e.runner=null;else continue;}
        e.remanTimer+=dt;if(e.remanTimer<8)continue;
        let best=null,bd=220;for(const s of this.soldiers)if(s.alive&&s.camp===e.camp&&s.role==='rifle'&&s.state!=='inside'){const d=Math.hypot(s.position.x-e.seat.x,s.position.z-e.seat.z);if(d<bd){bd=d;best=s;}}
        if(best){best.state='toSeat';best.target=e.seat.clone();best.emplacement=e;e.runner=best;e.remanTimer=0;}
      }
    }
    nearestShelter(s){
      let best=null,bd=150;
      for(const sh of this.shelters){if(!sh.alive||sh.occupants>=sh.capacity)continue;const d=Math.hypot(sh.door.x-s.position.x,sh.door.z-s.position.z);if(d<bd){bd=d;best=sh;}}
      return best;
    }
    think(s,dt,heli){
      if(s.role==='crew'){s.pose='sit';s.weapon='none';return;}   // seated; the trainer moves the seat
      const toHeli=heli.position.clone().sub(s.position),dist=toHeli.length(),L=s.role==='verba'?s.launcher:null;
      s.panic=Math.max(0,s.panic-dt);s.think-=dt;
      if(s.think<=0){
        s.think=.2+s.random()*.1;
        const eye=s.position.clone().add(V(0,1.6,0)),sight=L?Math.max(480,L.range||0):480;s.sees=heli.alive&&dist<sight&&this.env.los(eye,heli.position);
        if(s.state==='inside'){s.calm=s.sees||s.panic>0||dist<260?0:s.calm+.25;if(s.calm>10+s.random()*12)this.leaveShelter(s);return;}
        // A soldier running to an emplacement is committed.
        if(s.state!=='toSeat'){
          if(L)this.decideVerba(s,heli,dist,L);
          // Rockets fly only when the ground fights back; otherwise a rocket gunner behaves as a rifleman.
          else if(s.role==='rpg'&&this.rocketsLive())this.decideRocket(s,heli,dist);
          // Brave soldiers hold their ground under fire unless rounds land close.
          else if(heli.alive&&(dist<(s.brave?50:90)||s.panic>0||!s.brave&&s.sees&&heli.firing&&dist<320)){if(s.state!=='flee'&&s.state!=='prone')this.flee(s);}
          else if(s.sees&&(s.state==='patrol'||s.state==='idle'))s.state='alert';
          else if(s.state==='alert'&&!s.sees){s.state='patrol';s.target=null;}
        }
      }
      if(s.state==='inside')return;
      if(s.role==='verba'&&s.state!=='engage')s.weapon=s.state==='reload'&&s.wait>2.5||s.state==='resupply'&&!s.target?'none':'tube';
      if(s.role==='rpg'&&s.state!=='aimrpg'){s.weapon='rpg';s.raise=Math.max(0,s.raise-dt/.6);}
      let speed=0;
      if(s.state==='patrol'){
        if(!s.target){s.wait-=dt;s.pose='stand';if(s.wait<=0){const c=s.home||s.camp,cx=c?c.x:s.position.x,cz=c?c.z:s.position.z,a=s.random()*6.28,rad=s.home?1+s.random()*(s.roof?4:7):4+s.random()*20;s.target=V(cx+Math.cos(a)*rad,0,cz+Math.sin(a)*rad);}}
        else speed=1.5;
      }else if(s.state==='alert'){
        s.pose='aim';s.yaw=Math.atan2(-toHeli.x,-toHeli.z);s.aimPitch=Math.atan2(toHeli.y,Math.hypot(toHeli.x,toHeli.z))*.7;
        if(this.cfg.enemyFire&&s.sees)this.shoot(s,dt,heli,dist);
      }else if(s.state==='engage'){
        // Tube on the shoulder, aimed at the launcher's lead point.
        s.pose='aim';s.weapon='tube';s.raise=Math.min(1,s.raise+dt/.7);
        const aim=L&&L.lead?L.lead:heli.position,ax=aim.x-s.position.x,az=aim.z-s.position.z;
        s.yaw=Math.atan2(-ax,-az);s.aimPitch=Math.atan2(aim.y-s.position.y-1.5,Math.hypot(ax,az));
        // Right after a shot: kneel and reload, or go for more missiles.
        if(L&&L.state==='idle'&&L.reload>0){if(L.ammo>0){s.state='reload';s.wait=L.reload;s.pose='kneel';}else this.startResupply(s);}
      }else if(s.state==='aimrpg'){
        // Launcher on the shoulder, aimed at the lead point of the helicopter; fires once steady.
        const R=ROCKETS[s.rocketKind];s.pose='aim';s.weapon='rpg';s.raise=Math.min(1,s.raise+dt/.8);s.aimTime+=dt;
        const eye=s.position.clone().add(V(0,1.5,0)),d=heli.position.distanceTo(eye),tof=d/((R.speed+R.boost)/2),lead=heli.position.clone().addScaledVector(heli.velocity||V(),tof);lead.y+=.5*4.9*tof*tof;
        const ax=lead.x-s.position.x,az=lead.z-s.position.z;s.yaw=Math.atan2(-ax,-az);s.aimPitch=Math.atan2(lead.y-eye.y,Math.hypot(ax,az));
        if(s.raise>=1&&s.aimTime>=s.aimDelay&&s.sees&&s.loaded&&heli.alive){
          const err=(2.2/Math.max(.4,this.cfg.enemyAccuracy||1))*Math.PI/180,dir=lead.clone().sub(eye).normalize();
          dir.x+=(s.random()-.5)*2*err;dir.y+=(s.random()-.5)*2*err;dir.z+=(s.random()-.5)*2*err;dir.normalize();
          const from=eye.clone().addScaledVector(dir,.8);s.rockets--;s.loaded=false;this.stats.rocketsFired=(this.stats.rocketsFired||0)+1;
          this.emit('rocketFired',{soldier:s,kind:s.rocketKind,from,dir,spec:R});
          s.state='reload';s.wait=R.reload;s.pose='kneel';s.aimTime=0;
        }
      }
      else if(s.state==='reload'){s.pose='kneel';s.wait-=dt;const done=s.role==='rpg'?s.wait<=0:(s.wait<=0||!L||L.reload<=0);if(done){if(s.role==='rpg')s.loaded=s.rockets>0;s.state='patrol';s.target=null;s.wait=.3;}}
      else if(s.state==='resupply'){if(s.target)speed=3;else{s.pose='stand';s.wait-=dt;if(s.wait<=0){if(L)L.ammo+=2;if(s.role==='rpg'){s.rockets+=2;s.loaded=true;}s.state='patrol';s.wait=.5;this.emit('resupplied',{soldier:s});}}}
      else if(s.state==='toSeat')speed=4.6;
      else if(s.state==='flee')speed=5.2;
      else if(s.state==='prone'){s.pose='prone';s.wait-=dt;if(s.wait<=0){s.state='patrol';s.target=null;}}
      if(speed>0&&s.target){
        const d=V(s.target.x-s.position.x,0,s.target.z-s.position.z),Ld=d.length();
        if(Ld<1.2){s.target=null;
          if(s.state==='flee'){if(s.shelter&&s.shelter.alive&&s.shelter.occupants<s.shelter.capacity){s.state='inside';s.shelter.occupants++;if(s.shelter.structure)s.shelter.structure.occupants++;s.calm=0;this.stats.shelterEntries++;this.emit('shelter',{soldier:s,shelter:s.shelter});}else{s.state='prone';s.wait=6+s.random()*6;}}
          else if(s.state==='toSeat'){const e=s.emplacement;if(e&&e.alive&&!(e.crew&&e.crew.alive)){s.role='crew';s.state='crew';s.pose='sit';s.weapon='none';e.crew=s;e.runner=null;this.emit('crewed',{soldier:s,emplacement:e});}else{s.state='patrol';s.emplacement=null;}}
          else if(s.state==='resupply'){/* at the dump: waits s.wait */}
          else{s.wait=2+s.random()*4;}return;}
        d.divideScalar(Ld);let dir=d;
        // Simple avoidance: try straight, then 60 deg left or right.
        const probe=a=>{const q=V(dir.x*Math.cos(a)-dir.z*Math.sin(a),0,dir.x*Math.sin(a)+dir.z*Math.cos(a)),p=s.position.clone().add(V(0,1,0));return this.env.field.hit(p,p.clone().addScaledVector(q,1.8),.25,new Set(['arbre']))?null:q;};
        dir=s.roof?dir:probe(0)||probe(1.05)||probe(-1.05)||probe(2)||dir;
        s.position.x+=dir.x*speed*dt;s.position.z+=dir.z*speed*dt;
        if(s.roof){s.position.x=Math.min(s.roof.x1,Math.max(s.roof.x0,s.position.x));s.position.z=Math.min(s.roof.z1,Math.max(s.roof.z0,s.position.z));}
        s.position.y=this.groundAt(s,s.position.x,s.position.z);
        s.yaw=Math.atan2(-dir.x,-dir.z);s.phase+=dt*speed*2.4;s.pose=speed>3?'run':'walk';
      }
    }
    // Verba gunner: engage when loaded and the helicopter is in range, hold while
    // the launcher acquires or locks (the brave ones even under fire), else take cover.
    decideVerba(s,heli,dist,L){
      const armed=!L.dead&&L.ammo>0,engaged=L.state!=='idle',inRange=dist<=(L.range||1000)&&dist>=(L.minRange||0);
      const threatened=heli.alive&&(dist<40||s.panic>0&&!s.brave);
      if(threatened&&!(engaged&&s.brave)){if(s.state!=='flee'&&s.state!=='prone')this.flee(s);return;}
      if(s.state==='reload'||s.state==='resupply')return;
      // A launch leaves the launcher idle with its reload running: the gunner waits in 'engage' for the step that
      // starts his kneel-and-reload instead of turning back to 'patrol' (the think tick could land in between).
      if(s.state==='engage'&&L.state==='idle'&&L.reload>0)return;
      if(armed&&L.reload<=0&&s.sees&&inRange&&heli.alive){if(s.state!=='engage'){s.state='engage';s.raise=0;s.target=null;}return;}
      if(s.state==='engage'){if(engaged)return;s.state='patrol';s.target=null;s.wait=1+s.random()*2;return;}
      if(!armed&&!L.dead&&(s.state==='patrol'||s.state==='alert'))this.startResupply(s);
    }
    // Rocket gunner: shoulders the launcher when the helicopter is in sight and range, else takes
    // cover under fire like a rifleman; out of rockets, goes to the dump like a Verba gunner.
    decideRocket(s,heli,dist){
      const R=ROCKETS[s.rocketKind],threatened=heli.alive&&(dist<35||s.panic>0&&!s.brave);
      if(threatened&&!(s.state==='aimrpg'&&s.brave)){if(s.state!=='flee'&&s.state!=='prone')this.flee(s);return;}
      if(s.state==='reload'||s.state==='resupply'||s.state==='flee'||s.state==='prone')return;
      if(s.loaded&&s.sees&&dist<R.range&&dist>25&&heli.alive){if(s.state!=='aimrpg'){s.state='aimrpg';s.aimTime=0;s.target=null;}return;}
      if(s.state==='aimrpg'){s.state='patrol';s.target=null;s.wait=1+s.random()*2;return;}
      if(s.rockets<=0&&(s.state==='patrol'||s.state==='alert'))this.startResupply(s);
    }
    // Rockets fly only when the ground fights back (full match, return fire, air defence drill).
    rocketsLive(){return !!(this.cfg.enemyFire||this.cfg.aaEverywhere||this.cfg.scenario==='missiles');}
    // Out of missiles: to the camp's ammunition dump if it stands (6 s there), otherwise a teammate brings two after 30 s.
    startResupply(s){
      const dump=s.camp?this.structures.find(st=>st.camp===s.camp&&st.alive&&st.type==='munitions'):null;
      s.state='resupply';s.raise=0;s.target=dump&&!s.roof?dump.position.clone().add(V(2.8,0,2.8)):null;s.wait=dump&&!s.roof?6:30;
    }
    flee(s){
      if(s.roof){s.state='prone';s.wait=5+s.random()*6;s.pose='prone';return;}   // behind the parapet
      const sh=this.nearestShelter(s);s.shelter=sh;
      if(sh){s.state='flee';s.target=sh.door.clone();}else{s.state='prone';s.wait=6+s.random()*8;s.pose='prone';}
    }
    leaveShelter(s){
      const sh=s.shelter;if(sh){sh.occupants=Math.max(0,sh.occupants-1);if(sh.structure)sh.structure.occupants=Math.max(0,sh.structure.occupants-1);}s.shelter=null;s.state='patrol';s.target=null;s.wait=1;
      if(sh){s.position.copy(sh.door);s.position.y=this.env.terrain(s.position.x,s.position.z);}
    }
    shoot(s,dt,heli,dist){
      s.fire-=dt;if(s.fire>0)return;
      if(s.burst<=0){s.burst=3+Math.floor(s.random()*3);}
      s.burst--;s.fire=s.burst>0?.12:1.2+s.random()*2;
      const speed=heli.velocity?heli.velocity.length():0,p=Math.max(.02,.3*(1-dist/500)*(1-Math.min(1,speed/80)*.6));
      const hit=s.random()<p,from=s.position.clone().add(V(0,1.4,0)),to=heli.position.clone();
      if(!hit)to.add(V((s.random()-.5)*14,(s.random()-.5)*10,(s.random()-.5)*14));
      this.stats.shotsAtHeli++;if(hit)this.stats.hitsOnHeli++;this.emit('soldierShot',{soldier:s,from,to,hit});
    }
    // Vehicle gun: the gunner fires bursts at a helicopter in sight (minigun out to 650 m, machine
    // gun to 500 m); tracers are reported every 5 rounds with the number of hits among them.
    vehicleGun(v,dt,heli){
      // `firing` stays set through a burst: each report covers the next 0.2 s of fire (the sound
      // plays the gun while it is set; set on the report step only, it was heard as a few shots).
      v.gunHold=Math.max(0,(v.gunHold||0)-dt);v.firing=v.gunHold>0;if(!this.cfg.enemyFire||!heli.alive)return;
      // No fire on a helicopter at the helipad, where it respawns and rearms (the game's HQ is a
      // safe zone of about 480 m; the convoy's road passes the pad here).
      if(Math.hypot(heli.position.x-W.PAD.x,heli.position.z-W.PAD.z)<300){v.burst=0;return;}
      const G=v.armed==='minigun'?{range:650,rate:25,burst:[1.2,2.2],pause:[1.2,2.5],base:.2}:{range:500,rate:14,burst:[.5,.9],pause:[1,2],base:.16};
      const from=v.position.clone().add(V(0,2.3,0)),dist=from.distanceTo(heli.position);
      v.look-=dt;if(v.look<=0){v.look=.25;v.sees=dist<G.range&&this.env.los(from,heli.position);}
      if(!v.sees){v.burst=0;return;}
      v.fire-=dt;if(v.fire>0)return;
      if(v.burst<=0){v.burst=G.burst[0]+Math.random()*(G.burst[1]-G.burst[0]);}
      v.burst-=.2;v.fire=v.burst>0?.2:G.pause[0]+Math.random()*(G.pause[1]-G.pause[0]);v.gunHold=.21;v.firing=true;
      const rounds=Math.round(G.rate*.2),speed=heli.velocity?heli.velocity.length():0,p=Math.max(.01,G.base*(1-dist/G.range)*(1-Math.min(1,speed/80)*.6)*(this.cfg.enemyAccuracy||1));
      let hits=0;for(let i=0;i<rounds;i++)if(Math.random()<p)hits++;
      const to=heli.position.clone();if(!hits)to.add(V((Math.random()-.5)*12,(Math.random()-.5)*8,(Math.random()-.5)*12));
      this.stats.shotsAtHeli+=rounds;this.stats.hitsOnHeli+=hits;this.emit('vehicleShot',{vehicle:v,from,to,hits,rounds,gun:v.armed});
    }
    // Bullet (segment a-b) against standing, prone or lying soldiers.
    hitSoldier(a,b){
      let best=null;
      for(const s of this.soldiers){
        if(!s.alive||s.state==='inside')continue;const p=s.position;
        if(Math.abs(p.x-a.x)>60&&Math.abs(p.x-b.x)>60)continue;if(Math.abs(p.z-a.z)>60&&Math.abs(p.z-b.z)>60)continue;
        // Body capsule: standing, kneeling (0.45 m lower), seated (hips 0.84 m above the frame) or lying.
        const lying=s.pose==='prone',base=s.pose==='kneel'?-.3:s.pose==='sit'?.75:.15,top=s.pose==='kneel'?1.3:1.75;
        const p2=lying?p.clone().add(V(-Math.sin(s.yaw)*.9,.25,-Math.cos(s.yaw)*.9)):p.clone().add(V(0,Math.max(base,.05),0)),q2=lying?p.clone().add(V(Math.sin(s.yaw)*.9,.25,Math.cos(s.yaw)*.9)):p.clone().add(V(0,top,0));
        const r=segSeg(a,b,p2,q2);if(r.dist<(lying?.3:.34)&&(!best||r.s<best.fraction))best={soldier:s,fraction:r.s,point:a.clone().lerp(b,r.s)};
      }
      return best;
    }
    damageSoldier(s,amount,cause='tir'){
      if(!s.alive)return false;s.health-=amount;s.panic=6;
      if(s.health<=0){s.alive=false;s.state='dead';s.pose='dead';this.stats.soldiersKilled++;this.emit('soldierKilled',{soldier:s,cause});return true;}
      // The seated crew stays at its post; the others run for cover.
      if(s.role!=='crew'&&s.state!=='flee'&&s.state!=='toSeat')this.flee(s);return false;
    }
    damageStructure(st,amount){
      if(!st.alive)return false;st.health-=amount;if(st.health>0)return false;
      st.alive=false;st.health=0;this.stats.structuresDestroyed++;for(const b of st.boxes)b.off=true;
      const def=TYPES[st.type];st.burning=def.explode?30:12;
      // Occupants die; an explosion kills people outside around it and damages neighbours.
      for(const s of this.soldiers)if(s.alive&&s.state==='inside'&&s.shelter&&s.shelter.structure===st){s.shelter=null;s.state='dead';this.damageSoldier(s,99,'effondrement');}
      if(def.explode){this.blast(st.position,def.explode,st);}
      this.emit('structureDestroyed',{structure:st,explode:!!def.explode});return true;
    }
    blast(p,radius,source=null){
      for(const s of this.soldiers)if(s.alive&&s.state!=='inside'){const d=s.position.distanceTo(p);if(d<radius)this.damageSoldier(s,99,'explosion');else if(d<radius*2.5)s.panic=6;}
      for(const st of this.structures)if(st.alive&&st!==source&&st.position.distanceTo(p)<radius*.7)this.damageStructure(st,st.maxHealth*.6);
    }
    damageVehicle(v,amount){
      if(!v.alive)return false;v.health-=amount;if(v.health>0)return false;
      v.alive=false;v.burning=25;this.stats.vehiclesDestroyed++;this.emit('vehicleDestroyed',{vehicle:v});return true;
    }
    // Bullet impacts and explosions scare soldiers nearby.
    panic(p,radius){for(const s of this.soldiers)if(s.alive&&s.state!=='inside'&&s.position.distanceTo(p)<radius){s.panic=5;}}
    get objectivesLeft(){return this.structures.filter(s=>s.alive).length;}
  }
  const api={Battlefield,TYPES,ROCKETS,defaults,segSeg};
  if(typeof module!=='undefined')module.exports=api;else root.HeliGround=api;
})(typeof window!=='undefined'?window:globalThis);
