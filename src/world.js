/* World of the trainer. Two kinds of maps:
   - "vallee" (v7): practice valley with the orders of magnitude measured on the two
     reference recordings of the game (docs/analyse/decor.md): helipad 84 m ASL, flown
     ground 0-104 m ASL, trees and factory roofs 13-20 m (AGL jumps), tall chimney about
     90 m, pylons about 35 m, ground slope over 100 m of track median 0.03-0.09, p90 about
     0.15. Its relief is unchanged since v7; v12 adds a village, fields and the towers
     measured on recording 1 (about 33 m to the roof).
   - generated maps (v12): the same kind of Caucasus valley as the recordings - river
     on a gravel bed, road, railway, factory with chimneys and cranes, villages,
     fields, numbered towers, power line, bridges and often a viaduct - laid out from a
     seed. Original layouts, not reconstructions of the game's maps.
   World y = 0 on the helipad; the HUD shows ASL = y + 84. North is -z (heading 000),
   east is +x. In the browser the map comes from the page address (#carte=...) or from
   the last choice saved by the menu; Node and the tests get "vallee". */
(function(root){
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const mix=(a,b,t)=>a+(b-a)*t;
  function hash(ix,iz,seed){
    let h=(Math.imul(ix,374761393)^Math.imul(iz,668265263)^Math.imul(seed+1,1442695041))|0;
    h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296;
  }
  function noise(x,z,seed){
    const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
    const a=hash(ix,iz,seed),b=hash(ix+1,iz,seed),c=hash(ix,iz+1,seed),d=hash(ix+1,iz+1,seed);
    return (a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v)*2-1;
  }
  function fbm(x,z,octaves,seed){let s=0,a=1,n=0;for(let i=0;i<octaves;i++){s+=a*noise(x,z,seed+i*31);n+=a;a*=.5;x=x*2.03+17.1;z=z*2.03-9.7;}return s/n;}
  function ridged(x,z,octaves,seed){let s=0,a=1,n=0;for(let i=0;i<octaves;i++){const r=1-Math.abs(noise(x,z,seed+i*31));s+=a*r*r;n+=a;a*=.5;x=x*2.07+5.3;z=z*2.07+11.9;}return s/n;}
  const rng=seed=>{let s=(seed>>>0)||1;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};
  const ASL_OFFSET=84,PAD={x:0,z:130,radius:22},ROAD_WIDTH=8,RAIL_WIDTH=10,TRACK_WIDTH=4.5;
  // Range lane in front of the helipad (target range), kept open on every map.
  const LANE={x:45,meadow:170,z0:-1250,z1:260};
  const STORE_KEY='littlebird-map';

  // ---- Valley shape (v7 formulas with their numbers as parameters) ----
  // The valley axis wanders less in front of the helipad (straight target range).
  function valleyShape(p){
    const wander=z=>p.wMin+(1-p.wMin)*smooth(p.wR0,p.wR1,Math.abs(z-p.wC));
    const valleyX=z=>p.x0+(p.a1*Math.sin((z+p.o1)/p.l1)+p.a2*Math.sin(z/p.l2+p.o2))*wander(z);
    const halfWidth=z=>p.w0+p.w1*Math.sin(z/p.wl+p.wo);
    const riverX=z=>valleyX(z)+p.rs*halfWidth(z)+p.ra*Math.sin(z/p.rl+p.ro);
    const railX=z=>valleyX(z)+p.railS*halfWidth(z)+p.railOff;
    const roadX=z=>valleyX(z)+p.roadS*halfWidth(z);
    const floorY=z=>z<PAD.z?p.y0+p.sN*(z-PAD.z):p.y0+p.sS*(z-PAD.z);
    return {valleyX,halfWidth,riverX,railX,roadX,floorY};
  }
  // The v7 valley. River flows north (-z).
  const VIDEO={x0:-90,a1:150,o1:400,l1:1300,a2:50,l2:470,o2:1.3,wMin:.35,wC:-700,wR0:600,wR1:2200,w0:420,w1:100,wl:760,wo:.7,
    rs:-.45,ra:25,rl:230,ro:.4,railS:-.45,railOff:62,roadS:.62,y0:-8,sN:.02,sS:.028,
    floorNoise:3.2,slopeH:260,slopeV:90,slopeIn:60,slopeOut:900,roughH:48,roughIn:120,roughOut:500,mountH:380,mountV:560,mountIn:650,mountOut:2700,asym:0,
    // v12: open grass in patches on the upper slopes, as on recording 1 at 38-62 s (alpine).
    ns:0,tree0:560,tree1:760,alpine:.55,river:{bed:5.5,bottom:8,bank:24,water:1.8}};

  // Factory template in local coordinates: u across the valley from the rail side,
  // v along the valley (+z). v7 layout (origin x -230, z -1675, rail to the west).
  const FACTORY_TEMPLATE={
    buildings:[{id:'hall',u:110,v:75,w:46,d:150,h:18,roof:3.4,type:'hall'},{id:'boiler',u:190,v:-105,w:40,d:36,h:26,type:'brick'},
      {id:'workshop',u:220,v:165,w:34,d:52,h:14,type:'brick'},{id:'store',u:70,v:-195,w:56,d:30,h:12,type:'concrete'},
      {id:'office',u:225,v:-215,w:26,d:18,h:16,type:'concrete'},{id:'shed',u:40,v:220,w:24,d:40,h:10,type:'metal'}],
    chimneys:[{u:168,v:-150,h:90,r0:4.6,r1:2.9,bands:true},{u:146,v:-167,h:72,r0:3.3,r1:2.3,bands:false}],
    cranes:[{u:-12,v:145,h:34},{u:-12,v:25,h:36},{u:-12,v:-95,h:33}],
    // Container stacks: [u, v, along the valley, rows, levels, cols] (ISO 40 ft, 12.19 x 2.59 x 2.44 m).
    stacks:[[25,195,false,2,1,1],[31,140,false,2,2,1],[25,85,false,2,3,1],[31,30,false,2,1,1],[25,-25,false,2,2,1],[50,-45,true,3,2,2],[170,225,true,2,1,2]],
    tanks:[[35,-65],[35,-85],[250,25]],pipes:[[133,35,170,35],[170,35,170,-115],[220,135,220,-85]],wagons:[-205,205],size:{u0:0,u1:250,v0:-255,v1:255}};

  // Pseudo-Georgian place names for the generated maps (no map name of the game).
  function mapName(seed){
    const r=rng(seed*7919+13),pick=a=>a[Math.floor(r()*a.length)];
    const pre=['Zemo ','Kvemo ','Akhali ','Dzveli ','','',''],a=['Sa','Ar','Ka','Tski','Mta','Go','Ba','Na','Dze','Khe','Ve','Chi','Lo','Ra','Tse','Kor','Zu','Di'],
      b=['ri','khe','ta','ne','vi','ga','lo','du','mi','sha','bi','tsa','ra'],c=['uli','eti','ani','ati','isi','ovani','ari','ula','auri'];
    return pre[Math.floor(r()*pre.length)]+pick(a)+(r()<.55?pick(b):'')+pick(c);
  }
  function parseSpec(s){
    if(s&&typeof s==='object'&&(s.kind==='vallee'||s.kind==='gen'))return s.kind==='gen'?{kind:'gen',seed:(Math.abs(Math.round(s.seed))%999999)||1}:{kind:'vallee'};
    if(typeof s!=='string')return {kind:'vallee'};
    const m=/^gen-?(\d{1,6})$/.exec(s.trim());return m?{kind:'gen',seed:(Number(m[1])%999999)||1}:{kind:'vallee'};
  }
  const specId=s=>s.kind==='gen'?`gen-${s.seed}`:'vallee';

  // ---- Random valley parameters (generated maps) ----
  function randomValley(r){
    const u=(a,b)=>a+(b-a)*r(),side=r()<.5?-1:1;
    return {x0:0,a1:u(80,230),o1:u(0,3000),l1:u(900,1700),a2:u(20,75),l2:u(330,650),o2:u(0,6.28),wMin:u(.25,.4),wC:-700,wR0:600,wR1:2200,
      w0:u(360,540),w1:u(40,110),wl:u(600,1000),wo:u(0,6.28),rs:side*u(.34,.5),ra:u(12,34),rl:u(170,300),ro:u(0,6.28),railS:0,railOff:0,roadS:-side*u(.52,.68),
      y0:u(-10,-5),sN:u(.012,.028),sS:u(.015,.03),floorNoise:u(2.4,4.2),slopeH:u(210,320),slopeV:u(60,120),slopeIn:60,slopeOut:u(700,1000),
      roughH:u(30,60),roughIn:120,roughOut:500,mountH:u(300,480),mountV:u(450,720),mountIn:u(550,800),mountOut:u(2300,3000),asym:u(-.25,.25),
      ns:100+Math.floor(r()*9000),tree0:u(330,520),tree1:u(520,720),alpine:u(.35,.85),side,
      // Stream winding in a wide gravel bed, as on the recordings (recording 1 at 110 s, recording 2 at 106 s).
      river:(()=>{const gravel=u(1,1.5),bank=u(24,32),half=u(5.5,9);return {bed:u(4,5),bottom:half,bank,gravel,water:gravel+.5,half,channel:true,amp:u(.25,.7),len:u(260,520),phase:u(0,6.28)};})()};
  }

  function build(spec){
    const gen=spec.kind==='gen',seed=gen?spec.seed:0,r=rng(gen?(Math.imul(seed,2654435761)>>>0)||7:20250927);
    const u=(a,b)=>a+(b-a)*r();
    // Valley: generated parameters are drawn until the helipad, the range lane in front of
    // it, the river and the road fit (the helipad on the floor, the lane on open flat ground).
    let p=gen?null:{...VIDEO},V=null;
    if(gen){
      for(let attempt=0;attempt<60&&!V;attempt++){
        const q=randomValley(r);q.railS=q.rs;q.railOff=-q.side*u(55,75);
        const probe=valleyShape(q),c0=probe.valleyX(PAD.z);q.x0=-c0+u(-.25,.25)*probe.halfWidth(PAD.z);
        // Helipad yard and its hall (61 m to the side away from the road) clear of the lines.
        const S=valleyShape(q);let ok=Math.abs(S.riverX(PAD.z))>130&&Math.abs(S.roadX(PAD.z))>75&&Math.abs(S.railX(PAD.z))>85;
        for(let z=LANE.z0;ok&&z<=LANE.z1;z+=50){ok=Math.abs(S.valleyX(z))+LANE.meadow<S.halfWidth(z)-60&&Math.abs(S.riverX(z))>95&&Math.abs(S.roadX(z))>70&&Math.abs(S.railX(z))>70;}
        if(ok){p=q;V=S;}
      }
      if(!V){p={...VIDEO,ns:seed%9000+100};V=valleyShape(p);}
    }else V=valleyShape(p);
    const {valleyX,halfWidth,riverX,railX,roadX,floorY}=V,RIVER={...p.river},ns=p.ns;
    // Water line: the stream in its bed (generated maps), or the axis of the carved river (v7).
    // v12: the v7 river keeps its bed but its water is 1.2 m lower, 31 m wide instead of 36,
    // with gravel showing on both sides like the game's river.
    if(!gen)RIVER.water=3;
    const channelX=RIVER.channel?z=>riverX(z)+RIVER.amp*(RIVER.bank-RIVER.half-5)*Math.sin(z/RIVER.len+RIVER.phase):riverX;

    // ---- Wooded knolls on the valley floor (cover for terrain masking) ----
    let KNOLLS;
    if(!gen)KNOLLS=[{x:-580,z:-960,r:170,h:62},{x:330,z:-1150,r:200,h:85},{x:-260,z:-2350,r:220,h:70},{x:280,z:-2950,r:180,h:60},{x:-640,z:620,r:190,h:55},{x:420,z:420,r:150,h:38}];
    else{
      KNOLLS=[];const n=4+Math.floor(r()*4);
      for(let t=0;t<400&&KNOLLS.length<n;t++){
        const z=u(-2950,750),x=valleyX(z)+u(-.8,.8)*halfWidth(z),rad=u(120,220),h=u(35,90);
        if(Math.hypot(x-PAD.x,z-PAD.z)<420||Math.abs(x)<LANE.meadow+rad*.8&&z>LANE.z0-rad&&z<LANE.z1+rad)continue;
        if(Math.abs(x-riverX(z))<rad*.7||KNOLLS.some(k=>Math.hypot(k.x-x,k.z-z)<380))continue;
        KNOLLS.push({x,z,r:rad,h});
      }
    }
    const knollHeight=(x,z)=>{let h=0;for(const k of KNOLLS){const q=((x-k.x)**2+(z-k.z)**2)/(k.r*k.r);if(q<9)h+=k.h*Math.exp(-q);}return h;};
    const knollCover=(x,z)=>{let c=0;for(const k of KNOLLS){const q=((x-k.x)**2+(z-k.z)**2)/(k.r*k.r);c=Math.max(c,Math.exp(-q*.8));}return c;};

    function rawHeight(x,z){
      const vx=valleyX(z),W=halfWidth(z),d=Math.abs(x-vx),base=floorY(z),side=x<vx?-1:1;
      let h=base+p.floorNoise*fbm(x/300,z/300,3,1+ns);
      const slope=smooth(W-p.slopeIn,W+p.slopeOut,d);
      if(slope>0)h+=(p.slopeH*(1+.5*p.asym*side)+p.slopeV*fbm(x/900,z/900,3,2+ns))*Math.pow(slope,1.25);
      const rough=smooth(W-p.roughIn,W+p.roughOut,d);
      if(rough>0)h+=p.roughH*fbm(x/260,z/260,4,3+ns)*rough;
      const m=smooth(W+p.mountIn,W+p.mountOut,d);
      if(m>0)h+=m*(p.mountH*(1+p.asym*side)+p.mountV*ridged(x/1500,z/1500,5,4+ns));
      h+=knollHeight(x,z);
      const dr=Math.abs(x-riverX(z));
      if(dr<RIVER.bank+6){
        if(RIVER.channel){
          h=mix(base-RIVER.gravel,h,smooth(RIVER.bank-9,RIVER.bank+2,dr));
          h=Math.min(h,base-RIVER.bed+(RIVER.bed-RIVER.gravel+.3)*smooth(RIVER.half-3,RIVER.half+4,Math.abs(x-channelX(z))));
        }else h=mix(base-RIVER.bed,h,smooth(RIVER.bottom,RIVER.bank,dr));
      }
      return h;
    }
    const slopeAt=(x,z)=>{const h=rawHeight(x,z);return Math.max(Math.abs(rawHeight(x+12,z)-h),Math.abs(rawHeight(x,z+12)-h))/12;};

    // ---- Factory, from the template: along the rail, extending toward the valley axis ----
    let FACTORY,factoryLevel,BUILDINGS,CHIMNEYS,CRANES,YARD;
    {
      let zc=-1675,dir=1,u0=-230,T=FACTORY_TEMPLATE,flip=1,scaleD=1,width=250;
      if(gen){
        // Straightest stretch of rail with the most room before the road.
        let best=-Infinity;
        for(let z=-2650;z<=-1250;z+=25){
          let lo=Infinity,hi=-Infinity,room=Infinity;const dirZ=Math.sign(valleyX(z)-railX(z))||1;
          for(let v=-260;v<=260;v+=20){const rx=railX(z+v);lo=Math.min(lo,rx);hi=Math.max(hi,rx);room=Math.min(room,Math.abs(roadX(z+v)-rx));}
          const score=Math.min(room-60,270)-2.5*(hi-lo)-.02*Math.abs(z+1800)+u(0,20);
          // The range lane in front of the helipad stays open: the yard reaches 285 m along the valley.
          const cu=dirZ>0?hi+14:lo-14,cw=clamp(room-(hi-lo)-58,150,250),cx0=Math.min(cu,cu+dirZ*cw),cx1=Math.max(cu,cu+dirZ*cw);
          const onLane=cx1>-LANE.x-30&&cx0<LANE.x+30&&z+285>LANE.z0-30&&z-285<LANE.z1+30;
          if(!onLane&&score>best){best=score;zc=z;dir=dirZ;u0=cu;width=cw;}
        }
        flip=r()<.5?-1:1;scaleD=u(.85,1.1);
      }
      const at=(uu,vv)=>({x:u0+dir*uu*width/250,z:zc+flip*vv*scaleD});
      factoryLevel=floorY(zc)+.5;
      BUILDINGS=T.buildings.map(b=>{const q=at(b.u,b.v),j=gen?u(.88,1.12):1;return {id:b.id,x:q.x,z:q.z,w:b.w*j*width/250,d:b.d*(gen?u(.8,1.15):1)*scaleD,h:b.h*(gen?u(.85,1.15):1),roof:b.roof,type:b.type,base:factoryLevel,group:'factory'};});
      const main=gen?u(80,100):90,count=gen?1+Math.floor(r()*3):2;
      CHIMNEYS=[];for(let i=0;i<count;i++){const c=T.chimneys[Math.min(i,1)],q=at(c.u+(i>1?-40:0),c.v+(i>1?-30:0));
        CHIMNEYS.push({x:q.x,z:q.z,h:i===0?main:gen?main*u(.72,.86):c.h,r0:i===0?4.6:3.3,r1:i===0?2.9:2.3,bands:i===0});}
      if(!gen)CHIMNEYS=T.chimneys.map(c=>({x:-230+c.u,z:-1675+c.v,h:c.h,r0:c.r0,r1:c.r1,bands:c.bands}));
      CRANES=T.cranes.filter((c,i)=>!gen||i<2||r()<.7).map(c=>{const q=at(c.u,c.v);return {x:gen?u0-dir*12:q.x,z:q.z,h:gen?u(32,38):c.h};});
      // rot (v7 flag): the container's length lies across the valley (x); stacks keep their spacing.
      const containers=[];
      for(const [su,sv,rot,rows,levels,cols] of T.stacks){
        const q=at(su,sv);
        for(let rr=0;rr<rows;rr++)for(let cc=0;cc<cols;cc++)for(let l=0;l<levels-(rr+cc)%2;l++){
          const du=rot?cc*12.4:rr*2.6,dv=rot?rr*2.6:cc*12.4;
          containers.push({x:gen?q.x+dir*du:(-230+su)+du,z:gen?q.z+flip*dv:(-1675+sv)+dv,level:l,alongZ:!rot});
        }
      }
      const wz=[at(0,T.wagons[0]).z,at(0,T.wagons[1]).z];
      YARD={containers,tanks:T.tanks.map(([a,b])=>{const q=at(a,b);return [q.x,q.z];}),pipes:T.pipes.map(([a,b,c,d])=>{const q=at(a,b),q2=at(c,d);return [q.x,q.z,q2.x,q2.z];}),
        wagons:{z0:Math.min(...wz),z1:Math.max(...wz),side:-2*dir}};
      const xs=[at(T.size.u0,0).x,at(T.size.u1,0).x],zs=[at(0,T.size.v0).z,at(0,T.size.v1).z];
      FACTORY={x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs),dir};
    }
    const inFactory=(x,z,m=0)=>x>FACTORY.x0-m&&x<FACTORY.x1+m&&z>FACTORY.z0-m&&z<FACTORY.z1+m;
    // Main lines only (river, rail, road, helipad, range lane, factory): used while laying out.
    const onLines=(x,z,m=0)=>Math.hypot(x-PAD.x,z-PAD.z)<120+m||Math.abs(x)<LANE.x+m&&z>LANE.z0&&z<LANE.z1||inFactory(x,z,30+m)||Math.abs(x-riverX(z))<RIVER.bank+4+m||
      Math.abs(x-railX(z))<RAIL_WIDTH/2+6+m||Math.abs(x-roadX(z))<ROAD_WIDTH/2+6+m;

    // ---- Objective towers: about 33 m to the roof, measured on recording 1 (AGL over tower 3 at
    // 141 s, and its image at 146 s). Numbered 1-3 on their walls, as in the game. ----
    let TOWERS;
    if(!gen)TOWERS=[{id:0,x:-420,z:-640,h:33},{id:1,x:240,z:-1080,h:33},{id:2,x:-40,z:-2250,h:34}];
    else{
      TOWERS=[];
      for(let t=0;t<6000&&TOWERS.length<3;t++){
        // One tower per third of the valley, then anywhere if a third has no room.
        const band=t<4000?[[-2950,-1900],[-1900,-900],[-900,700]][TOWERS.length]:[-2950,700],z=u(band[0],band[1]),x=valleyX(z)+u(-.78,.78)*halfWidth(z);
        if(Math.hypot(x-PAD.x,z-PAD.z)<550||onLines(x,z,45)||TOWERS.some(q=>Math.hypot(q.x-x,q.z-z)<(t<4000?650:450))||slopeAt(x,z)>.12)continue;
        TOWERS.push({id:TOWERS.length,x,z,h:Math.round(u(32,35))});
      }
    }
    // ---- Power line across the valley ----
    let POWER;
    if(!gen)POWER={a:{x:-1500,z:-1150},b:{x:1500,z:-1370},spans:11,height:35};
    else{
      let zp=-1200;for(let t=0;t<200;t++){zp=u(-2300,-500);if(Math.abs(zp-(FACTORY.z0+FACTORY.z1)/2)>420&&TOWERS.every(q=>Math.abs(q.z-zp)>200))break;}
      const cx=valleyX(zp),dz=u(-220,220);POWER={a:{x:cx-1550,z:zp+dz},b:{x:cx+1550,z:zp-dz},spans:11,height:35};
    }
    const pylons=[];for(let i=0;i<=POWER.spans;i++){const t=i/POWER.spans;pylons.push({x:mix(POWER.a.x,POWER.b.x,t),z:mix(POWER.a.z,POWER.b.z,t)});}
    const distanceToSegment=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?clamp(((x-a[0])*dx+(z-a[1])*dz)/l,0,1):0;return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);};
    const distanceToPowerLine=(x,z)=>distanceToSegment(x,z,[POWER.a.x,POWER.a.z],[POWER.b.x,POWER.b.z]);

    // ---- Surface-to-air sites. y is filled after the flats are known. ----
    let AA_SITES;
    if(!gen)AA_SITES=[
      {id:'toit-halle',x:-120,z:-1600,kind:'manpads',roof:'hall'},{id:'toit-chaufferie',x:-40,z:-1780,kind:'manpads',roof:'boiler'},
      {id:'colline-est',x:330,z:-1150,kind:'manpads'},{id:'colline-ouest',x:-580,z:-960,kind:'manpads'},{id:'clairiere-est',x:560,z:-480,kind:'manpads'},
      {id:'rive-ouest',x:-560,z:-260,kind:'manpads'},{id:'plaine-nord',x:-140,z:-2110,kind:'manpads'},{id:'colline-nord',x:-260,z:-2350,kind:'manpads'},
      {id:'hameau-sud',x:430,z:560,kind:'manpads'},{id:'crete-ouest',x:-880,z:-1750,kind:'sam'},{id:'epaulement-est',x:640,z:-2350,kind:'sam'}];
    else{
      AA_SITES=[];const add=(id,x,z,kind,roof)=>AA_SITES.push(roof?{id,x,z,kind,roof}:{id,x,z,kind});
      const hall=BUILDINGS.find(b=>b.id==='hall'),boiler=BUILDINGS.find(b=>b.id==='boiler');add('toit-halle',hall.x,hall.z,'manpads','hall');add('toit-chaufferie',boiler.x,boiler.z,'manpads','boiler');
      KNOLLS.slice().sort((a,b)=>b.h-a.h).slice(0,3).forEach((k,i)=>{if(!onLines(k.x,k.z,10))add('colline-'+(i+1),k.x,k.z,'manpads');});
      const far=(x,z,m)=>AA_SITES.every(s=>Math.hypot(s.x-x,s.z-z)>m)&&TOWERS.every(q=>Math.hypot(q.x-x,q.z-z)>90);
      for(let t=0,k=0;t<800&&k<4;t++){const z=u(-2900,700),x=valleyX(z)+u(-.8,.8)*halfWidth(z);
        if(Math.hypot(x-PAD.x,z-PAD.z)<380||onLines(x,z,20)||slopeAt(x,z)>.12||!far(x,z,420))continue;add('clairiere-'+(++k),x,z,'manpads');}
      // Two SAM sites up the slopes, 700 m from the other sites (450 m if the slopes leave no room).
      let sams=0;for(const spacing of [700,450])for(let t=0;t<1500&&sams<2;t++){const z=u(-2800,300),s=r()<.5?-1:1,x=valleyX(z)+s*(halfWidth(z)+u(140,320));
        if(slopeAt(x,z)>.3||!far(x,z,spacing)||Math.hypot(x-PAD.x,z-PAD.z)<600)continue;add(`epaulement-${s<0?'ouest':'est'}-${++sams}`,x,z,'sam');}
    }

    // ---- Tracks: dirt roads from the road to the helipad, the towers and some sites ----
    const TRACKS=gen?[[[PAD.x+Math.sign(roadX(PAD.z)||1)*24,PAD.z],[roadX(PAD.z),PAD.z]]]:
      [[[PAD.x+24,PAD.z],[roadX(PAD.z),PAD.z]],[[roadX(-640),-640],[-150,-640],[-400,-640]],[[roadX(-1080),-1080],[240,-1080]],[[roadX(-2250),-2250],[-40,-2250]],[[roadX(-480),-480],[560,-480]]];
    if(gen)for(const t of TOWERS)TRACKS.push([[roadX(t.z),t.z],[t.x+(roadX(t.z)>t.x?9:-9),t.z]]);

    // ---- Villages: houses along the road and side streets, a few apartment blocks ----
    const HOUSES=[],TOWNS=[],STREETS=[];
    {
      const occupied=(x,z,w,d)=>HOUSES.some(h=>Math.abs(h.x-x)<(h.w+w)/2+4&&Math.abs(h.z-z)<(h.d+d)/2+4);
      const blocked=(x,z,m)=>Math.hypot(x-PAD.x,z-PAD.z)<140||Math.abs(x)<LANE.meadow&&z>LANE.z0&&z<LANE.z1||inFactory(x,z,40)||Math.abs(x-riverX(z))<RIVER.bank+8+m||
        Math.abs(x-railX(z))<RAIL_WIDTH/2+8+m||Math.abs(x-roadX(z))<ROAD_WIDTH/2+5+m||TOWERS.some(q=>Math.hypot(q.x-x,q.z-z)<50)||AA_SITES.some(s=>!s.roof&&Math.hypot(s.x-x,s.z-z)<(s.kind==='sam'?30:16))||distanceToPowerLine(x,z)<26||slopeAt(x,z)>.16;
      // One village around a point of the road; kept only if it gets enough houses.
      function village(c,ti){
        const start=HOUSES.length,streets=[],town={id:ti,x:c.x,z:c.z,x0:Infinity,x1:-Infinity,z0:Infinity,z1:-Infinity},inward=Math.sign(valleyX(c.z)-roadX(c.z))||1,L=110+c.n*6;
        const place=(x,z,w,d,h,yaw,kind)=>{if(blocked(x,z,Math.max(w,d)/2)||occupied(x,z,w,d))return false;
          HOUSES.push({x,z,w,d,h,yaw,kind,roof:kind==='block'?'flat':'gable',town:ti,base:Math.min(rawHeight(x-w/2,z-d/2),rawHeight(x+w/2,z+d/2),rawHeight(x-w/2,z+d/2),rawHeight(x+w/2,z-d/2))});
          town.x0=Math.min(town.x0,x-w);town.x1=Math.max(town.x1,x+w);town.z0=Math.min(town.z0,z-d);town.z1=Math.max(town.z1,z+d);return true;};
        // Houses facing the road on both sides.
        for(let z=c.z-L/2;z<c.z+L/2;z+=u(17,27))for(const s of [-1,1]){if(r()<.2)continue;const w=u(7,11),d=u(8,13),x=roadX(z)+s*(ROAD_WIDTH/2+u(7,13)+w/2);place(x,z,w,d,u(5,7.5),0,r()<.12?'barn':'house');}
        // Side streets toward the valley axis.
        const count=gen?1+Math.floor(r()*3):2;
        for(let k=0;k<count;k++){const zs=c.z+u(-.4,.4)*L,x0=roadX(zs)+inward*(ROAD_WIDTH/2+1),len=u(110,230),x1=x0+inward*len;
          if(blocked(x0+inward*len*.5,zs,0))continue;streets.push([[x0,zs],[x1,zs]]);
          for(let s=12;s<len;s+=u(16,26))for(const side of [-1,1]){if(r()<.25)continue;const w=u(8,12),d=u(7,11),z=zs+side*(TRACK_WIDTH/2+u(5,10)+d/2);place(x0+inward*s,z,w,d,u(5,7),0,r()<.1?'barn':'house');}}
        // Apartment blocks near the road (five storeys).
        for(let k=0;k<c.blocks;k++)for(let t=0;t<20;t++){const z=c.z+u(-.35,.35)*L,x=roadX(z)+inward*u(34,70);if(place(x,z,u(12,14),u(30,48),u(14.5,17.5),0,'block'))break;}
        if(HOUSES.length-start<(gen?12:8)){HOUSES.length=start;return false;}
        TOWNS.push(town);for(const s of streets)STREETS.push(s);return true;
      }
      if(!gen)village({x:roadX(760),z:760,n:22,blocks:0},0);
      else{const want=r()<.35?2:1;
        for(let t=0;t<900&&TOWNS.length<want;t++){const z=u(-2800,700),x=roadX(z);
          if(Math.hypot(x-PAD.x,z-PAD.z)<500||inFactory(x,z,300)||TOWERS.some(q=>Math.hypot(q.x-x,q.z-z)<260)||TOWNS.some(c=>Math.abs(c.z-z)<900)||slopeAt(x+30,z)>.1)continue;
          village({x,z,n:Math.round(u(18,40)),blocks:r()<.6?1+Math.floor(r()*3):0},TOWNS.length);}}
      for(const s of STREETS)TRACKS.push(s);
    }
    const houseAt=(x,z,m=0)=>{for(const t of TOWNS){if(x<t.x0-m||x>t.x1+m||z<t.z0-m||z>t.z1+m)continue;for(const h of HOUSES)if(h.town===t.id&&Math.abs(h.x-x)<h.w/2+m&&Math.abs(h.z-z)<h.d/2+m)return h;}return null;};

    // ---- Fields (stubble, ploughed, green, hay) on flat open ground of the floor ----
    const FIELDS=[];
    {
      const fr=gen?r:rng(11),fu=(a,b)=>a+(b-a)*fr(),n=gen?4+Math.floor(fr()*6):5;
      for(let t=0;t<3000&&FIELDS.length<n;t++){
        // Smaller fields when the floor has little open flat ground.
        const k=t<1500?1:.6,z=gen?fu(-2900,800):fu(-2600,900),x=valleyX(z)+fu(-.72,.72)*halfWidth(z),w=fu(90,240)*k,d=fu(60,170)*k,yaw=Math.atan2(valleyX(z+60)-valleyX(z-60),120)+fu(-.25,.25);
        if(Math.abs(x)<LANE.meadow+w/2&&z>LANE.z0-d&&z<LANE.z1+d)continue;
        const c=Math.cos(yaw),s=Math.sin(yaw);let ok=true;
        for(let i=-1;i<=1&&ok;i+=.5)for(let j=-1;j<=1&&ok;j+=.5){const px=x+c*i*w/2+s*j*d/2,pz=z-s*i*w/2+c*j*d/2;
          ok=!onLines(px,pz,6)&&!houseAt(px,pz,12)&&slopeAt(px,pz)<.07&&knollCover(px,pz)<.25&&TOWERS.every(q=>Math.hypot(q.x-px,q.z-pz)>50)&&AA_SITES.every(q=>q.roof||Math.hypot(q.x-px,q.z-pz)>30)&&
            FIELDS.every(f=>Math.hypot(f.x-px,f.z-pz)>Math.hypot(f.w,f.d)/2+8)&&distanceToPowerLine(px,pz)>24;}
        if(ok)FIELDS.push({id:FIELDS.length,x,z,w,d,yaw,crop:['chaume','labour','vert','foin'][Math.floor(fr()*4)]});
      }
    }
    function fieldAt(x,z){
      for(const f of FIELDS){const dx=x-f.x,dz=z-f.z,R=(f.w+f.d)/2;if(dx*dx+dz*dz>R*R)continue;const c=Math.cos(f.yaw),s=Math.sin(f.yaw),a=dx*c-dz*s,b=dx*s+dz*c;
        if(Math.abs(a)<f.w/2&&Math.abs(b)<f.d/2)return f;}
      return null;
    }

    // ---- Bridges where tracks and streets cross the river; a stone-arch viaduct across the valley ----
    const BRIDGES=[];
    for(const line of TRACKS)for(let i=1;i<line.length;i++){
      const [x0,z0]=line[i-1],[x1,z1]=line[i],f=t=>x0+(x1-x0)*t-riverX(z0+(z1-z0)*t);
      let prev=f(0);for(let k=1;k<=60;k++){const t=k/60,cur=f(t);if(prev*cur<=0){const x=x0+(x1-x0)*t,z=z0+(z1-z0)*t;
        BRIDGES.push({x,z,yaw:Math.atan2(x1-x0,z1-z0),length:2*RIVER.bank+14,width:7,y:floorY(z)+.9});break;}prev=cur;}
    }
    let VIADUCT=null;
    if(gen&&r()<.8){
      for(let t=0;t<200&&!VIADUCT;t++){
        const z=u(-2900,-1350);if(Math.abs(z-(FACTORY.z0+FACTORY.z1)/2)<380||Math.abs(z-(POWER.a.z+POWER.b.z)/2)<300||TOWERS.some(q=>Math.abs(q.z-z)<120)||TOWNS.some(q=>z>q.z0-60&&z<q.z1+60))continue;
        // From slope to slope: no high knoll under the deck, abutments where the valley sides reach it.
        const deck=floorY(z)+u(36,48),cx=valleyX(z),W0=halfWidth(z);let xa=null,xb=null,knoll=false;
        for(let x=cx-W0*.8;x<=cx+W0*.8;x+=20)if(knollHeight(x,z)>22)knoll=true;
        if(knoll)continue;
        for(let d=W0*.7;d<W0+1500;d+=10){if(xa===null&&rawHeight(cx-d,z)>=deck-3)xa=cx-d;if(xb===null&&rawHeight(cx+d,z)>=deck-3)xb=cx+d;}
        if(xa===null||xb===null||xb-xa>2100)continue;
        const piers=[];for(let x=xa+36;x<xb-30;x+=u(36,44)){if(Math.abs(x-riverX(z))<RIVER.bank+4||Math.abs(x-roadX(z))<9||Math.abs(x-railX(z))<10)continue;const g=rawHeight(x,z);if(g<deck-6)piers.push({x,ground:g});}
        VIADUCT={z,x0:xa,x1:xb,deck,width:11,piers};
      }
    }

    // ---- Flattened ground: towers, launch sites, pylons (v7), the viaduct's piers ----
    const FLATS=[];
    for(const t of TOWERS)FLATS.push({x:t.x,z:t.z,r:16});
    for(const s of AA_SITES)if(!s.roof)FLATS.push({x:s.x,z:s.z,r:s.kind==='sam'?12:5});
    for(const q of pylons)FLATS.push({x:q.x,z:q.z,r:6});
    for(const f of FLATS)f.y=rawHeight(f.x,f.z);
    function height(x,z){
      let h=rawHeight(x,z);
      const rp=Math.hypot(x-PAD.x,z-PAD.z);
      if(rp<120)h=mix(0,h,smooth(55,120,rp));
      const fx=Math.max(FACTORY.x0-x,0,x-FACTORY.x1),fz=Math.max(FACTORY.z0-z,0,z-FACTORY.z1);
      if(fx<60&&fz<60){const fd=Math.hypot(fx,fz);if(fd<60)h=mix(factoryLevel,h,smooth(0,60,fd));}
      for(const f of FLATS){const dx=x-f.x,dz=z-f.z;if(Math.abs(dx)<f.r*2.4&&Math.abs(dz)<f.r*2.4){const q=Math.hypot(dx,dz);if(q<f.r*2.4)h=mix(f.y,h,smooth(f.r,f.r*2.4,q));}}
      return h;
    }
    for(const t of TOWERS)t.base=height(t.x,t.z);
    for(const s of AA_SITES){const b=s.roof?BUILDINGS.find(q=>q.id===s.roof):null;s.y=b?b.base+b.h+(b.roof||0):height(s.x,s.z);}
    for(const h of HOUSES)h.base=Math.min(h.base,height(h.x,h.z));
    if(VIADUCT)for(const q of VIADUCT.piers)q.ground=height(q.x,VIADUCT.z);

    const trackBoxes=TRACKS.map(line=>{let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const [x,z] of line){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}return {line,x0,x1,z0,z1};});
    function distanceToTracks(x,z,limit=Infinity){
      let best=Infinity;
      for(const b of trackBoxes){if(x<b.x0-limit||x>b.x1+limit||z<b.z0-limit||z>b.z1+limit)continue;const line=b.line;for(let i=1;i<line.length;i++)best=Math.min(best,distanceToSegment(x,z,line[i-1],line[i]));}
      return best;
    }

    // Stand density (0-1, share of the densest stand, about 230 trees/ha): scattered trees and
    // groves on the floor, a belt along the river, closed forest on the lower slopes and
    // knolls, clearings, tree line; generated maps also have open alpine grass higher up (the
    // recordings show grassy upper slopes with scattered trees, recording 1 at 38-62 s). Fields
    // and villages are open, with hedgerows along the field edges.
    function forestDensity(x,z,h=height(x,z)){
      const d=Math.abs(x-valleyX(z)),W=halfWidth(z),dr=Math.abs(x-riverX(z));
      // v12: fewer isolated trees on the open floor (half of v9's), the groves carry the woodland.
      let q=.035+.045*fbm(x/150,z/150,2,5+ns);
      q=Math.max(q,.8*smooth(.06,.3,fbm(x/210,z/210,3,9+ns)));
      q=Math.max(q,.7*smooth(RIVER.bank-4,RIVER.bank+4,dr)*(1-smooth(40,70,dr)));
      // Closed forest on about 60 % of the lower slopes, grass between (v12; recording 1 at 38 s shows
      // open grassy slopes beside wooded ones, recording 1 at 120 s a wooded slope).
      q=Math.max(q,.95*smooth(W-110,W+140,d)*smooth(-.38,.02,fbm(x/520,z/520,2,41+ns)));
      q=Math.max(q,.9*smooth(.3,.65,knollCover(x,z)));
      q*=.45+.55*smooth(-.35,.15,fbm(x/450,z/450,3,7+ns));
      q*=.6+.55*smooth(-.3,.3,fbm(x/110,z/110,2,21+ns));
      q*=1-smooth(p.tree0,p.tree1,h);
      if(p.alpine>0)q*=1-p.alpine*smooth(W+180,W+520,d)*smooth(-.25,.25,fbm(x/650,z/650,2,31+ns));
      if(Math.abs(x)<LANE.meadow&&z>LANE.z0&&z<LANE.z1)q*=.45;
      if(FIELDS.length){const f=fieldAt(x,z);if(f)return 0;}
      for(const t of TOWNS)if(x>t.x0-25&&x<t.x1+25&&z>t.z0-25&&z<t.z1+25){q*=.25;break;}
      return clamp(q,0,1);
    }
    // True where nothing may grow: helipad, the range lane, factory, river, railway, road,
    // tracks, power line, towers, launch sites, houses, bridges and the viaduct's piers; and no
    // tree, bush or tuft in a field (the stand density is interpolated on the terrain grid, 9 to
    // 30 m apart, which let trees stand up to 20 m inside the edge of a field).
    function reserved(x,z){
      if(FIELDS.length&&fieldAt(x,z))return true;
      if(Math.hypot(x-PAD.x,z-PAD.z)<110)return true;
      if(Math.abs(x)<LANE.x&&z>LANE.z0&&z<LANE.z1)return true;
      if(x>FACTORY.x0-30&&x<FACTORY.x1+30&&z>FACTORY.z0-30&&z<FACTORY.z1+30)return true;
      if(Math.abs(x-riverX(z))<RIVER.bank-2)return true;
      if(Math.abs(x-railX(z))<RAIL_WIDTH/2+5||Math.abs(x-roadX(z))<ROAD_WIDTH/2+5)return true;
      if(distanceToTracks(x,z,TRACK_WIDTH/2+4)<TRACK_WIDTH/2+4||distanceToPowerLine(x,z)<22)return true;
      for(const t of TOWERS)if(Math.hypot(x-t.x,z-t.z)<45)return true;
      for(const s of AA_SITES)if(Math.hypot(x-s.x,z-s.z)<(s.kind==='sam'?26:12))return true;
      if(HOUSES.length&&houseAt(x,z,4))return true;
      for(const b of BRIDGES)if(Math.hypot(x-b.x,z-b.z)<b.length/2+6)return true;
      if(VIADUCT&&Math.abs(z-VIADUCT.z)<VIADUCT.width/2+8&&x>VIADUCT.x0-20&&x<VIADUCT.x1+20)for(const q of VIADUCT.piers)if(Math.abs(x-q.x)<9)return true;
      return false;
    }
    // Light of the recordings (late afternoon, warm, from the south-west); generated maps
    // change the sun's direction a little.
    const sun=gen?(()=>{const az=u(-2.9,-1.6),el=u(.3,.5);return [Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el)];})():[-.55,.42,.72];
    return {id:specId(spec),kind:spec.kind,seed,name:gen?mapName(seed):'Vallée de référence',generated:gen,params:p,LIGHT:{sun},
      ASL_OFFSET,PAD,LANE,FACTORY,factoryLevel,RIVER,ROAD_WIDTH,RAIL_WIDTH,TRACK_WIDTH,KNOLLS,TOWERS,BUILDINGS,CHIMNEYS,CRANES,YARD,POWER,pylons,AA_SITES,TRACKS,
      HOUSES,TOWNS,FIELDS,BRIDGES,VIADUCT,
      height,rawHeight,valleyX,halfWidth,riverX,channelX,railX,roadX,floorY,forestDensity,reserved,distanceToTracks,distanceToPowerLine,fieldAt,houseAt,knollCover,slopeAt,
      noise,fbm,ridged,smooth,clamp,mix};
  }

  // ---- The map in use: one object, filled in place so every module sees the same map ----
  const api={};
  function use(spec){
    const w=build(parseSpec(spec));
    for(const k of Object.keys(api))if(!(k in STATIC))delete api[k];
    Object.assign(api,w);return api;
  }
  // Map chosen in the browser: a new generated map at every load when the menu asks for it,
  // else the page address (#carte=gen-1234), else the menu's last choice.
  function chosen(){
    let saved=null;try{const s=root.localStorage&&root.localStorage.getItem(STORE_KEY);if(s)saved=JSON.parse(s);}catch(e){}
    if(saved&&saved.random&&!saved.keep)return {kind:'gen',seed:1+Math.floor(Math.random()*999998)};
    try{const m=/carte=([\w-]+)/.exec(root.location&&root.location.hash||'');if(m)return parseSpec(m[1]);}catch(e){}
    return parseSpec(saved&&saved.id||'vallee');
  }
  // Eight daytime light presets, as the game's servers draw one per round (community documentation of
  // the server settings, docs/SOURCES.md: all daytime, two with fog, no night and no rain). Sun azimuth
  // from north toward east and elevation in degrees; colours, fog and exposure are the trainer's own
  // interpretation of each preset (chosen), and the clear afternoon is the light of the reference recordings.
  const LIGHTS={
    'aube-clair':{label:'Lever du jour, ciel clair',az:100,el:6,sun:'#ffbb8c',sunI:2.2,hemiSky:'#c7ccd6',hemiGround:'#5a5848',zenith:'#6a8bb8',horizon:'#e2c6a6',ground:'#8b8a86',fog:'#d0c2b2',fogD:.00024,cloud:.56,shade:.05,glow:1.3,exposure:1.02},
    'matin-clair':{label:'Matin, ciel clair',az:120,el:19,sun:'#ffe1c2',sunI:3.1,hemiSky:'#d3dfee',hemiGround:'#5c6446',zenith:'#5787bb',horizon:'#cdd6dd',ground:'#8a918d',fog:'#c2ced8',fogD:.00018,cloud:.56,shade:0,glow:1,exposure:1.05},
    'matin-brouillard':{label:'Matin, brouillard',az:125,el:15,sun:'#f0e2cf',sunI:1.6,hemiSky:'#d5dbe0',hemiGround:'#626456',zenith:'#9aa7b4',horizon:'#cdd2d5',ground:'#9a9e9c',fog:'#c3c9cc',fogD:.0007,cloud:.46,shade:.12,glow:.5,exposure:1.0},
    'midi-clair':{label:'Midi, ciel clair',az:180,el:52,sun:'#fff2e0',sunI:3.7,hemiSky:'#d5e2f1',hemiGround:'#5c6446',zenith:'#4c7cb6',horizon:'#c0cdd8',ground:'#8a918d',fog:'#b8c6d2',fogD:.00016,cloud:.58,shade:0,glow:1,exposure:1.02},
    'apres-midi-clair':{label:'Après-midi, ciel clair (lumière de référence)',az:217,el:25,sun:'#ffe4c0',sunI:3.5,hemiSky:'#d5e2f1',hemiGround:'#5c6446',zenith:'#5b86b6',horizon:'#c6d0d4',ground:'#8a918d',fog:'#bcc8d1',fogD:.0002,cloud:.52,shade:0,glow:1,exposure:1.05},
    'apres-midi-gris':{label:'Après-midi, ciel gris',az:222,el:30,sun:'#e6e4de',sunI:1.2,hemiSky:'#c9ced3',hemiGround:'#5e6152',zenith:'#8a95a0',horizon:'#b7bcc0',ground:'#8d918e',fog:'#aeb3b6',fogD:.0003,cloud:.3,shade:.35,glow:.2,exposure:1.02},
    'apres-midi-brouillard':{label:'Après-midi gris, brouillard',az:222,el:26,sun:'#e2e0da',sunI:1,hemiSky:'#cbcfd2',hemiGround:'#62655a',zenith:'#99a0a7',horizon:'#bdc1c3',ground:'#9a9d9b',fog:'#b4b8ba',fogD:.0008,cloud:.25,shade:.4,glow:.15,exposure:1.0},
    'soir-clair':{label:'Fin du jour, ciel clair',az:262,el:6,sun:'#ffaa76',sunI:2.3,hemiSky:'#c6c9d3',hemiGround:'#57553f',zenith:'#587aab',horizon:'#e6bd9a',ground:'#8a8781',fog:'#d3baa4',fogD:.00024,cloud:.55,shade:.05,glow:1.4,exposure:1.02}};
  const STATIC={use,create:s=>build(parseSpec(s)),parseSpec,specId,mapName,STORE_KEY,LIGHTS,MAPS:[{id:'vallee',name:'Vallée de référence'},{id:'gen',name:'Vallée générée'}]};
  Object.assign(api,STATIC);
  use(typeof module!=='undefined'?{kind:'vallee'}:chosen());
  Object.assign(api,STATIC);
  if(typeof module!=='undefined')module.exports=api;else root.HeliWorld=api;
})(typeof window!=='undefined'?window:globalThis);
