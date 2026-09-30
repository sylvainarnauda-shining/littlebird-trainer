/* Scenery of the trainer's maps: original procedural models, not the game's assets.
   Sizes come from world.js (orders of magnitude measured on the recordings).
   Solid objects are registered in an ObstacleField for the helicopter,
   rounds and missiles (trees carry the kind 'arbre').
   v12, after the reference recordings: river winding over a gravel bed, helipad in a
   walled yard beside a derelict hall (recording 1 at 2 and 380 s), numbered steel towers
   of about 33 m (recording 1 at 134-146 s), villages, fields, bridges, stone viaduct
   (recording 1 at 110 s), land-use texture for crisp field and yard edges. */
(function(root){
  const pow=typeof module!=='undefined'?require('./core/pow.js').pow:root.HeliPow.pow; // same double on every platform
  function buildScenery(T,P,scene,helpers={}){
    const W=helpers.world||(typeof module!=='undefined'?require('./world.js'):root.HeliWorld);
    const quality=helpers.quality||'high',makeCanvas=helpers.canvas||null;
    let seed=helpers.seed||8317;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const field=new P.ObstacleField(),towers=[],wires=[],updates=[],col=hex=>new T.Color(hex);
    const std=o=>new T.MeshStandardMaterial({roughness:.9,metalness:.04,...o});
    const shadows=quality!=='low',Y=new T.Vector3(0,1,0);
    function add(obj,cast=true,receive=true){obj.castShadow=cast&&shadows;obj.receiveShadow=receive&&shadows;scene.add(obj);return obj;}
    function place(parent,geo,material,x,y,z,cast=true){const m=new T.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=cast&&shadows;m.receiveShadow=shadows;parent.add(m);return m;}
    // ---- Procedural textures (skipped when no canvas is available) ----
    function texture(size,draw,anisotropy=8,h=size){
      if(!makeCanvas)return null;
      const c=makeCanvas(size,h),g=c.getContext('2d');draw(g,size,h);
      const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;t.anisotropy=anisotropy;return t;
    }
    const speckle=(g,s,n,base,alpha,w=3,h=5)=>{for(let i=0;i<n;i++){const v=base+Math.floor(random()*(255-base));g.fillStyle=`rgba(${v},${v},${Math.round(v*.93)},${alpha})`;g.fillRect(random()*s,random()*s,1+random()*w,1+random()*h);}};
    // Tileable drawing: an element near an edge is drawn again on the opposite side.
    const wrapped=(s,x,y,r,draw)=>{for(const ox of [-s,0,s])for(const oy of [-s,0,s]){if(x+ox+r<0||x+ox-r>s||y+oy+r<0||y+oy-r>s)continue;draw(x+ox,y+oy);}};
    // Ground detail (luminance, tileable, 4.5 m a tile): soil patches, short grass blades
    // seen from above, pebbles. The vertex colours give the hue; this gives the grain.
    const groundTex=texture(512,(g,s)=>{g.fillStyle='rgb(200,200,200)';g.fillRect(0,0,s,s);
      for(let i=0;i<120;i++){const x=random()*s,y=random()*s,r=14+random()*60,v=110+Math.floor(random()*120);wrapped(s,x,y,r,(px,py)=>{g.fillStyle=`rgba(${v},${v-4},${v-14},.3)`;g.beginPath();g.ellipse(px,py,r,r*(.5+random()*.5),random()*3,0,7);g.fill();});}
      for(let i=0;i<14000;i++){const x=random()*s,y=random()*s,a=random()*6.28,l=3+random()*9,v=150+Math.floor(random()*105);wrapped(s,x,y,l,(px,py)=>{g.strokeStyle=`rgba(${v},${v},${Math.round(v*.86)},.55)`;g.lineWidth=1+random()*1.2;g.beginPath();g.moveTo(px,py);g.lineTo(px+Math.cos(a)*l,py+Math.sin(a)*l);g.stroke();});}
      for(let i=0;i<500;i++){const x=random()*s,y=random()*s,r=.8+random()*2.2,v=90+Math.floor(random()*150);wrapped(s,x,y,r,(px,py)=>{g.fillStyle=`rgba(${v},${v},${v},.6)`;g.beginPath();g.arc(px,py,r,0,7);g.fill();});}},16);
    // Rock face (luminance, tileable): strata, cracks and pale lichen for the steep slopes.
    const rockTex=texture(512,(g,s)=>{g.fillStyle='rgb(185,182,176)';g.fillRect(0,0,s,s);
      for(let i=0;i<60;i++){const y=random()*s,h=4+random()*26,v=120+Math.floor(random()*90);g.fillStyle=`rgba(${v},${v-3},${v-8},.45)`;g.fillRect(0,y,s,h);if(y+h>s)g.fillRect(0,y-s,s,h);}
      for(let i=0;i<140;i++){const x=random()*s,y=random()*s,l=20+random()*90,a=random()*6.28;wrapped(s,x,y,l,(px,py)=>{g.strokeStyle='rgba(60,58,55,.5)';g.lineWidth=1+random()*2;g.beginPath();g.moveTo(px,py);g.lineTo(px+Math.cos(a)*l,py+Math.sin(a)*l*.4);g.stroke();});}
      for(let i=0;i<260;i++){const x=random()*s,y=random()*s,r=2+random()*9;wrapped(s,x,y,r,(px,py)=>{g.fillStyle=`rgba(235,232,215,${.15+random()*.25})`;g.beginPath();g.arc(px,py,r,0,7);g.fill();});}},16);
    const asphaltTex=texture(256,(g,s)=>{g.fillStyle='#565857';g.fillRect(0,0,s,s);speckle(g,s,4000,60,.25,2,2);
      g.fillStyle='#d6d2c0';g.fillRect(s*.045,0,s*.02,s);g.fillRect(s*.935,0,s*.02,s);g.fillRect(s*.492,0,s*.016,s*.3);
      g.fillStyle='rgba(30,30,30,.25)';g.fillRect(s*.18,0,s*.12,s);g.fillRect(s*.7,0,s*.12,s);
      // Worn, patched edges as on the recordings.
      for(let i=0;i<30;i++){g.fillStyle=`rgba(${120+random()*40},${115+random()*35},${95+random()*30},.35)`;const x=random()<.5?random()*s*.07:s*(.93+random()*.07);g.fillRect(x,random()*s,4+random()*10,10+random()*40);}});
    const railTex=texture(256,(g,s)=>{g.fillStyle='#7c776e';g.fillRect(0,0,s,s);speckle(g,s,6000,70,.35,2,2);
      for(const cx of [.3,.7]){g.fillStyle='#4a3f35';for(let k=0;k<10;k++)g.fillRect(s*(cx-.13),k*s/10+s*.03,s*.26,s*.035);
        g.fillStyle='#3b3b3d';g.fillRect(s*(cx-.078),0,s*.012,s);g.fillRect(s*(cx+.066),0,s*.012,s);
        g.fillStyle='#a9a9ab';g.fillRect(s*(cx-.076),0,s*.004,s);g.fillRect(s*(cx+.068),0,s*.004,s);}});
    const dirtTex=texture(256,(g,s)=>{g.fillStyle='#7d6f58';g.fillRect(0,0,s,s);speckle(g,s,5000,70,.3);
      g.fillStyle='rgba(60,50,38,.35)';g.fillRect(s*.25,0,s*.1,s);g.fillRect(s*.65,0,s*.1,s);});
    const waterTex=texture(256,(g,s)=>{g.fillStyle='#8a9ca0';g.fillRect(0,0,s,s);
      for(let i=0;i<260;i++){const v=150+Math.floor(random()*100);g.strokeStyle=`rgba(${v},${v+8},${v+10},.35)`;g.lineWidth=1+random()*2;const x=random()*s,y=random()*s;g.beginPath();g.moveTo(x,y);g.lineTo(x+(random()-.5)*6,y+10+random()*30);g.stroke();}});
    // Brick with arched window openings (old factory halls of the recordings).
    const brickTex=texture(256,(g,s)=>{g.fillStyle='#8a5a44';g.fillRect(0,0,s,s);
      for(let r=0;r<32;r++)for(let c=0;c<9;c++){const v=110+Math.floor(random()*50);g.fillStyle=`rgb(${v+30},${v-15},${v-35})`;g.fillRect(((c+(r%2)*.5)*s/8)%s,r*s/32+1,s/8-2,s/32-2);}
      g.fillStyle='#262b2c';for(const x of [.2,.62]){g.beginPath();g.moveTo(s*x,s*.55);g.lineTo(s*x,s*.3);g.arc(s*(x+.09),s*.3,s*.09,Math.PI,0);g.lineTo(s*(x+.18),s*.55);g.closePath();g.fill();
        g.strokeStyle='rgba(120,120,110,.7)';g.lineWidth=2;for(let k=1;k<4;k++){g.beginPath();g.moveTo(s*x,s*(.3+k*.065));g.lineTo(s*(x+.18),s*(.3+k*.065));g.stroke();}g.beginPath();g.moveTo(s*(x+.09),s*.21);g.lineTo(s*(x+.09),s*.55);g.stroke();}
      g.fillStyle='rgba(20,20,20,.25)';g.fillRect(0,s*.9,s,s*.1);});
    const concreteTex=texture(256,(g,s)=>{g.fillStyle='#9a978f';g.fillRect(0,0,s,s);speckle(g,s,5000,110,.25);
      g.strokeStyle='rgba(60,60,60,.35)';for(let k=0;k<=4;k++){g.beginPath();g.moveTo(0,k*s/4);g.lineTo(s,k*s/4);g.stroke();g.beginPath();g.moveTo(k*s/4,0);g.lineTo(k*s/4,s);g.stroke();}
      g.fillStyle='#2a3133';for(const x of [.08,.58])g.fillRect(s*x,s*.3,s*.34,s*.14);
      for(let i=0;i<14;i++){g.fillStyle=`rgba(70,60,50,${.08+random()*.12})`;g.fillRect(random()*s,random()*s*.5,3+random()*8,s*.5);}});
    const metalTex=texture(256,(g,s)=>{g.fillStyle='#8b8f8a';g.fillRect(0,0,s,s);for(let x=0;x<s;x+=8){g.fillStyle='rgba(40,45,45,.28)';g.fillRect(x,0,3,s);}
      for(let i=0;i<30;i++){g.fillStyle=`rgba(120,70,40,${.1+random()*.2})`;g.fillRect(random()*s,random()*s,4+random()*18,20+random()*80);}});
    const corrugatedTex=texture(128,(g,s)=>{g.fillStyle='#ffffff';g.fillRect(0,0,s,s);for(let x=0;x<s;x+=6){g.fillStyle='rgba(0,0,0,.18)';g.fillRect(x,0,2,s);}
      g.fillStyle='rgba(0,0,0,.12)';g.fillRect(0,0,s,4);g.fillRect(0,s-4,s,4);
      for(let i=0;i<24;i++){g.fillStyle=`rgba(90,60,40,${.08+random()*.12})`;g.fillRect(random()*s,random()*s,2+random()*6,6+random()*30);}},4);
    // Plastered house facade (luminance, 6 m a tile): two storeys, two window bays, frames, stains.
    const facadeTex=texture(256,(g,s)=>{g.fillStyle='#e6e6e6';g.fillRect(0,0,s,s);speckle(g,s,2500,190,.3);
      for(let i=0;i<10;i++){g.fillStyle=`rgba(90,85,75,${.05+random()*.08})`;g.fillRect(random()*s,random()*s,20+random()*60,30+random()*90);}
      for(const fx of [.14,.62])for(const fy of [.1,.6]){g.fillStyle='#f4f2ec';g.fillRect(s*(fx-.02),s*(fy-.02),s*.28,s*.32);g.fillStyle='#262c2e';g.fillRect(s*fx,s*fy,s*.24,s*.28);
        g.fillStyle='#8c9396';g.fillRect(s*(fx+.115),s*fy,s*.01,s*.28);g.fillRect(s*fx,s*(fy+.13),s*.24,s*.01);g.fillStyle='rgba(60,60,60,.5)';g.fillRect(s*(fx-.03),s*(fy+.28),s*.3,s*.02);}
      g.fillStyle='rgba(60,55,50,.35)';g.fillRect(0,s*.47,s,s*.02);});
    // Five-storey panel block (luminance, 12 x 15 m a tile): panels, window grid, balconies.
    const blockTex=texture(256,(g,s)=>{g.fillStyle='#d2d0ca';g.fillRect(0,0,s,s);speckle(g,s,3000,150,.25);
      for(let f=0;f<5;f++)for(let b=0;b<4;b++){const x=b*s/4,y=f*s/5;g.strokeStyle='rgba(70,70,70,.4)';g.strokeRect(x+1,y+1,s/4-2,s/5-2);
        g.fillStyle='#2a3034';g.fillRect(x+s*.06,y+s*.05,s*.13,s*.1);if(b%2){g.fillStyle='rgba(150,148,140,1)';g.fillRect(x+s*.03,y+s*.14,s*.19,s*.045);}}
      for(let i=0;i<8;i++){g.fillStyle=`rgba(60,55,50,${.08+random()*.1})`;g.fillRect(random()*s,random()*s,3+random()*5,40+random()*120);}});
    // Stone blocks of the viaduct.
    const stoneTex=texture(256,(g,s)=>{g.fillStyle='#bdb6a8';g.fillRect(0,0,s,s);
      for(let r=0;r<12;r++)for(let c=0;c<5;c++){const v=160+Math.floor(random()*60);g.fillStyle=`rgb(${v},${v-5},${v-14})`;g.fillRect(((c+(r%2)*.5)*s/4.5)%s,r*s/12+1,s/4.5-3,s/12-3);}
      for(let i=0;i<30;i++){g.fillStyle=`rgba(70,70,60,${.06+random()*.1})`;g.fillRect(random()*s,random()*s,4+random()*10,30+random()*80);}});
    // Blue-grey digital camouflage net, as over the derelict hall's door on the recordings.
    const camoTex=texture(128,(g,s)=>{g.fillStyle='#8aa0be';g.fillRect(0,0,s,s);const cs=['#dfe6ee','#5b7196','#3c4f73','#a9bad2'];
      for(let i=0;i<500;i++){g.fillStyle=cs[Math.floor(random()*cs.length)];g.fillRect(Math.floor(random()*32)*4,Math.floor(random()*32)*4,4*(1+Math.floor(random()*3)),4*(1+Math.floor(random()*2)));}},4);
    // Boxes with UVs scaled to metres (one texture tile = tile metres).
    function boxUV(w,h,d,tile=8){
      const geo=new T.BoxGeometry(w,h,d),uv=geo.attributes.uv,dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
      for(let f=0;f<6;f++)for(let v=0;v<4;v++){const i=f*4+v;uv.setXY(i,uv.getX(i)*dims[f][0]/tile,uv.getY(i)*dims[f][1]/tile);}
      return geo;
    }
    function solid(parent,w,h,d,x,y,z,material,kind,ox=0,oy=0,oz=0,tile=8){const m=place(parent,boxUV(w,h,d,tile),material,x,y,z);field.add(x+ox,y+oy,z+oz,w,h,d,kind);return m;}
    // Beam between two points (for lattices); returns a transformed box geometry.
    function beam(a,b,t){
      const d=b.clone().sub(a),g=new T.BoxGeometry(t,d.length(),t),m=new T.Matrix4();
      m.compose(a.clone().add(b).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()),new T.Vector3(1,1,1));
      return g.applyMatrix4(m);
    }
    // Merge geometries into one non-indexed geometry with vertex colours and UVs.
    // gradient [bottom, top] darkens the lower part of a part (cheap occlusion).
    function merge(parts){
      const list=parts.map(p=>{const g=p.geo.index?p.geo.toNonIndexed():p.geo.clone();if(p.matrix)g.applyMatrix4(p.matrix);if(!g.attributes.normal)g.computeVertexNormals();return {g,c:p.color||new T.Color(1,1,1),grad:p.gradient||[1,1]};});
      const total=list.reduce((s,p)=>s+p.g.attributes.position.count,0),pos=new Float32Array(total*3),nor=new Float32Array(total*3),colr=new Float32Array(total*3),uvs=new Float32Array(total*2);let o=0;
      for(const {g,c,grad} of list){
        const n=g.attributes.position.count,ys=g.attributes.position;let y0=Infinity,y1=-Infinity;for(let i=0;i<n;i++){y0=Math.min(y0,ys.getY(i));y1=Math.max(y1,ys.getY(i));}
        pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);if(g.attributes.uv)uvs.set(g.attributes.uv.array,o*2);
        for(let i=0;i<n;i++){const f=grad[0]+(grad[1]-grad[0])*(y1>y0?(ys.getY(i)-y0)/(y1-y0):1);colr[(o+i)*3]=c.r*f;colr[(o+i)*3+1]=c.g*f;colr[(o+i)*3+2]=c.b*f;}o+=n;
      }
      const out=new T.BufferGeometry();out.setAttribute('position',new T.BufferAttribute(pos,3));out.setAttribute('normal',new T.BufferAttribute(nor,3));out.setAttribute('color',new T.BufferAttribute(colr,3));out.setAttribute('uv',new T.BufferAttribute(uvs,2));return out;
    }
    // Collector of parts for one merged mesh; frame = world matrix of a local frame (or null).
    function Parts(){
      const list=[],q=new T.Quaternion(),e=new T.Euler();
      return {list,
        put(geo,x,y,z,{color=null,rx=0,ry=0,rz=0,grad=null,frame=null,s=null}={}){const m=new T.Matrix4().compose(new T.Vector3(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),s||new T.Vector3(1,1,1));if(frame)m.premultiply(frame);list.push({geo,matrix:m,color:color?col(color):null,gradient:grad});},
        box(w,h,d,x,y,z,o={}){this.put(o.tile?boxUV(w,h,d,o.tile):new T.BoxGeometry(w,h,d),x,y,z,o);},
        mesh(material,cast=true,receive=true,name=''){if(!list.length)return null;const m=new T.Mesh(merge(list),material);m.name=name;return add(m,cast,receive);}};
    }
    const frameOf=(x,y,z,yaw=0)=>new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromAxisAngle(Y,yaw),new T.Vector3(1,1,1));
    // Axis-aligned collision box of a local box (cx, cy, cz, w, h, d) under a yawed frame.
    function solidLocal(x,y,z,yaw,[cx,cy,cz,w,h,d],kind){
      const c=Math.cos(yaw),s=Math.sin(yaw);
      field.add(x+cx*c+cz*s,y+cy,z-cx*s+cz*c,Math.abs(c)*w+Math.abs(s)*d,h,Math.abs(s)*w+Math.abs(c)*d,kind);
    }

    // ---- Terrain: one grid, fine near the play area (sinh spacing: ~9 m to ~90 m) ----
    const N=quality==='low'?240:quality==='medium'?320:400,A=6000,K=3,CX=-100,CZ=-900,S=Math.sinh(K);
    const coord=i=>A*Math.sinh(K*(i/N*2-1))/S,vc=(N+1)*(N+1),pos=new Float32Array(vc*3),uvs=new Float32Array(vc*2);
    for(let j=0,k=0;j<=N;j++){const z=CZ+coord(j);for(let i=0;i<=N;i++,k++){const x=CX+coord(i);pos[k*3]=x;pos[k*3+1]=W.height(x,z);pos[k*3+2]=z;uvs[k*2]=x/4.5;uvs[k*2+1]=z/4.5;}}
    const index=new Uint32Array(N*N*6);for(let j=0,q=0;j<N;j++)for(let i=0;i<N;i++,q+=6){const a=j*(N+1)+i,b=a+1,c=a+N+1,d=c+1;index[q]=a;index[q+1]=c;index[q+2]=b;index[q+3]=b;index[q+4]=c;index[q+5]=d;}
    const terrainGeo=new T.BufferGeometry();terrainGeo.setAttribute('position',new T.BufferAttribute(pos,3));terrainGeo.setAttribute('uv',new T.BufferAttribute(uvs,2));terrainGeo.setIndex(new T.BufferAttribute(index,1));terrainGeo.computeVertexNormals();
    const stand=new Float32Array(vc);
    const R=W.RIVER,alpine=(W.params&&W.params.alpine)||0;
    {
      const nrm=terrainGeo.attributes.normal.array,colors=new Float32Array(vc*3),c=new T.Color(),tmp=new T.Color();
      // Grass and forest floor muted like the recordings (grass on screen about #49513a-#535433).
      const C={meadow:col('#5b6440'),dry:col('#77714b'),lush:col('#4c5834'),canopy:col('#343b2a'),autumn:col('#584b2e'),alpine:col('#80805e'),steppe:col('#8a8558'),rock:col('#85806f'),darkRock:col('#615e57'),snow:col('#eef2f5'),gravel:col('#908a7c'),bed:col('#50544b'),yard:col('#726d60'),earth:col('#7b6a4c')};
      for(let k=0;k<vc;k++){
        const x=pos[k*3],h=pos[k*3+1],z=pos[k*3+2],ny=nrm[k*3+1],slope=Math.sqrt(Math.max(0,1-ny*ny))/Math.max(ny,.05);
        const n1=W.fbm(x/220,z/220,3,11),n2=W.fbm(x/60,z/60,2,12),n3=W.fbm(x/95,z/95,2,13);
        c.copy(C.meadow).lerp(n1>0?C.dry:C.lush,Math.min(1,Math.abs(n1)*1.6)).lerp(C.alpine,W.smooth(420,640,h));
        // Generated maps: dry yellow-green grass on the open upper slopes (recording 1 at 38-62 s).
        if(alpine>0){const d=Math.abs(x-W.valleyX(z)),hw=W.halfWidth(z);c.lerp(C.steppe,alpine*.7*W.smooth(hw+150,hw+600,d)*(.6+.4*W.smooth(-.3,.3,n1)));}
        // Mown and tall grass patches, bare earth spots on flat ground.
        c.multiplyScalar(1+.26*n3+.1*W.fbm(x/34,z/34,2,14)).lerp(C.earth,W.smooth(.45,.7,n3)*.35*(1-W.smooth(.2,.4,slope)));
        // Forest floor under the stands (the same density places the trees).
        stand[k]=W.forestDensity(x,z,h);
        tmp.copy(C.canopy).lerp(C.autumn,W.smooth(-.2,.5,n2));c.lerp(tmp,W.smooth(.2,.7,stand[k])*.9);
        c.lerp(C.rock,W.smooth(.55,.95,slope)*.9).lerp(C.darkRock,W.smooth(1.1,1.6,slope)*.6);
        const snow=720+70*n1;c.lerp(C.snow,W.smooth(snow,snow+110,h)*(1-W.smooth(1.1,1.5,slope)));
        const dr=Math.abs(x-W.riverX(z));if(dr<R.bank+2)c.lerp(dr<(R.channel?R.half+2:14)?C.bed:C.gravel,1-W.smooth(R.channel?R.bank-4:14,R.bank+2,dr));
        if(x>W.FACTORY.x0-12&&x<W.FACTORY.x1+12&&z>W.FACTORY.z0-12&&z<W.FACTORY.z1+12)c.lerp(C.yard,.85);
        const rp=Math.hypot(x-W.PAD.x,z-W.PAD.z);if(rp<80)c.lerp(C.yard,(1-W.smooth(42,80,rp))*.75);
        const v=1.08+.08*n2;colors[k*3]=c.r*v;colors[k*3+1]=c.g*v;colors[k*3+2]=c.b*v;
      }
      terrainGeo.setAttribute('color',new T.BufferAttribute(colors,3));
    }
    // ---- Land use (v12): fields, gravel beds and yards drawn at 2.6 m per pixel over the play
    // area, blended over the terrain colours in its shader (crisp edges, furrows). ----
    const LAND={x0:-2700,z0:-3500,size:5400,px:2048};
    const landTex=makeCanvas&&quality!=='low'?(()=>{
      const S=LAND.px,c=makeCanvas(S,S),g=c.getContext('2d'),k=S/LAND.size,X=x=>(x-LAND.x0)*k,Z=z=>(z-LAND.z0)*k;g.clearRect(0,0,S,S);
      // Gravel bed of the river, the stream darker and wet (under the water surface).
      const bank=[],band=(fx,off)=>{for(let z=LAND.z0;z<=LAND.z0+LAND.size;z+=6)bank.push([X(fx(z)+off),Z(z)]);};
      const strip=(fx,a,b,style)=>{bank.length=0;band(fx,a);const right=[];for(let z=LAND.z0+LAND.size;z>=LAND.z0;z-=6)right.push([X(fx(z)+b),Z(z)]);g.fillStyle=style;g.beginPath();bank.concat(right).forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill();};
      strip(W.riverX,-(R.bank-3),R.bank-3,'rgba(122,117,106,.8)');
      for(let i=0;i<60000;i++){const z=LAND.z0+random()*LAND.size,x=W.riverX(z)+(random()*2-1)*(R.bank-3),v=70+Math.floor(random()*110);g.fillStyle=`rgba(${v},${v-3},${v-10},.5)`;g.fillRect(X(x),Z(z),1+random()*1.5,1+random()*1.5);}
      if(R.channel)strip(W.channelX,-(R.half+3),R.half+3,'rgba(78,80,72,.85)');
      // Fields: stubble, ploughed earth, young crop, hay, sunflowers.
      const CROP={chaume:['#b1a06b','rgba(120,105,70,.55)',3],labour:['#6c5842','rgba(55,42,30,.7)',2],vert:['#6a843d','rgba(70,95,45,.8)',3],foin:['#9a9859','rgba(150,146,96,.7)',6],tournesol:['#7a6a35','rgba(200,170,50,.8)',2]};
      for(const f of W.FIELDS){
        const [base,stripe,gap]=CROP[f.crop]||CROP.chaume;g.save();g.translate(X(f.x),Z(f.z));g.rotate(-f.yaw);const w=f.w*k,d=f.d*k;
        g.fillStyle=base;g.fillRect(-w/2,-d/2,w,d);g.strokeStyle=stripe;g.lineWidth=1;
        for(let y=-d/2+1;y<d/2;y+=gap){g.beginPath();g.moveTo(-w/2+1,y);g.lineTo(w/2-1,y);g.stroke();}
        for(let i=0;i<w*d*.25;i++){const v=random();g.fillStyle=`rgba(${v<.5?40:210},${v<.5?35:200},${v<.5?25:150},.12)`;g.fillRect(-w/2+random()*w,-d/2+random()*d,1,1);}
        g.strokeStyle='rgba(70,70,45,.6)';g.lineWidth=1.5;g.strokeRect(-w/2,-d/2,w,d);g.restore();
      }
      // Yards: helipad compound (wet gravel with puddles), factory, around the houses.
      g.fillStyle='rgba(106,102,92,.9)';g.fillRect(X(W.PAD.x-26),Z(W.PAD.z-26),52*k,52*k);
      for(let i=0;i<40;i++){const x=W.PAD.x+(random()*2-1)*24,z=W.PAD.z+(random()*2-1)*24;g.fillStyle=`rgba(62,62,58,${.3+random()*.4})`;g.beginPath();g.ellipse(X(x),Z(z),(1+random()*3)*k,(1+random()*2)*k,random()*3,0,7);g.fill();}
      g.fillStyle='rgba(118,114,104,.75)';g.fillRect(X(W.FACTORY.x0-8),Z(W.FACTORY.z0-8),(W.FACTORY.x1-W.FACTORY.x0+16)*k,(W.FACTORY.z1-W.FACTORY.z0+16)*k);
      for(let i=0;i<500;i++){g.fillStyle=`rgba(60,55,48,${.1+random()*.2})`;g.fillRect(X(W.FACTORY.x0+random()*(W.FACTORY.x1-W.FACTORY.x0)),Z(W.FACTORY.z0+random()*(W.FACTORY.z1-W.FACTORY.z0)),(2+random()*6)*k,(2+random()*6)*k);}
      for(const h of W.HOUSES){g.fillStyle='rgba(118,106,82,.45)';g.fillRect(X(h.x-h.w/2-5),Z(h.z-h.d/2-5),(h.w+10)*k,(h.d+10)*k);}
      const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.flipY=false;t.anisotropy=helpers.anisotropy||8;t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;return t;})():null;
    // Ground shading (v11): the grain at 4.5 m blends into the same texture at 24 m with the
    // distance (no visible tiling), a bump from the grain, rock strata where the slope is steep;
    // v12: land use over the vertex colours.
    const terrainMat=std({vertexColors:true,map:groundTex,bumpMap:groundTex,bumpScale:1.4,roughness:.97,envMapIntensity:.6});
    if(groundTex&&rockTex)terrainMat.onBeforeCompile=s=>{
      s.uniforms.rockMap={value:rockTex};s.uniforms.landMap={value:landTex};s.uniforms.landArea={value:new T.Vector3(LAND.x0,LAND.z0,LAND.size)};
      s.vertexShader='varying vec3 vGroundPos;\nvarying vec3 vGroundNrm;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundPos=(modelMatrix*vec4(transformed,1.0)).xyz;\nvGroundNrm=normalize(mat3(modelMatrix)*objectNormal);');
      s.fragmentShader='uniform sampler2D rockMap;\nuniform sampler2D landMap;\nuniform vec3 landArea;\nvarying vec3 vGroundPos;\nvarying vec3 vGroundNrm;\nfloat gGrain=1.0;\n'+s.fragmentShader.replace('#include <map_fragment>',`
        float gDist=length(vViewPosition);
        float gFine=texture2D(map,vMapUv).g,gCoarse=texture2D(map,vMapUv*0.19+vec2(0.37,0.11)).g;
        float gLum=mix(gFine*0.6+gCoarse*0.4,gCoarse,smoothstep(90.0,700.0,gDist));
        float gRock=smoothstep(0.34,0.58,1.0-clamp(vGroundNrm.y,0.0,1.0));
        float gStrata=texture2D(rockMap,vec2((vGroundPos.x+vGroundPos.z)*0.7,vGroundPos.y*1.7)*0.085).g;
        gGrain=mix(0.33+0.76*gLum,0.3+0.95*gStrata,gRock);`).replace('#include <color_fragment>',`#include <color_fragment>
        ${landTex?'vec4 gLand=texture2D(landMap,(vGroundPos.xz-landArea.xy)/landArea.z);diffuseColor.rgb=mix(diffuseColor.rgb,gLand.rgb,gLand.a*(1.0-gRock));':''}
        diffuseColor.rgb*=gGrain;`);
    };
    const terrain=add(new T.Mesh(terrainGeo,terrainMat),false,true);
    // Height and stand density read on the rendered terrain (trees sit on the drawn surface).
    const XS=new Float64Array(N+1),ZS=new Float64Array(N+1);for(let i=0;i<=N;i++){XS[i]=CX+coord(i);ZS[i]=CZ+coord(i);}
    const locate=(v,c0,arr)=>{let i=Math.floor((Math.asinh((v-c0)*S/A)/K+1)*N/2);i=Math.max(0,Math.min(N-1,i));while(i>0&&v<arr[i])i--;while(i<N-1&&v>arr[i+1])i++;return i;};
    const probe=[0,0];
    function terrainSample(x,z){
      const i=locate(x,CX,XS),j=locate(z,CZ,ZS),u=Math.min(1,Math.max(0,(x-XS[i])/(XS[i+1]-XS[i]))),w=Math.min(1,Math.max(0,(z-ZS[j])/(ZS[j+1]-ZS[j])));
      const a=j*(N+1)+i,b=a+1,c=a+N+1,d=c+1,ha=pos[a*3+1],hb=pos[b*3+1],hc=pos[c*3+1],hd=pos[d*3+1];
      // Same diagonal as the index buffer: triangles (a,b,c) and (b,c,d).
      probe[0]=u+w<=1?ha+(hb-ha)*u+(hc-ha)*w:hd+(hc-hd)*(1-u)+(hb-hd)*(1-w);
      probe[1]=(stand[a]*(1-u)+stand[b]*u)*(1-w)+(stand[c]*(1-u)+stand[d]*u)*w;
      return probe;
    }

    // ---- Ribbons: river, road, railway, tracks ----
    function resample(points,step){const out=[points[0]];for(let i=1;i<points.length;i++){const [x0,z0]=points[i-1],[x1,z1]=points[i],n=Math.max(1,Math.ceil(Math.hypot(x1-x0,z1-z0)/step));for(let k=1;k<=n;k++)out.push([x0+(x1-x0)*k/n,z0+(z1-z0)*k/n]);}return out;}
    function ribbon(points,width,material,{lift=.3,vLen=10,y=null,across=2,step=5}={}){
      const pts=resample(points,step),n=pts.length,cols=across+1,p=new Float32Array(n*cols*3),u=new Float32Array(n*cols*2),idx=[];let dist=0;
      for(let i=0;i<n;i++){
        const [x,z]=pts[i],[xa,za]=pts[Math.max(0,i-1)],[xb,zb]=pts[Math.min(n-1,i+1)],L=Math.hypot(xb-xa,zb-za)||1,tx=(xb-xa)/L,tz=(zb-za)/L;
        if(i)dist+=Math.hypot(x-pts[i-1][0],z-pts[i-1][1]);
        for(let c=0;c<cols;c++){const s=(c/(cols-1)-.5)*width,px=x-tz*s,pz=z+tx*s,k=i*cols+c;p[k*3]=px;p[k*3+1]=y?y(px,pz):W.height(px,pz)+lift;p[k*3+2]=pz;u[k*2]=c/(cols-1);u[k*2+1]=dist/vLen;}
        if(i)for(let c=0;c<cols-1;c++){const a=(i-1)*cols+c,b=a+1,d=i*cols+c,e=d+1;idx.push(a,b,d,b,e,d);}
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));g.setAttribute('uv',new T.BufferAttribute(u,2));g.setIndex(idx);g.computeVertexNormals();
      return add(new T.Mesh(g,material),false,true);
    }
    const decal=o=>std({polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,...o});
    const line=(fx,z0,z1,step)=>{const out=[];for(let z=z0;step<0?z>=z1:z<=z1;z+=step)out.push([fx(z),z]);return out;};
    // River (v11): grey-green water as on the recordings, reflecting the sky, with ripples
    // from a normal map read twice at different scales and drifting with the current.
    const waterNormal=(()=>{
      if(!makeCanvas)return null;const s=256,c=makeCanvas(s,s),g=c.getContext('2d'),hgt=new Float32Array(s*s);
      for(let k=0;k<70;k++){const cx=random()*s,cy=random()*s,r=6+random()*26,a=.4+random()*.8;
        for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r*1.6);x<=cx+r*1.6;x++){const dx=(x-cx)/1.6,dy=y-cy,d=Math.sqrt(dx*dx+dy*dy)/r;if(d>=1)continue;hgt[((y%s+s)%s)*s+((x%s+s)%s)]+=a*Math.cos(d*Math.PI*1.5)*(1-d);}}
      const img=g.createImageData(s,s);
      for(let y=0;y<s;y++)for(let x=0;x<s;x++){const hx=hgt[y*s+(x+1)%s]-hgt[y*s+(x+s-1)%s],hy=hgt[((y+1)%s)*s+x]-hgt[((y+s-1)%s)*s+x],n=new T.Vector3(-hx*2,-hy*2,1).normalize(),o=(y*s+x)*4;
        img.data[o]=(n.x*.5+.5)*255;img.data[o+1]=(n.y*.5+.5)*255;img.data[o+2]=(n.z*.5+.5)*255;img.data[o+3]=255;}
      g.putImageData(img,0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(9,7);return t;})();
    const waterMat=new T.MeshStandardMaterial({color:'#687a70',roughness:.1,metalness:0,map:waterTex,normalMap:waterNormal,normalScale:new T.Vector2(.45,.45),transparent:true,opacity:.74,depthWrite:false});
    const waterTime={value:0};
    if(waterNormal)waterMat.onBeforeCompile=s=>{s.uniforms.waterTime=waterTime;
      s.fragmentShader='uniform float waterTime;\n'+s.fragmentShader.replace('#include <normal_fragment_maps>',T.ShaderChunk.normal_fragment_maps.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        'vec3 mapN = normalize( texture2D( normalMap, vNormalMapUv + vec2( 0.0, waterTime * 0.09 ) ).xyz * 2.0 - 1.0 + texture2D( normalMap, vNormalMapUv * 1.9 + vec2( waterTime * 0.03, waterTime * 0.05 ) ).xyz * 2.0 - 1.0 );'));};
    // Half-width of the water line in the carved bed (v7 river, or the stream of a generated map).
    const waterHalf=(()=>{const f=d=>R.channel?Math.min(-R.gravel,-R.bed+(R.bed-R.gravel+.3)*W.smooth(R.half-3,R.half+4,d)):-R.bed+R.bed*W.smooth(R.bottom,R.bank,d);
      let d=0;while(d<R.bank&&f(d)< -R.water)d+=.25;return d;})();
    const water=ribbon(line(W.channelX,4600,-6600,-12),2*waterHalf+7,waterMat,{y:(x,z)=>W.floorY(z)-R.water,vLen:30,across:3,step:8});
    water.castShadow=false;
    // Stones on the river bed and banks, rock outcrops on the steep slopes around the play
    // area (the recordings show a stony river and rocky slopes). Visual only.
    {
      const geo=new T.IcosahedronGeometry(1,1),Pp=geo.attributes.position,Nn=geo.attributes.normal;
      // Lumpy flattened stone; smooth normals from the ellipsoid (the geometry is not indexed).
      for(let i=0;i<Pp.count;i++){const x=Pp.getX(i),y=Pp.getY(i),z=Pp.getZ(i),k=.72+.4*(.5+.5*W.noise(x*1.9+3.1,z*1.9-2.3+y*1.3,77)),n=new T.Vector3(x,y*2,z).normalize();Pp.setXYZ(i,x*k,y*k*.5,z*k);Nn.setXYZ(i,n.x,n.y,n.z);}
      const items=[],m=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),sc=new T.Vector3(),p=new T.Vector3(),c=new T.Color(),half=R.bank+3;
      for(let z=700;z>-3000;z-=2.2){const n=2+(random()<.6?1:0);for(let k=0;k<n;k++){const u=random()*2-1,x=W.riverX(z)+u*half,s=(.25+.8*pow(random(),2.2))*(Math.abs(u)>.55?1.4:1);items.push([x,W.height(x,z)+s*.22,z,s,.5+.22*random()]);}}
      // Natural steep slopes only: not the banks cut around towers, sites, the helipad or houses.
      for(let z=-3000;z<800;z+=17)for(let x=-1700;x<1500;x+=17){const px=x+random()*17,pz=z+random()*17,h=W.height(px,pz),gx=W.height(px+3,pz)-h,gz=W.height(px,pz+3)-h,slope=Math.hypot(gx,gz)/3;
        if(slope>.55&&random()<.45&&!W.reserved(px,pz)&&W.TOWERS.every(t=>Math.hypot(t.x-px,t.z-pz)>60)&&W.AA_SITES.every(s=>Math.hypot(s.x-px,s.z-pz)>35)){const s=2.5+6*pow(random(),1.6);items.push([px,h-s*.25,pz,s,.42+.18*random()]);}}
      const rocks=new T.InstancedMesh(geo,std({color:'#ffffff',map:rockTex,roughness:.94}),items.length);rocks.instanceColor=new T.InstancedBufferAttribute(new Float32Array(items.length*3),3);
      items.forEach(([x,y,z,s,v],i)=>{m.compose(p.set(x,y,z),q.setFromEuler(e.set((random()-.5)*.5,random()*6.28,(random()-.5)*.5)),sc.set(s*(.8+.5*random()),s,s*(.8+.5*random())));rocks.setMatrixAt(i,m);c.setRGB(v*1.1,v*1.06,v);rocks.setColorAt(i,c);});
      rocks.name='rochers';rocks.frustumCulled=false;add(rocks,true,true);
    }
    if(waterTex){waterTex.repeat.set(2,1);updates.push(dt=>{waterTex.offset.y+=dt*.06;waterTime.value+=dt;});}
    ribbon(line(W.roadX,3200,-4400,-10),W.ROAD_WIDTH,decal({map:asphaltTex,color:asphaltTex?'#ffffff':'#555756',roughness:.85}),{vLen:12,lift:.35});
    ribbon(line(W.railX,4400,-6000,-10),W.RAIL_WIDTH,decal({map:railTex,color:railTex?'#ffffff':'#7a756c'}),{vLen:6,lift:.3});
    // Tracks follow the ground, and the deck of a bridge over the river.
    const bridgeLevel=(x,z)=>{for(const b of W.BRIDGES)if(Math.hypot(x-b.x,z-b.z)<b.length/2+1)return b.y+.35;return -Infinity;};
    const dirt=decal({map:dirtTex,color:dirtTex?'#ffffff':'#7b6d57'});
    for(const t of W.TRACKS)ribbon(t,W.TRACK_WIDTH,dirt,{vLen:8,lift:.25,y:(x,z)=>Math.max(W.height(x,z)+.25,bridgeLevel(x,z))});
    // Steel rails in 3D near the play area.
    {const parts=[];
     for(const off of [-2.76,-1.24,1.24,2.76]){const pts=line(z=>W.railX(z)+off,2600,-3800,-15);for(let i=1;i<pts.length;i++){const a=new T.Vector3(pts[i-1][0],W.height(pts[i-1][0],pts[i-1][1])+.55,pts[i-1][1]),b=new T.Vector3(pts[i][0],W.height(pts[i][0],pts[i][1])+.55,pts[i][1]);parts.push({geo:beam(a,b,.14)});}}
     add(new T.Mesh(merge(parts),std({color:'#6d6f72',metalness:.6,roughness:.4,vertexColors:true})),false,false);}

    // ---- Helipad (v12): walled yard of wet gravel beside a derelict hall, containers and
    // barrels, as on the recordings (recording 1 at 2 and 380 s). The helicopter starts in the middle. ----
    const concrete=std({map:concreteTex,color:concreteTex?'#ffffff':'#9a978f'}),brick=std({map:brickTex,color:brickTex?'#ffffff':'#8a5a44'}),metal=std({map:metalTex,color:metalTex?'#ffffff':'#8b8f8a',metalness:.3,roughness:.7});
    const dark=std({color:'#1e2427',roughness:.5,metalness:.3});
    // The gate faces the road: on maps with the road to the west the yard is mirrored.
    const PX=W.PAD.x,PZ=W.PAD.z,containers=[],side=Math.sign(W.roadX(W.PAD.z)-W.PAD.x)||1,X=dx=>PX+side*dx;
    {
      const walls=Parts(),posts=Parts(),fence=[],panel=3.4,H=2.7;
      // North, east and south walls (the hall closes the west side), gate toward the road.
      const runs=[[[-24,-26],[25,-26]],[[25,-26],[25,-7]],[[25,7],[25,24]],[[25,24],[-24,24]]];
      for(const [[x0,z0],[x1,z1]] of runs){
        const len=Math.hypot(x1-x0,z1-z0),n=Math.round(len/panel),yaw=Math.atan2(side*(x1-x0),z1-z0)+Math.PI/2;
        for(let i=0;i<n;i++){const t=(i+.5)/n,x=X(x0+(x1-x0)*t),z=PZ+z0+(z1-z0)*t,g=W.height(x,z),tilt=(random()-.5)*.03;
          walls.put(boxUV(panel-.08,H,.5,4),x,g+H/2-.1,z,{ry:yaw,rz:tilt,grad:[.78,1]});posts.box(.08,2,.08,x,g+H+.9,z);
          fence.push([x,g+H+1.9,z]);field.add(x,g+H/2,z,Math.abs(Math.cos(yaw))*panel+.6,H,Math.abs(Math.sin(yaw))*panel+.6,'mur');}
      }
      walls.mesh(concrete,true,true,'murs-helipad');posts.mesh(dark,true,false);
      // Wire fence on the walls: three strands.
      const pts=[];for(let s=0;s<3;s++)for(let i=1;i<fence.length;i++){const a=fence[i-1],b=fence[i];if(Math.hypot(a[0]-b[0],a[2]-b[2])>panel*1.6)continue;pts.push(new T.Vector3(a[0],a[1]-s*.6,a[2]),new T.Vector3(b[0],b[1]-s*.6,b[2]));}
      scene.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:'#3a3d3b'})));
      // Derelict hall on the far side from the road: brick walls with arched windows, broken skylights.
      const hx=X(-43),hz=PZ,hw=36,hd=78,hh=11;
      const hallBase=Math.min(W.height(hx-hw/2,hz-hd/2),W.height(hx+hw/2,hz+hd/2),W.height(hx-hw/2,hz+hd/2),W.height(hx+hw/2,hz-hd/2),W.height(hx,hz));
      place(scene,boxUV(hw,hh+2,hd,6),brick,hx,hallBase+hh/2-1,hz);field.add(hx,hallBase+hh/2,hz,hw,hh,hd,'bâtiment');
      {const roof=Parts(),g=hallBase+hh;roof.box(hw+.4,.4,hd+.4,hx,g+.2,hz,{color:'#5a5b58'});
        for(let x=-hw/2+4;x<hw/2-2;x+=6)for(let z=-hd/2+4;z<hd/2-2;z+=8){roof.box(4.2,.5,6.2,hx+x,g+.5,hz+z,{color:random()<.35?'#1b1f21':'#6f7a7c'});}
        roof.mesh(std({vertexColors:true,roughness:.7,metalness:.3}),true,true);
        field.add(hx,g+.4,hz,hw+.4,.8,hd+.4,'bâtiment');}
      // Camouflage net on posts in front of the hall's door (blue-grey, as on the recordings).
      {const g=W.height(X(-21),PZ+8),net=new T.Mesh(new T.PlaneGeometry(9,12),std({map:camoTex,color:camoTex?'#ffffff':'#8aa0be',side:T.DoubleSide,roughness:1}));net.rotation.set(-Math.PI/2+.18,0,0);net.position.set(X(-20.5),g+3.6,PZ+8);add(net,true,true);
        const pp=Parts();for(const [dx,dz] of [[-4,-5.5],[4,-5.5],[-4,5.5],[4,5.5]])pp.box(.15,dz<0?4.4:2.9,.15,X(-20.5+dx),g+(dz<0?2.2:1.45),PZ+8+dz);pp.mesh(dark,true,false);}
      // Barrels, pallets and crates by the walls.
      {const barrels=Parts(),geo=new T.CylinderGeometry(.3,.3,.88,10),cs=['#3d6a9c','#d8d8d2','#7a4a2c','#4d6a4a','#3d6a9c'];
        for(const [bx,bz,n] of [[20,-4,7],[-15,18,6],[21,19,5],[-17,-21,4]])for(let i=0;i<n;i++){const x=X(bx+(i%3)*.7+random()*.2),z=PZ+bz+Math.floor(i/3)*.7;barrels.put(geo,x,W.height(x,z)+.44,z,{color:cs[Math.floor(random()*cs.length)],grad:[.8,1]});}
        barrels.mesh(std({vertexColors:true,roughness:.6,metalness:.4}),true,true);
        const crates=Parts();for(const [bx,bz] of [[-12,-19],[-10,-19],[14,20]]){const x=X(bx),z=PZ+bz,g=W.height(x,z);crates.box(1.2,.15,1,x,g+.08,z,{color:'#8a7456'});crates.box(1.1,.9,.9,x,g+.6,z,{color:'#6b5a3a'});field.add(x,g+.5,z,1.2,1,1,'caisse');}
        crates.mesh(std({vertexColors:true,roughness:.9}),true,true);}
      // Puddles: reflecting the sky, darker than the gravel (the game's yard is wet).
      {const puddle=std({color:'#2e3232',roughness:.05,metalness:.2,transparent:true,opacity:.75,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
        for(const [dx,dz,r] of [[6,-8,3.2],[-7,5,2.4],[10,9,4],[-3,-15,2],[16,-16,2.6]]){const m=new T.Mesh(new T.CircleGeometry(r,20),puddle);m.rotation.x=-Math.PI/2;m.scale.set(1,.55+random()*.4,1);m.position.set(X(dx),W.height(X(dx),PZ+dz)+.04,PZ+dz);m.receiveShadow=shadows;m.name='flaque';scene.add(m);}}
      // Containers inside and around the yard.
      const stackAt=(x,z,alongZ,levels)=>{for(let l=0;l<levels;l++)containers.push({x:X(x),z:PZ+z,level:l,alongZ});};
      stackAt(-2,-23,false,2);stackAt(10.8,-23,false,1);stackAt(21.5,-17,true,1);stackAt(18.5,-17,true,2);stackAt(21.8,14,true,1);stackAt(31,-30,false,2);stackAt(36,20,true,1);stackAt(40,-12,true,1);
    }
    for(const c of W.YARD.containers)containers.push(c);
    // ---- Containers (12.19 x 2.59 x 2.44 m): the game's yards mix white, red, green and rust ----
    {const palette=['#d4d1c6','#9c3b2b','#3f6a44','#a7672e','#6c2c2a','#c7c2b3','#2f5b8a','#8e8f8a'],inst=new T.InstancedMesh(new T.BoxGeometry(12.19,2.59,2.44),std({map:corrugatedTex,roughness:.7,metalness:.2}),containers.length),m=new T.Matrix4(),q=new T.Quaternion();
     containers.forEach((c,i)=>{const y=W.height(c.x,c.z)+1.3+c.level*2.6;m.compose(new T.Vector3(c.x,y,c.z),q.setFromAxisAngle(Y,c.alongZ?Math.PI/2:0),new T.Vector3(1,1,1));inst.setMatrixAt(i,m);inst.setColorAt(i,col(palette[Math.floor(random()*palette.length)]));field.add(c.x,y,c.z,c.alongZ?2.44:12.19,2.59,c.alongZ?12.19:2.44,'conteneur');});
     inst.name='conteneurs';add(inst);}

    // ---- Factory (hall ~18 m, boiler house ~26 m, chimneys ~90 m, cranes ~35 m) ----
    const roofMat=std({color:'#4c4f4d',roughness:.85}),glass=std({color:'#2b3538',roughness:.25,metalness:.5}),rust=std({color:'#8a5534',roughness:.8,metalness:.3});
    for(const b of W.BUILDINGS){
      const mat=b.type==='brick'?brick:b.type==='metal'?metal:b.type==='hall'?brick:concrete,y0=b.base;
      // Walls reach 1 m into the ground (uneven yard); the collision box is the v7 one.
      place(scene,boxUV(b.w,b.h+1,b.d,b.type==='metal'?8:6),mat,b.x,y0+b.h/2-.5,b.z);field.add(b.x,y0+b.h/2,b.z,b.w,b.h,b.d,'bâtiment');
      if(b.type==='hall'){
        // Sawtooth roof: sloped panels and glazed north faces every 10 m.
        for(let z=b.z-b.d/2+5;z<b.z+b.d/2;z+=10){const slope=place(scene,new T.BoxGeometry(b.w,.3,10.6),roofMat,b.x,y0+b.h+1.6,z);slope.rotation.x=-.33;place(scene,new T.BoxGeometry(b.w,3.3,.25),glass,b.x,y0+b.h+1.65,z-5.1);}
        field.add(b.x,y0+b.h+1.7,b.z,b.w,3.4,b.d,'bâtiment');
      }else{
        for(const s of [-1,1]){place(scene,new T.BoxGeometry(b.w+.6,1.1,.5),concrete,b.x,y0+b.h+.55,b.z+s*b.d/2);place(scene,new T.BoxGeometry(.5,1.1,b.d),concrete,b.x+s*b.w/2,y0+b.h+.55,b.z);}
        // Roof vents in the corners (the centre stays free for launch sites).
        for(const [sx,sz] of [[-1,-1],[1,1],[1,-1]])solid(scene,3,2.4,3,b.x+sx*(b.w/2-4),y0+b.h+1.2,b.z+sz*(b.d/2-4),metal,'bâtiment');
      }
    }
    const y0=W.factoryLevel;
    for(const c of W.CHIMNEYS){
      const red=std({color:'#a8452f',roughness:.8}),white=std({color:'#d9d4c8',roughness:.8});
      place(scene,new T.CylinderGeometry(c.r1,c.r0,c.h,28,1,true),concrete,c.x,y0+c.h/2,c.z);
      if(c.bands)for(let k=0;k<5;k++){const y=c.h*(.66+k*.068),r=c.r0+(c.r1-c.r0)*(y/c.h)+.05;place(scene,new T.CylinderGeometry(r,r+.02,c.h*.068,28,1,true),k%2?white:red,c.x,y0+y+c.h*.034,c.z);}
      else for(let y=2;y<c.h-2;y+=1.6)place(scene,new T.BoxGeometry(.9,.12,.12),metal,c.x+c.r0*.98,y0+y,c.z,false);
      place(scene,new T.TorusGeometry(c.r1+.4,.18,6,28),metal,c.x,y0+c.h*.86,c.z).rotation.x=Math.PI/2;
      for(let s=0;s<4;s++){const y=(s+.5)*c.h/4,r=c.r0+(c.r1-c.r0)*(y/c.h);field.add(c.x,y0+y,c.z,1.7*r,c.h/4,1.7*r,'cheminée');}
    }
    for(const c of W.CRANES){
      const yellow=std({color:'#c9a23c',roughness:.7,metalness:.2}),green=std({color:'#5f6d57',roughness:.8}),g=new T.Group(),base=W.height(c.x,c.z);g.position.set(c.x,base,c.z);scene.add(g);
      if(W.FACTORY.dir<0)g.rotation.y=Math.PI;
      for(const sx of [-5,5])for(const sz of [-4,4]){place(g,new T.BoxGeometry(.9,11,.9),green,sx,5.5,sz);field.add(c.x+sx,base+5.5,c.z+sz,.9,11,.9,'grue');}
      place(g,new T.BoxGeometry(11,1.2,9.4),green,0,11.4,0);place(g,new T.BoxGeometry(7,5.5,8),yellow,0,14.8,0);place(g,new T.BoxGeometry(2.2,2.2,2.6),glass,3.6,15.2,-3);
      field.add(c.x,base+14,c.z,11,7,9.4,'grue');
      const jibLen=(c.h-17.5)/Math.sin(.95),a=new T.Vector3(0,17.5,0),dir=new T.Vector3(-Math.cos(.95),Math.sin(.95),0),b=a.clone().addScaledVector(dir,jibLen);
      const jib=new T.Mesh(beam(a,b,1.1),yellow);jib.castShadow=shadows;g.add(jib);g.add(new T.Mesh(beam(b,b.clone().add(new T.Vector3(-3,-1,0)),.8),yellow));
      g.add(new T.Mesh(beam(b.clone().add(new T.Vector3(-3,-1,0)),new T.Vector3(b.x-3,11,0),.06),metal));
      const sx=W.FACTORY.dir<0?-1:1;for(let t=0;t<=1;t+=.2){const p=a.clone().lerp(b,t);field.add(c.x+sx*p.x,base+p.y,c.z+sx*p.z,3,3,1.6,'grue');}
    }
    // Storage tanks and overhead pipes.
    for(const [x,z] of W.YARD.tanks){place(scene,new T.CylinderGeometry(3.6,3.6,9,20),rust,x,y0+4.5,z);field.add(x,y0+4.5,z,6,9,6,'réservoir');}
    for(const [x0,z0,x1,z1] of W.YARD.pipes){const a=new T.Vector3(x0,y0+8,z0),b=new T.Vector3(x1,y0+8,z1);scene.add(new T.Mesh(beam(a,b,1.1),rust));}
    // Rail wagons along the yard.
    {const wagons=[];for(let z=W.YARD.wagons.z1;z>W.YARD.wagons.z0;z-=15.5)if(random()<.8)wagons.push([W.railX(z)+W.YARD.wagons.side,z]);
     const inst=new T.InstancedMesh(boxUV(3.1,3.4,14,4),std({map:corrugatedTex,roughness:.8,metalness:.25}),wagons.length),m=new T.Matrix4(),q=new T.Quaternion();
     wagons.forEach(([x,z],i)=>{const y=W.height(x,z)+2.4;m.compose(new T.Vector3(x,y,z),q,new T.Vector3(1,1,1));inst.setMatrixAt(i,m);inst.setColorAt(i,col(['#6b4a36','#3e4f5e','#7a7870','#5d6b4b'][i%4]));field.add(x,y,z,3.1,3.4,14,'wagon');});
     add(inst);}

    // ---- Power line: lattice pylons (~35 m) and sagging wires ----
    {const H=W.POWER.height,lat=[],v=(x,y,z)=>new T.Vector3(x,y,z),halfAt=y=>4-3*y/30;
     for(const sx of [-1,1])for(const sz of [-1,1])lat.push({geo:beam(v(sx*4,0,sz*4),v(sx*1,30,sz*1),.35)});
     for(let y=0;y<30;y+=6){const h0=halfAt(y),h1=halfAt(y+6);for(const s of [-1,1]){lat.push({geo:beam(v(-h0,y,s*h0),v(h1,y+6,s*h1),.12)},{geo:beam(v(h0,y,s*h0),v(-h1,y+6,s*h1),.12)},{geo:beam(v(s*h0,y,-h0),v(s*h1,y+6,h1),.12)},{geo:beam(v(s*h0,y,h0),v(s*h1,y+6,-h1),.12)});}}
     lat.push({geo:beam(v(-11,27,0),v(11,27,0),.5)},{geo:beam(v(-11,27,0),v(-1,31,0),.2)},{geo:beam(v(11,27,0),v(1,31,0),.2)},{geo:beam(v(-1,30,-1),v(0,H,0),.25)},{geo:beam(v(1,30,1),v(0,H,0),.25)});
     const geo=merge(lat),line=new T.Vector3(W.POWER.b.x-W.POWER.a.x,0,W.POWER.b.z-W.POWER.a.z).normalize(),yaw=Math.atan2(line.x,line.z)+Math.PI/2;
     const inst=new T.InstancedMesh(geo,std({color:'#9aa0a2',metalness:.5,roughness:.5,vertexColors:true}),W.pylons.length),m=new T.Matrix4(),q=new T.Quaternion().setFromAxisAngle(v(0,1,0),yaw),attach=[];
     W.pylons.forEach((p,i)=>{const base=W.height(p.x,p.z);m.compose(v(p.x,base,p.z),q,v(1,1,1));inst.setMatrixAt(i,m);field.add(p.x,base+15,p.z,5,30,5,'pylône');
       const arm=v(1,0,0).applyQuaternion(q);field.add(p.x,base+27,p.z,Math.abs(arm.x)*22+1.5,1.2,Math.abs(arm.z)*22+1.5,'pylône');
       attach.push([-10,0,10].map(o=>v(p.x,base+26.4,p.z).addScaledVector(arm,o)).concat([v(p.x,base+H,p.z)]));});
     add(inst);
     const pts=[];for(let i=1;i<attach.length;i++)for(let w=0;w<4;w++){const a=attach[i-1][w],b=attach[i][w],sag=w===3?3:5,prev=[];
       for(let s=0;s<=12;s++){const t=s/12,p=a.clone().lerp(b,t);p.y-=sag*4*t*(1-t);prev.push(p);}
       for(let s=1;s<prev.length;s++){pts.push(prev[s-1],prev[s]);wires.push({a:prev[s-1],b:prev[s]});}}
     const wireGeo=new T.BufferGeometry().setFromPoints(pts);scene.add(new T.LineSegments(wireGeo,new T.LineBasicMaterial({color:'#2d3130'})));}

    // ---- Objective towers (v12): after towers 2 and 3 of recording 1 (134-146 s): braced steel
    // legs, a white floor with a red band and a walkway, an open braced level, a large panelled
    // block with the tower's number on every side, a roof with a stair hut, an exhaust stack and
    // a mast; external stairs on one side. Roof at t.h (about 33 m, measured). ----
    const digitTex=n=>texture(128,(g,s,h)=>{g.clearRect(0,0,s,h);g.fillStyle='rgba(236,236,230,.95)';g.font=`bold ${Math.round(h*.86)}px Arial, sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(String(n),s/2,h*.54);
      g.globalCompositeOperation='destination-out';for(let i=0;i<180;i++){g.fillStyle=`rgba(0,0,0,${.2+random()*.5})`;g.fillRect(random()*s,random()*h,1+random()*3,1+random()*3);}},4,160);
    // Grey cladding of the tower blocks (8 m a tile): vertical panels, seams, rust and dirt runs,
    // one pair of dark windows (the game's blocks are mostly blind, recording 1 at 146 s).
    const panelTex=texture(256,(g,s)=>{g.fillStyle='#c4c6c2';g.fillRect(0,0,s,s);speckle(g,s,3000,140,.22);
      for(let k=0;k<8;k++){const v=180+Math.floor(random()*40);g.fillStyle=`rgba(${v},${v},${v-4},.35)`;g.fillRect(k*s/8+1,0,s/8-2,s);}
      g.strokeStyle='rgba(55,55,52,.55)';g.lineWidth=2;for(let k=0;k<=8;k++){g.beginPath();g.moveTo(k*s/8,0);g.lineTo(k*s/8,s);g.stroke();}g.beginPath();g.moveTo(0,s*.5);g.lineTo(s,s*.5);g.stroke();
      g.fillStyle='#1f2426';g.fillRect(s*.58,s*.3,s*.1,s*.12);g.fillRect(s*.72,s*.3,s*.1,s*.12);
      for(let i=0;i<26;i++){g.fillStyle=`rgba(${random()<.5?90:60},${random()<.5?60:55},45,${.08+random()*.14})`;g.fillRect(random()*s,random()*s*.6,2+random()*5,30+random()*120);}});
    const towerMats={steel:std({color:'#3d4244',roughness:.6,metalness:.5,vertexColors:true}),panel:std({map:panelTex,color:panelTex?'#ffffff':'#8f918b',roughness:.85,vertexColors:true}),white:std({color:'#d2d3cd',roughness:.75,vertexColors:true})};
    for(const t of W.TOWERS){
      const g=new T.Group();g.position.set(t.x,t.base,t.z);scene.add(g);const H=t.h,deck=H+.75;
      const steel=Parts(),panel=Parts(),white=Parts(),sol=b=>field.add(t.x+b[0],t.base+b[1],t.z+b[2],b[3],b[4],b[5],'tour');
      const v=(x,y,z)=>new T.Vector3(x,y,z);
      // Braced legs (0-9 m).
      for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){steel.box(.9,9.4,.9,sx*6.2,4.7,sz*6.2);sol([sx*6.2,4.7,sz*6.2,.9,9.4,.9]);}
      for(const s of [-1,1]){steel.put(beam(v(-6.2,.4,s*6.2),v(6.2,9,s*6.2),.25),0,0,0);steel.put(beam(v(6.2,.4,s*6.2),v(-6.2,9,s*6.2),.25),0,0,0);steel.put(beam(v(s*6.2,.4,-6.2),v(s*6.2,9,6.2),.25),0,0,0);steel.put(beam(v(s*6.2,.4,6.2),v(s*6.2,9,-6.2),.25),0,0,0);}
      // First floor: slab, white walls with a red band and windows, walkway with railings.
      white.box(15,.6,15,0,9.3,0,{color:'#8a8780'});sol([0,9.3,0,15,.6,15]);
      white.box(13.4,4,13.4,0,11.6,0,{grad:[.85,1]});white.box(13.55,.45,13.55,0,12.95,0,{color:'#9a3b2e'});white.box(13.5,.9,13.5,0,11.1,0,{color:'#2a2f31'});sol([0,11.6,0,13.4,4,13.4]);
      steel.box(16.4,.25,16.4,0,9.55,0);for(const s of [-1,1]){steel.box(16.4,.08,.08,0,10.6,s*8.15);steel.box(.08,.08,16.4,s*8.15,10.6,0);for(let k=-8;k<=8;k+=2){steel.box(.08,1,.08,k,10.1,s*8.15);steel.box(.08,1,.08,s*8.15,10.1,k);}}
      // Second level: open braced frame with a stair core.
      for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){steel.box(.7,5.8,.7,sx*6,16.5,sz*6);sol([sx*6,16.5,sz*6,.7,5.8,.7]);}
      for(const s of [-1,1]){steel.put(beam(v(-6,13.7,s*6),v(6,19.2,s*6),.2),0,0,0);steel.put(beam(v(s*6,13.7,-6),v(s*6,19.2,6),.2),0,0,0);}
      panel.box(3.2,5.8,3.2,-3,16.5,-3,{color:'#9c9b95'});sol([-3,16.5,-3,3.2,5.8,3.2]);
      white.box(16,.6,16,0,19.5,0,{color:'#8a8780'});sol([0,19.5,0,16,.6,16]);
      // Top block with the tower's number, roof slab and parapet.
      const top0=19.8,top1=H-.15;panel.put(boxUV(16.5,top1-top0,16.5,8),0,(top0+top1)/2,0,{color:'#8f9391',grad:[.8,1]});sol([0,(top0+top1)/2,0,16.5,top1-top0,16.5]);
      white.box(17,.9,17,0,H+.3,0,{color:'#7d7a72'});sol([0,H+.3,0,17,.9,17]);
      for(const s of [-1,1]){white.box(17,1.1,.3,0,deck+.55,s*8.35,{color:'#8d8a82'});white.box(.3,1.1,17,s*8.35,deck+.55,0,{color:'#8d8a82'});}
      // Roof: stair hut, exhaust stack, mast, air-conditioning boxes.
      panel.box(4.4,3,4,-5,deck+1.5,5.4,{color:'#a7a59e'});sol([-5,deck+1.5,5.4,4.4,3,4]);
      steel.put(new T.CylinderGeometry(.5,.55,7,12),5.6,deck+3.5,5.6);sol([5.6,deck+3.5,5.6,1.1,7,1.1]);
      steel.box(.18,6,.18,6.6,deck+3,-6.6);steel.box(1.6,1,2.2,-.5,deck+.5,-6.4);steel.box(1.6,1,2.2,2,deck+.5,-6.4);
      // External stairs on the east side, from the ground to the second floor.
      for(const [sx,sz] of [[9.2,-3],[12,-3],[9.2,3],[12,3]])steel.box(.3,19.6,.3,sx,9.8,sz);
      for(let k=0;k<6;k++){const y0s=k*3.25,y1s=y0s+3.25,dir=k%2?1:-1;steel.put(beam(v(10.6,y0s+.2,-2.4*dir),v(10.6,y1s,2.4*dir),.15),0,0,0);steel.box(2.6,.15,1.4,10.6,y1s,2.4*dir);steel.box(2.8,.06,.06,10.6,y1s+1,2.6*dir);}
      sol([10.6,9.8,0,3.4,19.6,6.6]);
      // Clutter at the foot: a container and crates (recording 1 at 146 s).
      const cc=['#2f5b8a','#9c3b2b','#3f6a44'];white.box(6.06,2.59,2.44,-2,1.3,-9.5,{color:cc[t.id%3],grad:[.8,1]});sol([-2,1.3,-9.5,6.06,2.59,2.44]);
      white.box(1.4,1.2,1.2,4,.6,-9.4,{color:'#6b5a3a'});white.box(1.2,1,1.2,-8.5,.5,8.8,{color:'#6b5a3a'});
      // Meshes live in the tower group (built in local coordinates).
      for(const [parts,mat] of [[steel,towerMats.steel],[panel,towerMats.panel],[white,towerMats.white]]){const m=new T.Mesh(merge(parts.list),mat);m.castShadow=shadows;m.receiveShadow=shadows;g.add(m);}
      // Painted number on the four sides of the top block (towers are numbered in the game).
      const num=digitTex(t.id+1);if(num){num.wrapS=num.wrapT=T.ClampToEdgeWrapping;const nm=new T.MeshStandardMaterial({map:num,transparent:true,depthWrite:false,roughness:.8,polygonOffset:true,polygonOffsetFactor:-2});
        for(let k=0;k<4;k++){const a=k*Math.PI/2,p=new T.Mesh(new T.PlaneGeometry(6.4,8),nm);p.position.set(Math.sin(a)*8.27+Math.cos(a)*-3.6,(top0+top1)/2+.3,Math.cos(a)*8.27-Math.sin(a)*-3.6);p.rotation.y=a;g.add(p);}}
      // Capture signals of the trainer: flag on the mast, beacon disc on the roof.
      const flag=place(g,new T.BoxGeometry(2.2,1.3,.05),std({color:'#ca7846',side:T.DoubleSide}),7.8,deck+5.2,-6.6,false);
      const beacon=place(g,new T.CylinderGeometry(2.6,2.6,.08,24),std({color:'#d69e50'}),0,deck+.05,0,false);
      towers.push({id:t.id,group:g,x:t.x,z:t.z,height:t.base+t.h,base:t.base,structure:t.h,capture:0,captured:false,flag,beacon,slots:[[-4,-3],[4,-3],[0,3.5]]});
    }

    // ---- Villages (v12): plastered houses with gable roofs of tile or sheet metal, a few
    // five-storey panel blocks and metal barns (villages and blocks seen on recording 1, 134-206 s). ----
    if(W.HOUSES.length){
      const walls=Parts(),blocks=Parts(),roofs=Parts(),wallCols=['#d8d2c2','#cfc6ae','#bfb49a','#e0dccd','#c9b79a','#b5ab97','#d6c7a1','#c4b8a8'],roofCols=['#7a3b2e','#8a4a33','#5f625f','#6b6f6a','#8c6a4a','#4d5a52','#7b5a45','#8e8a82'];
      const pick=a=>a[Math.floor(random()*a.length)];
      function gable(w,d,rh,ov){
        // Two roof planes, ridge along z; eaves at y = 0.
        const hw=w/2+ov,hd=d/2+ov,sl=Math.hypot(hw,rh),p=[-hw,0,-hd,0,rh,hd,0,rh,-hd,-hw,0,-hd,-hw,0,hd,0,rh,hd, hw,0,-hd,0,rh,hd,hw,0,hd,hw,0,-hd,0,rh,-hd,0,rh,hd];
        const u=[0,0,d,sl,0,sl,0,0,d,0,d,sl, 0,0,d,sl,d,0,0,0,0,sl,d,sl].map(x=>x/2);
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(u,2));g.computeVertexNormals();return g;
      }
      function gableEnds(w,d,rh){const hw=w/2,hd=d/2,p=[-hw,0,hd,hw,0,hd,0,rh,hd, hw,0,-hd,-hw,0,-hd,0,rh,-hd];const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute([0,0,w/6,0,w/12,rh/6,0,0,w/6,0,w/12,rh/6],2));g.computeVertexNormals();return g;}
      for(const h of W.HOUSES){
        const g1=Math.max(W.height(h.x-h.w/2,h.z-h.d/2),W.height(h.x+h.w/2,h.z+h.d/2),W.height(h.x-h.w/2,h.z+h.d/2),W.height(h.x+h.w/2,h.z-h.d/2)),g0=h.base-.6,top=g1+h.h;
        const along=h.d>=h.w,w=along?h.w:h.d,d=along?h.d:h.w,yaw=h.yaw+(along?0:Math.PI/2),frame=frameOf(h.x,0,h.z,yaw);
        if(h.kind==='block'){
          blocks.put(boxUV(w,top-g0,d,14),0,(g0+top)/2,0,{frame,grad:[.8,1]});roofs.box(w+.3,.8,d+.3,0,top+.2,0,{frame,color:'#6d6d68'});roofs.box(3,2.6,4,0,top+1.3,d/4,{frame,color:'#8a8780'});
          field.add(h.x,(g0+top)/2+.3,h.z,h.w+.3,top-g0+.8,h.d+.3,'maison');continue;
        }
        const wall=h.kind==='barn'?'#8b8272':pick(wallCols),roof=h.kind==='barn'?'#7d6f60':pick(roofCols),rh=Math.min(4.2,w*.34);
        if(h.kind==='barn')roofs.put(boxUV(w,top-g0,d,3),0,(g0+top)/2,0,{frame,color:'#7e7568',grad:[.75,1]});
        else walls.put(boxUV(w,top-g0,d,6),0,(g0+top)/2,0,{frame,color:wall,grad:[.8,1]});
        walls.put(gableEnds(w,d,rh),0,top,0,{frame,color:wall});roofs.put(gable(w,d,rh,.5),0,top-.05,0,{frame,color:roof});
        if(h.kind==='house'&&random()<.7)roofs.box(.7,1.8,.7,w*.22,top+rh*.55,d*(random()-.5)*.5,{frame,color:'#7a4a38'});
        field.add(h.x,(g0+top)/2,h.z,h.w,top-g0,h.d,'maison');field.add(h.x,top+rh/2,h.z,h.w*.8,rh,h.d*.8,'maison');
      }
      walls.mesh(std({map:facadeTex,vertexColors:true,roughness:.9,side:T.DoubleSide}),true,true,'maisons');
      blocks.mesh(std({map:blockTex,color:blockTex?'#ffffff':'#9d9a92',vertexColors:true,roughness:.9}),true,true,'immeubles');
      roofs.mesh(std({map:corrugatedTex,vertexColors:true,roughness:.75,metalness:.25,side:T.DoubleSide}),true,true,'toits');
    }

    // ---- Bridges over the river on tracks and streets, and the stone viaduct ----
    if(W.BRIDGES.length){
      const parts=Parts();
      for(const b of W.BRIDGES){
        const frame=frameOf(b.x,0,b.z,b.yaw),L=b.length,wd=b.width,bed=W.floorY(b.z)-R.bed;
        parts.box(wd+1,.9,L,0,b.y-.15,0,{frame,color:'#8e8b83',tile:4});
        for(const s of [-1,1]){parts.box(.3,1,L,s*(wd/2+.35),b.y+.8,0,{frame,color:'#9a978f'});for(let k=-L/2+1;k<L/2;k+=2.5)parts.box(.18,1,.18,s*(wd/2+.35),b.y+.5,k,{frame,color:'#6d6f6c'});}
        for(const s of [-1,1]){const h=b.y-.6-bed;parts.box(wd,h,1.8,0,bed+h/2,s*L/4,{frame,color:'#8a877f'});}
        for(let k=0;k<Math.ceil(L/6);k++){const zz=-L/2+3+k*6;solidLocal(b.x,b.y-.15,b.z,b.yaw,[0,0,zz,wd+1,.9,6],'pont');}
      }
      parts.mesh(std({map:concreteTex,vertexColors:true,roughness:.9}),true,true,'ponts');
    }
    if(W.VIADUCT){
      const V=W.VIADUCT,stone=Parts(),z=V.z,wd=V.width,deck=V.deck,supports=[{x:V.x0,ground:deck-3,abut:true}].concat(V.piers).concat([{x:V.x1,ground:deck-3,abut:true}]);
      stone.box(V.x1-V.x0,1.8,wd,(V.x0+V.x1)/2,deck-.9,z,{tile:6});for(const s of [-1,1])stone.box(V.x1-V.x0,1,.5,(V.x0+V.x1)/2,deck+.5,z+s*(wd/2-.25),{tile:6});
      for(let i=1;i<supports.length;i++){
        const a=supports[i-1],b=supports[i],xa=a.x+(a.abut?0:2.6),xb=b.x-(b.abut?0:2.6),span=xb-xa,rise=Math.min(span/2,deck-1.8-Math.max(a.ground,b.ground)-2),spring=deck-1.8-rise-1.5;
        if(span<4||rise<2)continue;
        // Spandrel wall with the arch opening, extruded across the deck.
        const sh=new T.Shape();sh.moveTo(0,0);sh.lineTo(0,deck-1.8-spring);sh.lineTo(span,deck-1.8-spring);sh.lineTo(span,0);
        for(let k=1;k<16;k++){const t=Math.PI*k/16;sh.lineTo(span/2+Math.cos(t)*span/2,Math.sin(t)*rise);}
        sh.lineTo(0,0);const geo=new T.ExtrudeGeometry(sh,{depth:wd,bevelEnabled:false,curveSegments:4});
        const uvA=geo.attributes.uv;for(let k=0;k<uvA.count;k++)uvA.setXY(k,uvA.getX(k)/6,uvA.getY(k)/6);
        stone.put(geo,xa,spring,z-wd/2);
        field.add((xa+xb)/2,deck-.9,z,span,1.8,wd,'viaduc');
      }
      for(const p of V.piers){const top=deck-1.8,h=top-(p.ground-3);stone.box(5.2,h,wd+1.2,p.x,p.ground-3+h/2,z,{tile:6,grad:[.8,1]});field.add(p.x,p.ground-3+h/2,z,5.2,h,wd+1.2,'viaduc');}
      stone.mesh(std({map:stoneTex,color:stoneTex?'#ffffff':'#b0a898',vertexColors:true,roughness:.92}),true,true,'viaduc');
    }

    // ---- Launch sites: sandbag nests (operators are placed by the exercise) ----
    {const bags=[],sand=std({color:'#8d7d5c',roughness:1});
     for(const s of W.AA_SITES){if(s.roof)continue;const r=s.kind==='sam'?7:2.4,n=s.kind==='sam'?22:9;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;if(a>Math.PI*1.7)continue;bags.push([s.x+Math.cos(a)*r,W.height(s.x,s.z)+.4,s.z+Math.sin(a)*r,a]);}}
     const inst=new T.InstancedMesh(new T.BoxGeometry(1,.8,.6),sand,bags.length),m=new T.Matrix4(),q=new T.Quaternion();
     bags.forEach(([x,y,z,a],i)=>{m.compose(new T.Vector3(x,y,z),q.setFromAxisAngle(Y,-a),new T.Vector3(1,1,1));inst.setMatrixAt(i,m);});add(inst);}

    // ---- Forest (forest.js): pines, spruces and broadleaf trees, 11-20.5 m ----
    const Forest=helpers.forest||(typeof module!=='undefined'?require('./forest.js'):root.HeliForest);
    const forest=Forest.build(T,W,scene,{quality,shadows,sample:terrainSample,field,seed:helpers.seed||8317,canvas:makeCanvas,anisotropy:helpers.anisotropy||8});
    updates.push((dt,camera)=>{if(camera)forest.update(camera);});

    // ---- Sky dome: gradient, sun and drifting clouds (fog matches the horizon) ----
    const sunDirection=(helpers.sunDirection||new T.Vector3(...(W.LIGHT?W.LIGHT.sun:[-.55,.42,.72]))).clone().normalize();
    const skyColors={zenith:col('#5b86b6'),horizon:col('#c6d0d4'),ground:col('#8a918d')};
    const sky=new T.Mesh(new T.SphereGeometry(9000,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,
      uniforms:{sunDir:{value:sunDirection},zenith:{value:skyColors.zenith},horizon:{value:skyColors.horizon},ground:{value:skyColors.ground},time:{value:0},cloudCover:{value:.52},cloudShade:{value:0},sunGlow:{value:1}},
      vertexShader:'varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=vec4(p.xy,p.w*.99999,p.w);}',
      fragmentShader:`uniform vec3 sunDir,zenith,horizon,ground;uniform float time,cloudCover,cloudShade,sunGlow;varying vec3 vDir;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
        float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
        void main(){vec3 d=normalize(vDir);float y=d.y;vec3 c=mix(horizon,zenith,pow(clamp(y,0.,1.),.5));
          if(y<0.)c=mix(horizon,ground,clamp(-y*5.,0.,1.));float s=max(dot(d,sunDir),0.);
          if(y>.005){vec2 uv=d.xz/(y+.15)*1.6+vec2(time*.004,time*.0025);float cl=smoothstep(cloudCover,cloudCover+.28,fbm(uv));float fade=smoothstep(.005,.22,y);
            vec3 cloud=mix(vec3(.96,.96,.95),vec3(.72,.75,.8),smoothstep(.6,.95,fbm(uv*1.7+3.)))*(1.-cloudShade)+vec3(1.,.92,.8)*pow(s,5.)*.25*sunGlow;c=mix(c,cloud,cl*fade*.9);}
          c+=vec3(1.,.93,.78)*(pow(s,900.)*10.+pow(s,14.)*.22)*sunGlow;gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`}));
    sky.frustumCulled=false;sky.renderOrder=-10;scene.add(sky);
    updates.push((dt,camera)=>{if(camera)sky.position.copy(camera.position);sky.material.uniforms.time.value+=dt;});

    return {field,towers,wires,terrain,water,sky,skyColors,sunDirection,treeCount:forest.count,forest,terrainSample,sites:W.AA_SITES,world:W,land:landTex,containers:containers.length,
      update(dt,camera){for(const u of updates)u(dt,camera);}};
  }
  if(typeof module!=='undefined')module.exports=buildScenery;else root.buildScenery=buildScenery;
})(typeof window!=='undefined'?window:globalThis);
