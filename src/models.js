/* 3D models of the trainer: original low-poly geometry built in code (no
   game asset). Little Bird modelled after the AH-6M seen in the reference
   recordings: grey satin egg-shaped cabin with a large canopy, rear exhaust,
   slender boom, T-tail with end plates, 6-blade rotor, skids, weapon plank
   with two M134 miniguns. Also vehicles, soldiers (instanced, animated),
   destructible structures and air-defence teams. */
(function(root){
  const pow=typeof module!=='undefined'?require('./core/pow.js').pow:root.HeliPow.pow; // same double on every platform
  function create(T){
    const std=(color,o={})=>new T.MeshStandardMaterial({color,roughness:.8,metalness:.1,...o});
    function mesh(g,m,parent,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
    function box(parent,w,h,d,x,y,z,m){return mesh(new T.BoxGeometry(w,h,d),m,parent,x,y,z);}
    function rod(parent,a,b,r,m,r2=r,seg=10,hs=1){const diff=b.clone().sub(a),o=mesh(new T.CylinderGeometry(r2,r,diff.length(),seg,hs),m,parent);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),diff.normalize());return o;}
    const V=(x,y,z)=>new T.Vector3(x,y,z);
    // Merge the static meshes of a group by material (one draw call each).
    // Subtrees listed in keep (animated parts) are left untouched.
    function mergeStatic(group,keep=[]){
      group.updateMatrixWorld(true);const inv=new T.Matrix4().copy(group.matrixWorld).invert(),byMat=new Map(),remove=[];
      group.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o.raycast!==T.Mesh.prototype.raycast)return;let p=o;while(p&&p!==group){if(keep.includes(p))return;p=p.parent;}
        if(!byMat.has(o.material))byMat.set(o.material,[]);byMat.get(o.material).push(o);});
      for(const [material,list] of byMat){
        if(list.length<2)continue;const geos=[];
        for(const o of list){let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv,o.matrixWorld));if(!g.attributes.normal)g.computeVertexNormals();geos.push(g);remove.push(o);}
        const total=geos.reduce((s,g)=>s+g.attributes.position.count,0),pos=new Float32Array(total*3),nor=new Float32Array(total*3),uv=new Float32Array(total*2);let k=0;
        for(const g of geos){const n=g.attributes.position.count;pos.set(g.attributes.position.array,k*3);nor.set(g.attributes.normal.array,k*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,k*2);k+=n;}
        const merged=new T.BufferGeometry();merged.setAttribute('position',new T.BufferAttribute(pos,3));merged.setAttribute('normal',new T.BufferAttribute(nor,3));merged.setAttribute('uv',new T.BufferAttribute(uv,2));
        const m=new T.Mesh(merged,material);m.castShadow=list.some(o=>o.castShadow);m.receiveShadow=true;m.renderOrder=list[0].renderOrder;group.add(m);
      }
      for(const o of remove)o.parent.remove(o);
      return group;
    }

    // ---- Little Bird (AH-6M type) ----
    // v13 exterior, fitted to the chase frames of the reference recordings (docs/analyse/apparence.md: matched renders, camera
    // pose fits). "BA" = bundle adjustment of 6 game frames (40 observations, rms 2.8 px,
    // scale = skid track 2.0 m, frame anchored on the rotor hub at y 1.58); "B" = a value in that hub-anchored frame.
    // DY: the game's hub stands 2.97 m above the skid caps vs 2.78 in v12 (BA, +7 %); the skid bottom stays at -1.25
    // (the flight model rests the origin 1.25 m above the ground), so the whole airframe is raised: model y = B + DY.
    const DY=.188;
    // Egg profile: radius r at axial position z (nose -z). Scaled x 0.7, y 0.97 (cabin width 1.43 vs 1.40 measured). v13: closed tip.
    const PROFILE=[[0,-2.2],[.34,-2.13],[.6,-1.96],[.8,-1.7],[.93,-1.36],[1,-.9],[1.02,-.4],[.98,.15],[.88,.65],[.72,1.05],[.52,1.38],[.36,1.62],[.3,1.74],[.18,1.81],[0,1.84]];
    const SX=.7,SY=.97,CY=.12+DY;
    // v13 rear dome: behind z 0.2 the pod is shortened (tip 1.84 -> 1.10) and its axis drops 0.2 m, so that the exhaust
    // measured at (0, -0.26 B = -0.07, 0.80 +- 0.32) (BA; nozzle seen in two rear views) comes out of its lower rear.
    const warp=v=>{if(v.z>.2){const u=Math.min(1,(v.z-.2)/1.64);v.y-=.2*pow(u,1.6);v.z=.2+(v.z-.2)*(1-.45*u);}return v;};
    function lathe(z0,z1,phiStart,phiLength,segments,scale=1){
      const pts=[];for(let i=0;i<PROFILE.length;i++){const [r,z]=PROFILE[i];if(z<z0-1e-6||z>z1+1e-6)continue;pts.push(new T.Vector2(r*scale,z));}
      // Close the range exactly at z0/z1 by interpolation.
      const at=z=>{for(let i=1;i<PROFILE.length;i++){const [r0,a]=PROFILE[i-1],[r1,b]=PROFILE[i];if(z>=a&&z<=b)return r0+(r1-r0)*(z-a)/(b-a);}return 0;};
      if(!pts.length||pts[0].y>z0+1e-6)pts.unshift(new T.Vector2(at(z0)*scale,z0));if(pts[pts.length-1].y<z1-1e-6)pts.push(new T.Vector2(at(z1)*scale,z1));
      const g=new T.LatheGeometry(pts,segments,phiStart,phiLength);g.rotateX(Math.PI/2);g.scale(SX,SY,1);g.translate(0,CY,0);
      const p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){warp(v.fromBufferAttribute(p,i));p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();return g;
    }
    // Point on the cabin surface: axial z, angle a around the axis (0 = top, + = right).
    function surface(z,a,out=0){
      let r=0;for(let i=1;i<PROFILE.length;i++){const [r0,z0]=PROFILE[i-1],[r1,z1]=PROFILE[i];if(z>=z0&&z<=z1){r=r0+(r1-r0)*(z-z0)/(z1-z0);break;}}
      r+=out;return warp(V(Math.sin(a)*r*SX,CY+Math.cos(a)*r*SY,z));
    }
    // Lofted skin through superellipse sections [z, centre y, width, height, squareness] (Catmull-Rom between the
    // sections, sub rings per span, seam underneath), closed at both ends.
    function loft(keys,radial=24,sub=6){
      const cr=(a,b,c,d,t)=>.5*(2*b+(c-a)*t+(2*a-5*b+4*c-d)*t*t+(3*b-a-3*c+d)*t*t*t),rings=[],pos=[],uv=[],idx=[],n=radial;
      for(let i=0;i<keys.length-1;i++)for(let k=0;k<(i===keys.length-2?sub+1:sub);k++){const a=keys[Math.max(0,i-1)],b=keys[i],c=keys[i+1],d=keys[Math.min(keys.length-1,i+2)];rings.push(b.map((_,j)=>cr(a[j],b[j],c[j],d[j],k/sub)));}
      for(const [z,cy,w,h,e] of rings)for(let j=0;j<=n;j++){const t=j/n*Math.PI*2-Math.PI/2,c=Math.cos(t),s=Math.sin(t),q=2/e;pos.push(Math.sign(c)*pow(Math.abs(c),q)*w/2,cy+Math.sign(s)*pow(Math.abs(s),q)*h/2,z);uv.push(j/n,z/2);}
      for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++){const a=i*(n+1)+j,b=a+n+1;idx.push(a,a+1,b,b,a+1,b+1);}
      for(const [i,flip] of [[0,true],[rings.length-1,false]]){const [z,cy]=rings[i],c=pos.length/3;pos.push(0,cy,z);uv.push(.5,z/2);for(let j=0;j<n;j++){const a=i*(n+1)+j;if(flip)idx.push(c,a+1,a);else idx.push(c,a,a+1);}}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
    }
    // Top strip of the same skin (angles within +-a(z) of the top) between z0 and z1, raised by off (m): a conformal panel.
    function loftTop(keys,z0,z1,a,off,n=8,sub=8){
      const cr=(p,b,c,d,t)=>.5*(2*b+(c-p)*t+(2*p-5*b+4*c-d)*t*t+(3*b-p-3*c+d)*t*t*t),rings=[],pos=[],idx=[];
      for(let i=0;i<keys.length-1;i++)for(let k=0;k<=sub;k++){const r=keys[i].map((_,j)=>cr(keys[Math.max(0,i-1)][j],keys[i][j],keys[i+1][j],keys[Math.min(keys.length-1,i+2)][j],k/sub));if(r[0]>=z0&&r[0]<=z1&&!(rings.length&&r[0]<=rings[rings.length-1][0]+1e-6))rings.push(r);}
      for(const [z,cy,w,h,e] of rings)for(let j=0;j<=n;j++){const t=Math.PI/2-a(z)+2*a(z)*j/n,c=Math.cos(t),s=Math.sin(t),q=2/e;pos.push(Math.sign(c)*pow(Math.abs(c),q)*(w/2+off),cy+Math.sign(s)*pow(Math.abs(s),q)*(h/2+off),z);}
      for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++){const p=i*(n+1)+j,b=p+n+1;idx.push(p,p+1,b,b,p+1,b+1);}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
    }
    let paintTexture=null;
    // Weathered paint of the airframe (v11, after the game's Little Bird): grain, panel lines with
    // rivet rows, dirt runs streaking down, grime, a few chips; also used as a light bump map.
    function panelTexture(canvas){
      if(!canvas)return null;const S=512,c=canvas(S,S),g=c.getContext('2d');let sd=517;const r=()=>{sd=(Math.imul(sd,1664525)+1013904223)>>>0;return sd/4294967296;};
      g.fillStyle='#e6e6e6';g.fillRect(0,0,S,S);
      for(let i=0;i<9000;i++){const v=200+Math.floor(r()*55);g.fillStyle=`rgba(${v},${v},${v},.3)`;g.fillRect(r()*S,r()*S,1+r()*3,1+r()*3);}
      for(let i=0;i<70;i++){const x=r()*S,y=r()*S,w=3+r()*10,h=30+r()*160;const gr=g.createLinearGradient(0,y,0,y+h);gr.addColorStop(0,'rgba(70,65,55,.22)');gr.addColorStop(1,'rgba(70,65,55,0)');g.fillStyle=gr;g.fillRect(x,y,w,h);}
      for(let i=0;i<25;i++){g.fillStyle=`rgba(60,58,52,${.05+r()*.08})`;g.beginPath();g.ellipse(r()*S,r()*S,20+r()*70,10+r()*40,r()*3,0,7);g.fill();}
      g.strokeStyle='rgba(35,35,35,.3)';g.lineWidth=1.4;for(const x of [80,192,300,428]){g.beginPath();g.moveTo(x,0);g.lineTo(x,S);g.stroke();for(let y=6;y<S;y+=14){g.fillStyle='rgba(40,40,40,.45)';g.beginPath();g.arc(x+5,y,1.4,0,7);g.fill();}}
      for(const y of [140,300,420]){g.beginPath();g.moveTo(0,y);g.lineTo(S,y);g.stroke();for(let x=6;x<S;x+=14){g.fillStyle='rgba(40,40,40,.45)';g.beginPath();g.arc(x,y+5,1.4,0,7);g.fill();}}
      for(let i=0;i<50;i++){g.fillStyle=`rgba(245,243,236,${.2+r()*.3})`;g.fillRect(r()*S,r()*S,1+r()*5,1+r()*3);}
      const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;
    }
    // ---- Appearance constants of the helicopter (v13 appearance, fix and colour stages; docs/analyse/apparence.md) ----
    // Kept on the single LOOK line below (a tuning script can swap it as a whole). Keys:
    //  paintScale  linear RGB factors on every livery's paint colour (own, bots, air targets);
    //  paintEnv    sky (IBL) intensity of the paint;
    //  ao*         ambient occlusion baked per vertex from the helicopter's own static geometry (no ground): voxel aoVox m, aoRays
    //              cosine rays per vertex, reach aoDist m, hits nearer than aoSkip m ignored; the sky light (indirect diffuse and
    //              specular) of the airframe paint/cowl panel is x ao^aoInd, of the guns, pylon and mast x ao^aoDark;
    //  graze       sky reflection x mix(1, graze, (1 - N.V)^2) (grazing brightening);
    //  hoK,hoA,hoB sky reflection whose world direction points below hoA..hoB (horizon, ground) x hoK;
    //  indSat      chroma kept in the lit colour of the sky light (albedo included; the measured own paint);
    //  skySat, skySatLivery  chroma kept in the sky light itself, before the albedo (skySatLivery: assumed liveries, livery:true);
    //  gun*,hub*,pylon*,grip*,recess*  the other materials (colour, roughness, metalness, sky intensity; *Sun: sun light factor,
    //              pylonAO: occlusion exponent of the pylon); endCap: material of the tail boom's end cap;
    //  paintSpec, paintRough  sky-reflection factor and roughness of the paint;
    //  sunPow, sunGain  sun (direct) diffuse of the paint x sunGain x N.L^sunPow;
    //  topGraze, topA, topB  sky reflection of up-facing paint (smoothstep(topA, topB, world normal y)) x mix(1, topGraze, (1 - N.V)^2).
    // Method: matched renders against 12 views of the reference recordings (7 training views, the others held out), scored on
    // photometric classes (luminance and CIELAB / CIEDE2000 colour), rotor and HUD masked on both sides; a constant is adopted
    // only when it improves the held-out views. Status of each value:
    //  - paintScale [0.73,0.76,0.78] and paintEnv 0.9: measured (sunlit paint was +0.9 stops over the game's while the shade
    //    level matched; albedo x0.73-0.78 with the sky x1.5 keeps the shade level).
    //  - aoInd 1.45 on the airframe sky light, aoDark 0.5 on the guns, pylon and mast: measured (the trainer's darkest paint
    //    was +1.64 stops over the game's before; the scores of 1.0 / 1.3 / 1.45 / 1.6 are in the analysis).
    //  - hoK 0.5 below -0.25..0.15: measured (rim pixels were +0.87 stops over the game's; the paint darkens towards the
    //    silhouette). indSat 0.35: measured (shade paint split warm-dark / blue-bright before; now R/B x1.00 in shade, x1.01 in
    //    sun). The assumed liveries (bots, air targets: no footage of them) use skySatLivery so that an olive bot stays olive.
    //  - guns: metallic (metal 0.7, rough 0.35, #8c8780, sky 0.85) with the sun x0.15 (gunSun), measured: the game's guns are
    //    as bright in sun as in shade (same-pixel median Y 0.040 vs 0.038; now 0.034 / 0.030); the fuselage shadow they sit in is
    //    finer than the trainer's shadow texels (about 16 cm).
    //  - pylon: occlusion exponent 0.25, sky 1.1, sun x0.15, measured (its faces were near-black in shade before).
    //  - grips: pale metal #88847e, rough 0.6, metal 0.2: measured (they clipped to white in the sunlit chase view before).
    //  - recess (cowl aft face, exhaust interior): #3a3e3c, sky 1.2, sun x0.25, measured (game Y 0.005-0.051 there); the tail
    //    boom end cap in the gun material (game 0.020-0.070 there).
    //  - sunPow 1, sunGain 1.1: fitted, not physical (the game's paint brightens more steeply with the sun angle; N.L^0.5,
    //    ^0.75 and ^1 were tried, ^1 scores best on every guard).
    //  - topGraze 0.3, topA 0.3, topB 0.9: chosen (shaded boom and tail tops seen almost level: game L* 39.5, 45.6 before,
    //    39.6 with the cut; removing it made the held-out views worse). A sun term for up-facing paint was tried and not
    //    adopted (the held-out views disagreed).
    //  - Not matched by paint constants: the game's sunlit paint has more contrast and its brightest paint more chroma; in far
    //    or fast chase frames the game's helicopter reads much darker, cause not established.
    //  - Own paint colour OWN_PAINT (below) '#a58f76' (was '#9f9081'), measured: per frame, the paint's light split into sky +
    //    sun x max(0, N.L) gives 'sun x paint' C* 19.2 h 76 in the game (166 frames of recording 1) vs 14.3 before and 17.9
    //    now; dE00 at equal L* 3.3 before, 1.4 now (recording 2, held out: 1.9 -> 1.8).
    //  The sun response and the top cut apply to every helicopter's paint (own, bots, air targets: the same Little Bird paint);
    //  the colours of the bots and air targets stay assumed (app.js).
    const OWN_PAINT='#a58f76';
    const LOOK={"paintScale":[0.73,0.76,0.78],"paintEnv":0.9,"aoVox":0.04,"aoRays":24,"aoDist":1.2,"aoSkip":0.1,"aoInd":1.45,"aoDark":0.5,"graze":1,"hoK":0.5,"hoA":-0.25,"hoB":0.15,"indSat":0.35,"skySat":1,"gunColor":"#8c8780","gunRough":0.35,"gunMetal":0.7,"gunEnv":0.85,"gunSun":0.15,"hubColor":"#6e655b","hubMetal":0.15,"pylonColor":"#686057","pylonEnv":1.1,"pylonMetal":0.15,"pylonAO":0.25,"pylonSun":0.15,"gripColor":"#88847e","gripRough":0.6,"gripMetal":0.2,"gripEnv":0.6,"recessColor":"#3a3e3c","recessEnv":1.2,"recessSun":0.25,"endCap":"gun","paintSpec":1,"paintRough":0.3,"skySatLivery":0.35,"sunPow":1,"sunGain":1.1,"topGraze":0.3,"topA":0.3,"topB":0.9};
    // Helicopter-only light terms on a standard material (shader patch; one extra program variant): per-vertex occlusion (vertex
    // attribute aoV, 1 = open, default 1 when a mesh lacks it) of the sky light raised to aoExp, grazing and horizon cut of the
    // sky reflection, greyer sky light (indSat: of the lit colour, albedo included; skySat: of the sky light only, before it is
    // multiplied by the albedo), direct (sun) light x sun, sky reflection x spec. noAO: the material is not an AO receiver
    // (bakeAO leaves its aoV at 1). Colour stage, paint only: sunPow / sunGain (sun diffuse x sunGain x N.L^sunPow; only with a
    // single directional light, the sun of the main scene, so that another light could never be scaled by the sun's N.L) and
    // topGraze (sky reflection of up-facing surfaces seen at a grazing angle), see LOOK.
    function lookPatch(m,aoExp,{sun=1,spec=1,noAO=false,indSat=LOOK.indSat,skySat=LOOK.skySat,sunPow=0,sunGain=1,topGraze=1}={}){
      const f=x=>(+x).toFixed(4),sunK=sun,specK=spec,key='lbLook|'+[aoExp,sunK,specK,LOOK.graze,LOOK.hoK,LOOK.hoA,LOOK.hoB,indSat,skySat,sunPow,sunGain,topGraze].join('|');
      m.defaultAttributeValues={...(m.defaultAttributeValues||{}),aoV:[1]};m.userData.look=aoExp;if(noAO)m.userData.noAO=true;m.customProgramCacheKey=()=>key;
      m.onBeforeCompile=sh=>{
        sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float aoV;\nvarying float vAoV;').replace('#include <begin_vertex>','#include <begin_vertex>\nvAoV=aoV;');
        sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vAoV;')
          .replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
{vec3 rW=inverseTransformDirection(reflect(-geometryViewDir,geometryNormal),viewMatrix);radiance*=mix(${f(LOOK.hoK)},1.,smoothstep(${f(LOOK.hoA)},${f(LOOK.hoB)},rW.y));
radiance=mix(vec3(dot(radiance,vec3(.2126,.7152,.0722))),radiance,${f(skySat)});}
#endif
#if defined( RE_IndirectDiffuse )
irradiance=mix(vec3(dot(irradiance,vec3(.2126,.7152,.0722))),irradiance,${f(skySat)});iblIrradiance=mix(vec3(dot(iblIrradiance,vec3(.2126,.7152,.0722))),iblIrradiance,${f(skySat)});
#endif`)
          .replace('#include <aomap_fragment>',`#include <aomap_fragment>
{float lbO=pow(clamp(vAoV,.001,1.),${f(aoExp)}),lbG=pow(1.-saturate(dot(normal,normalize(vViewPosition))),2.);
reflectedLight.indirectDiffuse*=lbO;reflectedLight.indirectSpecular*=lbO*mix(1.,${f(LOOK.graze)},lbG);
reflectedLight.directDiffuse*=${f(sunK)};reflectedLight.directSpecular*=${f(sunK)};reflectedLight.indirectSpecular*=${f(specK)};
reflectedLight.indirectDiffuse=mix(vec3(dot(reflectedLight.indirectDiffuse,vec3(.2126,.7152,.0722))),reflectedLight.indirectDiffuse,${f(indSat)});
reflectedLight.indirectSpecular=mix(vec3(dot(reflectedLight.indirectSpecular,vec3(.2126,.7152,.0722))),reflectedLight.indirectSpecular,${f(indSat)});${topGraze!==1?`
reflectedLight.indirectSpecular*=mix(1.,${f(topGraze)},smoothstep(${f(LOOK.topA)},${f(LOOK.topB)},inverseTransformDirection(normal,viewMatrix).y)*lbG);`:''}${sunPow?`
#if NUM_DIR_LIGHTS == 1
reflectedLight.directDiffuse*=${f(sunGain)}*pow(max(saturate(dot(normal,directionalLights[0].direction)),1e-4),${f(sunPow)});
#endif
`:''}}`);};
      return m;
    }
    // Ambient occlusion per vertex of the static meshes of a helicopter group (after mergeStatic), from its own geometry only (no
    // ground: on the pad the game's lower cabin and gear are lit by ground bounce, photometry track). Occluders: every static mesh
    // but the glass; receivers: meshes whose material carries lookPatch (other patched meshes, e.g. the rotor head, keep 1).
    // Voxel grid (LOOK.aoVox), LOOK.aoRays cosine-weighted rays per vertex (shared directions, Fibonacci spiral), marched from
    // LOOK.aoSkip to LOOK.aoDist; ao = open fraction. Deterministic per (weapons, pilots): cached, about 0.1-0.2 s per variant.
    const aoCache=new Map();
    function bakeAO(group,skip,key){
      group.updateMatrixWorld(true);const inv=new T.Matrix4().copy(group.matrixWorld).invert(),M=new T.Matrix4(),NM=new T.Matrix3();
      const inSkip=o=>{let p=o;while(p&&p!==group){if(skip.includes(p))return true;p=p.parent;}return false;};
      const statics=[],patched=[];group.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes?.position)return;if(o.material?.userData?.look!=null)patched.push(o);if(!inSkip(o))statics.push(o);});
      const receivers=statics.filter(o=>o.material.userData.look!=null&&!o.material.userData.noAO&&o.geometry.attributes.normal);
      let cached=aoCache.get(key);if(cached&&(cached.length!==receivers.length||cached.some((a,i)=>a.length!==receivers[i].geometry.attributes.position.count)))cached=null;
      if(!cached){
        const vx=LOOK.aoVox,dist=LOOK.aoDist,R=LOOK.aoRays,sk=LOOK.aoSkip,tris=[],box=new T.Box3(),A=new T.Vector3(),B=new T.Vector3(),C=new T.Vector3();
        for(const o of statics){if(o.material.userData.part==='glass')continue;M.multiplyMatrices(inv,o.matrixWorld);const p=o.geometry.attributes.position,ix=o.geometry.index,n=ix?ix.count:p.count;
          for(let i=0;i<n;i+=3){A.fromBufferAttribute(p,ix?ix.getX(i):i).applyMatrix4(M);B.fromBufferAttribute(p,ix?ix.getX(i+1):i+1).applyMatrix4(M);C.fromBufferAttribute(p,ix?ix.getX(i+2):i+2).applyMatrix4(M);
            box.expandByPoint(A);box.expandByPoint(B);box.expandByPoint(C);tris.push(A.x,A.y,A.z,B.x,B.y,B.z,C.x,C.y,C.z);}}
        box.expandByScalar(dist+2*vx);const x0=box.min.x,y0=box.min.y,z0=box.min.z,NX=Math.ceil((box.max.x-x0)/vx),NY=Math.ceil((box.max.y-y0)/vx),NZ=Math.ceil((box.max.z-z0)/vx),grid=new Uint8Array(NX*NY*NZ);
        const cell=(x,y,z)=>{const i=Math.floor((x-x0)/vx),j=Math.floor((y-y0)/vx),k=Math.floor((z-z0)/vx);return (i<0||j<0||k<0||i>=NX||j>=NY||k>=NZ)?-1:(k*NY+j)*NX+i;};
        for(let t=0;t<tris.length;t+=9){const e=Math.max(Math.hypot(tris[t+3]-tris[t],tris[t+4]-tris[t+1],tris[t+5]-tris[t+2]),Math.hypot(tris[t+6]-tris[t],tris[t+7]-tris[t+1],tris[t+8]-tris[t+2]),Math.hypot(tris[t+6]-tris[t+3],tris[t+7]-tris[t+4],tris[t+8]-tris[t+5])),s=Math.max(1,Math.ceil(e/(vx*.5)));
          for(let i=0;i<=s;i++)for(let j=0;j<=s-i;j++){const u=i/s,v=j/s,w=1-u-v,q=cell(tris[t]*w+tris[t+3]*u+tris[t+6]*v,tris[t+1]*w+tris[t+4]*u+tris[t+7]*v,tris[t+2]*w+tris[t+5]*u+tris[t+8]*v);if(q>=0)grid[q]=1;}}
        const dirs=[];for(let i=0;i<R;i++){const r=Math.sqrt((i+.5)/R),ph=i*2.399963;dirs.push([r*Math.cos(ph),r*Math.sin(ph),Math.sqrt(1-r*r)]);}
        const P=new T.Vector3(),N=new T.Vector3(),Tg=new T.Vector3(),Bt=new T.Vector3(),seen=new Map();cached=[];
        for(const o of receivers){M.multiplyMatrices(inv,o.matrixWorld);NM.getNormalMatrix(M);const pos=o.geometry.attributes.position,nor=o.geometry.attributes.normal,out=new Float32Array(pos.count);
          for(let v=0;v<pos.count;v++){P.fromBufferAttribute(pos,v).applyMatrix4(M);N.fromBufferAttribute(nor,v).applyMatrix3(NM).normalize();
            const id=Math.round(P.x*500)+','+Math.round(P.y*500)+','+Math.round(P.z*500)+','+Math.round(N.x*20)+','+Math.round(N.y*20)+','+Math.round(N.z*20);
            let a=seen.get(id);
            if(a===undefined){Tg.set(Math.abs(N.x)<.9?1:0,Math.abs(N.x)<.9?0:1,0).cross(N).normalize();Bt.crossVectors(N,Tg);
              const ox=P.x+N.x*1.5*vx,oy=P.y+N.y*1.5*vx,oz=P.z+N.z*1.5*vx;let open=0;
              for(const [dx,dy,dz] of dirs){const rx=Tg.x*dx+Bt.x*dy+N.x*dz,ry=Tg.y*dx+Bt.y*dy+N.y*dz,rz=Tg.z*dx+Bt.z*dy+N.z*dz;let hit=false;
                for(let s=sk;s<=dist;s+=.7*vx){const q=cell(ox+rx*s,oy+ry*s,oz+rz*s);if(q<0)break;if(grid[q]){hit=true;break;}}if(!hit)open++;}
              a=open/R;seen.set(id,a);}
            out[v]=a;}
          // Buried vertices (at most one ray open: inside another part, e.g. a strut end in the pod, a fin root in the boom) take
          // the mean of the other vertices of their triangles, so that their darkness does not spread along large triangles.
          const ix=o.geometry.index,nt=(ix?ix.count:pos.count)/3,src=out.slice(),sum=new Float32Array(pos.count),cnt=new Uint16Array(pos.count),lo=1.5/R;
          for(let t=0;t<nt;t++){const a0=ix?ix.getX(3*t):3*t,a1=ix?ix.getX(3*t+1):3*t+1,a2=ix?ix.getX(3*t+2):3*t+2;
            for(const [p,q] of [[a0,a1],[a0,a2],[a1,a0],[a1,a2],[a2,a0],[a2,a1]])if(src[q]>=lo){sum[p]+=src[q];cnt[p]++;}}
          for(let v=0;v<pos.count;v++)if(src[v]<lo&&cnt[v])out[v]=sum[v]/cnt[v];
          cached.push(out);}
        aoCache.set(key,cached);
      }
      receivers.forEach((o,i)=>o.geometry.setAttribute('aoV',new T.BufferAttribute(cached[i],1)));
      for(const o of patched)if(!o.geometry.attributes.aoV)o.geometry.setAttribute('aoV',new T.BufferAttribute(new Float32Array(o.geometry.attributes.position.count).fill(1),1));
    }
    function helicopter(color=OWN_PAINT,{canvas=null,pilots=true,weapons='miniguns',livery=false}={}){
      if(!paintTexture&&canvas)paintTexture=panelTexture(canvas);
      // Materials (tagged userData.part for the material-ID renders). The numbers of this paragraph and the next are the v13
      // exterior-stage values, kept as history; the current values are the LOOK line above (docs/analyse/apparence.md). v13:
      // tuned on matched renders against the game frames (clear afternoon light). Paint: diffuse albedo 0.22 linear (colour x
      // texture 0.79 x (1 - metalness)), 2.8x v12's 0.078; the colour is slightly warm only to cancel the trainer's blue sky
      // light, so that the rendered shade is neutral grey like the game's (shade Y 0.064-0.070 vs game 0.050-0.081; saturation
      // 2.7-5.4 % vs 2.5-5.9 %, v12 20-25 %) and the sunlit side warm like it (Y 0.28, hue 31 deg vs 0.31, 32 deg); roughness
      // 0.3 for the satin highlights (paint luma p99.5 238/181/241 in 3 views vs game cabin 214-241; v12 119-175). Guns, pylon,
      // exhaust: grey like the paint in shade (game minigun Y 0.056-0.063, v13 0.061-0.069; v12 'dark' 0.002-0.006); rotor hub
      // and cowl-top panel darker (game hub Y 0.032 in the same frame).
      // Appearance stage: paint factor, sky intensities, guns / pylon / grips and the light terms from LOOK (see above); the
      // mean-patch levels above were matched with the sun off or at the shots' headings, which put the sun 10-80 deg off.
      // Fix stage (same-pixel medians over the 12 matched views): paint #9f9081 x [0.73,0.76,0.78] (colour stage: OWN_PAINT
      // '#a58f76', same factor); guns metallic #8c8780, Y 0.034 sun / 0.030 shade (game 0.040 / 0.038); pylon: see LOOK comment.
      const tag=(m,part)=>{m.userData.part=part;return m;};
      const paint=tag(std(color,{roughness:LOOK.paintRough,metalness:.05,envMapIntensity:LOOK.paintEnv,map:paintTexture,bumpMap:paintTexture,bumpScale:.4}),'paint');
      paint.color.r*=LOOK.paintScale[0];paint.color.g*=LOOK.paintScale[1];paint.color.b*=LOOK.paintScale[2];
      const gun=tag(std(LOOK.gunColor,{roughness:LOOK.gunRough,metalness:LOOK.gunMetal,envMapIntensity:LOOK.gunEnv}),'gun'),hubMat=tag(std(LOOK.hubColor,{roughness:.55,metalness:LOOK.hubMetal,envMapIntensity:.6}),'hub');
      const gripMat=tag(std(LOOK.gripColor,{roughness:LOOK.gripRough,metalness:LOOK.gripMetal,envMapIntensity:LOOK.gripEnv}),'grip');
      // Weapon pylon and cowl top (v13 fix-stage values, history; the pylon's current values are in LOOK): darker than the guns
      // and the paint in the game (measured on matched renders): pylon top Y 0.033-0.036 from above (2 views; now 0.042-0.047,
      // v13 0.074-0.085) and rear face 0.042 (now 0.029, v13 0.113), gun bodies unchanged (0.056-0.067); cowl top Y 0.052-0.098
      // in 8 regions of 6 views (now x0.96-1.41 the game's, v13 x0.96-2.64): their own materials, the gun bodies and the rest of
      // the paint keeping their measured levels.
      const pylon=tag(std(LOOK.pylonColor,{roughness:.55,metalness:LOOK.pylonMetal,envMapIntensity:LOOK.pylonEnv}),'pylon'),cowlPanel=tag(std('#5a4a3c',{roughness:.55,metalness:.15,envMapIntensity:1.2}),'cowlPanel');
      const glass=tag(std('#9db2b8',{roughness:.04,metalness:.35,transparent:true,opacity:.26,depthWrite:false,envMapIntensity:.6}),'glass');
      const interior=tag(std('#3a3e3c',{roughness:.9,side:T.BackSide,envMapIntensity:.6}),'interior');
      const recess=tag(std(LOOK.recessColor,{roughness:.9,envMapIntensity:LOOK.recessEnv}),'interior');recess.userData.recess=true;
      const blade=tag(std('#2d302f',{roughness:.6,metalness:.1,envMapIntensity:.6}),'blade'),tailBlade=tag(std('#353634',{roughness:.65,metalness:.1,envMapIntensity:.6}),'tail');
      const group=new T.Group();
      // Pod: rear shell, lower front, roof strip; glass over the front bubble; open door apertures (dark arches at the pod's
      // edge in the game's rear three-quarter frames) from the A-post (z -1.45) to the rear post (0.35).
      // Appearance stage: the openings reach up to 36 deg from the top (roof strip +-36 deg, v13 +-54 deg). Measured: the game is
      // dark where the trainer showed its roof strip and the pod shoulders beside the cowl (y 0.75-1.3, z < 0.6: game p50 Y
      // 0.021-0.024 vs v13 0.104 in shade, 0.023-0.057 vs 0.30-0.32 in sun); game pixels mapped onto the v13 surface: below 0.35x
      // the median paint in 58-82 % of them at 36-65 deg, z -0.5-0 and 78-84 % at 50-65 deg, z 0-0.25, in the top and the rear
      // views alike, but in 0-19 % behind z 0.5 (the rear shell stays).
      const DOOR0=-1.45,DOOR1=.35,upper=Math.PI*.62,roof=Math.PI*.2;
      // Lathe angle after rotation: 0 = bottom, PI = top, PI/2 = right.
      mesh(lathe(DOOR1,1.84,0,Math.PI*2,28),paint,group);mesh(lathe(-2.2,DOOR1,Math.PI+upper,Math.PI*2-2*upper,28),paint,group);mesh(lathe(DOOR0,DOOR1,Math.PI-roof,2*roof,12),paint,group);
      // Glass from the nose tip (-2.2, as the lower shell): starting at -2.16 left a 0.27 x 0.19 m opening into the cabin.
      const canopy=mesh(lathe(-2.2,DOOR0,Math.PI-upper,2*upper,28,1.004),glass,group);canopy.castShadow=false;canopy.renderOrder=2;
      // Dark interior lining over the whole pod: seen through the doors, and it stops rounds that enter by an open door
      // (single-sided shells would let them through).
      mesh(lathe(-2.1,1.84,0,Math.PI*2,14,.96),interior,group).castShadow=false;
      // Painted frames: windshield centre post, A-posts, mid and rear door posts, sills, upper door edges.
      const tube=(pts,r)=>{const o=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),pts.length-1,r,5),paint);o.castShadow=true;group.add(o);return o;};
      const arc=(z,a0,a1)=>{const p=[];for(let k=0;k<=8;k++)p.push(surface(z,a0+(a1-a0)*k/8,.012));return p;},along=(a,z0,z1)=>{const p=[];for(let k=0;k<=10;k++)p.push(surface(z0+(z1-z0)*k/10,a,.012));return p;};
      tube(along(0,-2.12,DOOR0),.028);
      for(const s of [-1,1]){tube(arc(DOOR0,0,s*upper),.032);tube(arc(-.5,s*roof,s*upper),.03);tube(arc(DOOR1-.02,s*roof,s*upper),.035);tube(along(s*upper,-1.95,DOOR1),.03);tube(along(s*roof,DOOR0,DOOR1),.03);}
      // Crew: two pilots, heads at the pilot view's eye (app.js EYE: y 0.8, z -1.35), instrument panel.
      if(pilots){const suit=std('#3d4238',{roughness:.9,envMapIntensity:.6}),helmet=std('#2e3230',{roughness:.5,metalness:.2,envMapIntensity:.6}),visor=std('#111416',{roughness:.1,metalness:.6,envMapIntensity:.6});
        for(const x of [-.32,.32]){box(group,.36,.5,.3,x,.4,-1.2,suit);mesh(new T.SphereGeometry(.14,12,10),helmet,group,x,.83,-1.25);const v=mesh(new T.SphereGeometry(.141,12,8,Math.PI*.55,Math.PI*.9,Math.PI*.35,Math.PI*.3),visor,group,x,.83,-1.25);v.rotation.y=Math.PI;}
        box(group,.9,.24,.2,0,.42,-1.72,gun);}
      // Engine cowl and tail boom, lofted skins [z, centre y, width, height, squareness]: flat-topped cowl 0.8 m wide,
      // top 1.53 (65 px at 13 m, top 1.34 B); boom tapering to its end (tail-rotor gearbox) at y 0.576 (0.388 B, BA)
      // and z 4.85 (BA 4.82 +- 0.52; a public side view gives pod/boom/tail about 51/32/17 % of the length). (v13 exterior stage:
      // one skin, the boom rooted at the cowl's rear top 1.39; replaced below.)
      // Appearance stage (features triangulated with the fitted game cameras): the cowl ends in a vertical dark aft face
      // (0.43-0.46 m wide; bottom edge triangulated from 7 views at (-0.06, 1.00, 1.17), 5.0 px rms vs 9.1 px at z 1.65; depth
      // +-0.2-0.4 m, rear-sector views only) and the boom starts below it, its top 1.0 at z 1.25 and 0.93 at z 2.4 (antenna mast
      // foot, 7 views, 5.4 px rms vs 11.1 px on v13's boom, whose top was 1.18 there). Two lofts: the cowl, closed at z 1.2 by
      // its flat end cap (the aft face, y 0.97-1.43), and the boom to the unchanged end.
      const COWL=[[-.34,1.26,.6,.44,3],[-.18,1.19,.76,.68,4],[.6,1.15,.8,.76,4],[.95,1.13,.66,.74,3.4],[1.2,1.2,.46,.46,3]];
      const BOOM=[[1.0,.83,.42,.36,2.2],[1.25,.85,.38,.3,2.2],[2.4,.8,.28,.26,2],[4.85,.576,.2,.2,2]];
      mesh(loft(COWL,24,4),paint,group);mesh(loft(BOOM,24,4),paint,group);
      // Dark aft face of the cowl (measured Y 0.018 in shade and 0.034 in another view; v13 0.098 / 0.212): a plate of the dark
      // interior material 1.5 cm behind the cap (back-side material: the plane faces forward).
      // Fix stage: the dark part is only the lower middle of that face (measured: the game frames sampled on the plane z 1.215
      // through the 12 fitted cameras; game Y under 0.35x the view's median paint in >= 50 % of the views where the plane is
      // seen: y 1.00-1.24, x -0.14..+0.15; above y 1.25 the game shows grey paint in every view, Y 0.05-0.07 in shade, where the
      // 0.42 m plate of the appearance stage was black, -3.2 stops on the same pixels). A 0.30 x 0.24 plate of the recess
      // material (below), facing aft; the cowl's painted end cap shows above and beside it.
      {const f=mesh(new T.PlaneGeometry(.3,.24),recess,group,0,1.12,1.215);f.castShadow=false;}
      // v13's rear lobes either side of the boom root removed (they read as a round pale ball in the rear views and as two
      // bulges from above, where the game shows the cowl box side and a smooth pod; the rear silhouette is the pod's own).
      // Mast, engine intakes on the cowl sides, and two short rods angled up and outward on each upper-rear shoulder
      // (rear view at 12.8 m: about (+-0.45, 1.14) to (+-0.58, 1.44); another view alike).
      rod(group,V(0,1.45,.1),V(0,1.72,.1),.075,hubMat);
      // Dark cowl top (fix stage; game: Y 0.076-0.092 there vs cabin top 0.157 in 2 views; darkest at its aft end): a strip of
      // the cowl skin 1.2 cm proud, +-40 deg about its top, widening to +-75 deg towards the aft end (z 0.8-1.4).
      // Appearance stage: the dark region seen from above behind z 1.2 is the vertical aft face (its top edge at y 1.43 projects
      // within 3 px of the game's in a top view), so the panel stops at the cowl's end and the boom is painted.
      mesh(loftTop(COWL,-.05,1.2,z=>{const u=Math.min(1,Math.max(0,(z-.8)/.6));return (40+35*u*u*(3-2*u))*Math.PI/180;},.012),cowlPanel,group);
      for(const s of [-1,1]){box(group,.03,.2,.4,s*.405,1.3,.45,gun);for(const z of [.4,.7])rod(group,V(s*.4,1.14,z),V(s*.56,1.44,z-.04),.016,gun,.016,6);}
      // Exhaust nozzle out of the lower rear of the dome (measured (0, -0.07, 0.80 +- 0.32), about 0.26 m wide); v12's large
      // dark ring at mid-height removed.
      // Appearance stage: an open nozzle with a black interior (game interior Y 0.027 / 0.017 in two rear views vs 0.123 / 0.131
      // for v13's closed grey disc), about 0.31 m across (26 px at 12.3-12.6 m, measured); centre kept on the 'exhaust' key point
      // (moving it by the +0.05 m of a single pick put that key point 10 px off the bundle-adjusted observation instead of 6);
      // axis aft and about 10 deg down (assumed).
      {const n=mesh(new T.CylinderGeometry(.14,.14,.26,14,1,true),gun,group,0,-.06,1.09);n.rotation.x=Math.PI/2+.17;
       mesh(new T.TorusGeometry(.14,.025,6,14),gun,group,0,-.08,1.21).rotation.x=.17;
       const d=mesh(new T.CircleGeometry(.13,14),recess,group,0,-.07,1.15);d.rotation.x=.17;d.castShadow=false;}
      // Belly antenna; sensor ball under the nose (public description of the type).
      rod(group,V(0,-.6,.1),V(0,-.9,.45),.012,gun);mesh(new T.SphereGeometry(.15,14,10),gun,group,0,-.5,-1.75);
      // Tail (BA, model y = B + 0.188): stabiliser at y 1.721 (1.533 +- 0.11 B, about hub height), tips +-0.836 (span 1.67 m,
      // v12 2.25), z 5.695; swept leading edge, root chord 0.45 (top view), tip chord 0.30 (assumed from the top views);
      // vertical end plates 0.31 m tall centred on it (43 px at 7.6 m); fin 1.1 m from the boom end up to it.
      // Section 2 cm thick, leading edge up 6 deg about its centre (measured, 1 image: from behind at its height the game shows
      // the sunlit top, Y 0.617, the brightest bar of the frame; a flat 5 cm slab showed its dark trailing edge, Y 0.084); the
      // fin's top edge follows its underside.
      // Fix stage: same plate, built as a grid (16 x 4 cells a face) instead of a 5-point extrusion: the extrusion's top face had
      // vertices only at its tips, inside the end plates, and at the root against the fin, so the baked occlusion read there
      // (0.67-0.83) spread over the whole face; the grid samples it on the face itself.
      const stabGeo=(()=>{const NX=16,NZ=4,H=.01,pos=[],uv=[],idx=[],zl=x=>5.47+.15*Math.abs(x)/.836,P=(u,v)=>{const x=u*.836,z=zl(x)+v*(5.92-zl(x));return [x,z];};
        const face=(sy)=>{const b=pos.length/3;for(let j=0;j<=NZ;j++)for(let i=0;i<=NX;i++){const [x,z]=P(-1+2*i/NX,j/NZ);pos.push(x,sy*H,z);uv.push(x,z);}
          for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const a=b+j*(NX+1)+i,c=a+NX+1;if(sy>0)idx.push(a,c,a+1,a+1,c,c+1);else idx.push(a,a+1,c,a+1,c+1,c);}};
        face(1);face(-1);
        const edge=(pts)=>{for(let k=0;k<pts.length-1;k++){const [x0,z0]=pts[k],[x1,z1]=pts[k+1],b=pos.length/3;pos.push(x0,H,z0,x1,H,z1,x0,-H,z0,x1,-H,z1);uv.push(x0,z0,x1,z1,x0,z0,x1,z1);idx.push(b,b+1,b+2,b+1,b+3,b+2);}};
        const ring=[];for(let i=0;i<=NX;i++)ring.push(P(-1+2*i/NX,0));ring.push(P(1,1));for(let i=NX-1;i>=0;i--)ring.push(P(-1+2*i/NX,1));ring.push(P(-1,0));edge(ring);
        let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g=g.toNonIndexed();g.computeVertexNormals();
        g.translate(0,0,-5.695);g.rotateX(6*Math.PI/180);g.translate(0,1.721,5.695);return g;})();
      mesh(stabGeo,paint,group);
      for(const s of [-1,1])box(group,.03,.31,.3,s*.836,1.721,5.77,paint);
      const fin=new T.Shape([new T.Vector2(4.62,.6),new T.Vector2(5.02,.6),new T.Vector2(5.92,1.7),new T.Vector2(5.48,1.745)]);
      const finGeo=new T.ExtrudeGeometry(fin,{depth:.05,bevelEnabled:false});finGeo.rotateY(-Math.PI/2);finGeo.translate(.025,0,0);mesh(finGeo,paint,group);
      // Ventral fin and tail skid, tip at (0, -0.255, 5.1) (-0.443 +- 0.27 B, z 5.04 +- 0.45).
      const ventral=new T.Shape([new T.Vector2(4.7,.55),new T.Vector2(5,.55),new T.Vector2(5.17,-.03),new T.Vector2(5.03,-.03)]);
      const ventralGeo=new T.ExtrudeGeometry(ventral,{depth:.045,bevelEnabled:false});ventralGeo.rotateY(-Math.PI/2);ventralGeo.translate(.0225,0,0);mesh(ventralGeo,paint,group);
      rod(group,V(0,0,5.08),V(0,-.255,5.12),.018,gun);
      // Skid gear painted like the airframe (game skid legs (74,73,67) in shade: the paint's level; v12 bluish metal):
      // tubes end at the rear cross-tube foot, seen end-on as a round cap at z -0.15 (BA -0.25 +- 0.43; top views: plank-to-cap
      // gap 0.90 +- 0.07 m, 10 caps in 5 views; v12 ran 0.63 m past its rear tube to z 1.55), struts about 0.12 m thick;
      // bottom at -1.25; front struts at z -1.35 and the upturned tips assumed (not visible from behind); no steps (v12's white
      // steps are not in the game).
      // Appearance stage: tubes and struts cut in 0.15 m lengths so that the baked occlusion stays local (one segment carried the
      // darkness of the strut ends buried in the pod along the whole strut).
      const hs=(a,b)=>Math.max(1,Math.ceil(a.distanceTo(b)/.15));
      for(const s of [-1,1])for(const [a,b,r,seg] of [[V(s,-1.2,-1.85),V(s,-1.2,-.15),.05,12],[V(s,-1.2,-1.85),V(s,-1,-2.12),.05,12],[V(s,-1.2,-1.35),V(s*.36,-.36,-1.3),.06,10],[V(s,-1.2,-.1),V(s*.42,-.36,-.05),.06,10]])
        rod(group,a,b,r,paint,r,seg,hs(a,b));
      // Weapon pylon (plank): span 2.53 m (ends +-1.265 +- 0.03, v12 3.15), top -0.243 (-0.431 B), z -1.05 (BA -1.06 +- 0.49;
      // top views: plank 0.90 m ahead of the skid caps, and -0.98..-1.11 with the camera on hub and tail; guns, chute and pods
      // moved with it); each gun hangs in a frame of two posts, outer at about 1.19 m and inner at about 0.79 m (two rear
      // views at 14 m).
      mesh(new T.BoxGeometry(2.53,.1,.34,16,1,2),pylon,group,0,-.293,-1.05);for(const s of [-1,1])for(const x of [1.2,.77])box(group,.035,.34,.12,s*x,-.45,-1.05,gun);
      const podMat=weapons==='rockets'?std('#4d5246',{roughness:.6,metalness:.3,envMapIntensity:.6}):null;
      for(const s of [-1,1]){const x=s*.93;
        if(weapons==='rockets'){
          // AH-6R (v12): 7-tube pods, hung at the measured minigun station (assumed: the game's AH-6R was not filmed).
          const y=-.64,pod=mesh(new T.CylinderGeometry(.21,.21,1.55,14),podMat,group,x,y,-1);pod.rotation.x=Math.PI/2;
          mesh(new T.TorusGeometry(.2,.03,6,14),gun,group,x,y,-1.78);mesh(new T.CircleGeometry(.19,14),gun,group,x,y,-1.785).rotation.y=Math.PI;
          mesh(new T.ConeGeometry(.21,.3,14),podMat,group,x,y,-.08).rotation.x=Math.PI/2;box(group,.12,.12,.5,x,-.39,-1,gun);
        }else{
          // M134, 6 barrels, at x +-0.93 (rear views: centres 69 px apart at 14.1 m), axis 0.3 m under the plank top
          // (y -0.55); rear body and feed seen from behind, ammunition chute to the cabin side.
          // Appearance stage: the rear mechanism is 1.5-2x larger than v13's and reaches z about -0.40 (rear view: 0.32-0.38 x
          // ~0.5 m at 14.5 mm/px; two top views project it at z -0.40): body r 0.12 from z -0.42, feeder/delinker box and drive
          // motor (sizes measured, arrangement assumed).
          const y=-.55;box(group,.07,.14,.22,x,-.4,-1.05,gun);rod(group,V(x,y,-.42),V(x,y,-1.28),.12,gun,.12,12);box(group,.1,.13,.3,x+s*.1,y+.03,-.86,gun);
          box(group,.15,.22,.32,x-s*.1,y-.1,-.62,gun);box(group,.1,.12,.2,x+s*.1,y+.13,-.55,gun);
          rod(group,V(x,y,-1.28),V(x,y,-1.4),.075,gun,.09,12);
          for(let i=0;i<6;i++){const a=i*Math.PI/3,dx=Math.cos(a)*.055,dy=Math.sin(a)*.055;rod(group,V(x+dx,y+dy,-1.4),V(x+dx,y+dy,-2.15),.016,gun,.016,6);}
          mesh(new T.TorusGeometry(.075,.018,6,14),gun,group,x,y,-1.98);
          group.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([V(x-s*.08,y+.02,-.82),V(x-s*.3,-.42,-.75),V(s*.46,-.3,-.7)]),10,.045,6),gun));
        }
      }
      // No navigation lights or beacon: none is lit in the game frames (3 views). The beacon stays an empty object because
      // app.js blinks beacon.visible.
      const beacon=new T.Group();group.add(beacon);
      // Main rotor: dark grey hub (game sRGB 55-87), grips (the stubs the game shows while running; 0.80 m since the appearance
      // stage, below), six blades (4.16 m radius).
      const rotor=new T.Group();rotor.name='rotor';rotor.position.set(0,1.58+DY,.1);group.add(rotor);
      // Rotor head: a low, wide, rounded dome (0.6 m wide, top 0.165 m above the hub centre; about 48 px wide at 13.2 m in a
      // rear view; v13's 0.27 m post stood 11-22 px too high).
      const hub=new T.Group();rotor.add(hub);mesh(new T.CylinderGeometry(.22,.26,.16,12),hubMat,hub);{const dome=mesh(new T.SphereGeometry(.3,16,6,0,Math.PI*2,0,Math.PI/2),hubMat,hub,0,.03,0);dome.scale.y=.45;}
      // Appearance stage: the grips reach about 0.80 m (3 views: R 0.80 +- 0.05 m; chord 0.15-0.19 m from above) in pale metal
      // (sun Y 0.076-0.158, p90 0.20-0.25; v13's dark stubs 0.028-0.102), their own material; a solid dark swashplate /
      // pitch-link block fills the gap under them where v13 showed a thin mast with background either side (~0.6-0.75 m).
      for(let i=0;i<6;i++){const a=i*Math.PI/3;box(hub,.62,.09,.17,.49*Math.cos(a),0,-.49*Math.sin(a),gripMat).rotation.y=a;}
      mesh(new T.CylinderGeometry(.27,.3,.15,12),hubMat,hub,0,-.12,0);
      mergeStatic(hub);
      const bladeGeo=new T.BoxGeometry(3.85,.035,.19);bladeGeo.translate(2.2,0,0);
      for(let i=0;i<6;i++){const b=new T.Mesh(bladeGeo,blade);b.rotation.set(.04,i*Math.PI/3,0,'YXZ');b.castShadow=true;b.receiveShadow=true;rotor.add(b);}
      // Rotor blur (measured): hovering and on the pad the game shows only the stubs, no disc from above (4 views); edge-on, a
      // thin dark band 17-35 % darker reaching about 3 m (2 views). Dark disc whose opacity only rises at grazing view (sine
      // under 0.035-0.07, i.e. about 2-4 deg) and fades out between 2.6 and 3.6 m (v13 in the same pose: 19-23 % darker, 4-7 px
      // thick, out to 3.2 m; none in the pad and hover poses). The band also needs airspeed: none hovering at 22 km/h with the
      // camera 0.4 m above the hub (5 frames: no dip over 3 %) but present at 52 km/h; off below 25 km/h, full from 50 km/h
      // (ramp shape assumed). Full-length blurred blades seen in some flight frames but not others at 86-114 km/h: not
      // modelled.
      const discMat=new T.MeshBasicMaterial({color:'#2a2c2b',transparent:true,opacity:.35,depthWrite:false,side:T.DoubleSide});discMat.userData.part='disc';
      discMat.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying float vGraze,vR;').replace('#include <project_vertex>','#include <project_vertex>\nvGraze=abs(dot(normalize(normalMatrix*vec3(0.,0.,1.)),normalize(mvPosition.xyz)));vR=length(position.xy);');
        sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vGraze,vR;').replace('#include <alphamap_fragment>','#include <alphamap_fragment>\ndiffuseColor.a*=(1.-smoothstep(.035,.07,vGraze))*(1.-smoothstep(2.6,3.6,vR));');};
      const disc=new T.Mesh(new T.CircleGeometry(3.7,48),discMat);disc.rotation.x=-Math.PI/2;disc.raycast=()=>{};disc.visible=false;rotor.add(disc);
      // Tail rotor: four blades (0.71 m radius) left of the boom end, its own dark material (v12 shared the main blades').
      // The mount turns the spin axis to x, so that app.js's tail.rotation.y spins the disc (v12 swung it about the vertical).
      // Appearance stage: the boom ends in a collar and a round housing along the boom axis with a dark end cap (collar 0.20 m,
      // dark round end 0.13 m, Y 0.037; 3 views alike), not v13's pale sideways cylinder (the round dark thing low in the rear
      // chase views is this, not the exhaust); a short stub carries the tail rotor at x -0.2 as before.
      mesh(new T.TorusGeometry(.105,.022,6,14),gun,group,-.03,.59,4.7);
      mesh(new T.CylinderGeometry(.1,.09,.28,12),gun,group,-.03,.58,4.84).rotation.x=Math.PI/2;
      // Fix stage: the cap in the gun material (LOOK.endCap; game Y 0.020-0.070 on its pixels in 7 views, median 0.040; the
      // black lining gave 0.008-0.011 in 3 views: -2.3..-2.7 stops).
      {const cm=LOOK.endCap==='gun'?gun:LOOK.endCap==='recess'?recess:interior,c=mesh(new T.CircleGeometry(.07,12),cm,group,-.03,.575,4.985);if(cm===interior)c.rotation.y=Math.PI;c.castShadow=false;}
      rod(group,V(-.05,.576,4.85),V(-.17,.576,4.85),.05,gun,.05,10);
      // X-shaped rod antenna on a short mast on the boom top (a pale 6-armed asterisk in every top view, a bow-tie with a mast
      // from behind, at the same model position in rear, 3/4 and top views and in 6 consecutive frames, so a fixed object, not a
      // reflection; centre triangulated from 8 views at (-0.06, 1.15, 2.28), 3.7 px rms; mast foot (-0.06, 0.93, 2.41); arms
      // about 0.37-0.5 m, rods 1-2 cm; identity unknown). Pale arms in the paint, mast and foot in the gun material.
      rod(group,V(-.06,.92,2.33),V(-.06,1.15,2.3),.009,gun,.009,4);box(group,.1,.015,.03,-.06,.925,2.34,gun);
      for(const s of [-1,1])rod(group,V(-.24,1.15,2.3-s*.18),V(.12,1.15,2.3+s*.18),.007,paint,.007,4);
      const mount=new T.Group();mount.position.set(-.2,.576,4.85);mount.rotation.z=Math.PI/2;group.add(mount);const tail=new T.Group();mount.add(tail);
      mesh(new T.CylinderGeometry(.06,.06,.12,8),gun,tail);for(let i=0;i<4;i++){const a=i*Math.PI/2;box(tail,.7,.02,.09,.36*Math.cos(a),0,-.36*Math.sin(a),tailBlade).rotation.y=a;}
      mergeStatic(tail);
      group.traverse(o=>{if(o.isMesh&&(o.material===glass||o.material===interior||o.material===recess))o.castShadow=false;});
      mergeStatic(group,[rotor,mount,beacon]);
      // Appearance stage: helicopter-only light terms (LOOK), and the occlusion baked from the merged static geometry.
      const sat=livery?{indSat:1,skySat:LOOK.skySatLivery}:{};
      // Colour stage: the airframe paint also gets the measured sun response and the grazing top cut (LOOK), every livery alike.
      lookPatch(paint,LOOK.aoInd,{spec:LOOK.paintSpec,sunPow:LOOK.sunPow,sunGain:LOOK.sunGain,topGraze:LOOK.topGraze,...sat});
      lookPatch(cowlPanel,LOOK.aoInd,{spec:LOOK.paintSpec,...sat});for(const m of [hubMat,gripMat])lookPatch(m,LOOK.aoDark,sat);
      lookPatch(gun,LOOK.aoDark,{sun:LOOK.gunSun,...sat});lookPatch(pylon,LOOK.pylonAO,{sun:LOOK.pylonSun,...sat});lookPatch(recess,0,{sun:LOOK.recessSun,noAO:true,...sat});
      bakeAO(group,[rotor,mount,beacon],weapons+'|'+pilots);
      // Key points (model frame) for the reprojection checks against the game frames (tests/fidelity: exterior key points).
      group.userData.points={hub:[0,1.58+DY,.1],stabL:[-.836,1.721,5.695],stabR:[.836,1.721,5.695],stabC:[0,1.721,5.695],boomEnd:[-.1,.576,4.85],tailSkid:[0,-.255,5.12],
        exhaust:[0,-.07,1.1],plankL:[-1.265,-.243,-1.05],plankR:[1.265,-.243,-1.05],gunL:[-.93,-.55,-1],gunR:[.93,-.55,-1],skidRearL:[-1,-1.2,-.15],skidRearR:[1,-1.2,-.15],
        // Fix stage: the appearance stage's new features, checked against picks in the game frames with the fitted cameras: aft
        // face bottom edge 6.6 px rms (7 views, v13's boom root there 36 px), antenna centre 3.6 px (8 views), mast foot on the
        // boom top 4.5 px (2 views, v13's boom top 24.7 px).
        aftFaceBot:[0,1,1.215],antenna:[-.06,1.15,2.3],mastFoot:[-.06,.93,2.41]};
      return {group,rotor,tail,disc,beacon,materials:{paint,glass,dark:gun,metal:gun,gun,blade,tail:tailBlade,pylon,cowlPanel},
        // Running rotor (0-1) at airspeed speed (m/s): the blades beyond the grips are hidden (only the stubs show, as in the
        // game), the edge-on band fades in between 25 and 50 km/h, the tail rotor turns translucent.
        spin(s,speed=0){const on=s>.5;if(blade.userData.on!==on){blade.userData.on=on;blade.visible=!on;tailBlade.transparent=on;tailBlade.opacity=on?.3:1;tailBlade.depthWrite=!on;tailBlade.needsUpdate=true;}
          const u=Math.min(1,Math.max(0,(speed-25/3.6)/(25/3.6))),k=on?u*u*(3-2*u):0;discMat.opacity=.35*k;disc.visible=k>0;}};
    }

    // ---- Ground vehicles ----
    function vehicle(kind='truck',color){
      const g=new T.Group(),body=std(color||(kind==='pickup'?'#6d6a5c':kind==='humvee'?'#6a6a52':'#5f6650')),dark=std('#202424'),glass=std('#44606a',{roughness:.2,metalness:.4});
      // v12: Humvee with a ring-mounted minigun and its gunner behind a shield.
      if(kind==='humvee'){
        // Built from the ground up (the convoy places vehicles 0.9 m above the road).
        const h=new T.Group();h.position.y=-.9;g.add(h);
        box(h,2.2,.85,4.6,0,.9,0,body);box(h,2.08,.72,2.3,0,1.68,.25,body);box(h,1.94,.42,.05,0,1.74,-.92,glass);box(h,2.18,.22,1.25,0,1.42,-1.72,body);
        for(const s of [-1,1])box(h,.06,.4,1.9,s*1.05,1.73,.3,glass);
        mesh(new T.CylinderGeometry(.55,.55,.16,16),dark,h,0,2.12,.45);box(h,.95,.55,.06,0,2.48,0,dark);for(const s of [-1,1]){const w=box(h,.35,.45,.06,s*.58,2.46,.12,dark);w.rotation.y=-s*.6;}
        rod(h,V(0,2.38,.25),V(0,2.38,-.6),.07,dark);for(let i=0;i<6;i++){const a=i*Math.PI/3;rod(h,V(Math.cos(a)*.035,2.38+Math.sin(a)*.035,-.6),V(Math.cos(a)*.035,2.38+Math.sin(a)*.035,-1.05),.012,dark,.012,5);}
        box(h,.42,.5,.26,0,2.23,.7,std('#4c5437'));mesh(new T.SphereGeometry(.13,8,6),std('#3c4232'),h,0,2.63,.72);
        for(const x of [-1.05,1.05])for(const z of [-1.45,1.45]){const o=mesh(new T.CylinderGeometry(.47,.47,.34,12),dark,h,x,.47,z);o.rotation.z=Math.PI/2;}
        return {group:g};
      }
      if(kind==='pickup'){box(g,2.1,.9,4.8,0,.55,0,body);box(g,1.95,.75,1.7,0,1.35,-.7,body);box(g,1.8,.5,.05,0,1.42,-1.56,glass);box(g,.25,.6,.25,0,1.3,1.2,dark);rod(g,V(0,1.6,1.2),V(0,1.75,.2),.05,dark);}
      else {box(g,2.6,1.3,5,0,.3,0,std(color||'#bc714c'));box(g,2.3,.9,2,0,1.25,-.8,std('#b7ae83'));box(g,2.05,.55,.05,0,1.35,-1.82,glass);}
      for(const x of kind==='pickup'?[-1.05,1.05]:[-1.35,1.35])for(const z of [-1.5,1.5]){const o=mesh(new T.CylinderGeometry(.5,.5,.3,12),dark,g,x,kind==='pickup'?.1:-.1,z);o.rotation.z=Math.PI/2;}
      return {group:g};
    }
    // Tower roof defender (v12): a soldier of one of the factions, rifle at the ready.
    function defender(faction='black'){
      const F=FACTIONS[faction]||FACTIONS.black,group=new T.Group(),c=k=>std(F[k],{roughness:.9});
      box(group,.44,.6,.26,0,1.17,0,c('torso'));box(group,.5,.4,.34,0,1.26,0,c('vest'));box(group,.34,.4,.18,0,1.22,.24,c('pack'));
      mesh(new T.SphereGeometry(.115,10,8),c('head'),group,0,1.63,0);mesh(new T.SphereGeometry(.142,10,6,0,Math.PI*2,0,Math.PI*.55),c('helmet'),group,0,1.67,0);
      for(const x of [-.11,.11]){box(group,.16,.8,.19,x,.44,0,c('legs'));box(group,.15,.13,.3,x,.06,-.05,c('boots'));}
      for(const s of [-1,1]){const a=box(group,.11,.6,.12,s*.24,1.3,-.25,c('arms'));a.rotation.x=1.3;}
      box(group,.06,.1,.85,.05,1.34,-.55,std('#1e2220'));return {group};
    }
    // SAM emplacement: surface-to-air missile emplacement with one seated operator. v12, after
    // community databases (docs/SOURCES.md): one missile loaded, footprint about 3 x 3 x 2 m.
    // Original design of a generic MANPADS firing post: tripod, seat behind the launcher,
    // one tube on an elevating cradle with a thermal sight box and an IFF antenna, spare
    // missile containers on the ground, a short arc of sandbags. The operator faces -z.
    function samSite(){
      const g=new T.Group(),olive=std('#4f5a42'),dark=std('#23282a'),steel=std('#6c7166',{roughness:.5,metalness:.45}),sandMat=std('#8d7d5c',{roughness:1}),tubeMat=std('#5f6b52',{roughness:.7}),crateMat=std('#56603f',{roughness:.85});
      for(let i=0;i<9;i++){const a=-1.2+i*.3;const b=box(g,.9,.42,.5,Math.sin(a)*1.9,.21,-Math.cos(a)*1.9,sandMat);b.rotation.y=-a;if(i%2)box(g,.85,.38,.46,Math.sin(a+.15)*1.9,.6,-Math.cos(a+.15)*1.9,sandMat).rotation.y=-a;}
      for(let i=0;i<3;i++){const a=i/3*Math.PI*2+.5;rod(g,V(Math.sin(a)*.95,0,Math.cos(a)*.95),V(0,.7,0),.04,steel);}
      rod(g,V(0,.45,0),V(0,.95,0),.08,steel);box(g,.36,.08,.36,0,.04,0,dark);
      // Spare missiles in their containers (the post restocks from them).
      for(const [x,z,a] of [[1.25,.7,.3],[1.35,1.05,.35]]){const c=box(g,.28,.24,1.9,x,.12+(z>1?.24:0),z,crateMat);c.rotation.y=a;}
      const turret=new T.Group();turret.position.y=.95;g.add(turret);
      mesh(new T.CylinderGeometry(.3,.3,.08,14),olive,turret);
      // Seat and backrest behind the launcher, foot bar in front.
      rod(turret,V(0,.02,.1),V(0,-.28,.55),.035,steel);box(turret,.42,.06,.38,0,-.3,.62,dark);box(turret,.4,.42,.05,0,-.08,.84,dark);rod(turret,V(-.2,-.75,-.25),V(.2,-.75,-.25),.02,steel);
      for(const s of [-1,1])box(turret,.06,.5,.1,s*.22,.25,0,olive);
      const cradle=new T.Group();cradle.position.set(0,.45,0);turret.add(cradle);
      rod(cradle,V(-.26,0,0),V(.26,0,0),.035,steel);
      // One 72 mm tube (rear 0.6 m behind the pivot), seeker dome in front, thermal sight and IFF grid.
      const tube=mesh(new T.CylinderGeometry(.065,.065,1.85,12),tubeMat,cradle,0,.02,-.32);tube.rotation.x=Math.PI/2;
      mesh(new T.TorusGeometry(.067,.014,6,12),dark,cradle,0,.02,-1.24);mesh(new T.TorusGeometry(.067,.018,6,12),dark,cradle,0,.02,.6);
      const nose=mesh(new T.SphereGeometry(.06,10,8,0,Math.PI*2,0,Math.PI/2),std('#b9c2c4',{roughness:.2,metalness:.3}),cradle,0,.02,-1.25);nose.rotation.x=-Math.PI/2;
      box(cradle,.16,.15,.42,-.15,.06,.02,dark);mesh(new T.CylinderGeometry(.035,.035,.08,10),dark,cradle,-.15,.06,.26).rotation.x=Math.PI/2;
      box(cradle,.18,.14,.02,.13,.16,-.3,std('#3a403a'));rod(cradle,V(.13,.02,-.3),V(.13,.09,-.3),.012,steel);
      g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      mergeStatic(cradle,[nose]);mergeStatic(turret,[cradle]);mergeStatic(g,[turret]);
      // Seat surface in the turret frame (the crew's hips), sight in the cradle frame.
      return {group:g,turret,cradle,noses:[nose],muzzles:[V(0,.02,-1.3)],seat:V(0,-.27,.62),sight:V(-.15,.1,.2)};
    }

    // CIWS: 20 mm gatling emplacement, manually operated (guides; community
    // databases give a footprint of 6 x 6 x 5 m, docs/SOURCES.md). Original
    // design on that basis: sandbag ring, pedestal, turret with a white sensor dome
    // above a six-barrel gun, ammunition drum behind; the operator sits at a console
    // beside the mount (exposed). The gun points to -z.
    function ciws(){
      const g=new T.Group(),grey=std('#8a8f88',{roughness:.6,metalness:.3}),white=std('#d9dcd6',{roughness:.45,metalness:.15}),dark=std('#26292a',{roughness:.55,metalness:.4}),steel=std('#6b706a',{roughness:.45,metalness:.55}),sandMat=std('#8d7d5c',{roughness:1}),olive=std('#4f5a42');
      for(let i=0;i<20;i++){const a=i/20*Math.PI*2;if(Math.abs(Math.sin((a-2.4)/2))<.16)continue;const b=box(g,1.05,.5,.6,Math.sin(a)*3.2,.25,Math.cos(a)*3.2,sandMat);b.rotation.y=a;if(i%2)box(g,1,.45,.55,Math.sin(a+.16)*3.2,.72,Math.cos(a+.16)*3.2,sandMat).rotation.y=a;}
      box(g,2.6,.35,2.6,0,.17,0,grey);mesh(new T.CylinderGeometry(.62,.8,1.1,18),grey,g,0,.9,0);
      const turret=new T.Group();turret.position.y=1.45;g.add(turret);
      mesh(new T.CylinderGeometry(.95,.95,.22,20),grey,turret);for(const s of [-1,1])box(turret,.18,1.25,.9,s*.72,.72,0,grey);
      const cradle=new T.Group();cradle.position.set(0,1.1,0);turret.add(cradle);
      rod(cradle,V(-.72,0,0),V(.72,0,0),.09,steel);
      // Sensor dome (the tall white radome of such mounts) above the gun, ammunition drum behind.
      const dome=mesh(new T.CylinderGeometry(.62,.66,1.25,22),white,cradle,0,.95,.1);mesh(new T.SphereGeometry(.62,22,12,0,Math.PI*2,0,Math.PI/2),white,cradle,0,1.575,.1);void dome;
      box(cradle,.9,.5,.95,0,.28,.25,white);const drum=mesh(new T.CylinderGeometry(.42,.42,1.05,18),grey,cradle,0,-.12,.95);drum.rotation.z=Math.PI/2;
      box(cradle,.46,.42,.9,0,-.05,-.3,dark);rod(cradle,V(0,-.05,-.72),V(0,-.05,-1.05),.14,steel,.12,14);
      for(let i=0;i<6;i++){const a=i*Math.PI/3,dx=Math.cos(a)*.085,dy=Math.sin(a)*.085;rod(cradle,V(dx,-.05+dy,-1.02),V(dx,-.05+dy,-2.55),.024,dark,.022,6);}
      mesh(new T.TorusGeometry(.12,.025,6,16),steel,cradle,0,-.05,-2.35);mesh(new T.TorusGeometry(.12,.025,6,16),steel,cradle,0,-.05,-1.6);
      // Operator console with a seat, 2.3 m to the right of the mount, facing -z.
      const desk=new T.Group();desk.position.set(2.3,0,.6);g.add(desk);
      box(desk,.9,.8,.5,0,.4,-.55,olive);box(desk,.8,.35,.08,0,.95,-.72,dark);box(desk,.5,.08,.5,0,.5,.1,dark);box(desk,.5,.55,.08,0,.78,.37,dark);rod(desk,V(0,0,.1),V(0,.46,.1),.05,steel);
      g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      mergeStatic(cradle,[]);mergeStatic(turret,[cradle]);mergeStatic(g,[turret]);
      // Seat (hips) in the emplacement frame, sight on the console, muzzle in the cradle frame.
      return {group:g,turret,cradle,seat:V(2.3,.54,.7),sight:V(2.3,1.3,.4),muzzle:V(0,-.05,-2.6)};
    }

    // ---- Soldiers: one instanced mesh per body part, animated per frame ----
    // The 9K333 Verba tube (72 mm, about 1.6 m) is carried on the back or on the right shoulder.
    // v12: three factions in distinct outfits (chosen: tan gear with a blue shirt, jeans and bare arms;
    // black with red touches; green camouflage with a balaclava and long sleeves), plate carrier, boots,
    // hands; RPG-7 / MAAWS launcher.
    const TUBE_LENGTH=1.6,SHOULDER=[.17,1.52,-.08];
    const FACTIONS={
      tan:{label:'TENUE SABLE',torso:'#3f5d8a',arms:'#b08466',hands:'#a87d5e',legs:'#3b4f6c',vest:'#a38c60',pack:'#8f7a52',helmet:'#9a8558',head:'#b08466',boots:'#4a3a2a',accent:'#a38c60'},
      black:{label:'TENUE NOIRE',torso:'#1f2023',arms:'#1f2023',hands:'#151619',legs:'#25272b',vest:'#2c2d31',pack:'#27282c',helmet:'#1c1d20',head:'#b08466',boots:'#141414',accent:'#8e2b24'},
      olive:{label:'TENUE OLIVE',torso:'#5a6341',arms:'#5a6341',hands:'#3d432f',legs:'#535b3c',vest:'#4c5437',pack:'#50583a',helmet:'#4b5335',head:'#3f4731',boots:'#3a3326',accent:'#5a6341'}};
    class Crowd{
      constructor(scene,max=80){
        const legGeo=new T.BoxGeometry(.16,.8,.19);legGeo.translate(0,-.4,0);const bootGeo=new T.BoxGeometry(.15,.13,.3);bootGeo.translate(0,-.8,-.05);
        const armGeo=new T.BoxGeometry(.11,.6,.12);armGeo.translate(0,-.28,0);const handGeo=new T.BoxGeometry(.08,.11,.1);handGeo.translate(0,-.63,0);
        // Tapered torso (chest wider than the waist).
        const torsoGeo=new T.BoxGeometry(.44,.6,.26);{const p=torsoGeo.attributes.position;for(let i=0;i<p.count;i++){const k=p.getY(i)<0?.84:1.04;p.setX(i,p.getX(i)*k);}torsoGeo.computeVertexNormals();}
        const rifleGeo=new T.BoxGeometry(.06,.1,.85);rifleGeo.translate(0,0,-.2);
        // Tube along -z, rear end 0.45 m behind the shoulder; grip and sight under and beside it.
        const tubeGeo=new T.CylinderGeometry(.05,.05,TUBE_LENGTH,10);tubeGeo.rotateX(Math.PI/2);tubeGeo.translate(0,0,.45-TUBE_LENGTH/2);
        const sightGeo=new T.BoxGeometry(.07,.12,.22);sightGeo.translate(-.09,.03,-.2);
        // RPG-7 / MAAWS: 1 m tube, rear 0.35 m behind the shoulder; warhead in front when loaded.
        const rpgGeo=new T.CylinderGeometry(.045,.05,1,10);rpgGeo.rotateX(Math.PI/2);rpgGeo.translate(0,0,-.15);
        const headGeo=new T.CylinderGeometry(.085,.03,.42,10);headGeo.rotateX(-Math.PI/2);headGeo.translate(0,0,-.82);
        const parts=[['torso',torsoGeo,'#ffffff',true],['vest',new T.BoxGeometry(.5,.4,.34),'#ffffff',true],['pack',new T.BoxGeometry(.34,.4,.18),'#ffffff',true],['head',new T.SphereGeometry(.115,10,8),'#ffffff',true],
          ['helmet',new T.SphereGeometry(.142,10,6,0,Math.PI*2,0,Math.PI*.55),'#ffffff',true],['accent',new T.BoxGeometry(.13,.09,.13),'#ffffff',true],
          ['legL',legGeo,'#ffffff',true],['legR',legGeo,'#ffffff',true],['bootL',bootGeo,'#ffffff',true],['bootR',bootGeo,'#ffffff',true],['armL',armGeo,'#ffffff',true],['armR',armGeo,'#ffffff',true],['handL',handGeo,'#ffffff',true],['handR',handGeo,'#ffffff',true],
          ['rifle',rifleGeo,'#1e2220'],['tube',tubeGeo,'#4a5540'],['tubeSight',sightGeo,'#23282a'],['rpg',rpgGeo,'#3d4a33'],['rpgHead',headGeo,'#56603f']];
        this.max=max;this.parts=parts.map(([name,geo,color,tinted])=>{const m=new T.InstancedMesh(geo,std(color,{roughness:.9}),max);m.castShadow=true;m.count=0;m.frustumCulled=false;scene.add(m);return {name,mesh:m,tinted:!!tinted};});
        this.byName=Object.fromEntries(this.parts.map(p=>[p.name,p]));
        this.m=new T.Matrix4();this.b=new T.Matrix4();this.l=new T.Matrix4();this.q=new T.Quaternion();this.e=new T.Euler();this.c=new T.Color();this.zero=new T.Matrix4().makeScale(0,0,0);
      }
      // list: [{position, yaw, pose:'walk'|'run'|'stand'|'aim'|'kneel'|'sit'|'prone'|'dead', phase, faction, aimPitch, weapon:'rifle'|'tube'|'rpg'|'none', raise, loaded, id}]
      update(list){
        let n=0;const {m,b,l,q,e}=this;
        for(const s of list){
          if(n>=this.max)break;const pose=s.pose,weapon=s.weapon||'rifle',F=FACTIONS[s.faction]||FACTIONS.black,shade=.94+.12*((s.id||0)*.618%1);
          // Body frame: position, yaw, and lying poses (prone forward, dead on the side); kneeling is 0.45 m lower.
          e.set(pose==='prone'?-Math.PI/2:0,s.yaw,pose==='dead'?Math.PI/2:0,'YXZ');q.setFromEuler(e);b.compose(s.position,q,new T.Vector3(1,1,1));
          if(pose==='prone')b.multiply(l.makeTranslation(0,-.1,.8));if(pose==='dead')b.multiply(l.makeTranslation(-.8,-.12,0));if(pose==='kneel')b.multiply(l.makeTranslation(0,-.45,0));
          const run=pose==='run',walk=pose==='walk',swing=run?.95:walk?.5:0,w=Math.sin(s.phase)*swing,lean=run?.25:0,aim=pose==='aim',pitch=s.aimPitch||0;
          const tint={torso:F.torso,vest:F.vest,pack:F.pack,head:F.head,helmet:F.helmet,accent:F.accent,legL:F.legs,legR:F.legs,bootL:F.boots,bootR:F.boots,armL:F.arms,armR:F.arms,handL:F.hands,handR:F.hands};
          const put=(name,mat)=>{const part=this.byName[name];m.multiplyMatrices(b,mat);part.mesh.setMatrixAt(n,m);if(part.tinted)part.mesh.setColorAt(n,this.c.set(tint[name]).multiplyScalar(shade));};
          const hide=name=>this.byName[name].mesh.setMatrixAt(n,this.zero);
          const R=(x,y,z,rx=0,ry=0,rz=0)=>{e.set(rx,ry,rz,'XYZ');q.setFromEuler(e);return l.clone().compose(new T.Vector3(x,y,z),q,new T.Vector3(1,1,1));};
          put('torso',R(0,1.17,0,-lean));put('vest',R(0,1.26,-.01,-lean));put('pack',R(0,1.22,.24,-lean));put('head',R(0,1.63,-lean*.3));put('helmet',R(0,1.67,-lean*.3));put('accent',R(-.27,1.36,0,-lean));
          // A positive rotation about x swings a hanging limb forward (-z). Seated: legs forward;
          // kneeling: left leg forward, right knee down.
          const legs=pose==='sit'?[1.45,1.45]:pose==='kneel'?[1.2,-1]:[w,-w];
          for(const [k,side] of [[0,'L'],[1,'R']]){const M=R(k?.11:-.11,.84,0,legs[k]);put('leg'+side,M);put('boot'+side,M);}
          const shouldered=aim&&(weapon==='tube'||weapon==='rpg'),rise=shouldered?Math.min(1,s.raise??1):0;let arms;
          if(shouldered)arms=[[-.24,1.42,-.05,1.5+pitch*rise],[.26,1.42,-.02,.95+pitch*rise*.7]];
          else if(aim)arms=[[-.26,1.4,-.05,1.35+pitch],[.26,1.4,-.05,1.25+pitch]];
          else if(pose==='sit')arms=[[-.26,1.42,-.05,1.1],[.26,1.42,-.05,1.1]];
          else arms=[[-.29,1.42,0,-w*.8-lean],[.29,1.42,0,w*.8-lean]];
          for(const [k,side] of [[0,'L'],[1,'R']]){const [x,y,z,rx]=arms[k],M=R(x,y,z,rx);put('arm'+side,M);put('hand'+side,M);}
          if(weapon==='rifle'){if(aim)put('rifle',R(.05,1.34,-.45,pitch));else put('rifle',R(.18,1.12,-.2,-.5-lean,.25));}else hide('rifle');
          if(weapon==='tube'||weapon==='rpg'){
            // Raised from the back (tilted, behind the pack) to the shoulder, aimed with the pitch.
            const back=[0,1.25,.3],x=back[0]+(SHOULDER[0]-back[0])*rise,y=back[1]+(SHOULDER[1]-back[1])*rise,z=back[2]+(SHOULDER[2]-back[2])*rise;
            const rx=shouldered?pitch*rise+(1-rise)*1.25:1.25,rz=(1-rise)*.45,M=R(x,y,z,rx,0,rz);
            if(weapon==='tube'){put('tube',M);put('tubeSight',M);hide('rpg');hide('rpgHead');}
            else{put('rpg',M);if(s.loaded!==false)put('rpgHead',M);else hide('rpgHead');hide('tube');hide('tubeSight');}
          }else{hide('tube');hide('tubeSight');hide('rpg');hide('rpgHead');}
          n++;
        }
        for(const p of this.parts){p.mesh.count=n;p.mesh.instanceMatrix.needsUpdate=true;if(p.mesh.instanceColor)p.mesh.instanceColor.needsUpdate=true;}
      }
    }
    // Shouldered tube of a soldier, in the Crowd's frame: shoulder point (eye),
    // muzzle and axis in world coordinates.
    function tubeMuzzle(s,eye,muzzle,axis){
      const cy=Math.cos(s.yaw),sy=Math.sin(s.yaw),p=s.aimPitch||0;
      axis.set(-sy*Math.cos(p),Math.sin(p),-cy*Math.cos(p));
      // Shoulder point rotated by the yaw (local x right, z back).
      eye.set(s.position.x+SHOULDER[0]*cy+SHOULDER[2]*sy,s.position.y+SHOULDER[1],s.position.z-SHOULDER[0]*sy+SHOULDER[2]*cy);
      muzzle.copy(eye).addScaledVector(axis,TUBE_LENGTH-.45);
      return muzzle;
    }

    // ---- Cockpit for the first-person view (v10) ----
    // After the game's pilot view (recording 1 at 240 s, recording 2 at 115 s): reflex sight on
    // its drum and hoop, cross bar with a cast bracket, left canopy bow with the standby
    // compass, right door frame with a strap, glare shield with 14 lamps, multifunction
    // display. Built around the pilot's eye (origin, helicopter axes: x right, y up,
    // z back). Positions follow the 1080p frames with the measured 58 deg field of view
    // (focal 972 px) and the sightline raised 0.06 rad, shifted so that the sight sits on
    // the gun line; turning the head (free look) keeps everything in place.
    function cockpit(canvas=null){
      const F=972,PITCH=.06,cP=Math.cos(PITCH),sP=Math.sin(PITCH),DU=22,DV=15;
      const sp=(u,v,d)=>{const x=(u+DU-960)/F*d,y=-(v+DV-540)/F*d,z=-d;return V(x,y*cP-z*sP,y*sP+z*cP);};
      const tilt=new T.Matrix4().makeRotationX(PITCH),group=new T.Group();
      // Worn paint (v11): grain, grime, chipped edges showing bare metal, fine scratches; also
      // used as a bump map. The game's frames are olive-grey painted metal, scratched and chipped.
      const wear=canvas?(()=>{const S=512,c=canvas(S,S),g=c.getContext('2d');g.fillStyle='#d8d8d8';g.fillRect(0,0,S,S);let sd=911;const r=()=>{sd=(Math.imul(sd,1664525)+1013904223)>>>0;return sd/4294967296;};
        for(let i=0;i<5000;i++){const v=170+r()*85;g.fillStyle=`rgba(${v},${v},${v},.3)`;g.fillRect(r()*S,r()*S,1+r()*3,1+r()*3);}
        for(let i=0;i<30;i++){g.fillStyle=`rgba(70,68,60,${.03+r()*.05})`;g.beginPath();g.ellipse(r()*S,r()*S,20+r()*80,10+r()*40,r()*3,0,7);g.fill();}
        for(let i=0;i<70;i++){const x=r()*S,y=r()*S;g.fillStyle=`rgba(235,233,225,${.12+r()*.2})`;g.beginPath();for(let k=0;k<7;k++){const a=k/7*6.283,rr=(1+r()*4)*(k%2?.6:1);g.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr*.7);}g.closePath();g.fill();}
        for(let i=0;i<160;i++){g.strokeStyle=`rgba(${r()<.5?'245,242,235':'45,45,42'},${.06+r()*.14})`;g.lineWidth=.6+r()*.8;g.beginPath();const x=r()*S,y=r()*S,a=r()*6.28,l=10+r()*70;g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}
        const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(5,5);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;})():null;
      const mat=(color,o={})=>new T.MeshStandardMaterial({color,roughness:.72,metalness:.3,map:wear,bumpMap:wear,bumpScale:.6,...o});
      const frameMat=mat('#4a4d45'),boltMat=mat('#8c8d88',{metalness:.65,roughness:.42}),metal=mat('#666862',{metalness:.55,roughness:.5}),sightMat=mat('#5b5d58',{metalness:.5,roughness:.55}),dark=mat('#272826',{roughness:.65});
      // Plate cut from a screen outline (1080p px) at depth d, t thick away from the eye.
      function plate(pts,d,t,m,bevel=.0015){
        const shape=new T.Shape(pts.map(([u,v])=>new T.Vector2((u+DU-960)/F*d,-(v+DV-540)/F*d)));
        const g=new T.ExtrudeGeometry(shape,{depth:t,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:10});
        g.translate(0,0,-d-t);g.applyMatrix4(tilt);const o=new T.Mesh(g,m);group.add(o);return o;
      }
      // Tube through screen points (depth d unless given per point), radius in pixels at that depth.
      function tube(pts,d,rPx,m,seg=32){const c=new T.CatmullRomCurve3(pts.map(([u,v,dd])=>sp(u,v,dd??d)));const o=new T.Mesh(new T.TubeGeometry(c,seg,rPx/F*d,8),m);group.add(o);return o;}
      // Cylinder standing on the helicopter's vertical axis, or facing the eye (bolts, knobs).
      function upright(u,v,d,rPx,hPx,m,seg=24){const o=new T.Mesh(new T.CylinderGeometry(rPx/F*d,rPx/F*d,hPx/F*d,seg),m);o.position.copy(sp(u,v,d));group.add(o);return o;}
      function facing(u,v,d,rPx,thick,m,seg=16){const g=new T.CylinderGeometry(rPx/F*d,rPx/F*d,thick,seg);g.rotateX(Math.PI/2);g.applyMatrix4(tilt);const o=new T.Mesh(g,m);o.position.copy(sp(u,v,d));group.add(o);return o;}
      // Reflex sight: drum with a mesh top, band and front clasp, hoop, tinted glass.
      {const d=.62,c=sp(938,738,d),r=100/F*d;
       const drum=new T.Mesh(new T.CylinderGeometry(r,r*.94,r*.8,28),sightMat);drum.position.copy(c);group.add(drum);
       const grille=new T.Mesh(new T.CylinderGeometry(r*.86,r*.86,r*.05,28),mat('#8d8f8c',{roughness:.9,metalness:.3}));grille.position.copy(c).add(V(0,r*.41,0));group.add(grille);
       const band=new T.Mesh(new T.TorusGeometry(r*1.01,r*.07,6,28),metal);band.rotation.x=Math.PI/2;band.position.copy(c).add(V(0,-r*.1,0));group.add(band);
       const bowl=new T.Mesh(new T.SphereGeometry(r*.94,24,10,0,Math.PI*2,Math.PI/2,Math.PI/2),sightMat);bowl.scale.set(1,.4,1);bowl.position.copy(c).add(V(0,-r*.4,0));group.add(bowl);
       const clasp=new T.Mesh(new T.BoxGeometry(r*.34,r*.3,r*.16),metal);clasp.position.copy(c).add(V(0,-r*.1,-r));group.add(clasp);
       tube([[846,672],[846,600],[852,540],[878,506],[912,490],[938,487],[964,490],[998,506],[1024,540],[1030,600],[1030,672]],.6,6.5,dark,40);
       for(const u of [846,1030])plate([[u-9,690],[u+9,690],[u+9,640],[u-9,640]],.6,.012,dark);
       const glass=plate([[852,670],[852,560],[870,515],[905,497],[938,494],[971,497],[1006,515],[1024,560],[1024,670]],.605,.001,new T.MeshStandardMaterial({color:'#9fcfc4',transparent:true,opacity:.08,roughness:.05,metalness:.2,depthWrite:false}),0);glass.renderOrder=2;}
      // Cross bar, thin cable, post on the left and cast bracket on the right with two bolts.
      tube([[598,748],[800,747],[1000,745],[1262,743]],.66,9,metal,8);
      tube([[845,736],[760,742],[690,741],[650,734]],.64,2.2,mat('#8f8a3c',{roughness:.6}),12);
      upright(646,812,.7,40,100,metal);upright(646,762,.7,44,6,boltMat);
      plate([[1245,690],[1320,683],[1450,676],[1500,690],[1525,720],[1522,748],[1496,760],[1470,870],[1455,888],[1428,890],[1415,870],[1405,835],[1300,770],[1250,762]],.72,.012,metal);
      facing(1478,727,.705,15,.006,boltMat);facing(1463,868,.705,15,.006,boltMat);
      // Right door frame (two curved bands), strap with its nut.
      plate([[1342,1110],[1368,900],[1395,700],[1420,500],[1450,300],[1492,100],[1522,-30],[1845,-30],[1760,100],[1690,250],[1640,400],[1600,560],[1560,760],[1525,960],[1505,1110]],.85,.03,frameMat);
      plate([[1500,1110],[1522,960],[1556,760],[1596,560],[1636,400],[1686,250],[1756,100],[1840,-30],[1990,-30],[1990,560],[1900,800],[1760,1110]],.9,.03,mat('#41433c'));
      plate([[1680,72],[1722,60],[1765,88],[1850,168],[1940,236],[1940,300],[1882,262],[1792,190],[1722,142],[1686,122]],.8,.006,mat('#8b735e',{roughness:.95,metalness:0}));
      facing(1698,96,.795,17,.012,boltMat,6);
      // Left canopy bow with the standby compass (key-hole box, ring, window on the ball, lamp tube).
      tube([[95,-40],[170,90],[250,220],[330,340],[410,460],[480,572],[548,668]],.9,26,frameMat,40);
      {const d=.42;plate([[118,165],[300,160],[302,375],[262,378],[262,420],[158,422],[155,378],[120,376]],d,.03,mat('#6a6b68'));
       const ring=new T.Mesh(new T.TorusGeometry(58/F*d,2.4/F*d,6,32),metal);ring.applyMatrix4(tilt);ring.position.copy(sp(205,262,d-.002));group.add(ring);
       plate([[150,230],[262,230],[262,296],[150,296]],d-.003,.002,mat('#1d1f1e',{roughness:.3}),0);
       // Compass ball seen through the window (flattened, just in front of the dark glass).
       const ball=new T.Mesh(new T.SphereGeometry(30/F*d,16,12),mat('#b9ad96',{roughness:.6,metalness:0}));ball.scale.set(1,.95,.35);ball.position.copy(sp(228,263,d-.006));group.add(ball);
       tube([[300,282,d+.01],[335,290,d+.03],[372,300,d+.05]],d,44,mat('#c9c6bc',{metalness:.3,roughness:.5}),6);
       tube([[352,330,d+.03],[372,352,d+.03],[392,356,d+.05]],d,5,metal,8);
       plate([[296,166],[342,150],[372,176],[332,198]],d+.01,.01,frameMat);}
      // Glare shield: light top, front with 14 lamps and two recessed panels (canvas), right end.
      plate([[-40,650],[556,650],[576,668],[588,692],[-40,692]],.78,.02,mat('#8f918b',{metalness:.35}));
      {const face=plate([[-40,692],[588,692],[594,1110],[-40,1110]],.78,.04,mat('#4c4e47'));
       if(canvas){const c=canvas(1024,512),g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,1024,512);
         // Shape coordinates (metres) of the face: map its bounding box to the canvas.
         const x0=(-40+DU-960)/F*.78,x1=(594+DU-960)/F*.78,y1=-(692+DV-540)/F*.78,y0=-(1110+DV-540)/F*.78,px=u=>(u- -40)/(594+40)*1024,py=v=>(v-692)/(1110-692)*512;
         g.fillStyle='rgba(0,0,0,.22)';for(let i=0;i<15;i++){const u=7+i*34.5;g.fillRect(px(u-13),py(690),px(u+13)-px(u-13),py(716)-py(690));}
         for(let i=0;i<15;i++){const u=7+i*34.5;g.strokeStyle='rgba(255,255,255,1)';g.lineWidth=5;g.strokeRect(px(u-9),py(694),px(u+9)-px(u-9),py(712)-py(694));g.fillStyle='rgba(0,0,0,.55)';g.fillRect(px(u-8),py(695),px(u+8)-px(u-8),py(711)-py(695));}
         g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=6;g.strokeRect(px(-30),py(732),px(190)-px(-30),py(792)-py(732));g.strokeRect(px(262),py(732),px(512)-px(262),py(792)-py(732));
         g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=2;g.strokeRect(px(-26),py(736),px(186)-px(-26),py(788)-py(736));g.strokeRect(px(266),py(736),px(508)-px(266),py(788)-py(736));
         const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.repeat.set(1/(x1-x0),1/(y1-y0));t.offset.set(-x0/(x1-x0),-y0/(y1-y0));
         face.material=new T.MeshStandardMaterial({color:'#4c4e47',map:t,roughness:.75,metalness:.3});}}
      plate([[576,668],[616,660],[628,700],[622,860],[590,860],[588,692]],.76,.03,mat('#8f918b'));
      // Multifunction display: bezel, knobs, SPC. key, side buttons, screen (canvas redrawn by update()).
      plate([[576,862],[1042,862],[1046,1110],[572,1110]],.66,.03,mat('#3c3c39'));
      for(const [u,v] of [[650,882],[942,882]])facing(u,v,.655,15,.01,dark);
      plate([[846,870],[884,870],[884,896],[846,896]],.656,.006,dark);
      for(const v of [945,1020,1085])for(const u of [590,1026])facing(u,v,.655,13,.006,dark);
      let mfd=null;
      {const w=1000-620,hgt=1110-905;const g=new T.PlaneGeometry(w/F*.655,hgt/F*.655);g.applyMatrix4(tilt);
       const screen=new T.Mesh(g,new T.MeshBasicMaterial({color:'#101410'}));screen.position.copy(sp(810,1007,.655));group.add(screen);
       if(canvas){const c=canvas(512,280),ctx=c.getContext('2d'),tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;screen.material=new T.MeshBasicMaterial({map:tex,toneMapped:false});
         mfd={canvas:c,texture:tex,update({heading=0,bank=0,pitch=0}={}){
           const W=512,H=280;ctx.fillStyle='#121512';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#dfe5dc';ctx.fillStyle='#dfe5dc';ctx.lineWidth=3;
           // Heading tape and pointer, MSL counter, target brackets, attitude symbol, right tape (layout of the game's display).
           for(let i=-40;i<=40;i++){const x=300+i*6-((heading*2)%6);if(x<20||x>560)continue;ctx.fillRect(x,40,2,i%5===0?20:14);}
           ctx.beginPath();ctx.moveTo(300,70);ctx.lineTo(290,86);ctx.lineTo(310,86);ctx.closePath();ctx.fill();
           ctx.font='bold 34px "Bahnschrift","Segoe UI",sans-serif';ctx.fillText('MSL',40,150);ctx.fillText('006',40,200);
           ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(170,165);ctx.lineTo(170,128);ctx.lineTo(210,128);ctx.moveTo(360,128);ctx.lineTo(400,128);ctx.lineTo(400,165);ctx.stroke();
           ctx.save();ctx.translate(286,210);ctx.rotate(-bank*Math.PI/180);ctx.strokeStyle='#27c46a';ctx.fillStyle='#27c46a';ctx.lineWidth=4;
           ctx.beginPath();ctx.moveTo(0,-90);ctx.lineTo(0,70);ctx.stroke();ctx.fillRect(-6,-96,12,14);ctx.beginPath();ctx.moveTo(-150,60+pitch*2);ctx.lineTo(150,60+pitch*2);ctx.stroke();ctx.fillRect(-156,54+pitch*2,12,12);ctx.fillRect(144,54+pitch*2,12,12);ctx.restore();
           ctx.fillStyle='#dfe5dc';for(let y=20;y<H;y+=12)ctx.fillRect(470,y,y%36===20?22:14,2);ctx.beginPath();ctx.moveTo(440,190);ctx.lineTo(460,200);ctx.lineTo(440,210);ctx.closePath();ctx.fill();
           tex.needsUpdate=true;}};
         mfd.update();}}
      // Cabin shell for looking around: roof, floor, rear bulkhead with seat backs, door posts (helicopter axes).
      {const shell=mat('#393b36',{side:T.DoubleSide,roughness:.9});
       const add=(geo,x,y,z,rx=0,ry=0)=>{const o=new T.Mesh(geo,shell);o.position.set(x,y,z);o.rotation.set(rx,ry,0);group.add(o);return o;};
       // The roof covers the rear cabin only: overhead and in front, the canopy is glass.
       add(new T.PlaneGeometry(1.7,1.2),0,.42,.7,Math.PI/2);add(new T.PlaneGeometry(1.7,1.9),0,-1.05,.35,-Math.PI/2);add(new T.PlaneGeometry(1.7,1.5),0,-.33,1.3,0,Math.PI);
       for(const x of [-.42,.42]){const seat=new T.Mesh(new T.BoxGeometry(.5,.7,.1),mat('#2b2d29',{roughness:.95,metalness:0}));seat.position.set(x,-.25,1.2);group.add(seat);}
       for(const x of [-.78,.78])for(const z of [-.35,1.05]){const post=new T.Mesh(new T.BoxGeometry(.05,1.45,.07),frameMat);post.position.set(x,-.32,z);group.add(post);}}
      group.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});
      return {group,mfd,sightCenter:sp(938,583,.6)};
    }

    // ---- Destructible structures (visual parts; logic in ground.js) ----
    const wood=std('#7a5c3c'),plank=std('#8a6a45'),sand=std('#8d7d5c',{roughness:1}),canvasMat=std('#5f6248',{roughness:1}),tankMat=std('#5b6452',{roughness:.6,metalness:.3}),crate=std('#6b5a3a'),steel=std('#7d8385',{roughness:.5,metalness:.5}),roofMat=std('#4f4a44');
    function structure(type){
      const g=new T.Group(),top=new T.Group(),parts={group:g,top};g.add(top);
      if(type==='mirador'){
        for(const x of [-1.3,1.3])for(const z of [-1.3,1.3])rod(g,V(x,0,z),V(x*.8,7.4,z*.8),.12,wood);
        for(const y of [2.5,5])for(const s of [-1,1]){rod(g,V(-1.2,y,s*1.2),V(1.2,y+1.2,s*1.2),.05,wood);rod(g,V(s*1.2,y,-1.2),V(s*1.2,y+1.2,1.2),.05,wood);}
        top.position.y=7.4;box(top,3.2,.2,3.2,0,0,0,plank);for(const s of [-1,1]){box(top,3.2,1.1,.08,0,.6,s*1.55,plank);box(top,.08,1.1,3.2,s*1.55,.6,0,plank);}
        for(const x of [-1.5,1.5])for(const z of [-1.5,1.5])rod(top,V(x,0,z),V(x,2.3,z),.05,wood);const roof=box(top,3.6,.12,3.6,0,2.4,0,roofMat);roof.rotation.x=.05;
      }else if(type==='cabane'){
        box(top,5,2.6,4,0,1.3,0,plank);const r1=box(top,5.4,.1,2.4,0,3.05,-1,roofMat);r1.rotation.x=.45;const r2=box(top,5.4,.1,2.4,0,3.05,1,roofMat);r2.rotation.x=-.45;
        box(top,.9,1.8,.06,1.2,.9,-2.02,std('#2a2420'));box(top,.8,.6,.06,-1.3,1.6,-2.02,std('#1c2326'));
      }else if(type==='bunker'){
        for(let i=0;i<14;i++){const a=i/14*Math.PI*2;if(Math.abs(Math.sin(a)+1)<.25)continue;box(top,1,.5,.6,Math.cos(a)*2.4,.25,Math.sin(a)*2.4,sand).rotation.y=-a;box(top,1,.5,.6,Math.cos(a+.2)*2.4,.75,Math.sin(a+.2)*2.4,sand).rotation.y=-a;}
        box(top,5.4,.35,5.4,0,1.75,0,std('#6e6a5e'));box(top,4.6,1.6,4.6,0,.8,0,std('#5d5a50'));box(top,2.2,.4,.1,0,1.2,-2.32,std('#101212'));
      }else if(type==='tente'){
        const geo=new T.CylinderGeometry(.01,2.3,2.4,4,1);geo.rotateY(Math.PI/4);const t=mesh(geo,canvasMat,top,0,1.2,0);t.scale.set(1,1,1.3);
      }else if(type==='carburant'){
        for(const x of [-1.6,1.6]){const tk=mesh(new T.CylinderGeometry(1.1,1.1,4.2,16),tankMat,top,x,1.15,0);tk.rotation.x=Math.PI/2;}
        for(let i=0;i<6;i++)mesh(new T.CylinderGeometry(.3,.3,.9,10),std(i%2?'#7a3a2a':'#3d5a3a'),top,-2+i*.8,.45,2.6);
      }else if(type==='munitions'){
        for(let i=0;i<8;i++)box(top,1.2,.6,.8,(i%4-1.5)*1.3,.3+Math.floor(i/4)*.6,(i%2)*.1,crate);box(top,4.8,.05,2,0,1.3,0,canvasMat).rotation.z=.05;
      }else if(type==='antenne'){
        top.position.set(0,0,0);for(const [x,z] of [[-.4,-.4],[.4,-.4],[0,.45]])rod(top,V(x,0,z),V(0,16,0),.06,steel);for(let y=2;y<16;y+=2)rod(top,V(-.35,y,-.3),V(.35,y,-.3),.03,steel);
        box(top,.6,.5,.6,0,16.2,0,steel);box(g,1.5,1.4,1.2,2,.7,1.5,std('#4d5a46'));
      }
      g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      // The collapsing part (top) and the base are merged separately.
      mergeStatic(top);mergeStatic(g,[top]);
      return parts;
    }
    return {helicopter,OWN_PAINT,LOOK,vehicle,defender,samSite,ciws,cockpit,Crowd,FACTIONS,tubeMuzzle,structure,mergeStatic,mesh,box,rod,std};
  }
  if(typeof module!=='undefined')module.exports={create};else root.HeliModels={create};
})(typeof window!=='undefined'?window:globalThis);




