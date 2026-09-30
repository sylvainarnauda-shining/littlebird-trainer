/* Forest of the practice valley: original low-poly trees built in code (no
   game asset), shaped after the reference recordings:
   - Scots pines on the slopes: bare orange trunk on about 60 % of the
     height, irregular crown on top (recording 1 at 120 s);
   - slender pale-barked broadleaf trees in autumn colours (yellow, orange,
     green) on the valley floor and along the river (recording 2 at 106 s);
   - dark spruces, more frequent higher up.
   Tree tops 10.5-20 m: the AGL jumps over objects measured 13-20 m (v7).
   Stands up to about 230 trees per hectare (one candidate every 6.5 m in
   high quality), dense enough to read as a continuous canopy from afar.
   Rendering: full geometry near the camera, simplified geometry up to
   R_NEAR (lists rebuilt when the camera has moved 25 m) and one light shape
   per tree everywhere else (the GPU hides those already drawn nearby).
   Collisions: compact 16 m grid plugged into the ObstacleField as a layer of
   kind 'arbre' (trunk and crown boxes per tree). */
(function(root){
  // Muted foliage: on the recordings greens read #464c3b-#606e50 and autumn tones
  // #56462a-#735d34 on screen (saturation ~0.25 and ~0.45), docs/analyse/foret-dca.md.
  const SPECIES=[
    {name:'pin',h:[13.5,20],w:[.85,1.15],colors:['#4d5540','#535b44','#4a5240','#58604a','#474f3c','#50583f']},
    {name:'epicea',h:[12.5,19.5],w:[.85,1.1],colors:['#3f4a3c','#45503f','#3c4639','#4a5541']},
    {name:'feuillu',h:[10.5,17.5],w:[.85,1.2],colors:['#8a7c50','#948552','#80734a','#8a6842','#7d5f3f','#947046','#5a6344','#646b48','#565f41','#6f6a42','#85774e']}];
  const BOUNDS={x0:-3700,x1:3500,z0:-4600,z1:2900},PLAY={x:-100,z:-900};
  // Spruce crown boxes [centre, width, height] in tree heights.
  const SPRUCE_BOXES=[[.52,.26,.3],[.71,.18,.26],[.88,.1,.2]];
  function build(T,W,scene,o={}){
    const quality=o.quality||'high',shadows=o.shadows??quality!=='low';
    const sample=o.sample||((x,z)=>{const h=W.height(x,z);return [h,W.forestDensity(x,z,h)];});
    let seed=(o.seed||4242)>>>0;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const {x0:X0,x1:X1,z0:Z0,z1:Z1}=BOUNDS;
    const spacing=o.spacing||{high:6.5,medium:8.5,low:12}[quality]||8.5;
    const R_NEAR={high:900,medium:700,low:500}[quality]||700,R_FULL={high:330,medium:250,low:170}[quality]||250;

    // ---- Placement: one candidate per spacing x spacing cell, kept with the stand density ----
    let cap=1<<17,n=0,X=new Float32Array(cap),Y=new Float32Array(cap),Z=new Float32Array(cap),H=new Float32Array(cap),WD=new Float32Array(cap),RO=new Float32Array(cap),S=new Uint8Array(cap),C=new Uint8Array(cap),J=new Float32Array(cap);
    const grown=(a,Ctor)=>{const b=new Ctor(cap);b.set(a);return b;};
    function grow(){cap*=2;X=grown(X,Float32Array);Y=grown(Y,Float32Array);Z=grown(Z,Float32Array);H=grown(H,Float32Array);WD=grown(WD,Float32Array);RO=grown(RO,Float32Array);S=grown(S,Uint8Array);C=grown(C,Uint8Array);J=grown(J,Float32Array);}
    for(let z=Z0;z<Z1;z+=spacing)for(let x=X0;x<X1;x+=spacing){
      // Beyond 3 km of the play area the terrain colour carries most of the forest.
      const r=Math.hypot(x-PLAY.x,z-PLAY.z);if(r>3000&&rnd()<.7*W.smooth(3000,4600,r))continue;
      const px=x+rnd()*spacing,pz=z+rnd()*spacing,s=sample(px,pz);
      if(rnd()>=s[1]||W.reserved(px,pz))continue;
      // Species: broadleaf on the floor, pines on the slopes, spruces higher up.
      const d=Math.abs(px-W.valleyX(pz)),hw=W.halfWidth(pz),slope=W.smooth(hw-80,hw+250,d),high=W.smooth(260,480,s[0]);
      // Autumn broadleaf also covers the lower slopes (recording 1 at 200 s).
      const pBroad=(.65-.3*slope)*(1-.6*high),pSpruce=.08+.12*slope+.3*high,u=rnd(),k=u<pBroad?2:u<pBroad+pSpruce?1:0,sp=SPECIES[k];
      if(n>=cap)grow();
      X[n]=px;Y[n]=s[0];Z[n]=pz;H[n]=sp.h[0]+(sp.h[1]-sp.h[0])*Math.pow(rnd(),.8);WD[n]=sp.w[0]+(sp.w[1]-sp.w[0])*rnd();RO[n]=rnd()*6.2832;S[n]=k;C[n]=Math.floor(rnd()*sp.colors.length);J[n]=.88+.24*rnd();n++;
    }

    // ---- Sort by 100 m cell and species (contiguous ranges for the near lists) ----
    const NC=100,GX=Math.ceil((X1-X0)/NC),GZ=Math.ceil((Z1-Z0)/NC),K=GX*GZ*3;
    const cellOf=(x,z)=>Math.min(GZ-1,Math.max(0,Math.floor((z-Z0)/NC)))*GX+Math.min(GX-1,Math.max(0,Math.floor((x-X0)/NC)));
    const start=new Uint32Array(K+1);for(let i=0;i<n;i++)start[cellOf(X[i],Z[i])*3+S[i]+1]++;for(let k=0;k<K;k++)start[k+1]+=start[k];
    const order=new Uint32Array(n),fill=start.slice(0,K);for(let i=0;i<n;i++)order[fill[cellOf(X[i],Z[i])*3+S[i]]++]=i;
    const mat=new Float32Array(n*16),col=new Float32Array(n*3),sx=new Float32Array(n),sy=new Float32Array(n),sz=new Float32Array(n),sh=new Float32Array(n),sw=new Float32Array(n),ss=new Uint8Array(n);
    const cellY=new Float32Array(GX*GZ),cellN=new Uint32Array(GX*GZ);
    {const m=new T.Matrix4(),q=new T.Quaternion(),up=new T.Vector3(0,1,0),p=new T.Vector3(),sc=new T.Vector3(),c=new T.Color(),pal=SPECIES.map(sp=>sp.colors.map(h=>new T.Color(h)));
     for(let k=0;k<n;k++){const i=order[k];sx[k]=X[i];sy[k]=Y[i];sz[k]=Z[i];sh[k]=H[i];sw[k]=WD[i];ss[k]=S[i];
       m.compose(p.set(X[i],Y[i]-.3,Z[i]),q.setFromAxisAngle(up,RO[i]),sc.set(H[i]*WD[i],H[i],H[i]*WD[i]));m.toArray(mat,k*16);
       c.copy(pal[S[i]][C[i]]).multiplyScalar(J[i]);col[k*3]=c.r;col[k*3+1]=c.g;col[k*3+2]=c.b;
       const cell=cellOf(X[i],Z[i]);cellY[cell]+=Y[i];cellN[cell]++;}
     for(let c2=0;c2<cellY.length;c2++)cellY[c2]=cellN[c2]?cellY[c2]/cellN[c2]:0;}
    X=Y=Z=H=WD=RO=S=C=J=null;
    const perSpecies=[0,0,0];for(let k=0;k<n;k++)perSpecies[ss[k]]++;

    // ---- Geometry (v11): textured foliage cards around the trunk, like game trees ----
    // One atlas holds four tiles drawn in code (no game asset): pine needle tufts, spruce
    // spray, broadleaf leaf cluster and bark. Cards are alpha-tested; their normals point
    // out of the crown so a crown shades as a volume, with darker inner parts.
    const V3=(x,y,z)=>new T.Vector3(x,y,z);
    const TILE={pine:[0,.5],spruce:[.5,.5],leaf:[0,0],bark:[.5,0]};
    function Builder(){
      const pos=[],nor=[],uv=[],colr=[],crown=[];
      return {
        // Card: centre c, width axis ax, length axis ay (texture v: base to tip), both full lengths.
        card(c,ax,ay,tile,centre,radius,shade=1){
          const n=new T.Vector3().crossVectors(ax,ay).normalize(),[u0,v0]=TILE[tile];
          const corners=[[-.5,-.5,0,0],[.5,-.5,1,0],[.5,.5,1,1],[-.5,.5,0,1]];
          const vs=corners.map(([a,b,u,v])=>{const p=c.clone().addScaledVector(ax,a).addScaledVector(ay,b);
            const out=p.clone().sub(centre),d=out.length();const nn=out.normalize().multiplyScalar(.8).addScaledVector(n,n.dot(out)>=0?.2:-.2).normalize();
            const ao=shade*(.55+.45*Math.min(1,d/radius))*(.58+.42*Math.min(1,Math.max(0,(p.y-centre.y)/radius+.55)));
            return {p,nn,u:u0+.012+u*.476,v:v0+.012+v*.476,ao};});
          for(const k of [0,1,2,0,2,3]){const q=vs[k];pos.push(q.p.x,q.p.y,q.p.z);nor.push(q.nn.x,q.nn.y,q.nn.z);uv.push(q.u,q.v);colr.push(q.ao,q.ao,q.ao);crown.push(1);}
        },
        // Trunk or branch: open cylinder from a to b, bark tile, colour c0 at a to c1 at b.
        stem(a,b,r0,r1,seg,c0,c1){
          const d=b.clone().sub(a),len=d.length(),g=new T.CylinderGeometry(r1,r0,len,seg,1,true);g.translate(0,len/2,0);
          g.applyQuaternion(new T.Quaternion().setFromUnitVectors(V3(0,1,0),d.clone().normalize()));g.translate(a.x,a.y,a.z);
          const G=g.index?g.toNonIndexed():g,P=G.attributes.position,N=G.attributes.normal,U=G.attributes.uv,C0=new T.Color(c0),C1=new T.Color(c1),[u0,v0]=TILE.bark;
          for(let i=0;i<P.count;i++){const t=U.getY(i),c=C0.clone().lerp(C1,t);pos.push(P.getX(i),P.getY(i),P.getZ(i));nor.push(N.getX(i),N.getY(i),N.getZ(i));uv.push(u0+.012+U.getX(i)*.476,v0+.012+t*.476);colr.push(c.r,c.g,c.b);crown.push(0);}
        },
        geometry(){
          const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));
          g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(colr,3));g.setAttribute('crown',new T.Float32BufferAttribute(crown,1));g.computeBoundingSphere();return g;
        }};
    }
    let seedG=977;const rg=()=>{seedG=(Math.imul(seedG,1664525)+1013904223)>>>0;return seedG/4294967296;};
    const UP=V3(0,1,0),horiz=a=>V3(Math.cos(a),0,Math.sin(a));
    // Pine bark orange-brown as in the recordings, birch-like pale bark for the broadleaf trees.
    const PINE_BARK=['#6c5242','#c98a55'],SPRUCE_BARK=['#443a31','#5e4f41'],BIRCH_BARK=['#8a8474','#e2ddd0'];
    // Scots pine (v12): bare orange trunk to ~0.5, irregular crown of needle clumps at the ends of
    // a few crooked branches over the top 45 % (recording 1 at 38 and 110 s: tall pines, open crowns).
    function pine(n,seg,big=1){
      const b=Builder(),centre=V3(0,.78,0),lean=V3((rg()-.5)*.03,0,(rg()-.5)*.03);b.stem(V3(0,0,0),V3(lean.x,.93,lean.z),.022,.008,seg,...PINE_BARK);
      const tips=[];for(let k=0;k<6;k++){const a=k*2.4+rg()*.9,y=.55+.07*k+rg()*.03,len=.07+.11*(1-k/6)*(.6+.6*rg()),out=horiz(a),tip=V3(out.x*len,y+.04,out.z*len);
        if(seg>3)b.stem(V3(lean.x*y,y-.03,lean.z*y),tip,.006,.003,3,...PINE_BARK);tips.push(tip);}
      tips.push(V3(lean.x,.94,lean.z));
      for(let i=0;i<n;i++){
        const T0=tips[i%tips.length],f=T0.y,a=rg()*6.2832,out=horiz(a),r=.03+.05*rg(),s=big*(.14+.07*rg()+.04*(1-f)),y=T0.y+(rg()-.3)*.05;
        // Clumped sprays, mostly flat (a canopy from above), every third one on edge.
        const along=out.clone().setY(.05+.3*rg()).normalize(),side=new T.Vector3().crossVectors(UP,along).normalize(),tilt=(rg()-.5)*.8+(i%3===0?1.3:0);
        const ax=side.clone().applyAxisAngle(along,tilt).multiplyScalar(s*1.05),ay=along.clone().multiplyScalar(s);
        b.card(V3(T0.x+out.x*r,y,T0.z+out.z*r),ax,ay,'pine',centre,.26);
      }
      for(const a of [0,Math.PI/2])b.card(V3(lean.x,.95,lean.z),horiz(a).multiplyScalar(.18*big),V3(0,.14,0),'pine',centre,.26,1.05);
      return b.geometry();
    }
    // Spruce: whorls of drooping sprays, radius shrinking to the top, dark spire.
    function spruce(whorls,per,seg){
      const b=Builder(),centre=V3(0,.5,0);b.stem(V3(0,0,0),V3(0,.98,0),.02,.004,seg,...SPRUCE_BARK);
      for(let k=0;k<whorls;k++){
        const f=k/(whorls-1),y=.14+.8*f,R=.25*Math.pow(1-f*.95,1.05)+.02;
        for(let j=0;j<per;j++){
          const a=j*6.2832/per+k*.9+rg()*.4,out=horiz(a),droop=-.25-.25*rg(),along=out.clone().setY(droop).normalize(),s=Math.max(.07,R*1.15);
          const side=new T.Vector3().crossVectors(UP,along).normalize().applyAxisAngle(along,(rg()-.5)*.5);
          b.card(out.clone().multiplyScalar(s*.42).setY(y-s*.1),side.multiplyScalar(s*.8),along.clone().multiplyScalar(s),'spruce',centre,.3,.85+.2*f);
        }
      }
      for(const a of [0,Math.PI/2])b.card(V3(0,.95,0),horiz(a).multiplyScalar(.09),V3(0,.12,0),'spruce',centre,.3,1.05);
      return b.geometry();
    }
    // Broadleaf / birch (v12): slender pale trunk, five branches going up and out, leaf clusters
    // around their tips and the top: an open, lobed crown over the upper half with gaps between the
    // lobes (recording 1 at 2 and 38 s), instead of one round ball.
    function broadleaf(n,seg,big=1){
      const b=Builder(),centre=V3(0,.68,0);b.stem(V3(0,0,0),V3(.015,.9,0),.018,.006,seg,...BIRCH_BARK);
      const lobes=[];
      for(let k=0;k<5;k++){const a=k*2.4+rg()*.7,y=.4+.085*k+rg()*.04,len=.1+.09*rg(),out=horiz(a),tip=V3(out.x*len,y+len*.85,out.z*len);
        if(seg>3)b.stem(V3(.015*y,y,0),tip,.007,.003,3,...BIRCH_BARK);lobes.push(tip);}
      lobes.push(V3(.02,.9,0));
      for(let i=0;i<n;i++){
        const L=lobes[i%lobes.length],u=rg()*6.2832,v=Math.acos(2*rg()-1),dir=V3(Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)),rr=.05+.06*rg();
        const c=L.clone().add(V3(dir.x*rr*1.2,dir.y*rr*.8,dir.z*rr*1.2)),s=big*(.15+.08*rg());
        const ax=new T.Vector3(rg()-.5,rg()-.5,rg()-.5).normalize(),ay=new T.Vector3().crossVectors(dir,ax).normalize();
        b.card(c,ax.multiplyScalar(s),ay.multiplyScalar(s),'leaf',centre,.28);
      }
      return b.geometry();
    }
    const full=[pine(26,6),spruce(8,6,5),broadleaf(30,6)];
    const simple=[pine(12,3,1.2),spruce(5,4,3),broadleaf(14,3,1.15)];
    // ---- Atlas: tiles drawn once on a canvas (luminance and alpha; the tree colour tints it) ----
    function makeAtlas(){
      if(!o.canvas)return null;
      const S=1024,H=512,c=o.canvas(S,S),g=c.getContext('2d');g.clearRect(0,0,S,S);let sd=3301;const r=()=>{sd=(Math.imul(sd,1664525)+1013904223)>>>0;return sd/4294967296;};
      const shade=(v,a=1,hue=0)=>`rgba(${Math.round(255*v*(1-.08*hue))},${Math.round(255*v)},${Math.round(255*v*(1-.16*hue))},${a})`;
      // Pine: dense tufts of long needles along a few twigs, clumped (tile at 0,0).
      g.save();g.translate(0,0);
      const tufts=[];for(let t=0;t<18;t++){const a=r()*6.2832,d=Math.sqrt(r())*H*.32;tufts.push([H*.5+Math.cos(a)*d,H*.47+Math.sin(a)*d*.85]);}
      g.strokeStyle='rgba(95,70,50,1)';g.lineWidth=5;for(const [bx,by] of tufts){g.beginPath();g.moveTo(H*.5,H*.97);g.quadraticCurveTo(H*.5,H*.62,bx,by);g.stroke();}
      for(const [bx,by] of tufts)for(let k=0;k<130;k++){const a=r()*6.2832,l=H*(.045+.06*r()),x=bx+Math.cos(a)*H*.03*r(),y=by+Math.sin(a)*H*.03*r();g.strokeStyle=shade(.66+.34*r(),1,r());g.lineWidth=2.2+r()*2.4;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l*.85);g.stroke();}
      g.restore();
      // Spruce: flat spray, side branchlets covered with short needles (tile at 512,0).
      g.save();g.translate(H,0);
      const axisY=y=>H*.95-y*H*.9;g.strokeStyle='rgba(70,55,45,1)';g.lineWidth=6;g.beginPath();g.moveTo(H*.5,H*.97);g.lineTo(H*.5,H*.05);g.stroke();
      for(let k=0;k<22;k++){const y=axisY(k/22+.03),len=H*.44*(1-k/24);
        for(const sgn of [-1,1]){const ex=H*.5+sgn*len,ey=y-len*.35;g.strokeStyle='rgba(70,55,45,1)';g.lineWidth=2.5;g.beginPath();g.moveTo(H*.5,y);g.lineTo(ex,ey);g.stroke();
          for(let q=0;q<44;q++){const t=r(),x=H*.5+(ex-H*.5)*t,yy=y+(ey-y)*t,a=(sgn>0?-.9:-2.25)+(r()-.5)*1.6,l=H*.035+r()*H*.03;g.strokeStyle=shade(.55+.4*r(),1,r()*.6);g.lineWidth=2.4;g.beginPath();g.moveTo(x,yy);g.lineTo(x+Math.cos(a)*l,yy+Math.sin(a)*l);g.stroke();}}}
      g.restore();
      // Broadleaf: cluster of small leaves on twigs, denser in the middle (tile at 0,512).
      g.save();g.translate(0,H);g.strokeStyle='rgba(90,80,70,1)';g.lineWidth=3;
      for(let k=0;k<6;k++){g.beginPath();g.moveTo(H*.5,H*.98);g.quadraticCurveTo(H*(.3+.4*r()),H*.6,H*(.15+.7*r()),H*(.12+.5*r()));g.stroke();}
      for(let k=0;k<1100;k++){const a=r()*6.2832,d=Math.pow(r(),.6)*H*.44,x=H*.5+Math.cos(a)*d,y=H*.48+Math.sin(a)*d*.95;
        g.save();g.translate(x,y);g.rotate(r()*6.2832);g.fillStyle=shade(.52+.36*r(),1,r());g.beginPath();g.ellipse(0,0,H*(.026+.016*r()),H*(.013+.008*r()),0,0,6.2832);g.fill();g.restore();}
      g.restore();
      // Bark: long fissures and plates (tile at 512,512), opaque.
      g.save();g.translate(H,H);g.fillStyle=shade(.8);g.fillRect(0,0,H,H);
      for(let k=0;k<260;k++){const x=r()*H,w=2+r()*6;g.fillStyle=shade(.45+.25*r(),.8);g.fillRect(x,r()*H,w,H*(.08+.3*r()));}
      for(let k=0;k<160;k++){g.fillStyle=shade(.85+.15*r(),.6);g.fillRect(r()*H,r()*H,8+r()*20,4+r()*10);}
      g.restore();
      const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=o.anisotropy||8;t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;return t;
    }
    const atlas=makeAtlas();
    // Distant shape: one smooth diamond of crown (6 vertices), tinted per tree.
    const farGeo=(()=>{const g=new T.BufferGeometry(),p=[0,1,0, .19,.7,0, 0,.7,.19, -.19,.7,0, 0,.7,-.19, 0,.45,0];
      const nrm=[],colr=[],cr=[];for(let i=0;i<6;i++){const v=V3(p[i*3],(p[i*3+1]-.7)*2.2,p[i*3+2]).normalize();nrm.push(v.x,v.y,v.z);const s=i===0?1.05:i===5?.5:.85;colr.push(s,s,s);cr.push(1);}
      g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(nrm,3));g.setAttribute('color',new T.Float32BufferAttribute(colr,3));g.setAttribute('crown',new T.Float32BufferAttribute(cr,1));
      g.setIndex([0,2,1,0,3,2,0,4,3,0,1,4,5,1,2,5,2,3,5,3,4,5,4,1]);g.computeBoundingSphere();return g;})();

    // ---- Materials: the per-tree tint applies to the foliage only; foliage keeps its outward
    // normal on both faces of a card, and light passing through leaves brightens them a little.
    const tint=s=>{
      s.vertexShader='attribute float crown;\nvarying float vCrown;\n'+s.vertexShader
        .replace('#include <color_vertex>',T.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;','vColor.xyz *= mix( vec3( 1.0 ), instanceColor.xyz, crown );'))
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvCrown = crown;');
      s.fragmentShader='varying float vCrown;\n'+s.fragmentShader
        .replace('#include <normal_fragment_begin>',T.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;','normal *= mix( faceDirection, 1.0, vCrown );'))
        .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vCrown * diffuseColor.rgb * 0.06;');
    };
    const nearMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0,map:atlas,alphaTest:atlas?.42:0,alphaToCoverage:!!atlas,side:atlas?T.DoubleSide:T.FrontSide,envMapIntensity:.55});nearMat.onBeforeCompile=tint;
    const uCenter={value:new T.Vector2(1e9,1e9)},uRadius={value:R_NEAR};
    const farMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0});
    farMat.onBeforeCompile=s=>{s.uniforms.nearCenter=uCenter;s.uniforms.nearRadius=uRadius;
      s.vertexShader='uniform vec2 nearCenter;\nuniform float nearRadius;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_INSTANCING\nif( distance( vec2( instanceMatrix[3][0], instanceMatrix[3][2] ), nearCenter ) < nearRadius ) transformed = vec3( 0.0 );\n#endif');};
    const far=new T.InstancedMesh(farGeo,farMat,0);far.instanceMatrix=new T.InstancedBufferAttribute(mat,16);far.instanceColor=new T.InstancedBufferAttribute(col,3);far.count=n;far.frustumCulled=false;far.name='forest-far';scene.add(far);

    // ---- Near lists: capacities from the densest place the camera can reach ----
    const capacity=[[1,1,1],[1,1,1]];
    {const counts=new Uint32Array(GX*GZ*3);for(let k=0;k<K;k++)counts[k]=start[k+1]-start[k];
     for(let cz=-3600;cz<=1900;cz+=150)for(let cx=-3200;cx<=3000;cx+=150){
       const sum=[[0,0,0],[0,0,0]];
       for(let iz=Math.max(0,Math.floor((cz-R_NEAR-Z0)/NC));iz<=Math.min(GZ-1,Math.floor((cz+R_NEAR-Z0)/NC));iz++)for(let ix=Math.max(0,Math.floor((cx-R_NEAR-X0)/NC));ix<=Math.min(GX-1,Math.floor((cx+R_NEAR-X0)/NC));ix++){
         const ax=X0+ix*NC,az=Z0+iz*NC,dx=Math.max(ax-cx,0,cx-ax-NC),dz=Math.max(az-cz,0,cz-az-NC),d2=dx*dx+dz*dz;if(d2>=R_NEAR*R_NEAR)continue;
         const ccx=ax+NC/2-cx,ccz=az+NC/2-cz,lod=ccx*ccx+ccz*ccz<R_FULL*R_FULL?0:1;
         for(let s=0;s<3;s++){const c=counts[(iz*GX+ix)*3+s];sum[1][s]+=c;if(lod===0)sum[0][s]+=c;}
       }
       for(let l=0;l<2;l++)for(let s=0;s<3;s++)capacity[l][s]=Math.max(capacity[l][s],sum[l][s]);
     }
     // LOD 0 cells are chosen on the 3D distance, which never exceeds the 2D bound above.
     for(let l=0;l<2;l++)for(let s=0;s<3;s++)capacity[l][s]=Math.ceil(capacity[l][s]*1.05)+16;}
    const near=[0,1].map(l=>[0,1,2].map(s=>{
      const m=new T.InstancedMesh(l===0?full[s]:simple[s],nearMat,capacity[l][s]);m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.instanceColor=new T.InstancedBufferAttribute(new Float32Array(capacity[l][s]*3),3);m.instanceColor.setUsage(T.DynamicDrawUsage);
      m.count=0;m.frustumCulled=false;m.castShadow=l===0&&shadows;m.receiveShadow=false;m.name=`forest-${SPECIES[s].name}-lod${l}`;scene.add(m);return m;}));
    // ---- Bushes (v11): leafy clumps of 1.2-3.5 m on the meadows and along the stand edges
    // around the play area, as on the recordings. Visual only (rounds and rotor pass through).
    const bushes=(()=>{
      const b=Builder(),centre=V3(0,.42,0);
      for(let i=0;i<10;i++){const a=i*2.4,dir=V3(Math.cos(a)*.8,.35+.5*rg(),Math.sin(a)*.8).normalize(),s=.55+.25*rg();
        const ax=new T.Vector3(rg()-.5,rg()-.5,rg()-.5).normalize(),ay=new T.Vector3().crossVectors(dir,ax).normalize();b.card(centre.clone().addScaledVector(dir,.28),ax.multiplyScalar(s),ay.multiplyScalar(s),'leaf',centre,.5);}
      const geo=b.geometry(),list=[],m=new T.Matrix4(),q=new T.Quaternion(),p=new T.Vector3(),sc=new T.Vector3(),c=new T.Color();
      const pal=['#5d6844','#66703f','#4f5a3a','#7a6d44','#6e5a3a','#58603d'].map(h=>new T.Color(h));
      for(let z=-3100;z<1000;z+=10)for(let x=-1900;x<1700;x+=10){
        const px=x+rnd()*10,pz=z+rnd()*10;if(W.reserved(px,pz))continue;const s=sample(px,pz),d=s[1];
        if(rnd()>.09+.5*d*(1-d)*4*.45)continue;list.push([px,s[0]-.15,pz,1.2+2.3*Math.pow(rnd(),1.5),rnd()*6.28,Math.floor(rnd()*pal.length),.85+.3*rnd()]);
      }
      const inst=new T.InstancedMesh(geo,nearMat,list.length);inst.instanceColor=new T.InstancedBufferAttribute(new Float32Array(list.length*3),3);
      list.forEach(([x,y,z,s,r,k,j],i)=>{m.compose(p.set(x,y,z),q.setFromAxisAngle(UP,r),sc.set(s*1.15,s*.8,s*1.15));inst.setMatrixAt(i,m);c.copy(pal[k]).multiplyScalar(j);inst.setColorAt(i,c);});
      inst.frustumCulled=false;inst.castShadow=shadows;inst.receiveShadow=false;inst.name='buissons';scene.add(inst);return inst;
    })();
    // ---- Grass tufts (v11): around the camera when it flies low (under 90 m), on a fixed 3 m
    // pattern, thick on the meadows, sparse under the trees. Visual only. ----
    const grass=(()=>{
      if(!o.canvas||quality==='low')return null;
      const c=o.canvas(256,256),g=c.getContext('2d');g.clearRect(0,0,256,256);let sd=71;const r=()=>{sd=(Math.imul(sd,1664525)+1013904223)>>>0;return sd/4294967296;};
      for(let k=0;k<110;k++){const x=16+r()*224,h=80+r()*170,lean=(r()-.5)*70,v=.6+.4*r();g.strokeStyle=`rgba(${Math.round(255*v*.92)},${Math.round(255*v)},${Math.round(255*v*.72)},1)`;g.lineWidth=2+r()*3.5;g.beginPath();g.moveTo(x,256);g.quadraticCurveTo(x+lean*.25,256-h*.55,x+lean,256-h);g.stroke();}
      const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=o.anisotropy||8;
      const pos=[],nor=[],uv=[];for(let k=0;k<3;k++){const a=k*Math.PI/3,dx=Math.cos(a)*.5,dz=Math.sin(a)*.5;
        for(const [x,y,z,u,v] of [[-dx,0,-dz,0,0],[dx,0,dz,1,0],[dx,1,dz,1,1],[-dx,0,-dz,0,0],[dx,1,dz,1,1],[-dx,1,-dz,0,1]]){pos.push(x,y,z);nor.push(0,1,0);uv.push(u,v);}}
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new T.Float32BufferAttribute(nor,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      const mat=new T.MeshStandardMaterial({map:tex,alphaTest:.45,alphaToCoverage:true,side:T.DoubleSide,roughness:1,metalness:0});
      const R=80,STEP=3,cap=Math.ceil(Math.PI*R*R/(STEP*STEP)*1.15),inst=new T.InstancedMesh(geo,mat,cap);
      inst.instanceMatrix.setUsage(T.DynamicDrawUsage);inst.instanceColor=new T.InstancedBufferAttribute(new Float32Array(cap*3),3);inst.instanceColor.setUsage(T.DynamicDrawUsage);
      inst.count=0;inst.frustumCulled=false;inst.receiveShadow=shadows;inst.name='herbe';scene.add(inst);
      const m=new T.Matrix4(),q=new T.Quaternion(),p=new T.Vector3(),sc=new T.Vector3(),col=new T.Color(),base=[new T.Color('#6a7348'),new T.Color('#747a4a'),new T.Color('#5f6a42'),new T.Color('#858052')];
      let lx=1e9,lz=1e9;
      function update(camera){
        const cp=camera.position,h0=sample(cp.x,cp.z)[0];if(cp.y-h0>90){inst.visible=false;lx=1e9;return;}inst.visible=true;
        if((cp.x-lx)**2+(cp.z-lz)**2<49)return;lx=cp.x;lz=cp.z;let n=0;
        for(let iz=Math.floor((cp.z-R)/STEP);iz<=Math.floor((cp.z+R)/STEP);iz++)for(let ix=Math.floor((cp.x-R)/STEP);ix<=Math.floor((cp.x+R)/STEP);ix++){
          let hsh=(Math.imul(ix,73856093)^Math.imul(iz,19349663))>>>0;const hr=()=>{hsh=(Math.imul(hsh,1664525)+1013904223)>>>0;return hsh/4294967296;};
          const x=(ix+hr())*STEP,z=(iz+hr())*STEP;if((x-cp.x)**2+(z-cp.z)**2>R*R)continue;
          const s=sample(x,z),d=s[1];if(hr()>.75-.55*d||n>=cap)continue;if(W.reserved(x,z))continue;
          const k=.55+.75*hr();m.compose(p.set(x,s[0]-.05,z),q.setFromAxisAngle(UP,hr()*6.28),sc.set(k*1.3,k*(.7+.5*hr()),k*1.3));inst.setMatrixAt(n,m);
          col.copy(base[Math.floor(hr()*base.length)]).multiplyScalar(.85+.3*hr());inst.setColorAt(n,col);n++;
        }
        inst.count=n;inst.instanceMatrix.needsUpdate=true;inst.instanceColor.needsUpdate=true;
      }
      return {mesh:inst,update,get count(){return inst.count;}};
    })();
    let lastX=1e9,lastY=1e9,lastZ=1e9,rebuilds=0;
    const shown=[[0,0,0],[0,0,0]];
    function rebuild(cx,cy,cz){
      lastX=cx;lastY=cy;lastZ=cz;rebuilds++;uCenter.value.set(cx,cz);
      const R2=R_NEAR*R_NEAR,F2=R_FULL*R_FULL,cnt=[[0,0,0],[0,0,0]];
      for(let iz=Math.max(0,Math.floor((cz-R_NEAR-Z0)/NC));iz<=Math.min(GZ-1,Math.floor((cz+R_NEAR-Z0)/NC));iz++)for(let ix=Math.max(0,Math.floor((cx-R_NEAR-X0)/NC));ix<=Math.min(GX-1,Math.floor((cx+R_NEAR-X0)/NC));ix++){
        const ax=X0+ix*NC,az=Z0+iz*NC,dx=Math.max(ax-cx,0,cx-ax-NC),dz=Math.max(az-cz,0,cz-az-NC);if(dx*dx+dz*dz>=R2)continue;
        const fx=Math.max(Math.abs(ax-cx),Math.abs(ax+NC-cx)),fz=Math.max(Math.abs(az-cz),Math.abs(az+NC-cz)),inside=fx*fx+fz*fz<R2;
        const cell=iz*GX+ix,ccx=ax+NC/2-cx,ccz=az+NC/2-cz,dy=cy-cellY[cell],lod=ccx*ccx+ccz*ccz+dy*dy<F2?0:1;
        for(let s=0;s<3;s++){
          const a=start[cell*3+s],b=start[cell*3+s+1];if(a===b)continue;
          const m=near[lod][s],dst=m.instanceMatrix.array,dcol=m.instanceColor.array,max=capacity[lod][s];let c=cnt[lod][s];
          if(inside){const take=Math.min(b-a,max-c);dst.set(mat.subarray(a*16,(a+take)*16),c*16);dcol.set(col.subarray(a*3,(a+take)*3),c*3);c+=take;}
          else for(let t=a;t<b&&c<max;t++){const ddx=sx[t]-cx,ddz=sz[t]-cz;if(ddx*ddx+ddz*ddz<R2){dst.set(mat.subarray(t*16,t*16+16),c*16);dcol.set(col.subarray(t*3,t*3+3),c*3);c++;}}
          cnt[lod][s]=c;
        }
      }
      // Upload only the part in use.
      for(let l=0;l<2;l++)for(let s=0;s<3;s++){const m=near[l][s],c=cnt[l][s];m.count=c;shown[l][s]=c;if(!c)continue;
        for(const [attr,size] of [[m.instanceMatrix,16],[m.instanceColor,3]]){if(attr.addUpdateRange){attr.clearUpdateRanges();attr.addUpdateRange(0,c*size);}attr.needsUpdate=true;}}
    }
    function update(camera){const p=camera.position;if((p.x-lastX)**2+(p.z-lastZ)**2>625||Math.abs(p.y-lastY)>40)rebuild(p.x,p.y,p.z);if(grass)grass.update(camera);}

    // ---- Collisions: 16 m grid, trunk and crown boxes per tree ----
    const CS=16,CGX=Math.ceil((X1-X0)/CS),CGZ=Math.ceil((Z1-Z0)/CS),NCELL=CGX*CGZ,MAXR=6;
    const cStart=new Uint32Array(NCELL+1),cIdx=new Uint32Array(n),cTop=new Float32Array(NCELL).fill(-1e9);
    const ccell=k=>Math.min(CGZ-1,Math.max(0,Math.floor((sz[k]-Z0)/CS)))*CGX+Math.min(CGX-1,Math.max(0,Math.floor((sx[k]-X0)/CS)));
    for(let k=0;k<n;k++){const c=ccell(k);cStart[c+1]++;cTop[c]=Math.max(cTop[c],sy[k]+sh[k]);}
    for(let c=0;c<NCELL;c++)cStart[c+1]+=cStart[c];
    {const f=cStart.slice(0,NCELL);for(let k=0;k<n;k++)cIdx[f[ccell(k)]++]=k;}
    // Segment a-b (origin a, direction d) against a padded box: entry fraction, or -1 when missed.
    let ax=0,ay=0,az=0,dx=0,dy=0,dz=0,pad=0;
    function slab(x0,y0,z0,x1,y1,z1){
      let t0=0,t1=1,e,f,s;x0-=pad;y0-=pad;z0-=pad;x1+=pad;y1+=pad;z1+=pad;
      if(Math.abs(dx)<1e-10){if(ax<x0||ax>x1)return -1;}else{e=(x0-ax)/dx;f=(x1-ax)/dx;if(e>f){s=e;e=f;f=s;}if(e>t0)t0=e;if(f<t1)t1=f;if(t0>t1)return -1;}
      if(Math.abs(dy)<1e-10){if(ay<y0||ay>y1)return -1;}else{e=(y0-ay)/dy;f=(y1-ay)/dy;if(e>f){s=e;e=f;f=s;}if(e>t0)t0=e;if(f<t1)t1=f;if(t0>t1)return -1;}
      if(Math.abs(dz)<1e-10){if(az<z0||az>z1)return -1;}else{e=(z0-az)/dz;f=(z1-az)/dz;if(e>f){s=e;e=f;f=s;}if(e>t0)t0=e;if(f<t1)t1=f;if(t0>t1)return -1;}
      return t0;
    }
    function treeHit(k){
      const x=sx[k],y=sy[k],z=sz[k],h=sh[k],w=sw[k]*h;let best=-1,t,r;
      if(ss[k]===0){best=slab(x-.3,y,z-.3,x+.3,y+.84*h,z+.3);r=.17*w;t=slab(x-r,y+.58*h,z-r,x+r,y+h,z+r);if(t>=0&&(best<0||t<best))best=t;}
      else if(ss[k]===1){best=slab(x-.3,y,z-.3,x+.3,y+.44*h,z+.3);for(const [c,wf,hf] of SPRUCE_BOXES){r=.55*wf*w;t=slab(x-r,y+(c-hf/2)*h,z-r,x+r,y+(c+hf/2)*h,z+r);if(t>=0&&(best<0||t<best))best=t;}}
      else {best=slab(x-.28,y,z-.28,x+.28,y+.7*h,z+.28);r=.19*w;t=slab(x-r,y+.47*h,z-r,x+r,y+h,z+r);if(t>=0&&(best<0||t<best))best=t;}
      return best;
    }
    function hitShort(a,b,p){
      const ix0=Math.max(0,Math.floor((Math.min(a.x,b.x)-p-MAXR-X0)/CS)),ix1=Math.min(CGX-1,Math.floor((Math.max(a.x,b.x)+p+MAXR-X0)/CS));
      const iz0=Math.max(0,Math.floor((Math.min(a.z,b.z)-p-MAXR-Z0)/CS)),iz1=Math.min(CGZ-1,Math.floor((Math.max(a.z,b.z)+p+MAXR-Z0)/CS));
      const low=Math.min(a.y,b.y)-p;let best=-1;
      ax=a.x;ay=a.y;az=a.z;dx=b.x-a.x;dy=b.y-a.y;dz=b.z-a.z;pad=p;
      for(let iz=iz0;iz<=iz1;iz++)for(let ix=ix0;ix<=ix1;ix++){const c=iz*CGX+ix;if(cTop[c]<low)continue;
        for(let q=cStart[c];q<cStart[c+1];q++){const t=treeHit(cIdx[q]);if(t>=0&&(best<0||t<best))best=t;}}
      return best<0?null:best;
    }
    const pa={x:0,y:0,z:0},pb={x:0,y:0,z:0};
    // Long segments are cut into 32 m pieces, nearest first.
    function hit(a,b,padding=0){
      const len=Math.hypot(b.x-a.x,b.z-a.z);
      if(len<=40){const t=hitShort(a,b,padding);return t===null?null:{fraction:t,kind:'arbre',owner:null};}
      const pieces=Math.ceil(len/32);
      for(let i=0;i<pieces;i++){const f0=i/pieces,f1=(i+1)/pieces;
        pa.x=a.x+(b.x-a.x)*f0;pa.y=a.y+(b.y-a.y)*f0;pa.z=a.z+(b.z-a.z)*f0;pb.x=a.x+(b.x-a.x)*f1;pb.y=a.y+(b.y-a.y)*f1;pb.z=a.z+(b.z-a.z)*f1;
        const t=hitShort(pa,pb,padding);if(t!==null)return {fraction:f0+(f1-f0)*t,kind:'arbre',owner:null};}
      return null;
    }
    // Trees per hectare within radius r of (x, z) (tests and documentation).
    function density(x,z,r=50){
      let count=0;const ix0=Math.max(0,Math.floor((x-r-X0)/CS)),ix1=Math.min(CGX-1,Math.floor((x+r-X0)/CS)),iz0=Math.max(0,Math.floor((z-r-Z0)/CS)),iz1=Math.min(CGZ-1,Math.floor((z+r-Z0)/CS));
      for(let iz=iz0;iz<=iz1;iz++)for(let ix=ix0;ix<=ix1;ix++){const c=iz*CGX+ix;for(let q=cStart[c];q<cStart[c+1];q++){const k=cIdx[q];if((sx[k]-x)**2+(sz[k]-z)**2<r*r)count++;}}
      return count/(Math.PI*r*r/1e4);
    }
    const layer={kind:'arbre',hit};
    if(o.field)o.field.addLayer(layer);
    return {count:n,perSpecies,heights:sh,species:ss,x:sx,y:sy,z:sz,layer,hit,density,update,rebuild,far,near,capacity,shown,bushes,grass,
      get rebuilds(){return rebuilds;},settings:{spacing,R_NEAR,R_FULL},SPECIES};
  }
  const api={build,SPECIES,BOUNDS};
  if(typeof module!=='undefined')module.exports=api;else root.HeliForest=api;
})(typeof window!=='undefined'?window:globalThis);



