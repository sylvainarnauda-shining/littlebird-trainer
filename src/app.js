'use strict';
(() => {
  // Browser automation (Playwright and other WebDriver clients set navigator.webdriver) must never capture the real
  // cursor of the machine: a hidden headless window would confine and recentre the user's mouse while tests or renders
  // run in the background (it happened once). Under automation the pointer lock is emulated inside the page
  // (same pointerLockElement / pointerlockchange contract; mousemove keeps its movementX/Y). Define
  // window.__LB_REAL_POINTER_LOCK__ = true before the page loads to exercise the real lock on purpose.
  if(typeof navigator!=='undefined'&&navigator.webdriver===true&&!window.__LB_REAL_POINTER_LOCK__&&typeof Element==='function'&&typeof Document==='function'){
    let locked=null;const changed=()=>setTimeout(()=>document.dispatchEvent(new Event('pointerlockchange')),0);
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Element.prototype.requestPointerLock=function(){locked=this;changed();return Promise.resolve();};
    Document.prototype.exitPointerLock=function(){if(locked){locked=null;changed();}};
    window.__LB_EMULATED_POINTER_LOCK__=true;
  }
  // The same rule for the joysticks: under automation navigator.getGamepads is the page's own emulation, which returns
  // only the pads a test puts into window.__LB_EMULATED_GAMEPADS__ (none otherwise), so that no automated run (a
  // headless browser, the desktop app's self-test) can read the machine's real joysticks. There is no opt-out; if the
  // emulation cannot be installed, the page reads no joystick at all under automation (joyRead).
  let emulatedGamepads=null;
  if(typeof navigator!=='undefined'&&navigator.webdriver===true){
    const pads=[];emulatedGamepads=()=>pads.slice(0,8);
    try{Object.defineProperty(navigator,'getGamepads',{configurable:true,writable:false,value:emulatedGamepads});Object.defineProperty(window,'__LB_EMULATED_GAMEPADS__',{value:pads});}catch(e){}
  }
  const $=id=>document.getElementById(id), T=window.THREE, P=window.HeliPhysics, M=window.HeliMissiles, W=window.HeliWorld, A=window.HeliAudio, G=window.HeliGround, H=window.HeliBot, SET=window.HeliSettings, MENUS=window.HeliMenus;
  if(!T||!P||!M||!W||!A||!G||!H||!SET||!MENUS||!window.HeliModels||!window.HeliForest||!window.buildScenery) { $('saveState').textContent='Fichiers manquants : conserve le dossier complet.'; $('start').disabled=true; return; }
  // The map is chosen before the scene is built (world.js): its name on the loading screen.
  try{const t=document.querySelector('#loading .loading-title');if(t)t.textContent='CHARGEMENT · '+String(W.name||'').toUpperCase();}catch(e){}
  function boot(){
    const STORE='littlebird-range-v1';
    const {defaults:DEFAULTS,baseBindings,labels,KEY_NAMES,KEY_PATTERN,REVISION,FLIGHT_KEYS,V13_KEYS,sanitize,validBindings}=SET;
    const {MODES}=MENUS;
    const MODE_OF=s=>['air','ground','mixed'].includes(s)?'range':s;
    let cfg={...DEFAULTS},bindings={...baseBindings},storageOK=true;
    const notices=[];
    // Joysticks (J1): the profile block profile.joystick (physics.js joystick: schema 1, validation, defaults), kept
    // apart from cfg and bindings and stored only when it differs from the defaults, and the reading state. Nothing reads
    // the joysticks until a session flies with the HOTAS on or the joystick panel is asked to read (joyWanted).
    const J=P.joystick;
    const JOY_NOTICES={invalid:'Configuration joystick illisible : réglages joystick par défaut.',schema:'Configuration joystick d’une version inconnue : réglages joystick par défaut.','duplicate-button':'Bouton de joystick utilisé pour deux actions : la seconde est ignorée.'};
    let joyProfile=J.defaultProfile();
    const joy={roles:J.createRoles(),fresh:J.createFreshness(),state:J.createJoyState(),pads:[],res:{main:[],left:[],right:[]},live:new Set(),frame:null,rolesInfo:null,
      active:false,reading:false,error:'',present:new Set(),unconfirmed:false,learn:null,learnBase:new Map(),stickLook:false,tick:0,prompted:'',rows:new Map(),ready:false};
    function joyLoad(block,into){const codes=[],p=J.validateProfile(block,codes);for(const c of new Set(codes))into.push(JOY_NOTICES[c]);return p;}
    try { const saved=JSON.parse(localStorage.getItem(STORE)); if(saved){const up=SET.upgrade(saved);notices.push(...up.notices);cfg=sanitize(up.doc.settings);bindings=validBindings(saved.bindings);joyProfile=joyLoad(saved.joystick,notices);} }catch(e){storageOK=false;}
    // The stored and exported profile: the joystick block only when it differs from the defaults (same bytes otherwise).
    function profileDoc(head){const doc={...head,tuningRevision:REVISION,settings:cfg,bindings};if(!J.isDefaultProfile(joyProfile))doc.joystick=joyProfile;return doc;}
    function save(){try{localStorage.setItem(STORE,JSON.stringify(profileDoc({version:1})));$('saveState').textContent='Profil sauvegardé sur ce navigateur';}catch(e){$('saveState').textContent='Sauvegarde indisponible — exporte le profil';}}
    let toastTimeout;
    function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
    // ---- Renderer, light and atmosphere ----
    const renderer=new T.WebGLRenderer({canvas:$('world'),antialias:true,powerPreference:'high-performance'});
    const pixelRatio=()=>Math.min(devicePixelRatio,{low:1,medium:1.35,high:1.75}[cfg.graphics]||1.5);
    renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth,innerHeight);
    renderer.outputColorSpace=T.SRGBColorSpace;if(renderer.info)renderer.info.autoReset=false;   // two passes per frame (valley, cockpit)
     renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    const shadowsOn=cfg.graphics!=='low';
    if(renderer.shadowMap){renderer.shadowMap.enabled=shadowsOn;renderer.shadowMap.type=T.PCFSoftShadowMap;}
    const scene=new T.Scene();
    // The game's fields of view are horizontal: the vertical one follows the window's shape.
    const vfov=h=>2*Math.atan(Math.tan(h*Math.PI/360)*innerHeight/innerWidth)*180/Math.PI;
    const camera=new T.PerspectiveCamera(vfov(cfg.fovCockpit),innerWidth/innerHeight,.5,16000);
    const sunDirection=new T.Vector3(-.55,.42,.72).normalize();
    // Late-afternoon light of the recordings: warm sun, sky light from the environment map
    // (set below) plus a weaker hemisphere, long shadows.
    const hemi=new T.HemisphereLight('#d5e2f1','#5c6446',1.8);scene.add(hemi);
    const sun=new T.DirectionalLight('#ffe4c0',3.5);sun.position.copy(sunDirection).multiplyScalar(1000);scene.add(sun,sun.target);
    if(shadowsOn){const size=cfg.graphics==='high'?4096:2048,R=cfg.graphics==='high'?320:240;sun.castShadow=true;sun.shadow.mapSize.set(size,size);Object.assign(sun.shadow.camera,{left:-R,right:R,top:R,bottom:-R,near:20,far:2400});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.0004;sun.shadow.normalBias=.8;}
    // ---- Post-processing (v11): the frame is drawn in HDR with 4x MSAA, then a light bloom,
    // the ACES curve, a slight grade (warm highlights, cooler shadows) and sharpening, as the
    // game's image looks on the recordings (bloom and sharpening on). Low quality skips it.
    const post=(()=>{
      if(cfg.graphics==='low'||!renderer.capabilities||!renderer.capabilities.isWebGL2||!renderer.getPixelRatio)return null;
      const target=(samples=0)=>new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples,depthBuffer:samples>0});
      let w0=1,h0=1;const hdr=target(4),mips=[target(),target(),target()];
      const vert='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
      const quad=new T.Mesh(new T.PlaneGeometry(2,2)),s2=new T.Scene(),c2=new T.OrthographicCamera(-1,1,1,-1,0,1);quad.frustumCulled=false;s2.add(quad);
      const down=new T.ShaderMaterial({uniforms:{src:{value:null},texel:{value:new T.Vector2()},threshold:{value:0}},vertexShader:vert,depthTest:false,depthWrite:false,
        fragmentShader:`uniform sampler2D src;uniform vec2 texel;uniform float threshold;varying vec2 vUv;
          void main(){vec3 c=texture2D(src,vUv).rgb*.25;
            c+=(texture2D(src,vUv+vec2(texel.x,0.)).rgb+texture2D(src,vUv-vec2(texel.x,0.)).rgb+texture2D(src,vUv+vec2(0.,texel.y)).rgb+texture2D(src,vUv-vec2(0.,texel.y)).rgb)*.125;
            c+=(texture2D(src,vUv+texel).rgb+texture2D(src,vUv-texel).rgb+texture2D(src,vUv+vec2(texel.x,-texel.y)).rgb+texture2D(src,vUv+vec2(-texel.x,texel.y)).rgb)*.0625;
            if(threshold>0.){float l=max(c.r,max(c.g,c.b));c*=smoothstep(threshold,threshold*2.,l);}
            gl_FragColor=vec4(c,1.);}`});
      const final=new T.ShaderMaterial({uniforms:{src:{value:hdr.texture},b1:{value:mips[0].texture},b2:{value:mips[1].texture},b3:{value:mips[2].texture},texel:{value:new T.Vector2()},exposure:{value:1.05},bloom:{value:.08},sharpen:{value:.6}},
        vertexShader:vert,depthTest:false,depthWrite:false,fragmentShader:`uniform sampler2D src,b1,b2,b3;uniform vec2 texel;uniform float exposure,bloom,sharpen;varying vec2 vUv;
          vec3 aces(vec3 c){c*=exposure/.6;c=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777)*c;vec3 a=c*(c+.0245786)-.000090537,b=c*(.983729*c+.4329510)+.238081;c=a/b;
            return clamp(mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602)*c,0.,1.);}
          vec3 grade(vec3 c){float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,1.02);return c*mix(vec3(.98,.99,1.02),vec3(1.025,1.,.96),smoothstep(.15,.75,l));}
          vec3 look(vec2 uv){return grade(aces(texture2D(src,uv).rgb));}
          vec3 srgb(vec3 c){return mix(pow(c,vec3(.41666))*1.055-.055,c*12.92,vec3(lessThanEqual(c,vec3(.0031308))));}
          void main(){
            vec3 glow=texture2D(b1,vUv).rgb*.5+texture2D(b2,vUv).rgb*.3+texture2D(b3,vUv).rgb*.2;
            vec3 c=grade(aces(texture2D(src,vUv).rgb+glow*bloom));
            vec3 n=look(vUv+vec2(texel.x,0.))+look(vUv-vec2(texel.x,0.))+look(vUv+vec2(0.,texel.y))+look(vUv-vec2(0.,texel.y));
            c=clamp(c+(c*4.-n)*sharpen*.25,0.,1.);
            gl_FragColor=vec4(srgb(c),1.);}`});
      function resize(){const pr=renderer.getPixelRatio();w0=Math.max(1,Math.floor(innerWidth*pr));h0=Math.max(1,Math.floor(innerHeight*pr));hdr.setSize(w0,h0);
        mips.forEach((m,i)=>m.setSize(Math.max(1,w0>>(i+2)),Math.max(1,h0>>(i+2))));final.uniforms.texel.value.set(1/w0,1/h0);}
      function pass(src,sw,sh,dst,threshold=0){down.uniforms.src.value=src;down.uniforms.texel.value.set(1/sw,1/sh);down.uniforms.threshold.value=threshold;quad.material=down;renderer.setRenderTarget(dst);renderer.render(s2,c2);}
      resize();
      return {target:hdr,resize,final,
        begin(){renderer.setRenderTarget(hdr);},
        end(){pass(hdr.texture,w0,h0,mips[0],1.1);pass(mips[0].texture,mips[0].width,mips[0].height,mips[1]);pass(mips[1].texture,mips[1].width,mips[1].height,mips[2]);
          quad.material=final;renderer.setRenderTarget(null);renderer.render(s2,c2);}};
    })();
    const mat=(color,more={})=>new T.MeshStandardMaterial({color,roughness:.85,metalness:.1,...more});
    function mesh(g,m,parent,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;}
    function box(parent,w,h,d,x,y,z,m){return mesh(new T.BoxGeometry(w,h,d),m,parent,x,y,z);}
    const canvasFactory=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
    const models=window.HeliModels.create(T);
    const anisotropy=renderer.capabilities?.getMaxAnisotropy?Math.min(8,renderer.capabilities.getMaxAnisotropy()):4;
    const scenery=window.buildScenery(T,P,scene,{world:W,quality:cfg.graphics,canvas:canvasFactory,anisotropy,sunDirection,seed:8317}),obstacles=scenery.field,towers=scenery.towers,wires=scenery.wires;
    scene.fog=new T.FogExp2(scenery.skyColors.horizon.clone().lerp(new T.Color('#aebfcf'),.35),.0002);
    // Sky reflections on the river and the helicopter (browser only), rebuilt when the light changes.
    let environment=null,pmrem=null,cockpitRef=null;const envUsers=[];
    function refreshEnvironment(){
      try{if(!renderer.isWebGLRenderer||!T.PMREMGenerator)return;if(!pmrem)pmrem=new T.PMREMGenerator(renderer);
        const env=new T.Scene();env.add(scenery.sky.clone());const next=pmrem.fromScene(env,0,1,20000).texture,old=environment;environment=next;
        scenery.water.material.envMap=environment;scenery.water.material.envMapIntensity=.75;
        // Every standard material takes its ambient light and reflections from the sky.
        scene.environment=environment;hemi.intensity=.75;for(const m of envUsers)m.envMap=environment;if(cockpitRef)cockpitRef.environment=environment;if(old)old.dispose();
      }catch(e){}
    }
    refreshEnvironment();
    // v13 paint: 2.8x v12's albedo, warm just enough to cancel the blue sky light so that the rendered shade is neutral grey
    // as in the game (measured on the chase frames, docs/analyse/apparence.md); each material keeps its own
    // sky-reflection strength from models.js (bots get the same through scene.environment). Appearance stage: models.js
    // (LOOK.paintScale) scales every livery's colour by the measured factor (about #8a7f73 for this one) and adds the baked
    // occlusion and helicopter-only sky-light terms, for the own helicopter, the bots and the air targets alike. Fix stage: the
    // bots and air targets pass livery:true (their colours are assumed, no footage): their sky light is greyed before the albedo
    // so that a livery keeps its hue in shade; the own measured paint keeps the measured neutral shade (models.js LOOK.indSat).
    // Colour stage: the own paint is models.OWN_PAINT ('#a58f76', was '#9f9081': CIELAB chroma of the albedo 8.3 -> 14.2 at
    // the same lightness, measured on the reference footage; models.js LOOK comment, docs/analyse/apparence.md).
    const own=models.helicopter(models.OWN_PAINT,{canvas:canvasFactory});scene.add(own.group);const flight=new P.Flight(cfg),gun=new P.Minigun(cfg);
    if(environment)own.group.traverse(o=>{if(o.isMesh&&o.material.isMeshStandardMaterial){o.material.envMap=environment;envUsers.push(o.material);}});
    // ---- Light presets of the game (world.js LIGHTS): one per session when "au hasard" ----
    let lightName='apres-midi-clair',cockpitSun=null;
    function applyLight(name){
      const known=Object.hasOwn(W.LIGHTS,name),L=known?W.LIGHTS[name]:W.LIGHTS['apres-midi-clair'],az=L.az*Math.PI/180,el=L.el*Math.PI/180;lightName=known?name:'apres-midi-clair';
      sunDirection.set(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el)).normalize();
      sun.color.set(L.sun);sun.intensity=L.sunI;hemi.color.set(L.hemiSky);hemi.groundColor.set(L.hemiGround);
      const u=scenery.sky.material.uniforms;u.sunDir.value.copy(sunDirection);u.zenith.value.set(L.zenith);u.horizon.value.set(L.horizon);u.ground.value.set(L.ground);u.cloudCover.value=L.cloud;u.cloudShade.value=L.shade;u.sunGlow.value=L.glow;
      scene.fog.color.set(L.fog);scene.fog.density=L.fogD;renderer.toneMappingExposure=L.exposure;if(post)post.final.uniforms.exposure.value=L.exposure;
      if(cockpitSun){cockpitSun.position.copy(sunDirection);cockpitSun.color.set(L.sun);cockpitSun.intensity=2.4*Math.min(1,L.sunI/3.5)+.4;}
      refreshEnvironment();followShadow(flight.position);
    }
    function pickLight(){const keys=Object.keys(W.LIGHTS);applyLight(cfg.lighting==='random'?keys[Math.floor(Math.random()*keys.length)]:cfg.lighting);}
    // Mouse input state of the shared input path (physics.js createInputState: v12 stick deflection, or the
    // movement summed for the measured rate law).
    const mouse=P.createInputState();
    let targets=[],bullets=[],effects=[],running=false,hasSession=false,view='cockpit',time=0,roundsFiring=0,hitFlash=0,accumulator=0,capturing=null,exerciseDirty=false,suppressClick=false,skipMouse=false,compatInput=false,lockAttempt=0,virtualAnchor=null,lastPointer=null;
    let stats={shots:0,hits:0,kills:0,tracked:0,duration:0,deaths:0,crashes:0},keySet=new Set(),summaryReason='';
    let lookLatch=false,lookUpAt=-1e9,lookSkipUp=false;
    let heliAlive=true,wreck=0,wreckCause='',hitsTaken=0,padTimer=0,flareRequest=false,freeLookHeld=false,lookYaw=0,lookPitch=0,shake=0,aaActive=false,aaBanner=null,damageFlash=0;
    let run={...cfg},ammo=300,health=100,score=0,killsBy={},hot=null,shopOpen=false,menuTab='modes';
    // Fuel (v9), read on the recordings' gauge (docs/analyse/foret-dca.md): about 0.02 %/s plus
    // 0.0011 %/s per km/h (0.3 %/s at 270 km/h: ~5 min of full-speed flight), refuelled on the
    // helipad at about 5 %/s (recording 1, 384-392 s). Used when resources are limited.
    const FUEL_BASE=.0002,FUEL_PER_KMH=.000011,FUEL_REFILL=.05;
    let fuel=1,fuelOut=false;
    const hud=$('hud'),ctx=hud.getContext('2d');
    const bulletCoords=new Float32Array(1200*6);const bulletGeo=new T.BufferGeometry();bulletGeo.setAttribute('position',new T.BufferAttribute(bulletCoords,3));bulletGeo.setDrawRange(0,0);scene.add(new T.LineSegments(bulletGeo,new T.LineBasicMaterial({color:'#ffe7a2',transparent:true,opacity:.9})));
    // Enemy small-arms tracers (full match).
    let enemyTracers=[];const enemyCoords=new Float32Array(200*6),enemyGeo=new T.BufferGeometry();enemyGeo.setAttribute('position',new T.BufferAttribute(enemyCoords,3));enemyGeo.setDrawRange(0,0);scene.add(new T.LineSegments(enemyGeo,new T.LineBasicMaterial({color:'#ff9a5a',transparent:true,opacity:.85})));
    // Rounds of the enemy helicopters' miniguns (duel, full match), drawn like the player's.
    let enemyRounds=[];const enemyRoundCoords=new Float32Array(600*6),enemyRoundGeo=new T.BufferGeometry();enemyRoundGeo.setAttribute('position',new T.BufferAttribute(enemyRoundCoords,3));enemyRoundGeo.setDrawRange(0,0);scene.add(new T.LineSegments(enemyRoundGeo,new T.LineBasicMaterial({color:'#ffc08a',transparent:true,opacity:.9})));
    // ---- Particles: smoke (normal blending) and glows (additive) ----
    class Particles{
      constructor(max,additive){
        this.max=max;this.n=0;const g=new T.BufferGeometry(),F=n=>new Float32Array(n);
        Object.assign(this,{pos:F(max*3),size:F(max),alpha:F(max),col:F(max*3),vel:F(max*3),age:F(max),life:F(max),s0:F(max),s1:F(max),a0:F(max),drag:F(max),lift:F(max)});
        g.setAttribute('position',new T.BufferAttribute(this.pos,3));g.setAttribute('size',new T.BufferAttribute(this.size,1));g.setAttribute('alpha',new T.BufferAttribute(this.alpha,1));g.setAttribute('color',new T.BufferAttribute(this.col,3));g.setDrawRange(0,0);
        this.material=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:additive?T.AdditiveBlending:T.NormalBlending,uniforms:{scale:{value:500},fogColor:{value:new T.Color()},fogDensity:{value:0}},
          vertexShader:'attribute float size;attribute float alpha;attribute vec3 color;uniform float scale;varying float vA;varying vec3 vC;varying float vD;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=min(900.,size*scale/max(.5,-mv.z));gl_Position=projectionMatrix*mv;vA=alpha;vC=color;vD=-mv.z;}',
          fragmentShader:`uniform vec3 fogColor;uniform float fogDensity;varying float vA;varying vec3 vC;varying float vD;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;float f=1.-exp(-fogDensity*fogDensity*vD*vD);float a=vA*(1.-r)*(1.-.6*r);
            ${additive?'gl_FragColor=vec4(vC*(1.-f),a);':'gl_FragColor=vec4(mix(vC,fogColor,f),a);'}
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`});
        this.points=new T.Points(g,this.material);this.points.frustumCulled=false;this.points.renderOrder=additive?3:2;scene.add(this.points);
      }
      emit(p,v,life,s0,s1,a0,c,drag=0,lift=0){
        if(this.n>=this.max)return;const i=this.n++;
        this.pos.set([p.x,p.y,p.z],i*3);this.vel.set([v.x,v.y,v.z],i*3);this.col.set(c,i*3);
        this.age[i]=0;this.life[i]=life;this.s0[i]=s0;this.s1[i]=s1;this.a0[i]=a0;this.drag[i]=drag;this.lift[i]=lift;this.size[i]=s0;this.alpha[i]=0;
      }
      move(from,to){for(const k of ['pos','vel','col'])for(let a=0;a<3;a++)this[k][to*3+a]=this[k][from*3+a];for(const k of ['size','alpha','age','life','s0','s1','a0','drag','lift'])this[k][to]=this[k][from];}
      update(dt){
        let i=0;
        while(i<this.n){
          this.age[i]+=dt;if(this.age[i]>=this.life[i]){this.move(--this.n,i);continue;}
          const t=this.age[i]/this.life[i],k=Math.exp(-this.drag[i]*dt);
          for(let a=0;a<3;a++)this.vel[i*3+a]*=k;this.vel[i*3+1]+=this.lift[i]*dt;for(let a=0;a<3;a++)this.pos[i*3+a]+=this.vel[i*3+a]*dt;
          this.size[i]=this.s0[i]+(this.s1[i]-this.s0[i])*Math.sqrt(t);this.alpha[i]=this.a0[i]*(1-t)*(t<.08?t/.08:1);i++;
        }
        const g=this.points.geometry;g.setDrawRange(0,this.n);for(const k of ['position','size','alpha','color'])g.attributes[k].needsUpdate=true;
      }
      clear(){this.n=0;this.points.geometry.setDrawRange(0,0);}
    }
    const smoke=new Particles(cfg.graphics==='low'?2000:5000,false),glow=new Particles(1500,true);
    const SMOKE=[.86,.86,.84],DARK_SMOKE=[.24,.23,.22],FIRE=[3.4,1.7,.55],FLASH=[5,4.2,3],FLARE=[5,4.4,3.2],DUST=[.6,.55,.46];
    const V3=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),randomDir=()=>V3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize();
    function explosion(p,scale=1){
      glow.emit(p,V3(),.28,6*scale,28*scale,1,FLASH);
      for(let i=0;i<10;i++)glow.emit(p,randomDir().multiplyScalar(16*scale),.45+Math.random()*.35,3*scale,10*scale,.9,FIRE,2.5);
      for(let i=0;i<14;i++)smoke.emit(p,randomDir().multiplyScalar(8*scale),3.5+Math.random()*2.5,3*scale,17*scale,.75,DARK_SMOKE,1.2,1.4);
    }
    // Round impacts: dust on the ground, sparks on hard targets.
    function burst(at,size=1,hard=false){
      if(hard){for(let i=0;i<3;i++)glow.emit(at,randomDir().multiplyScalar(6),.12,.25*size,.1,1,FIRE,3);}
      for(let i=0;i<2;i++)smoke.emit(at,randomDir().multiplyScalar(1.2).add(V3(0,1.5,0)),.9+Math.random()*.6,.4*size+.2,2.2*size+.6,.55,DUST,2,.3);
    }
    const missileMeshes=[];
    {const body=mat('#d7dad3',{roughness:.5}),fins=mat('#4c534b');
     for(let i=0;i<14;i++){const g=new T.Group();mesh(new T.CylinderGeometry(.075,.075,1.55,10),body,g).rotation.x=Math.PI/2;mesh(new T.ConeGeometry(.075,.28,10),body,g,0,0,-.91).rotation.x=-Math.PI/2;box(g,.02,.5,.22,0,0,.62,fins);box(g,.5,.02,.22,0,0,.62,fins);g.visible=false;scene.add(g);missileMeshes.push(g);}}
    // ---- Surface-to-air defence and ground battle ----
    const TREES=new Set(['arbre']);
    function lineOfSight(a,b){
      const d=b.clone().sub(a),n=Math.max(6,Math.ceil(d.length()/15));
      for(let i=1;i<n;i++){const t=i/n;if(a.y+d.y*t<P.terrain(a.x+d.x*t,a.z+d.z*t)+.3)return false;}
      return !obstacles.hit(a,b,0,run.aaTreesBlock?null:TREES);
    }
    const defense=new M.AirDefense(cfg,{terrain:P.terrain,los:lineOfSight,hit:(a,b)=>obstacles.hit(a,b,0,run.aaTreesBlock?null:TREES)});
    const battle=new G.Battlefield(cfg,{terrain:P.terrain,field:obstacles,los:(a,b)=>lineOfSight(a,b)});
    const crowd=new models.Crowd(scene,120);
    let structureViews=[];
    // Hot zone: yellow translucent cylinder like the game's moving circle.
    const hotRing=new T.Mesh(new T.CylinderGeometry(300,300,90,72,1,true),new T.MeshBasicMaterial({color:'#e9c53c',transparent:true,opacity:.11,side:T.DoubleSide,depthWrite:false}));hotRing.visible=false;hotRing.renderOrder=1;scene.add(hotRing);
    // ---- Sound: synthesis matched to the recordings (audio.js) ----
    const sfx=new A.SoundEngine();
    function initAudio(){if(!sfx.start(cfg.volume))toast('Audio indisponible ; tu peux voler sans son.');}
    function sound(kind,{delay=0,gain=1,pan=0,distance=null}={}){sfx.play(kind,{distance:distance??delay*340,pan,gain});}
    // Stereo position of a world point relative to the helicopter.
    function panOf(p){const local=p.clone().sub(flight.position).applyQuaternion(flight.quaternion.clone().invert());const L=local.length();return L>1?P.clamp(local.x/L*1.4,-1,1):0;}
    function updateAudio(){
      const warning=running&&heliAlive&&aaActive?defense.warning:0,beepOn=warning===2||warning===1&&(time*cfg.aaBeepRate)%1<.5;
      let nearest=null,dist=Infinity;for(const m of defense.missiles){const d=m.position.distanceTo(flight.position);if(d<dist){dist=d;nearest=m;}}
      // Rotor load: lever relative to hover thrust (v13 leverHover), so the rotor sound keeps its v12 level in hover.
      sfx.update({running,alive:heliAlive,volume:cfg.volume,mix:{engine:cfg.volEngine,weapons:cfg.volWeapons,alerts:cfg.volAlerts},collective:flight.collective-(cfg.leverHover||0),speed:flight.velocity.length(),spin:gun.spin,
        firing:running&&heliAlive&&!!downOrJoy('fire')&&(run.unlimitedAmmo||ammo>0),beepOn,toneHz:cfg.aaToneHz,missileDistance:nearest?dist:null,missilePan:nearest?panOf(nearest.position):0,
        // v12: the game's mix differs between the pilot view and the chase view (measured on the recordings).
        view:view==='cockpit'&&hasSession&&heliAlive?'cockpit':'chase',
        // Enemy helicopters: rotor and minigun, delayed and filtered with the distance.
        enemies:[...bots.map(t=>{const p=t.bot.flight.position;return {id:t.bot.id,alive:t.active||t.bot.falling,firing:t.active&&time<t.bot.firingUntil,distance:p.distanceTo(flight.position),pan:panOf(p)};}),
          // CIWS: no rotor, 30 reports a second (1 800 rounds/min), deeper and louder than a minigun.
          ...ciwsList.map(u=>({id:u.id,alive:!u.dead,rotor:false,firing:!u.dead&&time<u.firingUntil,distance:u.muzzle.distanceTo(flight.position),pan:panOf(u.muzzle),interval:1/CIWS.rate,pitch:.62,loud:.9})),
          // Armed vehicles (v12): Humvee minigun (25 a second), pickup machine gun (14 a second, lighter).
          ...battle.vehicles.filter(v=>v.armed).map(v=>({id:'veh'+v.id,alive:v.alive,rotor:false,firing:v.alive&&v.firing,distance:v.position.distanceTo(flight.position),pan:panOf(v.position),interval:v.armed==='minigun'?1/25:1/14,pitch:v.armed==='minigun'?1:1.35,loud:.55}))]});
    }
    function targetPosition(t,at){
      const speed=run.targetSpeed/3.6,phase=t.phase+at*speed/100,centerZ=130-run.targetDistance;
      let x=t.lane,z=centerZ+t.depth,y=t.air?run.targetAltitude+t.height:1;
      if(run.trajectory==='cross')x+=Math.sin(phase)*100;
      else if(run.trajectory==='circle'){x+=Math.sin(phase)*85;z+=Math.cos(phase)*85;}
      else if(run.trajectory==='zigzag'){x+=Math.sin(phase)*100;z+=Math.sin(phase*2)*35;if(t.air)y+=Math.sin(phase*1.5)*20;}
      if(!t.air)y=P.terrain(x,z)+.9;
      return new T.Vector3(x,y,z);
    }
    function disposeTarget(t){const materials=new Set();scene.remove(t.group);t.group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)materials.add(o.material);});for(const m of materials)m.dispose?.();}
    function createTargets(){
      for(const t of targets)disposeTarget(t);
      targets=[];bots=[];enemyRounds=[];for(const tower of towers){tower.capture=0;tower.captured=false;tower.flag.material.color.set('#ca7846');tower.beacon.material.color.set('#d69e50');}
      const mode=MODE_OF(run.scenario);
      if(mode==='duel'){
        // Enemies 1.3 km ahead up the valley, 750 m behind, or anywhere 0.9-1.6 km away.
        const n=P.clamp(run.duelBots,1,3),from=flight.position;
        for(let i=0;i<n;i++){
          const weapon=run.duelEnemy==='ah6r'||run.duelEnemy==='mix'&&i%2?'rockets':'miniguns';
          const t=addBot({points:200,respawnDelay:run.duelRespawn?12:Infinity,health:run.duelHealth,weapon});let p;
          if(run.duelStart==='front'||run.duelStart==='behind'){const z=from.z+(run.duelStart==='front'?-1300:750);p=V3(W.valleyX(z)+(i-(n-1)/2)*180,0,z);}
          else p=botSpot(from,900,1600);
          placeBot(t,p,from);
        }
      }
      if(mode==='range'||mode==='towers'){
        const count=mode==='towers'?Math.max(3,run.targetCount):run.targetCount;
        for(let i=0;i<count;i++){
          const air=run.scenario==='air'||run.scenario==='mixed'&&i%2===0;
          const tower=mode==='towers'?towers[i%towers.length]:null;
          const model=tower?models.defender():air?models.helicopter('#af7850',{pilots:false,livery:true}):models.vehicle('truck');
          const maxHealth=tower?run.baseHealth:air?run.airHealth:run.groundHealth;
          const t={...model,air,tower,damageTotal:0,hitCount:0,lastHit:-100,phase:i*1.35,lane:(i-Math.floor(run.targetCount/2))*35,depth:i*20,height:i%3*12,health:maxHealth,maxHealth,active:true,respawn:0,radius:(tower?2.5:air?6.5:4)*(tower?1:run.targetSize),points:tower?20:air?150:70};
          if(i===0){t.lane=0;t.height=0;}
          t.group.scale.setScalar(tower?1:run.targetSize);t.group.position.copy(targetPosition(t,0));
          if(tower){const slot=tower.slots[Math.floor(i/towers.length)];t.group.position.set(tower.x+slot[0],tower.height+.76,tower.z+slot[1]);}
          else {
            // Keep initial targets outside solid scenery, including legacy paths.
            let tries=0;while(obstacles.hit(t.group.position,t.group.position,air?7:3)&&tries++<40)t.group.position.x+=15;
            t.motion=new P.EvasiveMotion(t.group.position,t.group.position,air,run.targetSpeed/3.6,Math.floor(Math.random()*4294967296));
          }
          t.previous=t.group.position.clone();t.group.updateMatrixWorld(true);scene.add(t.group);targets.push(t);
        }
      }
    }
    // ---- Enemy helicopters flown by bots (v10, bot.js) ----
    // Same measured flight model (the v6 defaults, not the player's calibration) and the
    // same miniguns: 25 rounds/s after 0.35 s, 800 m/s, 0.35 deg spread, observed damage.
    // Durability in reference hits (36.02 points): the enemy helicopters of the full match
    // keep 60; in the duel every helicopter, the player's included, has `duelHealth`
    // (default 40: a normal bot then needs about 1 min on a helicopter circling at
    // 145 km/h, 20 s on a hovering one). The game's value is unknown: training choice.
    // Bot paints (v13): v12's hues (chosen from a public picture, not checked on footage) with the own paint's measured
    // correction applied channel by channel (linear x2.84, x2.14, x2.01: '#62655d' -> '#9f9081') - assumed to hold for any
    // paint. Colour stage: kept as they were (assumed; no footage of bots or air targets); they now share the own paint's
    // measured sun response and grazing top cut (models.js LOOK), not its colour.
    // v13: the bots fly the same defaults (single yaw lag, hover lever -0.14); bot.js aims its lever around
    // leverHover with the rescaled authorities (v13 as first shipped aimed around 0: ~0.9 m above its height).
    const BOT_CFG={...P.defaults},BOT_COLORS=['#ddb07d','#b0aa7d','#ca9779'],_Y=V3(0,1,0),_bq=new T.Quaternion(),_fwd=V3();
    let bots=[],botGrace=0,duel=null,lastCrack=-1;
    const heliHits=()=>MODE_OF(run.scenario)==='duel'?run.duelHealth:60;
    // Power-line wires within 12 m of the segment a-b (sampled every ~15 m): {fraction} or null.
    function wireHazard(a,b){
      if(W.distanceToPowerLine(a.x,a.z)>300&&W.distanceToPowerLine(b.x,b.z)>300)return null;
      const n=Math.max(2,Math.ceil(a.distanceTo(b)/15));
      for(let i=0;i<=n;i++){const q=_v.copy(a).lerp(b,i/n);for(const s of wires)if(M.segmentDistance(q,s.a,s.b)<12)return {fraction:i/n};}
      return null;
    }
    // v12: AH-6R rocket variant (community databases: B-13 pods, 350 rounds/min, reloaded in 6 s; 122 mm rockets
    // of 100 damage, four rockets bring a Little Bird down according to the guides, i.e. 25 % of the 400-point hull;
    // blast 3 m as listed for another helicopter's 122 mm). 8 rockets a load (guides). The databases list an
    // odd 1 430 m/s for the 122 mm rocket: 600 m/s (real order of magnitude) is the trainer's choice.
    const ROCKET_POD={label:'Roquette 122 mm',load:8,interval:60/350,reload:6,speed:600,boost:600,direct:100,blast:3,full:1,drop:4.9,harmony:400};
    // Minigun bots carry 1 050 rounds (7 boxes of 150: the 9 inventory slots minus 2 flares), then fly
    // back to rearm for 25 s, as players land at the vendor (training choice).
    const BOT_AMMO=1050,BOT_REARM=25;
    function addBot({home=null,detectRange=Infinity,points=200,respawnDelay=12,health=60,weapon='miniguns'}={}){
      const model=models.helicopter(BOT_COLORS[bots.length%BOT_COLORS.length],{weapons:weapon,livery:true}),f=new P.Flight(BOT_CFG);
      const pilot=new H.BotPilot(f,{skill:run.difficulty,seed:1+Math.floor(Math.random()*1e9),terrain:P.terrain,obstacles,wires:wireHazard,lineOfSight,bulletSpeed:weapon==='rockets'?ROCKET_POD.speed:BOT_CFG.bulletSpeed,
        drop:weapon==='rockets'?ROCKET_POD.drop:9.81,weapon,detectRange,home});
      // Wingmen swing wide to attack from other bearings (bot.js flank).
      pilot.flank=bots.length===0?0:bots.length%2?1:-1;
      const t={...model,air:true,enemyHeli:true,tower:null,damageTotal:0,hitCount:0,lastHit:-100,phase:0,health,maxHealth:health,active:true,respawn:0,radius:6.5,points,previous:V3(),
        bot:{id:bots.length,flight:f,pilot,gun:new P.Minigun(BOT_CFG),falling:false,spin:0,respawnDelay,shots:0,firingUntil:-1,lastPlayerHit:-100,
          weapon,ammo:BOT_AMMO,rockets:ROCKET_POD.load,salvo:0,salvoCool:0,podClock:0,podReload:0,rearming:false,rearmTimer:0,orig:{home,detectRange}}};
      scene.add(t.group);targets.push(t);bots.push(t);
      for(const b of bots)b.bot.pilot.others=bots.filter(o=>o!==b).map(o=>o.bot.flight);
      return t;
    }
    // Out of rounds: back to a base 1.6 km away from the player, 25 s there, then back in the fight.
    function startRearm(t){
      const b=t.bot,p=b.flight.position,away=V3(p.x-flight.position.x,0,p.z-flight.position.z);if(away.lengthSq()<1)away.set(0,0,-1);away.normalize();
      const z=P.clamp(p.z+away.z*900,-2900,700),base={x:W.valleyX(z)+P.clamp(away.x*300,-250,250),z,radius:180};
      b.rearming=true;b.rearmTimer=0;b.pilot.home=base;b.pilot.detectRange=0;b.pilot.forget();feed('Un hélicoptère ennemi part se réarmer',false,true);
    }
    function stepRearm(t,dt){
      const b=t.bot,h=b.pilot.home;if(!b.rearming||!h)return;
      if(Math.hypot(b.flight.position.x-h.x,b.flight.position.z-h.z)<320){b.rearmTimer+=dt;if(b.rearmTimer>=BOT_REARM){b.rearming=false;b.ammo=BOT_AMMO;b.pilot.home=b.orig.home;b.pilot.detectRange=b.orig.detectRange;}}
    }
    function fireBotRocket(t){
      const b=t.bot,f=b.flight,side=b.shots++%2?1:-1,p=V3(side*1.45,-.45,-1.6).applyQuaternion(f.quaternion).add(f.position);
      // Pods harmonised on the nose line at ROCKET_POD.harmony m (fired parallel, they missed by the
      // 1.45 m pod offset); 0.35 deg dispersion around that line.
      const s=Math.tan(.35*Math.PI/180),a=Math.random()*6.28,r=Math.sqrt(Math.random())*s,H=ROCKET_POD.harmony-1.6;
      const dir=V3(-side*1.45/H+Math.cos(a)*r,.45/H+Math.sin(a)*r,-1).normalize().applyQuaternion(f.quaternion);
      const v=dir.clone().multiplyScalar(ROCKET_POD.speed).add(f.velocity),g=new T.Group(),body=mesh(new T.CylinderGeometry(.06,.06,1.1,8),rocketMat,g);body.rotation.x=Math.PI/2;
      g.position.copy(p);scene.add(g);rockets.push({g,p:p.clone(),previous:p.clone(),v,spec:ROCKET_POD,kind:'122',age:0,cause:'heli',owner:t});
      glow.emit(p,V3(),.06,1.2,1.5,1,FLASH);for(let i=0;i<4;i++)smoke.emit(p,dir.clone().multiplyScalar(-6).add(randomDir()),1.2,.6,3,.6,SMOKE,1,.3);
      const d=p.distanceTo(flight.position);sound('launch',{distance:d,gain:P.clamp(260/d,.1,.8),pan:panOf(p)});if(duel)duel.enemyShots++;
    }
    // Puts a bot 75 m above the ground at p, flying toward `face` at 145 km/h.
    function placeBot(t,p,face){
      const b=t.bot,f=b.flight;f.reset(0);f.position.set(p.x,P.terrain(p.x,p.z)+75,p.z);
      const dir=V3(face.x-p.x,0,face.z-p.z);if(dir.lengthSq()<1)dir.set(0,0,-1);dir.normalize();
      f.quaternion.setFromAxisAngle(_Y,Math.atan2(-dir.x,-dir.z));f.velocity.copy(dir).multiplyScalar(40);f.collective=(f.cfg.leverHover||0)+.3;
      b.pilot.reset();b.gun.reset();b.falling=false;b.firingUntil=-1;
      if(b.orig){b.ammo=BOT_AMMO;b.rockets=ROCKET_POD.load;b.salvo=0;b.podReload=0;b.rearming=false;b.pilot.home=b.orig.home;b.pilot.detectRange=b.orig.detectRange;}
      Object.assign(t,{active:true,health:t.maxHealth,damageTotal:0,hitCount:0,lastHit:-100});t.group.visible=true;
      t.group.position.copy(f.position);t.group.quaternion.copy(f.quaternion);t.previous.copy(f.position);t.group.updateMatrixWorld(true);
    }
    // A point of the valley floor between r0 and r1 from `from`, clear of the other bots.
    function botSpot(from,r0,r1){
      for(let i=0;i<80;i++){
        const z=P.clamp(from.z+(Math.random()*2-1)*r1,-2900,480),x=W.valleyX(z)+(Math.random()*2-1)*W.halfWidth(z)*.6,d=Math.hypot(x-from.x,z-from.z);
        if(d<r0||d>r1)continue;
        if(bots.some(o=>o.active&&Math.hypot(o.bot.flight.position.x-x,o.bot.flight.position.z-z)<250))continue;
        return V3(x,0,z);
      }
      const z=P.clamp(from.z-r0,-2900,480);return V3(W.valleyX(z),0,z);
    }
    // Full match: two bots patrol the hot zone and engage the player within 1.3 km.
    function addEnemyHeli(center){
      // The full match mixes an AH-6M [Miniguns] and an AH-6R [Rockets] (v12).
      const t=addBot({home:{x:center.x,z:center.z,radius:450},detectRange:1300,points:200,respawnDelay:45,health:run.airHealth*.5,weapon:bots.length%2?'rockets':'miniguns'});
      placeBot(t,V3(center.x+(Math.random()-.5)*500,0,center.z+(Math.random()-.5)*500),center);return t;
    }
    function respawnBot(t){
      const b=t.bot;let p;
      if(hot){p=V3(hot.center.x+(Math.random()-.5)*900,0,hot.center.z+(Math.random()-.5)*900);if(b.pilot.home){b.pilot.home.x=hot.center.x;b.pilot.home.z=hot.center.z;}}
      else p=botSpot(flight.position,1000,1600);
      placeBot(t,p,hot&&!heliAlive?hot.center:flight.position);
    }
    function fireBotRound(t){
      const b=t.bot,f=b.flight,side=b.shots++%2?1:-1;
      const p=V3(side*1.45,-.38,-2.1).applyQuaternion(f.quaternion).add(f.position);
      const spread=Math.tan(BOT_CFG.spread*Math.PI/180),r=Math.sqrt(Math.random())*spread,angle=Math.random()*Math.PI*2;
      const v=V3(-side*1.45,.38,-BOT_CFG.gunConvergence+2.1).normalize().add(V3(Math.cos(angle)*r,Math.sin(angle)*r,0)).normalize().applyQuaternion(f.quaternion).multiplyScalar(BOT_CFG.bulletSpeed).add(f.velocity);
      enemyRounds.push({p,v,age:0,previous:p.clone(),owner:t,cracked:false});if(duel)duel.enemyShots++;
      glow.emit(p,V3(),.03,.9,.6,1,FIRE);
    }
    // One physics step of a bot: pilot, flight model, collisions, trigger; the shot-down
    // wreck spins and falls, burning, and explodes on the ground.
    function stepBot(t,dt){
      const b=t.bot,f=b.flight;
      if(b.falling){
        f.velocity.y-=9.81*dt;f.velocity.multiplyScalar(Math.exp(-.2*dt));f.position.addScaledVector(f.velocity,dt);f.quaternion.multiply(_bq.setFromAxisAngle(_Y,b.spin*dt));
        if(Math.random()<dt*30){smoke.emit(f.position,V3(0,2,0),3+Math.random()*2,1.5,7,.6,DARK_SMOKE,.4,.6);glow.emit(f.position,V3(),.3,1.2,2.5,.9,FIRE,1);}
        if(f.position.y<=P.terrain(f.position.x,f.position.z)+1||obstacles.hit(t.previous,f.position,1.5)){
          b.falling=false;f.crashed=true;t.group.visible=false;explosion(f.position,1.5);sound('explosion',{distance:f.position.distanceTo(flight.position),pan:panOf(f.position)});}
      }else if(t.active){
        const out=b.pilot.step(dt,{position:flight.position,velocity:flight.velocity,forward:_fwd.set(0,0,-1).applyQuaternion(flight.quaternion),alive:heliAlive,firing:roundsFiring>0});
        const before=f.position.clone();f.step(dt,out.input);
        if(!f.crashed&&obstacles.hit(before,f.position,2.2))f.crashed=true;
        if(!f.crashed&&W.distanceToPowerLine(f.position.x,f.position.z)<80)for(const s of wires)if(M.segmentDistance(f.position,s.a,s.b)<4.4){f.crashed=true;break;}
        if(f.crashed)botDown(t,'crash');
        else{
          const want=out.fire&&time>=botGrace&&heliAlive&&!b.rearming;stepRearm(t,dt);
          if(b.weapon==='rockets'){
            // Salvos of 2 to 4 rockets at 350 a minute, 1.2 s apart; the pods reload in 6 s when empty.
            b.podClock-=dt;b.salvoCool-=dt;if(b.podReload>0){b.podReload-=dt;if(b.podReload<=0)b.rockets=ROCKET_POD.load;}
            if(b.salvo<=0&&want&&b.rockets>0&&b.salvoCool<=0)b.salvo=2+Math.floor(Math.random()*3);
            if(b.salvo>0&&b.podClock<=0&&b.rockets>0){fireBotRocket(t);b.rockets--;b.salvo--;b.podClock=ROCKET_POD.interval;b.firingUntil=time+.3;if(!b.salvo)b.salvoCool=1.2;if(!b.rockets){b.podReload=ROCKET_POD.reload;b.salvo=0;}}
          }else{
            const rounds=b.gun.step(dt,want&&b.ammo>0);
            for(let r=0;r<rounds;r++)fireBotRound(t);if(rounds)b.firingUntil=time+.12;b.ammo-=rounds;if(b.ammo<=0&&!b.rearming)startRearm(t);
          }
          // Damaged: smoke trail below half, thicker below a quarter.
          if(t.health<t.maxHealth*.5&&Math.random()<dt*(t.health<t.maxHealth*.25?24:9))smoke.emit(f.position.clone().add(V3(0,.6,0)),V3(0,1,0),2.5+Math.random()*2,.8,5,.5,DARK_SMOKE,.5,.4);
        }
      }
      t.group.position.copy(f.position);t.group.quaternion.copy(f.quaternion);
    }
    function botDown(t,cause){
      const b=t.bot,p=b.flight.position.clone(),d=p.distanceTo(flight.position);t.active=false;t.respawn=time+b.respawnDelay;
      if(cause==='shot'){
        b.falling=true;b.spin=(Math.random()<.5?-1:1)*(2.5+Math.random()*2);explosion(p,.9);sound('explosion',{distance:d,gain:.8,pan:panOf(p)});
        stats.kills++;award(t.points,'Hélicoptère ennemi',p);if(duel)duel.kills++;
      }else{
        t.group.visible=false;explosion(p,1.5);sound('explosion',{distance:d,pan:panOf(p)});
        // A crash within 10 s of being hit counts for the player.
        if(time-b.lastPlayerHit<10){stats.kills++;award(Math.round(t.points*.75),'Hélicoptère ennemi écrasé',p);if(duel)duel.kills++;}
        else feed('Un hélicoptère ennemi s’est écrasé',false,true);
      }
    }
    // Enemy round on the player's helicopter: a 20 mm shell of a CIWS (15 %), or a
    // minigun round of a bot.
    function playerHit(r){
      if(r.kind==='ciws'){
        health=Math.max(0,health-CIWS.hitPercent);ciwsStats.hits++;damageFlash=Math.max(damageFlash,.5);shake=Math.max(shake,.7);sfx.play('impact',{gain:1.4});
        glow.emit(flight.position,V3(),.12,1.5,3,1,FLASH);if(health<=0)destroyHeli('ciws');return;
      }
      const damage=P.hitDamage(cfg);health=Math.max(0,health-100*(damage/36.02)/heliHits());
      damageFlash=Math.max(damageFlash,.22);shake=Math.max(shake,.25);sfx.play('impact',{gain:1});
      if(duel){duel.hitsTaken++;duel.damageTaken+=damage;}
      if(health<=0)destroyHeli('heli');
    }
    function stepEnemyRounds(dt,previousPosition){
      if(!enemyRounds.length)return;
      own.group.position.copy(flight.position);own.group.quaternion.copy(flight.quaternion);own.group.updateMatrixWorld(true);
      for(let i=enemyRounds.length-1;i>=0;i--){
        const r=enemyRounds[i];r.previous.copy(r.p);r.v.y-=9.81*dt;r.p.addScaledVector(r.v,dt);r.age+=dt;let remove=false;
        const wall=obstacles.hit(r.previous,r.p),hit=heliAlive?P.sweptMesh(r.previous,r.p,previousPosition,own.group,7):null;
        if(hit&&(!wall||hit.fraction<wall.fraction)){remove=true;playerHit(r);}
        else if(wall){remove=true;const p=r.previous.clone().lerp(r.p,wall.fraction);burst(p,r.kind==='ciws'?.9:.4,wall.kind!=='arbre');if(r.kind==='ciws')glow.emit(p,V3(),.08,1,2,1,FLASH);}
        else if(r.p.y<P.terrain(r.p.x,r.p.z)){remove=true;burst(r.p,r.kind==='ciws'?1:.5,r.kind==='ciws');}
        // Supersonic crack of a round passing within 12 m (once per round, 14 per second at most).
        if(!remove&&!r.cracked&&heliAlive){const d=M.segmentDistance(flight.position,r.previous,r.p);if(d<12){r.cracked=true;if(time-lastCrack>.07){lastCrack=time;sfx.play('crack',{gain:P.clamp(1.25-d/12,.3,1),pan:panOf(r.p)});}}}
        if(remove||r.age>(r.life||3))enemyRounds.splice(i,1);
      }
    }
    // ---- Unguided rockets of the ground gunners (v12): RPG-7 and MAAWS (ground.js ROCKETS) ----
    let rockets=[],rocketStats={fired:0,hits:0,damage:0};const rocketMat=mat('#4b5340',{roughness:.7});
    function spawnRocket(e){
      const g=new T.Group(),body=mesh(new T.CylinderGeometry(.045,.045,.9,8),rocketMat,g);body.rotation.x=Math.PI/2;const head=mesh(new T.ConeGeometry(.085,.35,8),rocketMat,g,0,0,.6);head.rotation.x=Math.PI/2;
      g.position.copy(e.from);scene.add(g);rockets.push({g,p:e.from.clone(),previous:e.from.clone(),v:e.dir.clone().multiplyScalar(e.spec.speed),spec:e.spec,kind:e.kind,age:0});rocketStats.fired++;
      const d=e.from.distanceTo(flight.position);sound('launch',{distance:d,gain:P.clamp(380/d,.15,1),pan:panOf(e.from)});
      // Backblast behind the launcher, flash at the muzzle.
      const rear=e.from.clone().addScaledVector(e.dir,-1.4);for(let i=0;i<14;i++)smoke.emit(rear,e.dir.clone().multiplyScalar(-(4+Math.random()*8)).add(randomDir().multiplyScalar(2)),1.6+Math.random()*1.4,.8,4.5,.7,SMOKE,2,.5);
      glow.emit(e.from,V3(),.1,1,2,1,FLASH);if(run.aaAssist)banner(`${e.spec.label} · DÉPART ROQUETTE`,'#ff8a70',1.4);
    }
    // Direct hit: the listed damage; otherwise blast, full within `full` m and nothing beyond `blast` m.
    function explodeRocket(r,p,direct){
      explosion(p,.9);sound('explosion',{distance:p.distanceTo(flight.position),gain:.9,pan:panOf(p)});battle.panic(p,15);scene.remove(r.g);
      if(!heliAlive)return;const S=r.spec,d=direct?0:p.distanceTo(flight.position),f=d<=S.full?1:Math.max(0,(S.blast-d)/(S.blast-S.full));if(f<=0)return;
      const dmg=100*S.direct/400*f;health=Math.max(0,health-dmg);rocketStats.damage+=dmg;if(direct)rocketStats.hits++;damageFlash=Math.max(damageFlash,.5);shake=Math.max(shake,direct?1:.6);sfx.play('impact',{gain:1.3});
      if(duel&&r.cause==='heli'){duel.hitsTaken++;duel.damageTaken+=S.direct*f;}
      if(health<=0)destroyHeli(r.cause||'roquette');else if(run.aaAssist)banner(direct?`${S.label} · IMPACT DIRECT · INTÉGRITÉ ${Math.round(health)} %`:`${S.label} · ÉCLATS À ${fmt(d)} m · INTÉGRITÉ ${Math.round(health)} %`,'#ff6b55',2);
    }
    function stepRockets(dt,previousPosition){
      if(!rockets.length)return;own.group.position.copy(flight.position);own.group.quaternion.copy(flight.quaternion);own.group.updateMatrixWorld(true);
      for(let i=rockets.length-1;i>=0;i--){
        const r=rockets[i];r.age+=dt;r.previous.copy(r.p);
        // Sustainer after 0.12 s (the RPG-7's rocket motor), net drop of half a g (rocket lift).
        const speed=r.v.length(),want=r.age>.12?r.spec.boost:r.spec.speed;r.v.setLength(Math.min(want,speed+160*dt));r.v.y-=4.9*dt;r.p.addScaledVector(r.v,dt);
        r.g.position.copy(r.p);r.g.lookAt(_rk.copy(r.p).add(r.v));if(Math.random()<.8)smoke.emit(r.p,V3(),.6+Math.random()*.4,.45,2.2,.45,SMOKE,.7,.2);
        const hit=heliAlive?P.sweptMesh(r.previous,r.p,previousPosition,own.group,7):null,wall=obstacles.hit(r.previous,r.p);let done=true;
        if(hit&&(!wall||hit.fraction<wall.fraction))explodeRocket(r,r.previous.clone().lerp(r.p,hit.fraction),true);
        else if(wall)explodeRocket(r,r.previous.clone().lerp(r.p,wall.fraction),false);
        else if(r.p.y<P.terrain(r.p.x,r.p.z))explodeRocket(r,r.p,false);
        else if(r.age>4.5)explodeRocket(r,r.p,false);   // self-destruct in the air (the RPG-7's at about 900 m)
        else done=false;
        if(done)rockets.splice(i,1);
      }
    }
    const _rk=V3();
    function setupBattle(){
      for(const v of structureViews)scene.remove(v.view.group);structureViews=[];
      const mode=MODE_OF(run.scenario);hot=null;hotRing.visible=false;
      if(mode!=='assault'&&mode!=='match'){battle.reset();crowd.update([]);return;}
      // The camps belong to the two opposing factions (the player's own faction has no camp here).
      battle.cfg=run;battle.factions=['black','olive'];const seed=1+Math.floor(Math.random()*1e9);
      battle.generate(seed,{camps:run.camps,soldiersPerCamp:run.infantryPerCamp,vehicles:run.convoy});
      for(const st of battle.structures){const view=models.structure(st.type);view.group.position.copy(st.position);view.group.rotation.y=st.yaw;scene.add(view.group);structureViews.push({st,view});}
      for(const v of battle.vehicles){const model=models.vehicle(v.kind);const t={...model,convoy:v,air:false,tower:null,damageTotal:0,hitCount:0,lastHit:-100,health:v.health,maxHealth:v.health,active:true,respawn:0,radius:4,points:v.points,previous:v.position.clone()};
        t.group.position.copy(v.position);t.group.rotation.y=v.heading;scene.add(t.group);targets.push(t);}
      if(mode==='match'&&battle.camps.length){const c=battle.camps[Math.floor(Math.random()*battle.camps.length)];hot={center:V3(c.x,c.y,c.z),radius:300,next:180,camp:c};placeHotRing();for(let i=0;i<2;i++)addEnemyHeli(hot.center);}
    }
    function placeHotRing(){hotRing.visible=!!hot;if(hot){hotRing.position.set(hot.center.x,P.terrain(hot.center.x,hot.center.z)+40,hot.center.z);}}
    // ---- Air defence units (v9): missiles leave from launchers that can be shot ----
    // Verba gunners are soldiers of the ground battle (tube on the shoulder); a SAM emplacement
    // is a target (a launcher on a turret) with a seated crew.
    let samSites=[];
    // SAM emplacement (v12, community databases): 3 000 hull HP, i.e. 416 reference hits at -80 % for small
    // arms as for the CIWS (players kill the operator instead); one missile loaded, reloaded in
    // about 3 s from the missiles stocked at the emplacement (8), restocked one every 15 s.
    const SAM_HEALTH=3000/(36.02*.2),SAM_RESTOCK=15,SAM_STOCK=8;
    function roofBounds(site){const b=W.BUILDINGS.find(q=>q.id===site.roof);if(!b)return null;const y=(b.base??W.factoryLevel)+b.h+(b.roof||0);return {y,x0:Math.max(b.x-b.w/2+2,site.x-5),x1:Math.min(b.x+b.w/2-2,site.x+5),z0:Math.max(b.z-b.d/2+2,site.z-5),z1:Math.min(b.z+b.d/2-2,site.z+5)};}
    function syncVerba(u){models.tubeMuzzle(u.soldier,u.eye,u.muzzle,u.axis);}
    // Gives a Verba tube to a soldier and ties a launcher to him.
    function armVerba(s,ammo,site){
      s.role='verba';s.weapon='tube';s.state=s.state==='inside'?'inside':'patrol';s.target=null;
      const unit={soldier:s,get alive(){return s.alive;},get ready(){return s.alive&&s.state==='engage'&&s.raise>=1;},eye:V3(),muzzle:V3(),axis:V3(0,0,-1),aligned:true};syncVerba(unit);
      const l=defense.addLauncher({id:site?.id||`verba-${s.id}`,x:s.position.x,y:s.position.y,z:s.position.z,kind:'manpads',unit,ammo});
      l.range=defense.range(l);l.minRange=defense.minRange();l.camp=s.camp;s.launcher=l;return l;
    }
    function addVerba(x,z,camp,{roof=null,home=false,ammo=3,site=null}={}){return armVerba(battle.addSoldier(x,z,camp,Math.random,{role:'verba',roof,home}),ammo,site);}
    function addSamSite(x,z,camp=null,yaw=0,site=null){
      const view=models.samSite(),g=P.terrain(x,z);view.group.position.set(x,g,z);view.group.rotation.y=yaw;view.turret.rotation.y=Math.random()*6.28;view.cradle.rotation.x=.25;scene.add(view.group);
      const emp=battle.addEmplacement(x,z,camp,yaw);
      // Without a camp nobody can take the seat back: killing the crew neutralises the emplacement.
      const u={view,emp,loaded:[true],next:0,reloadTimer:0,burning:0,eye:V3(),muzzle:V3(),axis:V3(0,0,-1),aligned:false,
        get alive(){return emp.alive&&(!!camp||!emp.crew||emp.crew.alive);},get ready(){return emp.alive&&!!emp.crew&&emp.crew.alive&&emp.crew.state==='crew'&&u.loaded.some(Boolean);}};
      const t={group:view.group,samSite:u,aa:null,air:false,tower:null,damageTotal:0,hitCount:0,lastHit:-100,health:SAM_HEALTH,maxHealth:SAM_HEALTH,active:true,respawn:0,radius:2.4,previous:view.group.position.clone(),points:250};
      syncSamSite(u,0);battle.addCrew(emp);syncSamSite(u,0);
      const l=defense.addLauncher({id:site?.id||`sam-${emp.id}`,x,y:g,z,kind:'sam',unit:u,ammo:SAM_STOCK});l.range=defense.range(l);l.minRange=defense.minRange();l.camp=camp;
      u.launcher=l;t.aa=l;targets.push(t);samSites.push(u);return l;
    }
    // Turret and cradle follow the lead point while the launcher works, track a visible
    // helicopter, or scan slowly; the crew sits on the turret.
    const _q=new T.Quaternion(),_v=V3(),_w=V3();
    function syncSamSite(u,dt){
      const v=u.view,l=u.launcher,crew=u.emp.crew&&u.emp.crew.alive?u.emp.crew:null;
      if(!u.emp.alive){v.group.updateMatrixWorld(true);return;}
      let want=null;if(l&&crew&&dt>0){if(l.state!=='idle')want=l.lead;else if(l.visible)want=flight.position;}
      if(want){
        v.group.updateMatrixWorld(true);const local=v.group.worldToLocal(_v.copy(want)),dy=local.y-(v.turret.position.y+v.cradle.position.y);
        const yaw=Math.atan2(-local.x,-local.z),dYaw=Math.atan2(Math.sin(yaw-v.turret.rotation.y),Math.cos(yaw-v.turret.rotation.y)),pitch=P.clamp(Math.atan2(dy,Math.hypot(local.x,local.z)),-.1,1.35);
        v.turret.rotation.y+=P.clamp(dYaw,-1.5*dt,1.5*dt);v.cradle.rotation.x+=P.clamp(pitch-v.cradle.rotation.x,-dt,dt);
      }else if(crew&&dt>0){v.turret.rotation.y+=dt*.12;v.cradle.rotation.x+=(.25-v.cradle.rotation.x)*Math.min(1,dt);}
      v.group.updateMatrixWorld(true);
      v.turret.localToWorld(u.emp.seat.copy(v.seat));
      if(crew){crew.position.copy(u.emp.seat);crew.position.y-=.84;v.turret.getWorldQuaternion(_q);const f=_v.set(0,0,-1).applyQuaternion(_q);crew.yaw=Math.atan2(-f.x,-f.z);}
      v.cradle.localToWorld(u.eye.copy(v.sight));
      u.next=Math.max(0,u.loaded.indexOf(true));v.cradle.localToWorld(u.muzzle.copy(v.muzzles[u.next]));
      v.cradle.getWorldQuaternion(_q);u.axis.set(0,0,-1).applyQuaternion(_q);
      u.aligned=!!l&&u.axis.dot(_w.copy(l.lead).sub(u.muzzle).normalize())>Math.cos(8*Math.PI/180);
    }
    // The crew puts the next missile in the tube once the launcher's 3 s cycle is over, and the
    // emplacement's stock grows by one missile every 15 s up to 8 (supplies turned into missiles).
    function reloadSamSite(u,dt){
      const l=u.launcher,crew=u.emp.crew&&u.emp.crew.alive;if(!u.emp.alive||!l||l.dead||!crew){u.reloadTimer=0;return;}
      if(!u.loaded[0]&&l.reload<=0&&l.ammo>0)u.loaded[0]=true;
      if(l.ammo<SAM_STOCK){u.reloadTimer+=dt;if(u.reloadTimer>=SAM_RESTOCK){u.reloadTimer=0;l.ammo++;}}else u.reloadTimer=0;
    }
    function destroySamSite(t){
      const u=t.samSite;t.active=false;u.emp.alive=false;u.burning=35;stats.kills++;
      const p=t.group.position.clone().add(V3(0,1.3,0)),d=p.distanceTo(flight.position);explosion(p,1.5);sound('explosion',{distance:d,pan:panOf(p)});
      // Missiles still in the tubes cook off; the crew does not survive.
      if(u.loaded.some(Boolean)){explosion(p.clone().add(V3(0,.8,0)),1);sound('explosion',{distance:d,gain:.6,pan:panOf(p)});}
      battle.blast(t.group.position,6);
      u.view.cradle.rotation.x=-.3;u.view.turret.rotation.z=.18;u.loaded.fill(false);
      u.view.group.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){o.material=o.material.clone();o.material.color.multiplyScalar(.28);}});
      award(t.points,'Poste SAM',t.group.position);
    }
    function syncAirUnits(dt){
      for(const l of defense.launchers)if(!l.dead&&l.unit&&l.unit.soldier)syncVerba(l.unit);
      for(const u of samSites){reloadSamSite(u,dt);syncSamSite(u,dt);}
      for(const u of ciwsList)stepCiws(u,dt);
    }
    // ---- CIWS (v10): manned 20 mm gatling emplacement ----
    // Guides and community databases (docs/SOURCES.md; not checked in the game): built in a FOB,
    // manually operated, 20x102 mm, 60 damage a shot, 5 000 hull HP, 500-round magazine,
    // effective out to about 1 km (player report). v12, community databases: 1 800 rounds/min,
    // reload 3 s plus 1 s before and after (players: about 5 s), shells at 224 m/s (v10
    // estimated 1 000 m/s; players find leading at distance almost impossible, consistent with
    // slow shells, which drop about 100 m over 1 km). It cannot fire straight up (guides: a safe
    // cone above it). On the helicopter: 60 of the 400 hull HP listed for the AH-6M, 15 % a hit.
    // Its hull under the minigun: 5 000 HP at -80 % (small arms, as listed for the helicopters)
    // = 694 reference hits, in line with the roughly 500 rounds on target a player reports.
    const CIWS={rate:30,velocity:224,life:6,magazine:500,reload:5,reserve:2000,range:1000,acquire:1300,hitPercent:15,hp:5000,health:5000/(36.02*.2),spread:.35,traverse:1.6,elevate:1.1,maxElevation:1.3,points:300,
      // Gunner by level: perception delay (s), aim error (deg), fire cone (deg).
      gunner:{easy:[.6,1.3,2.6],normal:[.4,.65,2],real:[.25,.3,1.6]}};
    let ciwsList=[],ciwsStats={shots:0,hits:0,destroyed:0,gunners:0};
    function addCiws(x,z,camp=null,yaw=0){
      const view=models.ciws(),g=P.terrain(x,z);view.group.position.set(x,g,z);view.group.rotation.y=yaw;view.turret.rotation.y=Math.random()*6.28;scene.add(view.group);
      const emp=battle.addEmplacement(x,z,camp,yaw);emp.kind='ciws';
      const u={view,emp,camp,ammo:CIWS.magazine,reserve:CIWS.reserve,reloadTimer:0,clock:0,burst:0,pause:0,firing:false,firingUntil:-1,revealed:0,history:[],visible:false,losClock:0,
        noise:V3(),noiseTarget:V3(),noiseClock:0,muzzle:V3(),axis:V3(0,0,-1),lead:V3(),aim:null,dead:false,resupply:0,burning:0,id:'ciws'+(ciwsList.length+1)};
      const t={group:view.group,ciws:u,air:false,tower:null,damageTotal:0,hitCount:0,lastHit:-100,health:CIWS.health,maxHealth:CIWS.health,hp:CIWS.hp,active:true,respawn:0,radius:4.2,previous:view.group.position.clone(),points:CIWS.points};
      u.target=t;syncCiws(u,0);battle.addCrew(emp);syncCiws(u,0);targets.push(t);ciwsList.push(u);return u;
    }
    // Turret toward the aim point (92 deg/s in bearing, 63 deg/s in elevation); the
    // operator sits at the console beside the mount.
    function syncCiws(u,dt){
      const v=u.view,crew=u.emp.crew&&u.emp.crew.alive?u.emp.crew:null;
      v.group.updateMatrixWorld(true);
      if(!u.dead&&u.aim&&dt>0){
        const local=v.group.worldToLocal(_v.copy(u.aim)),dy=local.y-(v.turret.position.y+v.cradle.position.y);
        const yaw=Math.atan2(-local.x,-local.z),dYaw=Math.atan2(Math.sin(yaw-v.turret.rotation.y),Math.cos(yaw-v.turret.rotation.y)),pitch=P.clamp(Math.atan2(dy,Math.hypot(local.x,local.z)),-.12,CIWS.maxElevation);
        v.turret.rotation.y+=P.clamp(dYaw,-CIWS.traverse*dt,CIWS.traverse*dt);v.cradle.rotation.x+=P.clamp(pitch-v.cradle.rotation.x,-CIWS.elevate*dt,CIWS.elevate*dt);
        v.group.updateMatrixWorld(true);
      }
      v.group.localToWorld(u.emp.seat.copy(v.seat));
      if(crew){crew.position.copy(u.emp.seat);crew.position.y-=.84;crew.yaw=v.group.rotation.y;}
      v.cradle.localToWorld(u.muzzle.copy(v.muzzle));v.cradle.getWorldQuaternion(_q);u.axis.set(0,0,-1).applyQuaternion(_q);
    }
    function stepCiws(u,dt){
      if(u.dead){if(u.burning>0&&Math.random()<dt*12){u.burning-=dt;const p=u.view.group.position.clone().add(V3((Math.random()-.5)*2,1.5+Math.random()*2,(Math.random()-.5)*2));smoke.emit(p,V3(0,2.5,0),5+Math.random()*3,1.5,8,.55,DARK_SMOKE,.3,.9);}return;}
      const crew=u.emp.crew&&u.emp.crew.alive?u.emp.crew:null,[lag,noise,cone]=CIWS.gunner[run.difficulty]||CIWS.gunner.normal;
      if(u.revealed>0)u.revealed-=dt;
      // Magazine of 500, reload about 5 s from the reserve; an empty reserve is restocked by
      // the camp after 60 s while the camp stands (the drill restocks without a camp).
      if(u.ammo<=0&&u.reloadTimer<=0&&u.reserve>0&&crew)u.reloadTimer=CIWS.reload;
      if(u.reloadTimer>0){u.reloadTimer-=dt;if(u.reloadTimer<=0){const n=Math.min(CIWS.magazine,u.reserve);u.ammo=n;u.reserve-=n;}}
      if(u.ammo<=0&&u.reserve<=0){u.resupply+=dt;if(u.resupply>60&&(!u.camp||u.camp.structures.some(s=>s.alive))){u.resupply=0;u.reserve=CIWS.reserve;}}
      let fire=false;u.aim=null;
      if(crew&&heliAlive){
        // The gunner sees the helicopter as it was `lag` s ago, when it is in sight.
        const dist=flight.position.distanceTo(u.muzzle);
        u.losClock-=dt;if(u.losClock<=0){u.losClock=.1;u.visible=dist<CIWS.acquire&&lineOfSight(_w.copy(u.muzzle).add(_Y),flight.position);}
        if(u.visible)u.history.push({t:time,p:flight.position.clone(),v:flight.velocity.clone()});
        while(u.history.length>2&&u.history[1].t<=time-lag)u.history.shift();
        const h=u.history[0];
        if(h&&time-h.t<3){
          const p=h.p.clone().addScaledVector(h.v,time-h.t),d=p.distanceTo(u.muzzle),tf=d/CIWS.velocity;
          u.lead.copy(p).addScaledVector(h.v,tf);u.lead.y+=.5*9.81*tf*tf;
          u.noiseClock-=dt;if(u.noiseClock<=0){u.noiseClock=.35+Math.random()*.4;u.noiseTarget.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(2*noise*Math.PI/180*d);}
          u.noise.lerp(u.noiseTarget,1-Math.exp(-dt/.3));u.aim=u.lead.clone().add(u.noise);
          const err=Math.acos(P.clamp(u.axis.dot(_w.copy(u.aim).sub(u.muzzle).normalize()),-1,1))*180/Math.PI;
          fire=u.visible&&d<CIWS.range&&err<cone&&u.ammo>0&&u.reloadTimer<=0;
        }else u.history.length=0;
      }else u.history.length=0;
      syncCiws(u,dt);
      // Bursts of 1.5-3 s, pauses of 0.5-1 s.
      if(u.pause>0){u.pause-=dt;fire=false;}
      if(fire){
        if(u.burst===0){u.burstLength=1.5+Math.random()*1.5;if(run.aaAssist&&time>=(u.bannerAt||0)){u.bannerAt=time+6;banner(`CIWS EN TIR · ${Math.round(u.muzzle.distanceTo(flight.position))} m`,'#ff8a70',1.6);}}
        u.burst+=dt;if(u.burst>u.burstLength){u.burst=0;u.pause=.5+Math.random()*.5;}
      }else u.burst=0;
      if(fire){
        u.clock+=dt;u.firingUntil=time+.1;u.revealed=8;
        while(u.clock>=1/CIWS.rate&&u.ammo>0){u.clock-=1/CIWS.rate;u.ammo--;fireCiwsRound(u);}
      }else u.clock=Math.min(u.clock,1/CIWS.rate);
    }
    function fireCiwsRound(u){
      const s=Math.tan(CIWS.spread*Math.PI/180),r=Math.sqrt(Math.random())*s,a=Math.random()*6.2832,right=_v.set(1,0,0).applyQuaternion(_q),upv=_w.set(0,1,0).applyQuaternion(_q);
      const dir=u.axis.clone().addScaledVector(right,Math.cos(a)*r).addScaledVector(upv,Math.sin(a)*r).normalize(),p=u.muzzle.clone();
      enemyRounds.push({p,v:dir.multiplyScalar(CIWS.velocity),age:0,life:CIWS.life,previous:p.clone(),owner:u.target,kind:'ciws',cracked:false});ciwsStats.shots++;
      if(Math.random()<.5)glow.emit(p,V3(),.04,1.6,1,1,FIRE);
    }
    function destroyCiws(t){
      const u=t.ciws,p=t.group.position.clone().add(V3(0,2,0)),d=p.distanceTo(flight.position);t.active=false;u.dead=true;u.emp.alive=false;u.burning=40;u.aim=null;ciwsStats.destroyed++;stats.kills++;
      explosion(p,1.8);sound('explosion',{distance:d,pan:panOf(p)});setTimeout(()=>{explosion(p.clone().add(V3(0,1.5,0)),1.1);sound('explosion',{distance:d,gain:.7,pan:panOf(p)});},300);
      battle.blast(t.group.position,7);u.view.cradle.rotation.x=-.2;u.view.turret.rotation.z=.12;
      u.view.group.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){o.material=o.material.clone();o.material.color.multiplyScalar(.3);}});
      award(t.points,'Canon CIWS',t.group.position);
    }
    // A flat spot clear of structures and trees (4.5 m around) between r0 and r1 from c.
    function ciwsSpot(c,r0,r1){
      let best=null,score=Infinity;
      for(let i=0;i<60;i++){
        // r0 = 0 (a free launch site): its flattened clearing first, the woods around only if it is taken.
        const a=Math.random()*6.28,r=i===0&&r0===0?0:r0+Math.random()*(r1-r0),x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r,g=P.terrain(x,z);
        if(obstacles.hit(V3(x,g+.6,z),V3(x,g+4,z),4.5))continue;
        const slope=Math.abs(P.terrain(x+3,z)-g)+Math.abs(P.terrain(x,z+3)-g);if(slope<score){score=slope;best={x,z};}
        if(slope<.6)break;
      }
      return best||campSpot(c,r0,r1);
    }
    // Sites: in the drill, open ground near free launch sites; in the camps, beside the camp (FOB).
    function placeCiws(n,fromCamps){
      for(let i=0;i<n;i++){
        if(fromCamps&&battle.camps.length){const c=battle.camps[(i*2+1)%battle.camps.length],p=ciwsSpot(c,24,45);addCiws(p.x,p.z,c,Math.random()*6.28);continue;}
        // Free ground sites: no launcher, no CIWS, no rocket gunner posted there.
        const used=new Set([...defense.launchers.map(l=>l.site.id),...ciwsList.map(u=>u.site)]),gunner=s=>battle.soldiers.some(q=>q.alive&&q.role==='rpg'&&q.home&&Math.hypot(q.home.x-s.x,q.home.z-s.z)<15);
        const free=W.AA_SITES.filter(s=>!s.roof&&!used.has(s.id)&&!gunner(s)),site=free[Math.floor(Math.random()*free.length)]||W.AA_SITES[i%W.AA_SITES.length];
        const p=ciwsSpot(site,0,40);addCiws(p.x,p.z,null,Math.atan2(p.x-W.valleyX(p.z),0)).site=site.id;
      }
    }
    // A free spot of open ground around a camp for an emplacement.
    function campSpot(c,r0,r1){
      for(let i=0;i<40;i++){const a=Math.random()*6.28,r=r0+Math.random()*(r1-r0),x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r,g=P.terrain(x,z);
        if(!obstacles.hit(V3(x,g+.4,z),V3(x,g+3,z),4,TREES)&&Math.abs(P.terrain(x+3,z)-g)<1.2&&Math.abs(P.terrain(x,z+3)-g)<1.2)return {x,z};}
      return {x:c.x+r0,z:c.z};
    }
    // Missile drill: gunners and emplacements on the launch sites (roofs, hills,
    // clearings); full match and assault: Verba gunners in the camps and SAM emplacement
    // emplacements next to some of them.
    function setupAirDefense(){
      aaActive=run.scenario==='missiles'||run.aaEverywhere;
      for(const m of missileMeshes)m.visible=false;smoke.clear();glow.clear();aaBanner=null;
      for(const u of samSites)scene.remove(u.view.group);samSites=[];targets=targets.filter(t=>!t.samSite);
      for(const u of ciwsList)scene.remove(u.view.group);ciwsList=[];targets=targets.filter(t=>!t.ciws);ciwsStats={shots:0,hits:0,destroyed:0,gunners:0};
      defense.cfg=run;
      const seed=1+Math.floor(Math.random()*1e9);defense.reset([],seed);
      if(!aaActive)return;
      defense.grace=6;const mode=MODE_OF(run.scenario);
      if(mode==='missiles'||!battle.camps.length){
        const pool=W.AA_SITES.slice();let s=seed;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
        for(let i=pool.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
        const chosen=[];for(const site of pool){if(chosen.length>=run.aaLaunchers)break;if(site.kind==='sam'&&run.aaLaunchers<5&&chosen.some(c=>c.kind==='sam'))continue;chosen.push(site);}
        for(const site of chosen){if(site.kind==='sam')addSamSite(site.x,site.z,null,Math.atan2(site.x-W.valleyX(site.z),0),site);else addVerba(site.x,site.z,null,{roof:site.roof?roofBounds(site):null,home:true,ammo:3,site});}
        // v12: rocket gunners (RPG-7, MAAWS) near free ground sites.
        const spare=pool.filter(s=>!s.roof&&!chosen.includes(s));
        for(let i=0;i<(run.aaRockets||0)&&spare.length;i++){const site=spare.splice(Math.floor(rnd()*spare.length),1)[0],a=rnd()*6.28;battle.addSoldier(site.x+Math.cos(a)*6,site.z+Math.sin(a)*6,null,Math.random,{role:'rpg',home:true,rockets:4,faction:'black'});}
        placeCiws(run.ciwsCount,false);
        return;
      }
      const camps=battle.camps,n=run.aaLaunchers,samCount=n>=2?Math.max(1,Math.floor(n/3)):0;
      for(let i=0;i<samCount;i++){const c=camps[i%camps.length],p=campSpot(c,20,30);addSamSite(p.x,p.z,c,Math.random()*6.28);}
      for(let i=0;i<n-samCount;i++){
        const c=camps[(i+samCount)%camps.length],s=battle.soldiers.find(q=>q.camp===c&&q.role==='rifle'&&q.alive);
        if(s)armVerba(s,2);else{const a=Math.random()*6.28;addVerba(c.x+Math.cos(a)*10,c.z+Math.sin(a)*10,c,{ammo:2});}
      }
      placeCiws(run.ciwsCount,true);
    }
    // Replacements: the drill puts a new team on a free site after 25 s; in the
    // camps a new Verba gunner walks in after 45 s while the camp still stands.
    function reviveLauncher(l){
      l.reviveAt=0;l.replaced=true;
      if(MODE_OF(run.scenario)==='missiles'||!l.camp){
        const used=new Set(defense.launchers.filter(q=>!q.dead).map(q=>q.site.id)),free=W.AA_SITES.filter(s=>!used.has(s.id)&&s.kind===l.kind);
        const site=free[Math.floor(Math.random()*free.length)]||l.site.x!==undefined&&W.AA_SITES.find(s=>s.id===l.site.id);if(!site)return;
        if(site.kind==='sam'){const old=samSites.find(u=>u.launcher===l);if(old){old.emp.alive=false;scene.remove(old.view.group);samSites=samSites.filter(u=>u!==old);targets=targets.filter(t=>t.samSite!==old);}addSamSite(site.x,site.z,null,0,site);}
        else addVerba(site.x,site.z,null,{roof:site.roof?roofBounds(site):null,home:true,ammo:3,site});
        return;
      }
      if(l.kind!=='manpads'||!l.camp.structures.some(s=>s.alive))return;
      const a=Math.random()*6.28,s=battle.addSoldier(l.camp.x+Math.cos(a)*70,l.camp.z+Math.sin(a)*70,l.camp);armVerba(s,2);s.target=V3(l.camp.x,0,l.camp.z);
    }
    // Joystick: commands dropped until the next read, buttons still held ignored until released (latchButtons).
    function clearInputs(){keySet.clear();P.resetInput(mouse);freeLookHeld=false;lookLatch=false;flareRequest=false;gun.reset();roundsFiring=0;joy.active=false;joy.stickLook=false;J.latchButtons(joy.state);updateAudio();}
    function enableCompatibility(){
      if(!running||document.pointerLockElement)return;
      compatInput=true;skipMouse=true;P.resetInput(mouse);virtualAnchor=null;lastPointer=null;
      $('world').focus({preventScroll:true});
      $('mouseMode').hidden=false;
      toast('Manche souris : écarte pour tourner, ramène pour arrêter. X recentre ; Échap met en pause.');
    }
    async function lock(){
      const attempt=++lockAttempt;compatInput=false;$('mouseMode').hidden=true;
      $('world').focus({preventScroll:true});
      if(typeof $('world').requestPointerLock!=='function'){enableCompatibility();return;}
      // No {unadjustedMovement}: the measured mouse gain K is per accelerated cursor px (Windows pointer precision on).
      try{await $('world').requestPointerLock();}
      catch(e){if(attempt===lockAttempt)enableCompatibility();return;}
      // Some embedded browsers return no promise and only emit pointerlockerror.
      setTimeout(()=>{if(attempt===lockAttempt&&!document.pointerLockElement)enableCompatibility();},250);
    }
    // Session configuration: difficulty scales the enemy, the full match forces its rules.
    function sessionConfig(){
      const c={...cfg},mode=MODE_OF(c.scenario);c.enemyAccuracy=1;
      if(['assault','missiles','match','duel'].includes(mode)){
        if(c.difficulty==='easy'){c.aaAssist=true;c.showMarkers=true;c.aaLockTime*=1.4;c.aaMissileSpeed*=.8;c.aaAgility*=.7;c.enemyAccuracy=.5;}
        else if(c.difficulty==='real'){c.aaAssist=false;c.showMarkers=false;c.aaLockTime*=.85;c.enemyAccuracy=1.25;}
      }
      if(mode==='match'){c.enemyFire=true;c.unlimitedAmmo=false;c.aaEverywhere=true;c.flareUnlimited=false;c.aaObjective='survive';c.aaRespawn=true;}
      if(mode==='missiles'||mode==='duel')c.aaEverywhere=false;
      if(mode!=='assault'&&mode!=='match')c.enemyFire=false;
      return c;
    }
    function start(){
      clearInputs();cfg=sanitize(cfg);run=sessionConfig();flight.cfg=cfg;gun.cfg=cfg;defense.cfg=run;battle.cfg=run;
      const mode=MODE_OF(run.scenario);flight.reset(run.scenario==='ground'?35:['missiles','match','assault','duel'].includes(mode)?45:70);gun.reset();
      duel=mode==='duel'?{kills:0,hitsTaken:0,damageTaken:0,enemyShots:0,exposed:0,hitsGiven:0,hitDistance:0}:null;botGrace=0;lastCrack=-1;
      // Free flight starts landed on the pad, lever at idle, like the recordings.
      if(mode==='free'){flight.position.y=P.terrain(W.PAD.x,W.PAD.z)+1.25;flight.collective=-1;flight.onGround=true;}
      syncRender();chaseZoom=0;
      time=0;accumulator=0;stats={shots:0,hits:0,kills:0,tracked:0,duration:0,deaths:0,crashes:0};bullets=[];enemyTracers=[];hitFlash=0;view='cockpit';exerciseDirty=false;
      for(const r of rockets)scene.remove(r.g);rockets=[];rocketStats={fired:0,hits:0,damage:0};
      heliAlive=true;wreck=0;hitsTaken=0;padTimer=0;lookYaw=0;lookPitch=0;shake=0;damageFlash=0;ammo=300;health=100;score=0;killsBy={};fuel=1;fuelOut=false;
      effects.forEach(e=>{e.life=0;e.mesh.visible=false;});createTargets();setupBattle();setupAirDefense();running=true;hasSession=true;summaryReason='';
      showScreen(null);$('resume').hidden=false;document.body.classList.add('flying');document.body.classList.toggle('telemetry',cfg.showTelemetry);$('feed').textContent='';$('modeLabel').textContent=MODES[mode].title;
      // A light preset of the game for this session (or the one chosen in the menu).
      pickLight();
      initAudio();save();updateCamera();lock();
      feed(MODES[mode].start,false,true);feed(`${W.name} · ${W.LIGHTS[lightName].label}`,false,true);
      joyStart();
    }
    // Screens: 'menu' (modes/controls/settings tabs), 'pause', 'results', 'shop' or null (flying).
    function showScreen(name){for(const id of ['menu','pause','results','shop','loading'])$(id).classList.toggle('hidden',id!==name);}
    function pause(){
      if(!hasSession||shopOpen)return;running=false;lockAttempt++;clearInputs();document.body.classList.remove('flying');$('mouseMode').hidden=true;
      showScreen(summaryReason?'results':'pause');if(document.pointerLockElement)document.exitPointerLock();syncUI();
    }
    function resume(){if(summaryReason||!hasSession)return;running=true;accumulator=0;clearInputs();document.body.classList.add('flying');showScreen(null);initAudio();lock();}
    function openMenu(tab='modes'){running=false;if(document.pointerLockElement)document.exitPointerLock();document.body.classList.remove('flying');showScreen('menu');selectTab(tab);$('resume').hidden=!hasSession||!!summaryReason||exerciseDirty;syncUI();}
    const median=list=>{const v=list.filter(x=>x!==null).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null;};
    const ciwsText=()=>ciwsList.length?` Canons CIWS : ${ciwsStats.shots} obus tirés, ${ciwsStats.hits} impacts reçus (15 % chacun), ${ciwsStats.destroyed} canon${ciwsStats.destroyed>1?'s':''} détruit${ciwsStats.destroyed>1?'s':''} sur ${ciwsList.length}, ${ciwsStats.gunners} servant${ciwsStats.gunners>1?'s':''} abattu${ciwsStats.gunners>1?'s':''}.`:'';
    const fmt=(x,d=1)=>x.toFixed(d).replace('.',',');
    const card=(value,label)=>`<div><b>${value}</b><small>${label}</small></div>`;
    function finish(reason){
      running=false;lockAttempt++;summaryReason=reason;clearInputs();document.body.classList.remove('flying');$('mouseMode').hidden=true;if(document.pointerLockElement)document.exitPointerLock();
      showScreen('results');$('resultTitle').textContent=reason;
      const mode=MODE_OF(run.scenario),accuracy=stats.shots?(100*stats.hits/stats.shots).toFixed(1)+' %':'—',a=defense.stats,dodged=dodgedCount(a),b=battle.stats;
      const kills=Object.entries(killsBy).map(([k,n])=>`${n} ${k}`).join(', ')||'aucune';
      if(mode==='duel'&&duel){
        const d=duel,level={easy:'Découverte',normal:'Normal',real:'Réaliste'}[run.difficulty],exposed=time?Math.round(d.exposed/time*100):0;
        $('resultStats').innerHTML=card(`${d.kills} / ${stats.deaths}`,'Victoires / défaites')+card(accuracy,'Précision minigun')+card(`${d.hitsTaken} / ${d.enemyShots}`,'Impacts reçus / coups ennemis')+card(`${exposed} %`,'Temps dans l’axe des canons ennemis (< 3°, < 700 m)');
        $('resultDetail').textContent=`${bots.length} bot${bots.length>1?'s':''} niveau ${level}. Tes impacts : ${d.hitsGiven}${d.hitsGiven?`, à ${Math.round(d.hitDistance/d.hitsGiven)} m en moyenne`:''} ; précision des bots : ${d.enemyShots?fmt(100*d.hitsTaken/d.enemyShots):'—'} %. Suivi : ${time?Math.round(stats.tracked/time*100):0} % du temps avec un ennemi à moins de 2,5° de ton nez. Résistance : ${run.duelHealth} impacts de référence (36,02 points) par hélicoptère, choix d’entraînement. Vol : ${Math.round(time)} s.`;
        return;
      }
      if(mode==='match'||mode==='assault'){
        $('resultStats').innerHTML=card(score,'Score')+card(`${b.structuresDestroyed} / ${battle.structures.length}`,'Structures détruites')+card(accuracy,'Précision minigun')+card(mode==='match'?stats.deaths:b.soldiersKilled,mode==='match'?'Hélicoptères perdus':'Fantassins neutralisés');
        $('resultDetail').textContent=`Neutralisés : ${kills}. Fantassins abrités dans les bâtiments : ${b.shelterEntries} fois. Tirs ennemis reçus : ${b.hitsOnHeli} sur ${b.shotsAtHeli}.${aaActive?` Missiles esquivés ${dodged} sur ${a.launches}, impacts ${a.hits}, leurres ${a.flaresUsed}.`:''} Vol : ${Math.round(time)} s, ${stats.hits} impacts sur ${stats.shots} coups.${ciwsText()}`;
        return;
      }
      if(aaActive){
        const timing=median(a.flareTiming);
        $('resultStats').innerHTML=card(`${dodged} / ${a.launches}`,'Missiles esquivés / tirés')+card(a.hits,'Impacts de missiles reçus')+card(a.flaresUsed,`Salves de leurres${timing!==null?` · médiane ${fmt(timing)} s avant l’impact`:''}`)+card(a.launchersKilled,`Tireurs et lanceurs neutralisés${a.killedWhileEngaging?` · ${a.killedWhileEngaging} en pleine visée`:''}`);
        const verdicts={};for(const t of a.flareTiming){const v=flareVerdict(t);verdicts[v]=(verdicts[v]||0)+1;}
        const salvos=Object.entries(verdicts).map(([v,n])=>`${n} ${v}`).join(', ')||'aucune';
        $('resultDetail').textContent=`Accrochages : ${a.acquisitions}, dont ${a.brokenAcquisitions} rompus avant verrouillage (vol bas ou relief). Verrouillages : ${a.locks}, dont ${a.brokenLocks} rompus avant le tir. Esquives : leurres ${a.dodged.flare}, relief ou obstacle ${a.dodged.terrain}, manœuvre ou portée ${a.dodged.maneuver}, vol bas ${a.dodged.clutter||0}. Missiles passés de justesse (éclats) : ${a.grazes||0}. Salves de leurres : ${salvos} (bon moment = 0,35 à 3 s avant l’impact ; guides : 1 à 2 s). Hélicoptères perdus : ${stats.deaths}. Vol : ${Math.round(time)} s, ${stats.hits} impacts de minigun sur ${stats.shots} coups.${ciwsText()}`;
        return;
      }
      $('resultStats').innerHTML=card(accuracy,'Précision · impacts / projectiles tirés')+card(stats.kills,'Cibles neutralisées')+card(Math.round(time)+' s','Temps de vol')+card(stats.shots,'Projectiles tirés');
      $('resultDetail').textContent=`${stats.hits} impacts. Suivi : ${time?Math.round(stats.tracked/time*100):0} % du temps avec une cible à moins de 2,5° du nez. Les projectiles encore en vol à la fin ne sont pas comptés comme impacts.`;
    }
    const down=a=>keySet.has(bindings[a])?1:0;
    // Keys or joystick buttons (an action held on either); only used while the joystick is active, so that without it the
    // input path keeps the keys' own function.
    const downOrJoy=a=>down(a)||joyHeld(a);
    function joyHeld(a){return joy.active&&joy.frame&&joy.state.held.has(a)?1:0;}
    function fireRound(){
      const side=stats.shots%2?1:-1;
      const p=new T.Vector3(side*1.45,-.38,-2.1).applyQuaternion(flight.quaternion).add(flight.position);
      const spread=Math.tan(cfg.spread*Math.PI/180),r=Math.sqrt(Math.random())*spread,angle=Math.random()*Math.PI*2;
      const aim=new T.Vector3(-side*1.45,.38,-cfg.gunConvergence+2.1).normalize();
      const v=aim.add(new T.Vector3(Math.cos(angle)*r,Math.sin(angle)*r,0)).normalize().applyQuaternion(flight.quaternion).multiplyScalar(cfg.bulletSpeed).add(flight.velocity);
      bullets.push({p,v,age:0,previous:p.clone()});stats.shots++;if(!run.unlimitedAmmo)ammo=Math.max(0,ammo-1);
      glow.emit(p,V3(),.03,.9,.6,1,FIRE);
    }
    const canRespawn=()=>MODE_OF(run.scenario)==='duel'?run.duelRespawn:(run.scenario==='missiles'||run.aaEverywhere||MODE_OF(run.scenario)==='match'||run.enemyFire)&&run.aaRespawn;
    const LOSS={missile:'Abattu par un missile',tirs:'Abattu par les tirs au sol',heli:'Abattu par un hélicoptère ennemi',ciws:'Abattu par un canon CIWS',roquette:'Abattu par une roquette',crash:'Accident'};
    function destroyHeli(cause){
      heliAlive=false;wreck=2.4;wreckCause=cause;stats.deaths++;explosion(flight.position,1.7);shake=1.3;damageFlash=.8;roundsFiring=0;sound('hit');
      if(cause==='crash')stats.crashes++;if(['match','duel'].includes(MODE_OF(run.scenario))){score=Math.max(0,score-100);feed('Hélicoptère perdu −100',true);}
    }
    function respawnHeli(){
      flight.reset(45);syncRender();chaseZoom=0;heliAlive=true;hitsTaken=0;gun.reset();P.resetInput(mouse);bullets=[];health=100;ammo=300;fuel=1;fuelOut=false;
      if(aaActive){defense.clearThreats(5);defense.refill();}
      // The bots lose track of the helicopter and hold their fire for 4 s.
      enemyRounds=[];botGrace=time+4;for(const t of bots)t.bot.pilot.forget();
      toast(`${LOSS[wreckCause]||'Accident'} — réapparition au-dessus de l’hélipad`);
    }
    function banner(text,color,seconds=1.8){aaBanner={text,color,until:time+seconds};}
    // Window measured on the v9 missile model (tests/unit/missiles.test.js): 0.35-3 s; the guides advise 1-2 s.
    const FLARE_WINDOW=[.35,3],flareVerdict=t=>t===null?'sans missile':t<FLARE_WINDOW[0]?'trop tard':t>FLARE_WINDOW[1]?'trop tôt':'bon moment';
    const REASONS={flare:'leurres',terrain:'relief',maneuver:'manœuvre',clutter:'vol bas'};
    const dodgedCount=a=>a.dodged.flare+a.dodged.terrain+a.dodged.maneuver+(a.dodged.clutter||0);
    // Kill feed and score (the hot zone doubles the points, as in the game).
    function feed(text,bad=false,info=false){
      try{const d=document.createElement('div');d.textContent=text;if(bad)d.className='bad';if(info)d.style.borderLeftColor='#9aa3a0';const box=$('feed');if(box.prepend)box.prepend(d);else box.append(d);
        while(box.children&&box.children.length>6)box.lastChild.remove();setTimeout(()=>d.remove?.(),4300);}catch(e){}
    }
    function award(points,label,where){
      const mult=hot&&where&&Math.hypot(where.x-hot.center.x,where.z-hot.center.z)<hot.radius?2:1,p=Math.round(points*mult);score+=p;killsBy[label]=(killsBy[label]||0)+1;
      feed(`${label.toUpperCase()} +${p}${mult>1?' · ZONE ×2':''}`);
    }
    function handleDefenseEvent(e){
      if(e.type==='launch'){
        const l=e.launcher,p=e.muzzle||l.eye,axis=e.axis||V3(0,1,0),d=p.distanceTo(flight.position);
        sound('launch',{distance:d,gain:P.clamp(420/d,.12,1),pan:panOf(p)});
        // Backblast out of the rear of the tube, dust raised around the gunner, short muzzle flash.
        const rear=p.clone().addScaledVector(axis,-(l.kind==='sam'?1.8:1.65)),ground=P.terrain(rear.x,rear.z);
        for(let i=0;i<18;i++)smoke.emit(rear,axis.clone().multiplyScalar(-(5+Math.random()*9)).add(randomDir().multiplyScalar(2.5)),1.8+Math.random()*1.6,.8,5,.75,SMOKE,2.2,.5);
        if(rear.y-ground<4)for(let i=0;i<8;i++){const q=randomDir();q.y=0;smoke.emit(V3(rear.x,ground+.3,rear.z),q.multiplyScalar(5),2.5+Math.random()*2,1.2,6,.6,DUST,1.6,.3);}
        glow.emit(rear,axis.clone().multiplyScalar(-8),.18,1.2,4,1,FIRE,3);glow.emit(p,V3(),.08,.8,1.6,1,FLASH);
        const u=samSites.find(q=>q.launcher===l);if(u)u.loaded[u.next]=false;
        if(run.aaAssist)banner('DÉPART MISSILE','#ff6b55');
      }else if(e.type==='ignite'){const p=e.missile.position;glow.emit(p,V3(),.12,1.6,4.5,1,FLASH);for(let i=0;i<6;i++)smoke.emit(p,randomDir().multiplyScalar(2),2+Math.random(),.8,3.5,.6,SMOKE,1.2,.3);}
      else if(e.type==='launcherKilled'){
        // Replacements, except in the drill whose goal is to destroy every launcher.
        const l=e.launcher;if(!l.replaced&&(run.aaObjective!=='destroy'||MODE_OF(run.scenario)!=='missiles'))l.reviveAt=time+(MODE_OF(run.scenario)==='missiles'||!l.camp?25:45);
        if(e.interrupted&&e.interrupted!=='idle'&&run.aaAssist)banner(e.interrupted==='acquiring'?'TIREUR ABATTU · ACCROCHAGE ROMPU':'TIREUR ABATTU · VERROUILLAGE ROMPU','#b8f07c',2.2);
      }
      else if(e.type==='decoyed'){if(run.aaAssist)banner('MISSILE LEURRÉ','#ffd27a');}
      // v12: damage of the community databases (200 of the 400 hull points on a direct hit, blast
      // down to nothing at 10.8 m), unless a number of hits was chosen in the menu.
      else if(e.type==='hit'){explosion(flight.position,1.2);sound('hit');shake=1;hitsTaken++;damageFlash=.6;
        health=Math.max(0,health-(run.aaHitsToKill?60:M.missileDamage(e.distance||0)));
        if(run.aaHitsToKill?hitsTaken>=run.aaHitsToKill:health<=0)destroyHeli('missile');else if(run.aaAssist)banner(`MISSILE · IMPACT DIRECT · INTÉGRITÉ ${Math.round(health)} %`,'#ff6b55',2.2);}
      // Near miss: fragments only; the helicopter survives unless already weak.
      else if(e.type==='graze'){const p=e.missile.position;explosion(p,.9);sound('explosion',{distance:p.distanceTo(flight.position),pan:panOf(p)});sfx.play('impact',{gain:1});shake=.7;damageFlash=.4;
        health=Math.max(0,health-(run.aaHitsToKill?35:M.missileDamage(e.distance||M.constants.LETHAL)));
        if(health<=0)destroyHeli('missile');else if(run.aaAssist)banner(`ÉCLATS · MISSILE PASSÉ À ${fmt(e.distance)} m · INTÉGRITÉ ${Math.round(health)} %`,'#ffb35a',2.2);}
      else if(e.type==='trackLost'&&(e.reason==='maneuver'||e.reason==='clutter')){if(run.aaAssist)banner(e.reason==='maneuver'?'MISSILE DÉCROCHÉ · manœuvre':'MISSILE DÉCROCHÉ · vol bas','#b8f07c',2);}
      else if(e.type==='miss'){
        const p=e.missile.position,d=p.distanceTo(flight.position);if(e.how!=='expired'&&e.how!=='dud')explosion(p,.8);
        sound('explosion',{distance:d,gain:1,pan:panOf(p)});
        if(run.aaAssist&&REASONS[e.reason])banner('MISSILE ESQUIVÉ · '+REASONS[e.reason],'#b8f07c',2.2);
      }else if(e.type==='flares'){
        for(let i=0;i<M.constants.FLARES_PER_SALVO;i++)sfx.play('flare',{gain:.9});
        // Immediate feedback on the timing (model window 0.75-2.5 s, guides 1-2 s).
        if(run.aaAssist){const t=e.ttg;banner(t===null?'LEURRES · aucun missile en approche':`LEURRES · ${fmt(t)} s avant impact · ${flareVerdict(t)}`,flareVerdict(t)==='bon moment'?'#b8f07c':'#ffd27a',2.2);}
      }
      else if(e.type==='flareCooling'||e.type==='flareEmpty'){sound('click');if(run.aaAssist)banner(e.type==='flareEmpty'?'PLUS DE LEURRES — B sur l’hélipad':'LEURRES EN RECHARGE','#ffd27a',1.4);}
    }
    function handleBattleEvent(e){
      if(e.type==='soldierShot'){
        enemyTracers.push({a:e.from.clone(),b:e.to.clone(),age:0});
        if(e.hit&&heliAlive){health=Math.max(0,health-.8*(run.enemyAccuracy>1?1.2:1));damageFlash=Math.max(damageFlash,.12);if(Math.random()<.4)sfx.play('impact',{gain:.8});if(health<=0)destroyHeli('tirs');}
      }else if(e.type==='rocketFired')spawnRocket(e);
      // Vehicle guns (v12): a 7.62 mm minigun round takes 1.8 % (36 points at -80 % for small arms
      // on the 400-point hull), a 5.56 mm machine-gun round 0.8 %, like a rifle.
      else if(e.type==='vehicleShot'){
        enemyTracers.push({a:e.from.clone(),b:e.to.clone(),age:0});
        if(e.hits&&heliAlive){health=Math.max(0,health-e.hits*(e.gun==='minigun'?1.8:.8));damageFlash=Math.max(damageFlash,.2);sfx.play('impact',{gain:.9});if(health<=0)destroyHeli('tirs');}
      }else if(e.type==='soldierKilled'){
        const s=e.soldier;
        if(s.role==='verba')award(150,'Tireur Verba',s.position);
        else if(s.role==='rpg')award(100,`Tireur ${G.ROCKETS[s.rocketKind]?.label||'RPG'}`,s.position);
        else if(s.role==='crew'){const gun=s.emplacement&&s.emplacement.kind==='ciws';if(gun)ciwsStats.gunners++;award(80,gun?'Servant CIWS':'Servant SAM',s.position);s.position.x+=.9;s.position.y=P.terrain(s.position.x,s.position.z);}   // falls off the seat
        else award(15,'Fantassin',s.position);
      }
      else if(e.type==='structureDestroyed'){
        const st=e.structure,p=st.position.clone().add(V3(0,2,0));explosion(p,e.explode?2.2:1);sound('explosion',{distance:p.distanceTo(flight.position),pan:panOf(p)});
        if(e.explode)setTimeout(()=>{explosion(p.clone().add(randomDir().multiplyScalar(4)),1.2);sound('explosion',{distance:p.distanceTo(flight.position),pan:panOf(p),gain:.7});},350);
        award(st.points,st.label,st.position);
        if(battle.objectivesLeft===0&&MODE_OF(run.scenario)==='assault'){finish('Tous les camps sont détruits');}
      }else if(e.type==='vehicleDestroyed'){const p=e.vehicle.position;explosion(p,1.3);sound('explosion',{distance:p.distanceTo(flight.position),pan:panOf(p)});award(e.vehicle.points,{humvee:'Humvee · minigun',pickup:'Pick-up armé'}[e.vehicle.kind]||'Camion',p);}
    }
    const onPad=()=>heliAlive&&flight.onGround&&Math.hypot(flight.position.x-W.PAD.x,flight.position.z-W.PAD.z)<W.PAD.radius+3;
    function step(dt){
      time+=dt;stats.duration=time;
      const previousPosition=flight.position.clone(),previousQuaternion=flight.quaternion.clone();
      // State before this step: the frame shows the helicopter between it and the new state (render interpolation).
      renderFrom.p.copy(flight.position);renderFrom.q.copy(flight.quaternion);
      if(heliAlive){
        // Fuel: burnt in flight when resources are limited, refilled low over the helipad; empty = no power.
        const overPad=Math.hypot(flight.position.x-W.PAD.x,flight.position.z-W.PAD.z)<W.PAD.radius+3&&flight.position.y-P.terrain(flight.position.x,flight.position.z)<5;
        if(overPad)fuel=Math.min(1,fuel+FUEL_REFILL*dt);else if(!run.unlimitedAmmo&&!flight.onGround)fuel=Math.max(0,fuel-(FUEL_BASE+FUEL_PER_KMH*flight.velocity.length()*3.6)*dt);
        if(fuel<=0&&!fuelOut){fuelOut=true;toast('Panne sèche : plus de puissance, pose-toi en planant');feed('PANNE SÈCHE',true);}else if(fuel>.02)fuelOut=false;
        // Keys and mouse through the shared input path (physics.js inputStep): measured rate law, or the v12
        // virtual stick (amplified small movements, saturating at the key rates) and the compatibility mode.
        flight.cfg=cfg;const input=P.inputStep(mouse,cfg,joy.active?downOrJoy:down,dt,fuelOut,compatInput);
        // Joystick (HOTAS on, read this frame): its commands added to the keys and mouse (physics.js joystickMix).
        if(joy.active)J.joystickMix(input,joy.frame.cmd,fuelOut);
        flight.step(dt,input);
        // Sweep the fuselage, tail and rotor rim between physics steps.
        for(const [x,y,z,r] of [[0,0,0,1.15],[0,1.2,4.5,.5],[4.7,1.9,0,.3],[-4.7,1.9,0,.3],[0,1.9,-4.7,.3],[0,1.9,4.7,.3]]){
          const local=new T.Vector3(x,y,z),a=local.clone().applyQuaternion(previousQuaternion).add(previousPosition),b=local.applyQuaternion(flight.quaternion).add(flight.position);
          if(obstacles.hit(a,b,r)){flight.crashed=true;break;}
        }
        // Power-line wires: rotor disc against every wire segment nearby.
        if(!flight.crashed&&W.distanceToPowerLine(flight.position.x,flight.position.z)<80)for(const s of wires)if(M.segmentDistance(flight.position,s.a,s.b)<4.4){flight.crashed=true;break;}
        if(flight.crashed){if(canRespawn()){destroyHeli('crash');}else{finish('Hélicoptère accidenté');return;}}
        else if(Math.hypot(flight.position.x-W.PAD.x,flight.position.z-W.PAD.z)>3400){finish('Limite du terrain atteinte');return;}
      }else{
        wreck-=dt;
        if(wreck<=0){if(canRespawn())respawnHeli();else{finish(LOSS[wreckCause]||'Abattu par un missile');return;}}
      }
      for(const t of targets){
        t.previous.copy(t.group.position);
        if(t.bot)stepBot(t,dt);
        else if(t.convoy){const v=t.convoy;t.group.position.copy(v.position);t.group.rotation.y=v.heading;}
        else if(!t.tower&&!t.aa&&!t.ciws){
          if(run.trajectory==='evasive')t.group.position.copy(t.motion.step(dt,obstacles));
          else {const next=targetPosition(t,time);if(!obstacles.hit(t.group.position,next,t.air?6:2.8))t.group.position.copy(next);}
          const direction=t.group.position.clone().sub(t.previous);
          if(direction.lengthSq()>1e-8){
            const heading=Math.atan2(-direction.x,-direction.z),delta=Math.atan2(Math.sin(heading-t.group.rotation.y),Math.cos(heading-t.group.rotation.y));
            t.group.rotation.order='YXZ';t.group.rotation.y+=delta*(1-Math.exp(-dt*2.5));
            if(t.air){t.group.rotation.z+=(P.clamp(-delta*.5,-.6,.6)-t.group.rotation.z)*(1-Math.exp(-dt*3));t.group.rotation.x+=(-Math.atan2(direction.y,Math.hypot(direction.x,direction.z))-t.group.rotation.x)*(1-Math.exp(-dt*2));}
          }
        }
        if(t.rotor&&(t.active||t.bot&&t.bot.falling)){t.rotor.rotation.y+=dt*35;t.tail.rotation.y+=dt*50;}if(t.spin)t.spin(t.active||t.bot&&t.bot.falling?1:0,dt>0?t.group.position.distanceTo(t.previous)/dt:0);
        if(!t.active&&!t.tower&&!t.aa&&!t.convoy&&!t.ciws&&time>=t.respawn){
          if(t.bot){if(!t.bot.falling)respawnBot(t);}
          else{t.active=true;t.health=t.maxHealth;t.group.visible=true;t.damageTotal=0;t.hitCount=0;t.lastHit=-100;}
        }
        t.group.updateMatrixWorld(true);
      }
      const forward=new T.Vector3(0,0,-1).applyQuaternion(flight.quaternion);
      if(targets.some(t=>t.active&&forward.dot(t.group.position.clone().sub(flight.position).normalize())>Math.cos(2.5*Math.PI/180)))stats.tracked+=dt;
      gun.cfg=cfg;const canFire=heliAlive&&!!downOrJoy('fire')&&(run.unlimitedAmmo||ammo>0);const rounds=gun.step(dt,heliAlive&&!!downOrJoy('fire'));roundsFiring=rounds&&canFire?.12:Math.max(0,roundsFiring-dt);
      if(canFire)for(let r=0;r<rounds&&(run.unlimitedAmmo||ammo>0);r++)fireRound();
      for(let i=bullets.length-1;i>=0;i--){
        const b=bullets[i];b.previous.copy(b.p);b.v.y-=9.81*dt;b.p.addScaledVector(b.v,dt);b.age+=dt;let remove=false;
        const wall=obstacles.hit(b.previous,b.p);
        let victim=null,nearest=wall?wall.fraction:Infinity,impact=null,soldierHit=null;
        for(const t of targets)if(t.active){
          const hit=P.sweptMesh(b.previous,b.p,t.previous,t.group,t.radius);
          if(hit&&hit.fraction<nearest){nearest=hit.fraction;victim=t;impact=hit.point;}
        }
        if(battle.soldiers.length){const s=battle.hitSoldier(b.previous,b.p);if(s&&s.fraction<nearest){nearest=s.fraction;soldierHit=s;victim=null;}}
        const damage=P.hitDamage(cfg);
        if(soldierHit){stats.hits++;stats.damage=(stats.damage||0)+damage;hitFlash=.15;remove=true;burst(soldierHit.point,.3);battle.damageSoldier(soldierHit.soldier,damage/36.02);}
        else if(victim){
          stats.hits++;stats.damage=(stats.damage||0)+damage;
          victim.damageTotal+=damage;victim.hitCount++;victim.lastHit=time;victim.lastDamage=damage;
          // Health controls remain reference hits to preserve existing practice
          // durability. One reference hit = 36.02 damage points (video baseline).
          if(!run.indestructible||victim.aa||victim.convoy||victim.enemyHeli||victim.ciws)victim.health=Math.max(0,victim.health-damage/36.02);
          hitFlash=.15;remove=true;burst(impact,.45,true);
          if(victim.bot){victim.bot.pilot.hit();victim.bot.lastPlayerHit=time;if(duel){duel.hitDistance+=b.p.distanceTo(flight.position);duel.hitsGiven++;}}
          if(victim.convoy&&victim.convoy.alive){battle.damageVehicle(victim.convoy,damage/36.02);if(!victim.convoy.alive){victim.active=false;victim.group.traverse(o=>{if(o.isMesh&&o.material.color)o.material=o.material.clone(),o.material.color.multiplyScalar(.25);});stats.kills++;}}
          else if(victim.bot&&victim.health<=1e-8)botDown(victim,'shot');
          else if(victim.ciws&&victim.health<=1e-8)destroyCiws(victim);
          else if(victim.samSite&&victim.health<=1e-8)destroySamSite(victim);
          else if(victim.health<=1e-8){victim.active=false;victim.respawn=time+(victim.enemyHeli?45:2);stats.kills++;
            if(!victim.convoy)victim.group.visible=false;
            explosion(victim.group.position,victim.air?1.1:.6);
            if(victim.enemyHeli)award(200,'Hélicoptère ennemi',victim.group.position);
            else if(MODE_OF(run.scenario)!=='range')award(victim.points||20,victim.tower?'Défenseur':'Cible',victim.group.position);}
        }
        else if(wall){remove=true;const p=b.previous.clone().lerp(b.p,wall.fraction);burst(p,.4,wall.kind!=='arbre');
          if(wall.owner){stats.hits++;wall.owner.lastHit=time;battle.damageStructure(wall.owner,damage/36.02);}
          if(battle.soldiers.length&&i%3===0)battle.panic(p,12);}
        if(!remove&&b.p.y<P.terrain(b.p.x,b.p.z)){burst(b.p,.5);if(battle.soldiers.length&&i%3===0)battle.panic(b.p,12);remove=true;}
        if(remove||b.age>3)bullets.splice(i,1);
      }
      stepEnemyRounds(dt,previousPosition);stepRockets(dt,previousPosition);
      if(!running)return;
      // Duel: time spent in an enemy's gun line (within 3 deg of its nose, inside 700 m).
      if(duel&&heliAlive){
        if(bots.some(t=>{if(!t.active)return false;const f=t.bot.flight,d=flight.position.clone().sub(f.position),l=d.length();return l<700&&_fwd.set(0,0,-1).applyQuaternion(f.quaternion).dot(d.divideScalar(l))>Math.cos(3*Math.PI/180);}))duel.exposed+=dt;
        if(!run.duelRespawn&&bots.length&&bots.every(t=>!t.active&&!t.bot.falling)){finish('Victoire : tous les hélicoptères ennemis sont abattus');return;}
      }
      for(const fx of effects)if(fx.life>0){fx.life-=dt;fx.mesh.visible=fx.life>0;fx.mesh.scale.setScalar(fx.max*(1.3-fx.life));fx.mesh.material.opacity=Math.max(0,fx.life*1.8);}
      hitFlash=Math.max(0,hitFlash-dt);
      // Ground battle: infantry, trucks, structures.
      if(battle.structures.length||battle.soldiers.length||battle.vehicles.length){
        battle.step(dt,{position:flight.position,velocity:flight.velocity,firing:roundsFiring>0,alive:heliAlive});
        for(const e of battle.events.splice(0))handleBattleEvent(e);
        if(!running)return;
      }
      // Hot zone moves every 3 minutes to another camp.
      if(hot){hot.next-=dt;if(hot.next<=0&&battle.camps.length>1){const others=battle.camps.filter(c=>c!==hot.camp),c=others[Math.floor(Math.random()*others.length)];hot.center.set(c.x,c.y,c.z);hot.camp=c;hot.next=180;placeHotRing();feed('LA ZONE CHAUDE SE DÉPLACE',false,true);
        for(const t of bots)if(t.bot.pilot.home){t.bot.pilot.home.x=c.x;t.bot.pilot.home.z=c.z;}}}
      // Flares work in every exercise; launchers exist only with the SAM drill.
      // Latched on key/button down so a very short tap is never missed.
      if(flareRequest){flareRequest=false;if(heliAlive)defense.deployFlares(flight);}
      // Launchers follow their gunner or emplacement (tube, turret, crew seat).
      syncAirUnits(dt);
      defense.step(dt,{position:flight.position,velocity:flight.velocity,quaternion:flight.quaternion,agl:flight.position.y-P.terrain(flight.position.x,flight.position.z),alive:heliAlive});
      for(const e of defense.events.splice(0))handleDefenseEvent(e);
      if(!running)return;
      // Unlimited-ammo drills restock flares after 3 s on the helipad; limited ones use B.
      if(onPad()&&run.unlimitedAmmo){padTimer+=dt;if(padTimer>=3&&defense.charges<cfg.flareCharges){defense.refill();toast('Leurres rechargés sur l’hélipad');}}else padTimer=0;
      if(aaActive){
        for(const l of defense.launchers)if(l.dead&&l.reviveAt&&time>=l.reviveAt)reviveLauncher(l);
        if(run.aaObjective==='destroy'&&run.scenario==='missiles'&&defense.launchers.length&&defense.launchers.every(l=>l.dead)){finish('DCA neutralisée');return;}
      }
      if(run.scenario==='towers'){
        for(const tower of towers){
          if(tower.captured)continue;
          const cleared=!targets.some(t=>t.tower===tower&&t.active),near=Math.hypot(flight.position.x-tower.x,flight.position.z-tower.z)<28;
          const steady=flight.position.y>tower.height+5&&flight.position.y<tower.height+25&&flight.velocity.length()<11;
          if(heliAlive&&cleared&&near&&steady)tower.capture=Math.min(10,tower.capture+dt);else tower.capture=Math.max(0,tower.capture-dt*.5);
          if(tower.capture>=10){tower.captured=true;tower.flag.material.color.set('#9bd66b');tower.beacon.material.color.set('#9bd66b');toast(`Tour ${tower.id+1} capturée`);}
        }
        if(towers.every(t=>t.captured)){finish('Les trois tours sont capturées');return;}
      }
      if(run.duration&&time>=run.duration)finish('Session terminée');
    }
    // Pilot's eye in the helicopter frame (cockpit view).
    const EYE=new T.Vector3(0,.8,-1.35),_eye=new T.Vector3();
    let chaseYaw=0;const tmpQ=new T.Quaternion(),pitchOffset=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.06);
    // Render interpolation (v13): physics steps at a fixed 1/120 s while a display may run at, for example, 100 Hz,
    // i.e. 1,1,1,1,2 steps a frame: raw states jump 0.648 / 1.296 m at 280 km/h (per-frame displacement CV 33 %
    // at 100 Hz). Each frame now shows the
    // helicopter, cockpit eye, chase camera and HUD attitude between the last two steps at alpha =
    // accumulator x 120, a constant 1/120 s behind the physics. Physics and collisions are unchanged.
    const renderFrom={p:new T.Vector3(),q:new T.Quaternion()},pose={p:new T.Vector3(),q:new T.Quaternion()};let renderAlpha=1;
    function syncRender(){renderFrom.p.copy(flight.position);renderFrom.q.copy(flight.quaternion);}
    function renderPose(){
      if(renderAlpha>=1){pose.p.copy(flight.position);pose.q.copy(flight.quaternion);}
      else{pose.p.lerpVectors(renderFrom.p,flight.position,renderAlpha);pose.q.slerpQuaternions(renderFrom.q,flight.quaternion,renderAlpha);}
      return pose;
    }
    // Moving targets (bots, air targets, trucks) are drawn between their last two steps as well (t.previous is the
    // position before the last step), so they do not jump against the smooth view; jumps over 20 m (respawns) are
    // not interpolated. Their physics positions and matrices are restored right after the frame is drawn.
    const _tp=[];
    function interpolateTargets(){
      _tp.length=0;if(renderAlpha>=1)return;
      for(const t of targets){const p=t.group.position,q=t.previous;if(!q||p.equals(q)||p.distanceToSquared(q)>400)continue;_tp.push(t,p.clone());p.lerpVectors(q,p,renderAlpha);}
    }
    function restoreTargets(){for(let i=0;i<_tp.length;i+=2){const t=_tp[i];t.group.position.copy(_tp[i+1]);t.group.updateMatrixWorld(true);}_tp.length=0;}
    // Chase view widening with speed (v13, measured on the reference recordings, docs/analyse/sensations.md): camera /
    // tape rotation ratio = focal length at speed / focal at 85 deg, from background flow vs tape rate (tape rate 6-80 deg/s),
    // median per band: 81-87 deg up to 140 km/h, 98.6 at 155-170 (n=320), 102.4 at 170-185 (n=176), then 106.9 / 108.8 /
    // 109.2 / 107.9 / 111.0 deg at 185-200 / 200-215 / 215-230 / 230-260 / 260-300 km/h (n=138/126/93/109/674; the
    // steady-turn focal fit gives 110-111 at 170-230). Ramp 85 -> 109 deg from 140 to 190 km/h: every band from 110 km/h
    // up within -0.032..+0.038 of the game ratio (M14: +-0.05; 95-110 km/h -0.066 as before). The stabiliser shrinks to
    // 0.51-0.58 of its hover size above 183 km/h (16 frames, +-10 %): with 109 deg that is a x1.11 camera offset
    // (14 -> 15.5 m; span 201 -> 111 px at 1080p, ratio 0.552). Linear ramp and 0.5 s smoothing assumed. The pilot
    // view never widens.
    const CHASE_ZOOM={v0:140,v1:190,fov:24,dist:.11,tau:.5};let chaseZoom=0;
    function horizontalFov(){return view==='chase'&&hasSession?cfg.fovChase+(cfg.chaseSpeedView?CHASE_ZOOM.fov*chaseZoom:0):cfg.fovCockpit;}
    // HUD heading: the airframe in the pilot view; in the chase view the game's tape follows the camera heading
    // chaseYaw (measured: zero lag between background flow and tape during yaw). The free-look part (+ lookYaw) is
    // assumed: the reference recordings contain no free-look use (chase frames at 2 Hz, background flow vs tape at
    // 60 Hz, cockpit gunsight at 10 Hz), so they cannot show it; players do use free look in the chase view.
    function tapeHeading(att){return view==='chase'&&hasSession&&heliAlive?((-(chaseYaw+lookYaw)*180/Math.PI)%360+360)%360:(att||P.attitudeOf(renderPose().q)).heading;}
    function updateCamera(dt=0){
      const at=renderPose();
      own.group.position.copy(at.p);own.group.quaternion.copy(at.q);
      own.group.visible=(view==='chase'||!hasSession)&&heliAlive;
      // Chase zoom state follows the speed in both views (a switch to the chase view at speed is already wide).
      const zoomTo=cfg.chaseSpeedView?P.clamp((flight.velocity.length()*3.6-CHASE_ZOOM.v0)/(CHASE_ZOOM.v1-CHASE_ZOOM.v0),0,1):0;
      chaseZoom=dt?chaseZoom+(zoomTo-chaseZoom)*(1-Math.exp(-dt/CHASE_ZOOM.tau)):zoomTo;
      // Horizontal fields of view of the game's settings (pilot view, chase view), the chase view widening
      // with speed as measured. No other widening: the game has none.
      camera.fov=vfov(horizontalFov());camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
      if(!hasSession){camera.position.set(-9,4.2,146);camera.lookAt(0,1.4,128);own.group.position.set(W.PAD.x,1.25,W.PAD.z);followShadow(camera.position);camera.updateMatrixWorld(true);return;}
      // Releasing free look (assumed; no source found and absent from the reference recordings, not measured yet): the
      // pilot view snaps back, the chase view eases back with 0.25 s (chosen).
      // Look axes of a joystick (joy.stickLook) hold the view like free look.
      if(!freeLookHeld&&!joy.stickLook&&dt){if(view==='cockpit'){lookYaw=0;lookPitch=0;}else{const k=1-Math.exp(-dt/.25);lookYaw-=lookYaw*k;lookPitch-=lookPitch*k;}}
      if(!heliAlive&&dt){
        // After a loss the camera backs away from the wreck and keeps it in view.
        const back=camera.position.clone().sub(at.p);back.y=Math.max(back.y,2);back.setLength(Math.min(70,back.length()+dt*22));
        camera.position.copy(at.p).add(back);camera.up.set(0,1,0);camera.lookAt(at.p);
      }
      if(heliAlive){
        const offset=view==='chase'?new T.Vector3(0,4.5,14):EYE.clone();
        camera.position.copy(offset.applyQuaternion(at.q).add(at.p));camera.quaternion.copy(at.q);
        if(view==='cockpit'){
          // Raised sightline puts the weapon sight below centre, as in the reference.
          camera.quaternion.multiply(pitchOffset).multiply(tmpQ.setFromEuler(new T.Euler(lookPitch,lookYaw,0,'YXZ')));
          // No vibration: the game's pilot view is steady.
        }
        // The recorded chase view stays level while the aircraft banks and follows
        // the heading with a short lag. Framing matched to the recordings: camera
        // looking 10 deg down, helicopter ~9 deg below the view axis and about a
        // quarter of the screen height (14 m behind, 4.8 m above in hover; x1.11 at speed).
        const nose=new T.Vector3(0,0,-1).applyQuaternion(at.q);
        const yaw=Math.hypot(nose.x,nose.z)>1e-3?Math.atan2(-nose.x,-nose.z):chaseYaw;
        if(view!=='chase'||!dt)chaseYaw=yaw;
        else chaseYaw+=Math.atan2(Math.sin(yaw-chaseYaw),Math.cos(yaw-chaseYaw))*(1-Math.exp(-dt/.3));
        if(view==='chase'){
          const look=chaseYaw+lookYaw,ahead=new T.Vector3(-Math.sin(look),0,-Math.cos(look)),tilt=P.clamp(10*Math.PI/180-lookPitch,-1.2,1.3),d=cfg.chaseSpeedView?1+CHASE_ZOOM.dist*chaseZoom:1;
          camera.position.copy(at.p).addScaledVector(ahead,-14*d*Math.cos(tilt-.17));camera.position.y+=d*(4.8+14*Math.sin(tilt-.17));
          const dir=ahead.clone().multiplyScalar(Math.cos(tilt));dir.y=-Math.sin(tilt);
          camera.up.set(0,1,0);camera.lookAt(camera.position.clone().addScaledVector(dir,100));
        }
      }
      // Jolt of an impact: a small angular jolt in the pilot view (the cockpit stays around the
      // eye), a shift of the camera in the chase view.
      if(shake>0){if(view==='cockpit'&&heliAlive){const a=shake*.007;camera.quaternion.multiply(tmpQ.setFromEuler(new T.Euler((Math.random()-.5)*a,(Math.random()-.5)*a,0)));}else camera.position.add(randomDir().multiplyScalar(shake*.6));shake=Math.max(0,shake-dt*2.2);}
      followShadow(at.p);camera.updateMatrixWorld(true);
    }
    function followShadow(focus){sun.target.position.copy(focus);sun.position.copy(focus).addScaledVector(sunDirection,1000);sun.target.updateMatrixWorld();}
    // ---- 3D cockpit (v10), second render pass with its own camera (near plane 2 cm) ----
    // models.cockpit() rebuilds the game's pilot view around the eye; the pass is drawn
    // over the valley after clearing the depth buffer, so free look shows it in place.
    const cockpitScene=new T.Scene(),cockpitCam=new T.PerspectiveCamera(cfg.fov,innerWidth/innerHeight,.02,8),cockpit=models.cockpit(canvasFactory);
    cockpitScene.add(new T.HemisphereLight('#dde8f4','#5b6249',environment?.7:1.5),cockpit.group);if(environment)cockpitScene.environment=environment;cockpitRef=cockpitScene;
    {const light=new T.DirectionalLight('#fff1da',2.4);light.position.copy(sunDirection);cockpitScene.add(light);cockpitSun=light;}
    pickLight();
    let mfdClock=0;
    function renderCockpit(dt){
      if(view!=='cockpit'||!heliAlive||!hasSession||!renderer.clearDepth)return;
      const at=renderPose();cockpit.group.quaternion.copy(at.q);
      // Head vibration and shake: the camera's offset from the eye, in world axes.
      cockpitCam.position.copy(camera.position).sub(at.p).sub(_eye.copy(EYE).applyQuaternion(at.q));
      cockpitCam.quaternion.copy(camera.quaternion);cockpitCam.fov=camera.fov;cockpitCam.aspect=camera.aspect;cockpitCam.updateProjectionMatrix();
      mfdClock-=dt;if(cockpit.mfd&&mfdClock<=0){mfdClock=.1;const a=P.attitudeOf(at.q);cockpit.mfd.update({heading:a.heading,bank:a.bank,pitch:a.pitch});}
      renderer.autoClear=false;renderer.clearDepth();renderer.render(cockpitScene,cockpitCam);renderer.autoClear=true;
    }
    // HUD laid out like the game's helicopter HUD measured on the recordings
    // (1080p reference, scaled with the window height): heading tape (7.61 px
    // per degree, labels every 15 deg), attitude widget (roll marks, pitch
    // triangles 0.40 deg/px clipped at 30 deg, collective arcs) and SPD/ALT boxes.
    // Original drawing; it reproduces the layout, not the game's artwork.
    const CARDINALS=['N','NE','E','SE','S','SW','W','NW'],HUD_FONT='Bahnschrift, "Segoe UI", Arial, sans-serif';
    // Height of the skids above whatever lies below. The game's AGL counts trees and roofs
    // (sudden drops at constant ASL, analysis v7), and reads 0 / ASL 84 on the helipad.
    const SKID=1.25,_agl0=V3(),_agl1=V3();
    function hudAGL(){
      const p=flight.position,base=p.y-SKID,g=P.terrain(p.x,p.z);if(base-g<.3)return Math.max(0,base-g);
      _agl0.set(p.x,base,p.z);_agl1.set(p.x,g-.5,p.z);const hit=obstacles.hit(_agl0,_agl1);
      return Math.max(0,hit?(base-g+.5)*hit.fraction:base-g);
    }
    function drawFlightHud(w,h){
      const k=h/1080,cx=w/2,cy=h-134.4*k,att=P.attitudeOf(renderPose().q),light='rgba(236,240,234,.93)',dim='rgba(18,24,21,.55)';
      ctx.save();ctx.lineCap='butt';
      // Collective arcs: lit from the horizontal toward +-45 deg with the lever.
      const R=66.2*k,deg=Math.PI/180,lever=P.clamp(flight.collective,-1,1);
      ctx.lineWidth=5.3*k;
      for(const side of [1,-1]){
        const base=side>0?0:Math.PI,arc=(a0,a1,col)=>{ctx.strokeStyle=col;ctx.beginPath();ctx.arc(cx,cy,R,Math.min(a0,a1),Math.max(a0,a1));ctx.stroke();};
        arc(base-46*deg,base+46*deg,dim);
        const reach=lever*45*deg*(side>0?-1:1);
        if(Math.abs(lever)>.01)arc(base,base+reach,light);
        arc(base-3.5*deg,base+3.5*deg,light);
      }
      // Pitch scale ticks and triangles.
      ctx.fillStyle=light;
      for(let i=-3;i<=3;i++){ctx.fillRect(cx-78*k,cy+i*16.8*k-.7*k,5*k,1.4*k);ctx.fillRect(cx+73*k,cy+i*16.8*k-.7*k,5*k,1.4*k);}
      const ty=cy+P.clamp(-att.pitch/.40,-75,75)*k;
      ctx.beginPath();ctx.moveTo(cx-86*k,ty-4.5*k);ctx.lineTo(cx-79.5*k,ty);ctx.lineTo(cx-86*k,ty+4.5*k);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(cx+86*k,ty-4.5*k);ctx.lineTo(cx+79.5*k,ty);ctx.lineTo(cx+86*k,ty+4.5*k);ctx.closePath();ctx.fill();
      // Roll marks: two segments on a line through the centre, tilted with the bank.
      const b=att.bank*deg,cb=Math.cos(b),sb=Math.sin(b);ctx.strokeStyle=light;ctx.lineWidth=2*k;ctx.beginPath();
      for(const s of [1,-1]){ctx.moveTo(cx+s*43*k*cb,cy+s*43*k*sb);ctx.lineTo(cx+s*59*k*cb,cy+s*59*k*sb);}ctx.stroke();
      // Helicopter symbol seen from above (fixed).
      const hy=cy-10*k;ctx.strokeStyle='rgba(236,240,234,.8)';ctx.lineWidth=2.4*k;ctx.beginPath();
      ctx.moveTo(cx-39*k,hy);ctx.lineTo(cx-10*k,hy);ctx.moveTo(cx+10*k,hy);ctx.lineTo(cx+39*k,hy);
      for(const [x,y] of [[-22,-26],[22,-26],[-22,22],[22,22]]){ctx.moveTo(cx+x*.35*k,hy+y*.35*k);ctx.lineTo(cx+x*k,hy+y*k);}
      ctx.moveTo(cx,hy+11*k);ctx.lineTo(cx,hy+36*k);ctx.moveTo(cx+4*k,hy+30*k);ctx.lineTo(cx+4*k,hy+40*k);ctx.stroke();
      ctx.fillStyle='rgba(58,64,61,.85)';ctx.beginPath();ctx.ellipse(cx,hy,8*k,12*k,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      // SPD / ALT boxes, positioned as on the recordings. ASL = skid height + 84 m (helipad: AGL 0, ASL 84).
      const altitude=hudAGL();
      ctx.font=`${Math.round(15*k)}px ${HUD_FONT}`;ctx.lineWidth=1.3*k;ctx.strokeStyle=light;ctx.fillStyle=light;ctx.textBaseline='middle';
      ctx.strokeRect(cx-168*k,cy-50.6*k,72*k,23*k);ctx.strokeRect(cx+96*k,cy-50.6*k,72*k,23*k);
      ctx.textAlign='left';ctx.fillText('SPD',cx-165*k,cy-39*k);ctx.fillText('ALT',cx+99*k,cy-39*k);
      ctx.fillText('KM/H',cx-165*k,cy-14*k);ctx.fillText('AGL',cx+99*k,cy-14*k);ctx.fillText('ASL',cx+99*k,cy+8*k);
      ctx.textAlign='right';ctx.fillText(String(Math.round(flight.velocity.length()*3.6)),cx-96*k,cy-14*k);
      ctx.fillText(String(Math.round(altitude)),cx+166*k,cy-14*k);ctx.fillText(String(Math.round(flight.position.y-SKID+W.ASL_OFFSET)),cx+166*k,cy+8*k);
      // Fuel gauge under the widget, as on the recordings (1080p: x 917-1022, y 1009-1014): pump
      // icon and 10 segments filled continuously; amber below 20 %, red below 10 % (trainer aid).
      {const fx0=cx-43*k,fy=cy+63.4*k,pitch=10.5*k,segW=8.5*k,segH=5.5*k,col=fuel<.1?'#ff6a55':fuel<.2?'#ffb35a':light;
       for(let i=0;i<10;i++){const x=fx0+i*pitch,f=P.clamp(fuel*10-i,0,1);ctx.fillStyle='rgba(236,240,234,.3)';ctx.fillRect(x,fy,segW,segH);if(f>0){ctx.fillStyle=col;ctx.fillRect(x,fy,segW*f,segH);}}
       ctx.strokeStyle='rgba(236,240,234,.75)';ctx.lineWidth=1.2*k;ctx.beginPath();ctx.moveTo(fx0-2*k,fy-1*k);ctx.lineTo(fx0-2*k,fy+segH+2.5*k);ctx.lineTo(fx0+10*pitch,fy+segH+2.5*k);ctx.lineTo(fx0+10*pitch,fy-1*k);ctx.stroke();
       const px=cx-62*k,py=fy-4*k;ctx.fillStyle=fuel<.1?'#ff6a55':light;ctx.fillRect(px,py,8*k,12*k);ctx.fillRect(px-1*k,py+12*k,10*k,1.6*k);ctx.fillStyle='rgba(30,34,32,.9)';ctx.fillRect(px+1.5*k,py+1.5*k,5*k,3.5*k);
       ctx.strokeStyle=fuel<.1?'#ff6a55':light;ctx.lineWidth=1.3*k;ctx.beginPath();ctx.moveTo(px+8*k,py+2*k);ctx.lineTo(px+10.5*k,py+4*k);ctx.lineTo(px+10.5*k,py+10*k);ctx.lineTo(px+9*k,py+11*k);ctx.stroke();}
      // Airframe integrity once damaged (full match, return fire).
      if(health<100){ctx.textAlign='left';ctx.fillStyle=health<35?'#ff7a60':light;ctx.fillText(`INTÉGRITÉ ${Math.ceil(health)} %`,cx-168*k,cy+8*k);ctx.fillStyle='rgba(18,24,21,.55)';ctx.fillRect(cx-168*k,cy+19*k,72*k,4*k);ctx.fillStyle=health<35?'#ff7a60':light;ctx.fillRect(cx-168*k,cy+19*k,72*k*health/100,4*k);}
      // Heading tape: labels every 15 deg, three ticks between labels; the camera's heading in the chase view.
      const H=tapeHeading(att),ppd=7.61*k,ty0=35*k;ctx.textAlign='center';ctx.fillStyle=light;ctx.font=`${Math.round(14*k)}px ${HUD_FONT}`;
      for(let x=-320;x<320;x+=10){ctx.globalAlpha=Math.max(0,1-Math.abs(x)/330);ctx.fillRect(cx+x*k,55*k,6*k,Math.max(1,1.2*k));}ctx.globalAlpha=1;
      for(let d=Math.ceil((H-44)/1.5)*1.5;d<=H+44;d+=1.5){
        const x=cx+(d-H)*ppd,m=((d%15)+15)%15;if(Math.abs(x-cx)<40*k)continue;
        const a=Math.max(0,1-Math.abs(x-cx)/(330*k));ctx.globalAlpha=a;
        if(Math.abs(m)<1e-6||Math.abs(m-15)<1e-6){const lab=((Math.round(d)%360)+360)%360;ctx.fillText(String(lab).padStart(3,'0'),x,ty0);}
        else if([4.5,7.5,10.5].some(v=>Math.abs(m-v)<1e-6))ctx.fillRect(x-1*k,ty0-7*k,2*k,14*k);
      }
      ctx.globalAlpha=1;ctx.strokeRect(cx-36*k,ty0-13*k,72*k,26*k);
      const hd=Math.floor(H+1e-6)%360;ctx.fillText(`${String(hd).padStart(3,'0')} ${CARDINALS[Math.round(H/45)%8]}`,cx,ty0);
      ctx.restore();
    }
    const keyName=a=>bindings[a]==='Unbound'?'—':(KEY_NAMES[bindings[a]]||bindings[a].replace('Key','')).replace(' gauche','').replace('Maj','⇧');
    // Weapon widgets placed as in the game (bottom right): flares "V / 002", ammunition "FMJ 300".
    function drawWeapons(w,h){
      const k=h/1080,x=w-325*k,y=h-145*k,key=keyName('flares');
      ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle='rgba(236,240,234,.92)';ctx.fillRect(x-11*k,y-11*k,22*k,22*k);ctx.fillStyle='#1b2320';ctx.font=`bold ${Math.round(13*k)}px ${HUD_FONT}`;ctx.fillText(key.length>3?key.slice(0,3):key,x,y);
      const bx=x-32*k,by=y+20*k,bw=64*k,bh=58*k,cool=cfg.flareCooldown>0?defense.cooldown/cfg.flareCooldown:0;
      ctx.fillStyle='rgba(60,66,64,.72)';ctx.fillRect(bx,by,bw,bh);if(cool>0){ctx.fillStyle='rgba(20,24,22,.75)';ctx.fillRect(bx,by,bw,bh*cool);}
      ctx.strokeStyle=defense.charges>0||run.flareUnlimited?'rgba(236,240,234,.95)':'rgba(255,120,100,.95)';ctx.lineWidth=2.2*k;ctx.beginPath();
      for(let i=0;i<8;i++){const a=i*Math.PI/4,r0=i%2?6*k:9*k,r1=i%2?13*k:17*k;ctx.moveTo(x+Math.cos(a)*r0,by+22*k+Math.sin(a)*r0);ctx.lineTo(x+Math.cos(a)*r1,by+22*k+Math.sin(a)*r1);}ctx.stroke();
      ctx.fillStyle='rgba(236,240,234,.95)';ctx.font=`${Math.round(13*k)}px ${HUD_FONT}`;ctx.fillText(run.flareUnlimited?'∞':String(defense.charges).padStart(3,'0'),x,by+49*k);
      // Ammunition: magazine icons, FMJ tag, large count, secondary slot.
      const ax=w-190*k,ay=h-92*k;ctx.fillStyle='rgba(236,240,234,.95)';
      for(let i=0;i<3;i++)ctx.fillRect(ax-40*k+i*7*k,ay+2*k,5*k,16*k);
      ctx.fillRect(ax-8*k,ay-30*k,9*k,34*k);ctx.beginPath();ctx.moveTo(ax-8*k,ay-30*k);ctx.lineTo(ax-3.5*k,ay-40*k);ctx.lineTo(ax+1*k,ay-30*k);ctx.fill();
      ctx.fillStyle='rgba(236,240,234,.95)';ctx.fillRect(ax-14*k,ay+8*k,22*k,13*k);ctx.fillStyle='#1b2320';ctx.font=`bold ${Math.round(9*k)}px ${HUD_FONT}`;ctx.fillText('FMJ',ax-3*k,ay+15*k);
      ctx.fillStyle=!run.unlimitedAmmo&&ammo===0?'#ff7a60':'rgba(236,240,234,.97)';ctx.font=`${Math.round(32*k)}px ${HUD_FONT}`;ctx.fillText(run.unlimitedAmmo?'∞':String(ammo).padStart(3,'0'),ax+62*k,ay);
      ctx.fillStyle='rgba(236,240,234,.6)';ctx.fillRect(ax+110*k,ay-20*k,1*k,40*k);ctx.font=`${Math.round(12*k)}px ${HUD_FONT}`;ctx.fillText('000',ax+137*k,ay+14*k);ctx.fillRect(ax+134*k,ay-26*k,5*k,18*k);
      ctx.restore();
    }
    // Key reminders on the right, like the game's list ("MONTÉE COLLECTIVE Z"...).
    function drawKeyHints(w,h){
      const k=h/1080,right=w-36*k;let y=h-383*k;
      // Same order as the game's list (interact and seat-change lines first, then these three, the last one about
      // the flares); short functional labels in French; the trainer's own keys take the first two lines.
      const lines=[['REGARD LIBRE',keyName('freeLook')],['CHANGER DE VUE',keyName('view')],['MONTÉE COLLECTIVE',keyName('collectiveUp')],['DESCENTE COLLECTIVE',keyName('collectiveDown')],['LARGUER LES LEURRES',keyName('flares')]];
      ctx.save();ctx.textBaseline='middle';ctx.font=`600 ${Math.round(16*k)}px ${HUD_FONT}`;ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=4*k;
      for(const [label,key] of lines){ctx.textAlign='right';ctx.fillStyle='rgba(236,240,234,.96)';const kw=Math.max(20*k,ctx.measureText(key).width+10*k);
        ctx.fillRect(right-kw,y-10*k,kw,20*k);ctx.fillStyle='#1b2320';ctx.shadowBlur=0;ctx.textAlign='center';ctx.font=`bold ${Math.round(12*k)}px ${HUD_FONT}`;ctx.fillText(key,right-kw/2,y);
        ctx.font=`600 ${Math.round(16*k)}px ${HUD_FONT}`;ctx.shadowBlur=4*k;ctx.fillStyle='rgba(236,240,234,.96)';ctx.textAlign='right';ctx.fillText(label,right-kw-9*k,y);y+=26*k;}
      ctx.font=`600 ${Math.round(16*k)}px ${HUD_FONT}`;ctx.letterSpacing='2px';ctx.fillText('AH-6M · MINIGUNS',right,h-168*k);
      ctx.restore();
    }
    // Mini-map (bottom left): valley pre-rendered once, north up, 1.4 km across.
    let minimap=null;const MAP={x0:-2600,z0:-3400,size:5000,px:384};
    function buildMinimap(){
      try{
        const c=canvasFactory(MAP.px,MAP.px),g=c.getContext('2d'),img=g.createImageData(MAP.px,MAP.px),s=MAP.size/MAP.px;
        for(let j=0;j<MAP.px;j++)for(let i=0;i<MAP.px;i++){
          const x=MAP.x0+i*s,z=MAP.z0+j*s,h=W.height(x,z),hx=W.height(x+s,z),shade=P.clamp(1+(h-hx)/s*1.6,.55,1.35),f=W.forestDensity(x,z,h);
          let r=112-40*f,gg=128-30*f,b=86-30*f;if(h>650){r=g2(r,200,(h-650)/200);gg=g2(gg,205,(h-650)/200);b=g2(b,210,(h-650)/200);}
          if(Math.abs(x-W.riverX(z))<16){r=70;gg=104;b=120;}else if(Math.abs(x-W.roadX(z))<5){r=gg=b=70;}else if(Math.abs(x-W.railX(z))<4){r=88;gg=80;b=70;}
          if(x>W.FACTORY.x0&&x<W.FACTORY.x1&&z>W.FACTORY.z0&&z<W.FACTORY.z1){r=110;gg=100;b=90;}
          const o=(j*MAP.px+i)*4;img.data[o]=r*shade;img.data[o+1]=gg*shade;img.data[o+2]=b*shade;img.data[o+3]=255;
        }
        g.putImageData(img,0,0);
        // v12: fields, houses, bridges and viaduct of the map.
        const k=MAP.px/MAP.size,X=x=>(x-MAP.x0)*k,Z=z=>(z-MAP.z0)*k,crop={chaume:'#a89a68',labour:'#6f5c45',vert:'#6f8a45',foin:'#979458',tournesol:'#a88c3a'};
        for(const f of W.FIELDS||[]){g.save();g.translate(X(f.x),Z(f.z));g.rotate(-f.yaw);g.fillStyle=crop[f.crop]||'#a89a68';g.globalAlpha=.85;g.fillRect(-f.w*k/2,-f.d*k/2,f.w*k,f.d*k);g.restore();}
        g.fillStyle='#b9b2a2';for(const h of W.HOUSES||[])g.fillRect(X(h.x-h.w/2),Z(h.z-h.d/2),Math.max(1.5,h.w*k),Math.max(1.5,h.d*k));
        g.strokeStyle='#cfc8b8';g.lineWidth=2;for(const b of W.BRIDGES||[]){const dx=Math.sin(b.yaw)*b.length/2,dz=Math.cos(b.yaw)*b.length/2;g.beginPath();g.moveTo(X(b.x-dx),Z(b.z-dz));g.lineTo(X(b.x+dx),Z(b.z+dz));g.stroke();}
        if(W.VIADUCT){g.strokeStyle='#d8d0bd';g.lineWidth=2.5;g.beginPath();g.moveTo(X(W.VIADUCT.x0),Z(W.VIADUCT.z));g.lineTo(X(W.VIADUCT.x1),Z(W.VIADUCT.z));g.stroke();}
        minimap=c;
      }catch(e){minimap=null;}
      function g2(a,b,t){t=P.clamp(t,0,1);return a+(b-a)*t;}
    }
    function drawMinimap(w,h){
      if(!minimap||!cfg.showMinimap)return;
      const k=h/1080,S=230*k,x0=28*k,y0=h-28*k-S,span=1400,px=MAP.px/MAP.size,cxw=flight.position.x,czw=flight.position.z;
      const sx=(cxw-span/2-MAP.x0)*px,sz=(czw-span/2-MAP.z0)*px,sw=span*px;
      ctx.save();ctx.fillStyle='rgba(12,14,13,.75)';ctx.fillRect(x0-3*k,y0-3*k,S+6*k,S+6*k);ctx.beginPath();ctx.rect(x0,y0,S,S);ctx.clip();
      ctx.globalAlpha=.92;ctx.drawImage(minimap,sx,sz,sw,sw,x0,y0,S,S);ctx.globalAlpha=1;
      const toMap=(x,z)=>[x0+(x-cxw+span/2)/span*S,y0+(z-czw+span/2)/span*S];
      if(hot){const [hx,hz]=toMap(hot.center.x,hot.center.z);ctx.strokeStyle='rgba(233,197,60,.95)';ctx.fillStyle='rgba(233,197,60,.18)';ctx.lineWidth=2*k;ctx.beginPath();ctx.arc(hx,hz,hot.radius/span*S,0,Math.PI*2);ctx.fill();ctx.stroke();}
      const [px0,pz0]=toMap(W.PAD.x,W.PAD.z);ctx.fillStyle='#e9ebe6';ctx.font=`bold ${Math.round(12*k)}px ${HUD_FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('H',px0,pz0);
      for(const v of structureViews){if(!v.st.alive)continue;const [mx,mz]=toMap(v.st.position.x,v.st.position.z);ctx.fillStyle='#ffb15a';ctx.fillRect(mx-2.5*k,mz-2.5*k,5*k,5*k);}
      for(const t of targets){if(!t.active)continue;if(t.aa&&!(t.aa.revealed>0))continue;if(t.ciws&&!(t.ciws.revealed>0))continue;if(t.bot&&!run.showMarkers)continue;const [mx,mz]=toMap(t.group.position.x,t.group.position.z);ctx.fillStyle=t.aa||t.ciws?'#ff5a45':t.air?'#ff8a70':'#ffd3a0';ctx.beginPath();if(t.ciws)ctx.rect(mx-3.5*k,mz-3.5*k,7*k,7*k);else ctx.arc(mx,mz,3*k,0,Math.PI*2);ctx.fill();}
      // Gunners give themselves away by firing (smoke trail), as in a real game.
      for(const l of defense.launchers){if(l.dead||!l.unit||!l.unit.soldier||!(l.revealed>0))continue;const [mx,mz]=toMap(l.eye.x,l.eye.z);ctx.fillStyle='#ff5a45';ctx.beginPath();ctx.moveTo(mx,mz-4*k);ctx.lineTo(mx+4*k,mz);ctx.lineTo(mx,mz+4*k);ctx.lineTo(mx-4*k,mz);ctx.closePath();ctx.fill();}
      for(const tw of towers){const [mx,mz]=toMap(tw.x,tw.z);ctx.strokeStyle='#cfd4cd';ctx.strokeRect(mx-5*k,mz-5*k,10*k,10*k);ctx.fillStyle='#e9ebe6';ctx.font=`bold ${Math.round(10*k)}px ${HUD_FONT}`;ctx.fillText(String(tw.id+1),mx,mz+.5*k);}
      // Own helicopter: arrow along the heading.
      const hd=flight.attitude().heading*Math.PI/180,cxm=x0+S/2,czm=y0+S/2;ctx.translate(cxm,czm);ctx.rotate(hd);ctx.fillStyle='#e9ebe6';ctx.beginPath();ctx.moveTo(0,-8*k);ctx.lineTo(5*k,6*k);ctx.lineTo(0,3*k);ctx.lineTo(-5*k,6*k);ctx.closePath();ctx.fill();
      ctx.restore();ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1;ctx.strokeRect(x0-.5,y0-.5,S+1,S+1);
    }
    // Optional training aids: lock state, missile directions and time to go.
    function drawThreats(w,h){
      const k=h/1080,list=defense.threats(flight),inverse=camera.quaternion.clone().invert(),R=165*k,cx=w/2,cy=h/2;
      ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
      let top=null,ttg=null;
      for(const t of list){
        const color=t.type==='missile'||t.type==='locked'?'#ff5a45':t.type==='decoyed'?'#9aa3a0':'#ffc04d';
        // Direction on the screen plane (x right, y up); "ARR." when behind the view.
        const rel=t.position.clone().sub(camera.position).applyQuaternion(inverse),ang=Math.atan2(rel.x,rel.y),px=cx+Math.sin(ang)*R,py=cy-Math.cos(ang)*R;
        ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(px+Math.sin(ang)*14*k,py-Math.cos(ang)*14*k);ctx.lineTo(px+Math.cos(ang)*8*k,py+Math.sin(ang)*8*k);ctx.lineTo(px-Math.cos(ang)*8*k,py-Math.sin(ang)*8*k);ctx.closePath();ctx.fill();
        if(rel.z>0){ctx.font=`${Math.round(10*k)}px ${HUD_FONT}`;ctx.fillText('ARR.',px,py+16*k);}
        if(t.type==='missile'){ctx.font=`bold ${Math.round(12*k)}px ${HUD_FONT}`;ctx.fillText(`${Math.round(t.distance)} m`,px,py-18*k);if(t.ttg!==null&&(ttg===null||t.ttg<ttg))ttg=t.ttg;}
        const rank={missile:3,locked:2,acquiring:1,decoyed:0}[t.type];if(!top||rank>top.rank)top={...t,rank,color};
      }
      let text=null,color=null;
      if(top&&top.type==='missile'){text=`MISSILE${ttg!==null?' · '+fmt(ttg)+' s':''}`;color=top.color;}
      else if(top&&top.type==='locked'){text='VERROUILLÉ';color=top.color;}
      else if(top&&top.type==='acquiring'){text='ACCROCHAGE';color=top.color;}
      if(aaBanner&&time<aaBanner.until&&(!text||top.type==='acquiring')){text=aaBanner.text;color=aaBanner.color;}
      if(text){ctx.font=`bold ${Math.round(18*k)}px ${HUD_FONT}`;ctx.fillStyle='rgba(12,18,16,.55)';const tw=ctx.measureText(text).width+30*k;ctx.fillRect(cx-tw/2,86*k,tw,30*k);ctx.fillStyle=color;ctx.fillText(text,cx,101*k);
        if(top&&top.type==='acquiring'){ctx.fillStyle='rgba(255,192,77,.3)';ctx.fillRect(cx-60*k,120*k,120*k,4*k);ctx.fillStyle='#ffc04d';ctx.fillRect(cx-60*k,120*k,120*k*top.progress,4*k);}}
      ctx.restore();
    }
    // Duel and full-match aid (with the markers): an arrow toward each enemy helicopter
    // within 1.5 km that is off the screen, red while its guns are on you and firing.
    function drawBotThreats(w,h,project){
      const k=h/1080,inverse=camera.quaternion.clone().invert(),R=205*k,cx=w/2,cy=h/2;
      ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
      for(const t of bots){
        if(!t.active)continue;const f=t.bot.flight,d=f.position.distanceTo(flight.position);if(d>1500)continue;
        const s=project(f.position);if(s.z>0&&s.z<1&&s.x>20&&s.x<w-20&&s.y>90&&s.y<h-70)continue;
        const rel=f.position.clone().sub(camera.position).applyQuaternion(inverse),ang=Math.atan2(rel.x,rel.y),px=cx+Math.sin(ang)*R,py=cy-Math.cos(ang)*R;
        const toMe=flight.position.clone().sub(f.position).normalize(),onMe=time<t.bot.firingUntil&&_fwd.set(0,0,-1).applyQuaternion(f.quaternion).dot(toMe)>Math.cos(4*Math.PI/180);
        ctx.fillStyle=onMe?'#ff5a45':'#ffb35a';ctx.beginPath();ctx.moveTo(px+Math.sin(ang)*16*k,py-Math.cos(ang)*16*k);ctx.lineTo(px+Math.cos(ang)*9*k,py+Math.sin(ang)*9*k);ctx.lineTo(px-Math.cos(ang)*9*k,py-Math.sin(ang)*9*k);ctx.closePath();ctx.fill();
        ctx.font=`bold ${Math.round(12*k)}px ${HUD_FONT}`;ctx.fillText(`${onMe?'TIRS · ':''}${Math.round(d)} m`,px-Math.sin(ang)*16*k,py+Math.cos(ang)*16*k);
      }
      ctx.restore();
    }
    function drawHud(){
      const w=innerWidth,h=innerHeight;ctx.clearRect(0,0,w,h);if(!hasSession)return;
      const project=vec=>{const v=vec.clone().project(camera);return {x:(v.x*.5+.5)*w,y:(-.5*v.y+.5)*h,z:v.z};};
      const at=renderPose(),forward=new T.Vector3(0,0,-1).applyQuaternion(at.q),aim=project(at.p.clone().addScaledVector(forward,600));
      ctx.font=`12px ${HUD_FONT}`;ctx.lineWidth=1;ctx.strokeStyle='#e2f7af';ctx.fillStyle='#e2f7af';
      if(run.showMarkers)for(let i=0;i<targets.length;i++){
        const t=targets[i];if(!t.active)continue;const p=project(t.group.position),distance=t.group.position.distanceTo(flight.position);
        if(t.aa&&!(t.aa.revealed>0||run.aaAssist&&t.aa.state!=='idle'))continue;
        if(t.ciws&&!(t.ciws.revealed>0||run.aaAssist&&t.ciws.visible&&distance<CIWS.acquire))continue;
        if(t.convoy&&distance>900)continue;
        if(p.z>1||p.z<0)continue;
        if(p.x<20||p.x>w-20||p.y<90||p.y>h-70){const x=P.clamp(p.x,30,w-30),y=P.clamp(p.y,95,h-75);ctx.fillText('◆',x,y);continue;}
        const radius=P.clamp(t.radius/distance*h/(2*Math.tan(camera.fov*Math.PI/360))+8,12,50);
        const tint=t.aa||t.ciws?'#ff8a70':t.enemyHeli?'#ff9a7a':t.air?'#e2f7af':'#ffd3a0';ctx.strokeStyle=tint+'b0';ctx.fillStyle=tint;
        for(const sx of [-1,1])for(const sy of [-1,1]){ctx.beginPath();ctx.moveTo(p.x+sx*(radius-6),p.y+sy*radius);ctx.lineTo(p.x+sx*radius,p.y+sy*radius);ctx.lineTo(p.x+sx*radius,p.y+sy*(radius-6));ctx.stroke();}
        ctx.fillText(`${t.samSite?'SAM':t.ciws?'CIWS 20 mm':t.enemyHeli?(t.bot&&t.bot.weapon==='rockets'?'AH-6R':'HÉLICO'):t.convoy?({humvee:'HUMVEE',pickup:'PICK-UP'}[t.convoy.kind]||'CAMION'):t.tower?'DÉFENSE':t.air?'AIR':'SOL'} ${String(i+1).padStart(2,'0')}  /  ${Math.round(distance)} m${t.ciws&&!(t.ciws.emp.crew&&t.ciws.emp.crew.alive)?' · SANS SERVANT':''}`,p.x+radius+7,p.y-3);
        ctx.fillStyle='#10231999';ctx.fillRect(p.x-radius,p.y+radius+7,radius*2,3);ctx.fillStyle='#d5ef88';ctx.fillRect(p.x-radius,p.y+radius+7,radius*2*t.health/t.maxHealth,3);
        // Points: the reference scale (36.02 a hit), or the game's hull HP when a database lists it (CIWS).
        ctx.fillText(run.indestructible&&!t.aa&&!t.convoy&&!t.ciws?'∞':t.hp?`${Math.ceil(t.health/t.maxHealth*t.hp)} / ${t.hp} PV`:`${Math.ceil(t.health*36.02)} / ${Math.round(t.maxHealth*36.02)} PV`,p.x+radius+7,p.y+13);
      }
      // Verba gunners: marked for 8 s after a shot or, with the aids, while they aim at you.
      if(run.showMarkers&&aaActive)for(const l of defense.launchers){
        if(l.dead||!l.unit||!l.unit.soldier||!(l.revealed>0||run.aaAssist&&l.state!=='idle'))continue;
        const p=project(l.eye);if(p.z<0||p.z>1)continue;const d=l.eye.distanceTo(flight.position),r=P.clamp(1.2/d*h/(2*Math.tan(camera.fov*Math.PI/360))+9,10,30);
        ctx.strokeStyle='#ff8a70c0';ctx.fillStyle='#ff8a70';ctx.beginPath();ctx.moveTo(p.x,p.y-r);ctx.lineTo(p.x+r,p.y);ctx.lineTo(p.x,p.y+r);ctx.lineTo(p.x-r,p.y);ctx.closePath();ctx.stroke();
        ctx.fillText(`VERBA · ${Math.round(d)} m${l.state==='locked'?' · VERROUILLÉ':l.state==='acquiring'?' · ACCROCHE':''}`,p.x+r+6,p.y+4);
      }
      // Objectives: one marker per camp at range, each structure up close or once hit.
      if(run.showMarkers){
        for(const c of battle.camps){const left=c.structures.filter(s=>s.alive).length,d=Math.hypot(c.x-flight.position.x,c.z-flight.position.z);if(!left||d<220)continue;const p=project(V3(c.x,c.y+18,c.z));if(p.z<0||p.z>1)continue;
          ctx.fillStyle='#ffb15a';ctx.strokeStyle='#ffb15acc';ctx.beginPath();ctx.moveTo(p.x,p.y-7);ctx.lineTo(p.x+7,p.y);ctx.lineTo(p.x,p.y+7);ctx.lineTo(p.x-7,p.y);ctx.closePath();ctx.stroke();ctx.fillText(`CAMP ${c.id+1} · ${left} OBJ. · ${Math.round(d)} m`,p.x+12,p.y+4);}
        for(const v of structureViews){const st=v.st;if(!st.alive)continue;const d=st.position.distanceTo(flight.position),hit=time-(st.lastHit||-100)<6;if(d>260&&!hit)continue;const p=project(st.position.clone().add(V3(0,6,0)));if(p.z<0||p.z>1)continue;
          ctx.strokeStyle='#ffb15acc';ctx.fillStyle='#ffb15a';ctx.strokeRect(p.x-6,p.y-6,12,12);ctx.fillText(st.label.toUpperCase(),p.x+11,p.y-3);ctx.fillStyle='#10231999';ctx.fillRect(p.x-18,p.y+10,36,3);ctx.fillStyle='#ffb15a';ctx.fillRect(p.x-18,p.y+10,36*st.health/st.maxHealth,3);}
      }
      for(const t of targets){if(time-t.lastHit>4)continue;const p=project(t.group.position);if(p.z<0||p.z>1)continue;
        ctx.save();ctx.textAlign='center';ctx.font=`bold 20px ${HUD_FONT}`;ctx.fillStyle='#ffffff';ctx.fillText(t.damageTotal.toFixed(2).replace('.',','),p.x,p.y-45);
        ctx.font=`12px ${HUD_FONT}`;ctx.fillText(`(${t.hitCount})`,p.x,p.y-28);ctx.fillStyle='#ff795f';ctx.fillText('+'+t.lastDamage.toFixed(2).replace('.',','),p.x+70,p.y-45);ctx.restore();
      }
      // Weapon sight in the cockpit only: the game shows no reticle in the chase
      // view (recordings, e.g. recording 1 at 120 s and recording 2 at 106 s).
      // Drawn like the game's reflex sight (recording 1 at 240 s): lime crosshair running past a
      // 50 px circle (1080p) whose lower arcs are solid and upper arcs dotted, ring and dot.
      // Its angular size is fixed (collimated sight): it scales with the field of view.
      if(heliAlive&&view==='cockpit'&&aim.z<1){const x=aim.x,y=aim.y,s=(h/2)/Math.tan(camera.fov*Math.PI/360)/972,col=hitFlash?'#ffd27a':'#a8f06a',R=50*s,g=.21;
        ctx.save();ctx.strokeStyle=col;ctx.fillStyle=col;ctx.shadowColor=col;ctx.shadowBlur=5*s;ctx.lineWidth=Math.max(1.2,2.4*s);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(x-68*s,y);ctx.lineTo(x-14*s,y);ctx.moveTo(x+14*s,y);ctx.lineTo(x+68*s,y);ctx.moveTo(x,y-60*s);ctx.lineTo(x,y-14*s);ctx.moveTo(x,y+14*s);ctx.lineTo(x,y+75*s);ctx.stroke();
        ctx.beginPath();ctx.arc(x,y,13*s,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,3.6*s,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(x,y,R,g,Math.PI/2-g);ctx.stroke();ctx.beginPath();ctx.arc(x,y,R,Math.PI/2+g,Math.PI-g);ctx.stroke();
        ctx.setLineDash([2.5*s,5*s]);ctx.beginPath();ctx.arc(x,y,R,Math.PI+g,1.5*Math.PI-g);ctx.stroke();ctx.beginPath();ctx.arc(x,y,R,1.5*Math.PI+g,2*Math.PI-g);ctx.stroke();ctx.setLineDash([]);
        ctx.restore();}
      drawFlightHud(w,h);drawWeapons(w,h);if(cfg.showKeyHints)drawKeyHints(w,h);drawMinimap(w,h);
      if(aaActive&&run.aaAssist&&heliAlive)drawThreats(w,h);
      if(bots.length&&run.showMarkers&&heliAlive)drawBotThreats(w,h,project);
      // Resupply prompt on the helipad, as in the game.
      if(onPad()&&!run.unlimitedAmmo){const k=h/1080;ctx.save();ctx.font=`600 ${Math.round(16*k)}px ${HUD_FONT}`;ctx.textBaseline='middle';const text='ACHETER DES MUNITIONS / FOURNITURES',tw=ctx.measureText(text).width,x=w/2-tw/2+14*k;
        ctx.fillStyle='rgba(236,240,234,.96)';ctx.fillRect(x-30*k,h-272*k,20*k,20*k);ctx.fillStyle='#1b2320';ctx.textAlign='center';ctx.font=`bold ${Math.round(12*k)}px ${HUD_FONT}`;ctx.fillText(keyName('shop'),x-20*k,h-262*k);
        ctx.textAlign='left';ctx.font=`600 ${Math.round(16*k)}px ${HUD_FONT}`;ctx.fillStyle='rgba(236,240,234,.96)';ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=4*k;ctx.fillText(text,x,h-262*k);ctx.restore();}
      if(damageFlash>0){ctx.fillStyle=`rgba(255,70,40,${Math.min(.45,damageFlash*.6)})`;ctx.fillRect(0,0,w,h);}
      if(!heliAlive){ctx.save();ctx.textAlign='center';ctx.font=`600 ${Math.round(h*.034)}px ${HUD_FONT}`;ctx.fillStyle='#ffd0c4';ctx.fillText((LOSS[wreckCause]||'Accident').toUpperCase(),w/2,h*.4);ctx.restore();}
      ctx.font=`11px ${HUD_FONT}`;ctx.fillStyle='#e2f7af';
      if(compatInput){const k=h/1080,bx=w/2+200*k,by=h-160*k;ctx.strokeStyle='#d5ef8855';ctx.strokeRect(bx,by-27,54,54);ctx.fillStyle='#d5ef88';ctx.beginPath();ctx.arc(bx+27-mouse.mouseYaw*24,by+mouse.mousePitch*24*(cfg.invertY?1:-1),3,0,Math.PI*2);ctx.fill();}
      if(run.scenario==='towers')for(const tower of towers){const p=project(new T.Vector3(tower.x,tower.height+13,tower.z));if(p.z<0||p.z>1)continue;const enemies=targets.filter(t=>t.tower===tower&&t.active).length;ctx.fillStyle=tower.captured?'#c3f19a':'#ffd3a0';ctx.fillText(`TOUR ${tower.id+1} · ${Math.round(tower.structure)} m · ${tower.captured?'CAPTURÉE':enemies?enemies+' défense(s)':Math.round(tower.capture*10)+' % · Maintenir la position'}`,P.clamp(p.x-70,15,w-300),P.clamp(p.y-26,130,h-160));}
      const lever=Math.round(flight.collective*100),vario=Math.abs(flight.velocity.y)<.05?0:flight.velocity.y;
      $('speed').textContent=Math.round(flight.velocity.length()*3.6);$('altitude').textContent=Math.round(hudAGL());
      $('collective').textContent=(lever>0?'+':'')+lever;$('vario').textContent=(vario>0?'+':'')+vario.toFixed(1);
      $('accuracy').textContent=stats.shots?Math.round(stats.hits/stats.shots*100)+' %':'—';$('kills').textContent=stats.kills;$('score').textContent=score;
      const seconds=run.duration?Math.max(0,Math.ceil(run.duration-time)):Math.floor(time);$('timer').textContent=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
      const a=defense.stats,dodged=dodgedCount(a),mode=MODE_OF(run.scenario);
      $('tracking').textContent=mode==='duel'&&duel?`Victoires ${duel.kills} · Défaites ${stats.deaths} · Ennemis en vol ${bots.filter(t=>t.active).length} / ${bots.length} · Intégrité ${Math.ceil(health)} %`:mode==='match'?`Structures ${battle.stats.structuresDestroyed}/${battle.structures.length} · Missiles esquivés ${dodged}/${a.launches}${hot?` · Zone chaude dans ${Math.ceil(hot.next)} s`:''}`:mode==='assault'?`Objectifs restants ${battle.objectivesLeft} / ${battle.structures.length} · Camions ${battle.stats.vehiclesDestroyed}/${battle.vehicles.length}`:mode==='missiles'?`Missiles esquivés ${dodged} / ${a.launches} · Impacts ${a.hits} · Lanceurs détruits ${a.launchersKilled}`:mode==='towers'?`Tours : ${towers.filter(t=>t.captured).length} / 3 · Capture : rester 10 s, 5–25 m au-dessus, à moins de 40 km/h`:`Suivi de cible : ${time?Math.round(stats.tracked/time*100):0} %`;
    }
    // Visual state of missiles, flares, launchers, structures and soldiers, once per rendered frame.
    function updateThreatVisuals(dt){
      let i=0;
      for(const m of defense.missiles){
        const g=missileMeshes[i++];if(!g)break;g.visible=true;g.position.copy(m.position);g.quaternion.setFromUnitVectors(V3(0,0,-1),m.velocity.clone().normalize());
        const tail=m.position.clone().addScaledVector(m.velocity.clone().normalize(),-1);
        // No flame or trail while the missile coasts out of the tube.
        if(!m.ignited){m.trailFrom=null;continue;}
        if(dt>0){
          glow.emit(tail,V3(),.06,2.2,3.2,1,FIRE);
          // Continuous trail: one puff every ~2.5 m travelled since the last frame.
          const from=m.trailFrom||tail,gap=tail.distanceTo(from),n=Math.min(12,Math.max(1,Math.round(gap/2.5)));
          for(let k=1;k<=n;k++)smoke.emit(from.clone().lerp(tail,k/n),randomDir().multiplyScalar(.8),4.5+Math.random()*1.5,1.1,6.5,.42,SMOKE,.4,.35);
          m.trailFrom=tail;
        }
      }
      for(;i<missileMeshes.length;i++)missileMeshes[i].visible=false;
      // Flares: small, very bright points with a short white smoke trail.
      if(dt>0)for(const f of defense.flares){const I=M.flareIntensity(f.age);glow.emit(f.position,V3(),.05,.5+Math.min(1.1,I*.2),.7,Math.min(1,.35+I*.15),FLARE);if(Math.random()<.6)smoke.emit(f.position,V3(0,.4,0),2.2+Math.random(),.35,2.4,.35,SMOKE,.8,.3);}
      // SAM emplacement: missiles visible in the loaded tubes; a destroyed emplacement burns.
      for(const u of samSites){u.view.noses.forEach((n,k)=>n.visible=u.loaded[k]);
        if(u.burning>0&&dt>0){u.burning-=dt;if(Math.random()<dt*12){const p=u.view.group.position.clone().add(V3((Math.random()-.5)*2,1+Math.random()*1.5,(Math.random()-.5)*2));smoke.emit(p,V3(0,2.5,0),5+Math.random()*3,1.5,8,.55,DARK_SMOKE,.3,.9);if(Math.random()<.5)glow.emit(p,V3(0,1.5,0),.5,1.2,2.5,.8,FIRE,1);}}}
      // Structures collapse and burn; wrecked trucks smoke.
      for(const {st,view} of structureViews){
        if(!st.alive){const f=st.fall;
          if(st.type==='mirador'){view.group.rotation.x=f*1.35;}else if(st.type==='antenne'){view.top.rotation.z=f*1.45;}else{view.top.scale.y=Math.max(.2,1-.8*f);view.top.rotation.z=.12*f;}
          if(dt>0&&st.burning>0&&Math.random()<dt*14){const p=st.position.clone().add(V3((Math.random()-.5)*3,1+Math.random()*2,(Math.random()-.5)*3));smoke.emit(p,V3(0,2.5,0),5+Math.random()*3,2,9,.55,DARK_SMOKE,.3,.9);if(Math.random()<.6)glow.emit(p,V3(0,1.5,0),.5,1.5,3,.8,FIRE,1);}}
      }
      for(const t of targets)if(t.convoy&&!t.convoy.alive&&t.convoy.burning>0&&dt>0&&Math.random()<dt*10){const p=t.group.position.clone().add(V3(0,1.5,0));smoke.emit(p,V3(0,2.5,0),4+Math.random()*2,1.5,7,.5,DARK_SMOKE,.3,.9);glow.emit(p,V3(0,1,0),.4,1.2,2.2,.8,FIRE,1);}
      const people=[];for(const s of battle.soldiers)if(s.state!=='inside'&&(s.alive||s.dead<25))people.push(s);crowd.update(people);
      // Enemy tracers fade in 0.15 s.
      let n=0;for(const tr of enemyTracers){tr.age+=dt;if(tr.age>.15||n>=200)continue;const a=tr.a.clone().lerp(tr.b,Math.min(1,tr.age/.15)),b=tr.a.clone().lerp(tr.b,Math.min(1,tr.age/.15+.12));enemyCoords.set([a.x,a.y,a.z,b.x,b.y,b.z],n*6);n++;}
      enemyTracers=enemyTracers.filter(tr=>tr.age<=.15);enemyGeo.setDrawRange(0,n*2);enemyGeo.attributes.position.needsUpdate=true;
    }
    let last=performance.now(),fps=60;
    // window.__LB_MANUAL_CLOCK__ (tests only): frames are driven by the test through the exposed frame(now).
    function animate(now){
      if(!window.__LB_MANUAL_CLOCK__)requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.1);last=now;renderer.info?.reset?.();if(dt>0)fps+=(1/dt-fps)*.05;
      // Joysticks: one read per rendered frame (the frame's steps run back to back), only when wanted.
      if(joyWanted())joyPoll();
      // Rate law: the frame's pointer movement becomes the rate held over this frame's n steps, divided by their
      // simulated time n/120 s (kept for the next frame if this one runs no step).
      if(running){accumulator+=dt;let n=0;for(let a=accumulator;a>=1/120;a-=1/120)n++;P.frameStart(mouse,cfg,dt,n);while(accumulator>=1/120&&running){step(1/120);accumulator-=1/120;}}
      renderAlpha=running?P.clamp(accumulator*120,0,1):1;
      own.rotor.rotation.y+=dt*(running?35:4);own.tail.rotation.y+=dt*40;own.spin(running&&heliAlive?1:0,flight.velocity.length());own.beacon.visible=(time*1.2)%1<.12||!running;updateCamera(running?dt:0);
      let count=0;for(let i=0;i<bullets.length&&count<1200;i+=2){const b=bullets[i],tail=b.p.clone().addScaledVector(b.v,-.012);bulletCoords.set([tail.x,tail.y,tail.z,b.p.x,b.p.y,b.p.z],count*6);count++;}bulletGeo.setDrawRange(0,count*2);bulletGeo.attributes.position.needsUpdate=true;
      count=0;for(let i=0;i<enemyRounds.length&&count<600;i+=2){const b=enemyRounds[i],tail=b.p.clone().addScaledVector(b.v,-.012);enemyRoundCoords.set([tail.x,tail.y,tail.z,b.p.x,b.p.y,b.p.z],count*6);count++;}enemyRoundGeo.setDrawRange(0,count*2);enemyRoundGeo.attributes.position.needsUpdate=true;
      const rdt=running?dt:0;updateThreatVisuals(rdt);smoke.update(rdt);glow.update(rdt);damageFlash=Math.max(0,damageFlash-rdt);
      const scale=innerHeight*pixelRatio()/2/Math.tan(camera.fov*Math.PI/360);for(const s of [smoke,glow]){s.material.uniforms.scale.value=scale;s.material.uniforms.fogColor.value.copy(scene.fog.color);s.material.uniforms.fogDensity.value=scene.fog.density;}
      scenery.update(dt,camera);
      updateAudio();interpolateTargets();if(post)post.begin();renderer.render(scene,camera);renderCockpit(dt);if(post)post.end();drawHud();restoreTargets();renderAlpha=1;
    }
    function resize(){renderer.setPixelRatio(pixelRatio());renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();hud.width=innerWidth*devicePixelRatio;hud.height=innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);if(post)post.resize();}
    // ---- Resupply screen (B on the helipad), after the game's vehicle resupply: boxes of 150 rounds, 9 slots ----
    const SLOTS=9;
    function inventory(){const items=[];let rest=ammo;while(rest>0&&items.length<SLOTS){const n=Math.min(150,rest);items.push({kind:'ammo',n});rest-=n;}for(let i=0;i<defense.charges&&items.length<SLOTS;i++)items.push({kind:'flare'});return items;}
    function renderShop(){
      const items=inventory(),box=$('inventory');$('shopSlots').textContent=`INVENTAIRE DU VÉHICULE ${items.length}/${SLOTS}`;
      if(!box.replaceChildren)return;box.replaceChildren();
      for(let i=0;i<SLOTS;i++){const it=items[i],b=document.createElement('button');if(!it){b.className='empty';b.textContent='—';}else{b.textContent=it.kind==='ammo'?`.308 FMJ ${it.n}/150`:'✳ LEURRES';b.onclick=()=>{if(it.kind==='ammo')ammo=Math.max(0,ammo-it.n);else defense.charges=Math.max(0,defense.charges-1);sfx.play('ui');renderShop();};}box.append(b);}
    }
    function openShop(){if(!onPad()||run.unlimitedAmmo||shopOpen)return;shopOpen=true;running=false;if(document.pointerLockElement)document.exitPointerLock();clearInputs();document.body.classList.remove('flying');showScreen('shop');renderShop();}
    function closeShop(){if(!shopOpen)return;shopOpen=false;showScreen(null);document.body.classList.add('flying');running=true;accumulator=0;lock();}
    document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>{const used=inventory().length,kind=b.dataset.item;
      if(kind==='repair'){health=100;toast('Hélicoptère réparé');}
      else if(used>=SLOTS&&!(kind==='ammo'&&ammo%150))toast('Inventaire plein (9 emplacements)');
      else if(kind==='ammo'){ammo+=ammo%150?150-ammo%150:150;}else if(kind==='flare'){defense.charges++;}
      sfx.play('ui');renderShop();});
    $('shopClose').onclick=closeShop;
    // ---- Menus ----
    // The mode choice and the handlers that the page's controls share live in menus.js; the screens are still here.
    const menus=MENUS.create({doc:document,S:SET,state:{get cfg(){return cfg;}},commit:next=>{cfg=next;flight.cfg=cfg;},
      act:{markExerciseDirty,syncUI,save,resetMouse:()=>P.resetInput(mouse)},toast,sfx});
    function selectTab(tab){menuTab=tab;document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));document.querySelectorAll('.tab').forEach(n=>n.classList.toggle('active',n.id===tab));$('pageTitle').textContent={modes:'MODES DE JEU',controls:'COMMANDES',settings:'RÉGLAGES',about:'À PROPOS'}[tab];renderBindings();if(tab!=='controls')joyStop();}
    function renderBindings(){
      $('bindings').replaceChildren();for(const [action,label] of Object.entries(labels)){const div=document.createElement('div');div.className='binding';const span=document.createElement('span');span.textContent=label;const button=document.createElement('button');button.textContent=KEY_NAMES[bindings[action]]||bindings[action].replace('Key','').replace('Unbound','Non assigné');button.onclick=()=>{capturing=action;renderBindings();toast('Appuie sur une touche ou un bouton de souris. Échap annule.');};if(capturing===action){button.textContent='En attente…';button.classList.add('listening');}div.append(span,button);$('bindings').append(div);}
    }
    function capture(code){
      if(!capturing)return false;
      if(code==='Escape'){capturing=null;renderBindings();return true;}
      if(!KEY_PATTERN.test(code)){toast('Cette touche est réservée ou non prise en charge.');return true;}
      for(const [action,b] of Object.entries(bindings))if(b===code&&action!==capturing){toast(`Déjà utilisée : ${labels[action]}. Choisis une autre touche.`);return true;}
      bindings[capturing]=code;capturing=null;renderBindings();save();return true;
    }
    function syncUI(){
      for(const [key,val] of Object.entries(cfg)){const el=$(key);if(!el)continue;if(el.type==='checkbox')el.checked=val;else el.value=val;const output=el.parentElement.querySelector('output');if(output)output.textContent=Number(val).toLocaleString('fr-FR',{maximumFractionDigits:Math.abs(val)>0&&Math.abs(val)<.01?5:3})+' '+(el.dataset.unit||'');}
      $('modeLabel').textContent=(MODES[MODE_OF(cfg.scenario)]||MODES.range).title;menus.selectMode(MODE_OF(cfg.scenario));renderBindings();joySync();
    }
    function markExerciseDirty(){exerciseDirty=true;$('resume').hidden=true;}
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{capturing=null;selectTab(b.dataset.tab);sfx.play('ui');});
    // À propos: the releases page, shown as text and as a link that opens in a new tab without opener or referrer. The
    // page never contacts it. In the Windows app the shell hands this exact address, and no other, to the default
    // browser (desktop/policy.cjs RELEASES_URL, the same string: tests/unit/about.test.js). The markup may hold no
    // address (scripts/page-policy.mjs), so it is set here. The version shown there and in the menu header is written
    // into the markup by the build (package.json).
    const RELEASES_URL='https://github.com/sylvainarnauda-shining/littlebird-trainer/releases';
    if($('releasesLink')){$('releasesLink').href=RELEASES_URL;$('releasesLink').textContent=RELEASES_URL;}
    $('start').onclick=start;$('retry').onclick=start;$('resume').onclick=resume;$('menuButton').onclick=pause;$('resultSettings').onclick=()=>openMenu('modes');
    $('pauseResume').onclick=resume;$('pauseRestart').onclick=start;$('pauseModes').onclick=()=>openMenu('modes');$('pauseSettings').onclick=()=>openMenu('settings');
    $('defaults').onclick=()=>{cfg={...DEFAULTS};bindings={...baseBindings};joyProfile=J.defaultProfile();joy.roles=J.createRoles();flight.cfg=cfg;markExerciseDirty();syncUI();save();toast('Réglages initiaux restaurés.');};
    $('demanding').onclick=()=>{for(const key of [...FLIGHT_KEYS,...V13_KEYS,'spinUp','cameraMotion','speedFov','chaseSpeedView'])cfg[key]=DEFAULTS[key];flight.cfg=cfg;P.resetInput(mouse);syncUI();save();toast('Modèle de vol mesuré rétabli (v6 + v13 : loi et gain de la souris (0,339), lacet, collectif en stationnaire, vue poursuite). Touches, sensibilités, champs de vision, cibles et dégâts conservés.');};
    // Wardogs settings file (%LOCALAPPDATA%\Wardogs\Saved\Config\WindowsClient\GameUserSettings.ini): helicopter mouse settings and
    // vehicle fields of view, read locally (HeliSettings.parseGameIni), nothing is written back. Only the lines of the
    // user-settings section are read (another section could hold a key of the same name).
    const GAME_SECTION='/Script/WDGame.WDUserSettings';
    $('importGame').onchange=async e=>{const file=e.target.files[0];if(!file)return;
      try{if(file.size>400000)throw Error('fichier trop volumineux');const r=SET.parseGameIni(await file.text(),GAME_SECTION);if(!r.found.length)throw Error('aucun réglage d’hélicoptère trouvé');
        Object.assign(cfg,r.settings);cfg=sanitize(cfg);flight.cfg=cfg;syncUI();save();toast(`Réglages du jeu importés : ${r.found.join(', ')}.${r.warn}`);}
      catch(err){toast('Import refusé : '+err.message);}e.target.value='';};
    $('export').onclick=()=>{const blob=new Blob([JSON.stringify(profileDoc({format:'littlebird-trainer-profile',version:1}),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='little-bird-profil.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    $('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100000)throw Error('Fichier trop volumineux');const parsed=JSON.parse(await file.text());if(parsed.version!==1||!parsed.settings||!parsed.bindings)throw Error('Format non reconnu');const up=SET.upgrade(parsed);notices.push(...up.notices);const next=sanitize(up.doc.settings),nextBindings=validBindings(parsed.bindings),nextJoy=joyLoad(parsed.joystick,notices);cfg=next;bindings=nextBindings;joyProfile=nextJoy;joy.roles=J.createRoles();flight.cfg=cfg;markExerciseDirty();syncUI();save();toast('Profil importé.'+(notices.length?' '+notices.splice(0).join(' '):''));}catch(err){toast('Import refusé : '+err.message);}e.target.value='';};
    // ---- Joysticks (J1). One read per rendered frame, only while a session flies with the HOTAS on or while the panel
    // reads after a click on « Lire les manettes » (stopped when the tab, the window or the page is left, and at the start
    // of a session). physics.js (joystick) gives the roles, the freshness, the devices and the frame's commands; here: the
    // read itself, the pause when a device in use is lost, the button actions, the look axes and the panel of the
    // Commandes tab (provisional, until the game-faithful HOTAS page).
    const JOY_ROWS=['Roll','Pitch','Yaw','Throttle','LookYaw','LookPitch'];   // the order of the game's HOTAS page (videos)
    const JOY_NAMES={Roll:'Roulis',Pitch:'Tangage',Yaw:'Lacet',Throttle:'Collectif',LookYaw:'Regard libre horizontal',LookPitch:'Regard libre vertical'};
    const JOY_REF_NAMES={main:'manette principale',left:'manche gauche',right:'manche droit'};
    const JOY_LOST={main:'Manette principale débranchée',left:'Manche gauche débranché',right:'Manche droit débranché'};
    const JOY_PROMPTS={'press-left':'Appuie sur la gâchette du manche GAUCHE.','press-right':'Appuie maintenant sur la gâchette du manche DROIT.',
      'confirm-left':'Deux manches identiques : appuie sur la gâchette du manche GAUCHE pour confirmer gauche et droite. D’ici là, ils ne pilotent pas.',
      'reconnect-left':'Manche gauche introuvable : bouge-le ou rebranche-le.','reconnect-right':'Manche droit introuvable : bouge-le ou rebranche-le.'};
    // HID usages 0x30-0x39 in the order Chromium numbers the axes (usage - 0x30).
    const HID_AXES=['X','Y','Z','Rx','Ry','Rz · torsion','curseur · molette des gaz','cadran','roue','chapeau'];
    const HAT_FR={up:'haut',upRight:'haut-droite',right:'droite',downRight:'bas-droite',down:'bas',downLeft:'bas-gauche',left:'gauche',upLeft:'haut-gauche'};
    const joyNum=(x,d=2)=>(x>0?'+':x<0?'−':'')+Math.abs(x).toFixed(d).replace('.',',');
    const joyFmt=x=>Number(x).toLocaleString('fr-FR',{maximumFractionDigits:3});
    function joyWanted(){return running&&joyProfile.useHotas||joy.reading;}
    function joyRead(){
      try{
        if(typeof navigator==='undefined'||typeof navigator.getGamepads!=='function'){joy.error='api';return [];}
        // Under automation only the page's own emulation answers (the shim at the top): never the machine's joysticks.
        if(navigator.webdriver===true&&navigator.getGamepads!==emulatedGamepads){joy.error='api';return [];}
        const list=navigator.getGamepads();joy.error='';return J.snapshotPads(list);
      }catch(e){joy.error='blocked';return [];}   // Permissions-Policy gamepad=() (the desktop self-test): SecurityError
    }
    function joyRolesWanted(){return !!joy.roles.identify||joyProfile.deviceMatch==='role'&&[...J.usedRefs(joyProfile)].some(r=>r!=='main');}
    function joyPoll(){
      const pads=joyRead();joy.pads=pads;joy.rolesInfo=null;
      if(joyRolesWanted()){
        const r=J.rolesStep(joy.roles,joyProfile.devices,pads,joyProfile.confirmRoles);joy.rolesInfo=r;
        if(r.consumed!==null)J.latchButtons(joy.state);   // the press that identified or confirmed the sticks never fires
        if(r.changed){save();joySync();if(r.events.some(e=>e==='identified'||e==='confirmed'||e==='swapped'))toast(`Manches identifiés : gauche n° ${r.left}, droit n° ${r.right}.`);}
      }
      joy.live=J.freshStep(joy.fresh,pads);joy.res=J.resolveDevices(joyProfile,pads,joy.roles);
      // Two identical sticks whose left and right are not confirmed yet drive nothing until the confirming press.
      const live=J.rolesLive(joy.live,joy.rolesInfo,joyProfile,joy.res);joy.unconfirmed=live!==joy.live;
      joy.frame=J.joyFrame(joy.state,joyProfile,pads,joy.res,live);
      if(joy.learn)joyLearnStep();
      joy.active=running&&joyProfile.useHotas;
      if(joy.active)joyFlight();
      else if(joy.reading&&(joy.tick++)%6===0)joyPanel();
    }
    // In flight: a device in use that was there and is gone pauses the session (as a lost pointer lock does); prompts for
    // the two sticks; button actions as their keys (keydown below); look axes.
    function joyFlight(){
      const f=joy.frame;
      for(const [ref,state] of Object.entries(f.refs)){
        if(state==='present')joy.present.add(ref);
        else if(joy.present.has(ref)){joy.present.delete(ref);pause();toast(`${JOY_LOST[ref]} : session en pause. Rebranche l’appareil puis reprends.`);return;}
      }
      const prompt=joy.rolesInfo&&joy.rolesInfo.prompt||'';
      if(prompt!==joy.prompted){joy.prompted=prompt;if(prompt)toast(JOY_PROMPTS[prompt]);}
      for(const a of f.pressed){
        if(a==='flares')flareRequest=true;
        else if(a==='freeLook')lookDown(false);
        else if(a==='view'){view=view==='cockpit'?'chase':'cockpit';toast(view==='chase'?'Vue poursuite':'Vue pilote');}
        else if(a==='neutral'){P.resetInput(mouse);if(compatInput)virtualAnchor=lastPointer?{...lastPointer}:null;}
        else if(a==='shop'){openShop();if(shopOpen)return;}
        else if(a==='reset'){start();return;}
      }
      for(const a of f.released)if(a==='freeLook')lookUp();
      // Look axes (B0, SUPPOSED): the view angle follows them within the free-look limits; centred, the view comes back as
      // when free look is released.
      const c=f.cmd;joy.stickLook=!!(c.lookYaw||c.lookPitch);
      if(joy.stickLook){lookYaw=c.lookYaw*J.LAW.lookYaw;lookPitch=c.lookPitch*J.LAW.lookPitch;}
    }
    function joyStart(){
      joy.present.clear();joy.prompted='';joyStop();
      if(joyProfile.useHotas&&!J.usedRefs(joyProfile).size)toast('HOTAS activé, mais aucun axe ni bouton n’est lié : Commandes › Manette · HOTAS.');
    }
    function joyStop(){if(!joy.reading&&!joy.learn&&!joy.roles.identify)return;joy.reading=false;joy.learn=null;J.cancelIdentify(joy.roles);joyPanel();}
    function joyReading(on){if(!on)joyStop();else if(!joy.reading){joy.reading=true;joy.tick=0;joyPanel();}}
    // The controls a device reference drives: axes (but the axis binding of row skip) and their Positive / Negative
    // sources by name, button actions by label.
    function joyUsersOf(ref,skip){
      const p=joyProfile,out=[],src=s=>!!s&&s.device===ref;
      for(const n of JOY_ROWS){const b=p.axes[n];if(n!==skip&&b.device===ref&&b.axis>=0||src(b.positive)||src(b.negative))out.push(JOY_NAMES[n]);}
      for(const a of Object.keys(p.actions))if(p.actions[a].some(src))out.push(labels[a]);
      return out;
    }
    // "Détecter": the axis moved past half its travel goes to the row being learnt, on the device reference of the pad
    // that moved: its identified role (left or right stick), else the main device. One of two identical sticks needs the
    // roles first (as the main device, the first of them in the browser's order, which can change at the next launch);
    // another model becomes the main device only while no other control uses it (« En faire la manette principale »
    // moves every control at once). A refusal changes nothing and says why.
    function joyLearnStep(){
      const hit=J.learnAxis(joy.learnBase,joy.pads,joy.live);if(!hit)return;
      const n=joy.learn,pad=joy.pads.find(p=>p.index===hit.index),name=`« ${pad.name||'manette'} »`;joy.learn=null;
      const refuse=text=>{toast(text);joyPanel();};
      const same=joy.pads.filter(p=>p.mapping!=='standard'&&J.sameModel(p,pad)).map(p=>p.index),twin=same.length>1;
      let ref=['left','right'].find(r=>joy.res[r].includes(hit.index)),was='';
      if(ref&&joy.unconfirmed)return refuse(JOY_PROMPTS['confirm-left']+' Puis détecte l’axe.');
      if(!ref&&twin&&joyProfile.deviceMatch==='role')return refuse('Deux manches identiques : clique d’abord sur « Identifier les manches gauche et droit », puis détecte l’axe.');
      if(!ref&&joy.res.main.includes(hit.index))ref='main';
      if(!ref){
        if(!pad.vendor)return refuse('Manette sans identifiant lisible : choisis la manette principale à la main.');
        if(twin&&joyProfile.deviceMatch==='first'&&hit.index!==Math.min(...same))return refuse(`Plusieurs manettes ${name} et le réglage « la première détectée de chaque modèle » : seule la n° ${Math.min(...same)} est lue. Détecte l’axe sur elle, ou change ce réglage.`);
        const users=joyUsersOf('main',n);
        if(users.length)return refuse(`${name} n’est pas la manette principale, qu’utilisent déjà : ${users.join(', ')}. Rien n’est changé. Pour la lier, clique sur « En faire la manette principale » sous ${name} (toutes ces commandes la liront), puis détecte de nouveau.`);
        const old=joy.res.main.length?joy.pads.find(p=>p.index===joy.res.main[0]):joyProfile.devices.main;
        was=`, désormais ${name}${old?` à la place de « ${old.name||'manette'} »`:''}`;
        joyProfile.devices.main=J.modelOf(pad);ref='main';
      }
      joyProfile.axes[n].device=ref;joyProfile.axes[n].axis=hit.axis;joyChanged();
      toast(`${JOY_NAMES[n]} : axe ${hit.axis} de ${name} (${JOY_REF_NAMES[ref]}${was}).`);
    }
    function joyChanged(){joyProfile=J.validateProfile(joyProfile);save();joySync();}
    function joyHotas(on){joyProfile.useHotas=!!on;joyChanged();
      toast(joyProfile.useHotas?'HOTAS activé : en vol, l’entraîneur lit les manettes liées ici.':'HOTAS désactivé : aucune manette n’est lue en vol.');}
    function joyAxisDevice(n,ref){joyProfile.axes[n].device=J.REFS.includes(ref)?ref:null;joyChanged();}
    function joyFill(sel,list){if(!sel||!sel.replaceChildren)return;sel.replaceChildren();for(const [v,t] of list){const o=document.createElement('option');o.value=v;o.textContent=t;sel.append(o);}}
    const joyKey=m=>m.vendor+':'+m.product;
    function joyModelByKey(key){
      const pad=joy.pads.find(p=>p.mapping!=='standard'&&p.vendor&&joyKey(p)===key),m=joyProfile.devices.main;
      if(pad)return J.modelOf(pad);if(m&&joyKey(m)===key)return m;
      const [vendor,product]=key.split(':');return J.validateProfile({schema:1,devices:{main:{vendor,product}}}).devices.main;
    }
    function joyMainOptions(){
      const sel=$('joyMain');if(!sel)return;const models=[],add=m=>{if(m&&m.vendor&&m.product&&!models.some(x=>J.sameModel(x,m)))models.push(m);};
      add(joyProfile.devices.main);for(const p of joy.pads)if(p.mapping!=='standard')add(p);
      const key=models.map(joyKey).join(',');
      if(sel.joyKey!==key){sel.joyKey=key;joyFill(sel,[['auto','Automatique : vJoy d’abord, sinon la première manette vue'],...models.map(m=>[joyKey(m),`${m.name||'Manette'} (${J.gameIdentifier(m).slice(0,9)})`])]);}
      sel.value=joyProfile.devices.main?joyKey(joyProfile.devices.main):'auto';
    }
    function joySlider(id,v,unit){const el=$(id);el.value=v;const o=el.parentElement&&el.parentElement.querySelector?el.parentElement.querySelector('output'):null;if(o)o.textContent=joyFmt(v)+(unit?' '+unit:'');}
    function joySync(){
      if(!joy.ready)return;const p=joyProfile;
      $('joyUseHotas').checked=p.useHotas;$('joyConfirmRoles').checked=p.confirmRoles;$('joyDeviceMatch').value=p.deviceMatch;joyMainOptions();
      for(const n of J.AXES){const b=p.axes[n];$(`joy${n}Device`).value=b.device||'';$(`joy${n}Axis`).value=String(b.axis);$(`joy${n}Invert`).checked=b.invert;
        joySlider(`joy${n}Sens`,b.sensitivity,'×');joySlider(`joy${n}Dz`,b.deadZone,'');}
      joyPanel();
    }
    function joyStatusText(){
      if(!joy.reading)return joyProfile.useHotas?'Lecture arrêtée. En vol, les manettes liées sont lues tant que le HOTAS est activé.':'Lecture arrêtée.';
      if(joy.error==='blocked')return 'Lecture refusée par la politique de la page : aucune manette n’est accessible ici.';
      if(joy.error==='api')return 'Ce navigateur ne donne pas accès aux manettes : utilise Chrome, Edge ou l’application de bureau.';
      if(joy.rolesInfo&&joy.rolesInfo.prompt)return JOY_PROMPTS[joy.rolesInfo.prompt];
      if(joy.learn)return `${JOY_NAMES[joy.learn]} : bouge l’axe voulu jusqu’en butée (un nouveau clic sur le bouton annule).`;
      if(!joy.pads.length)return 'Lecture en cours. Bouge un manche ou appuie sur un bouton : le navigateur ne montre une manette qu’après un geste.';
      return `Lecture en cours : ${joy.pads.length} manette${joy.pads.length>1?'s':''}. Les valeurs ci-dessous sont celles que l’entraîneur reçoit.`;
    }
    function joyAxisText(n,a){
      const b=joyProfile.axes[n],where=b.device&&b.axis>=0?`${JOY_REF_NAMES[b.device]}, axe ${b.axis}`:'non lié';
      if(!a)return where;
      if(a.status==='missing')return `${where} : introuvable`;
      if(a.status==='stale'&&joy.unconfirmed&&(b.device==='left'||b.device==='right'))return `${where} : en attente de la confirmation gauche et droite`;
      if(a.status==='stale')return `${where} : pas encore de signal`;
      if(a.status==='unbound')return a.value?`boutons ${joyNum(a.value)}`:where;
      return `${where} : brut ${a.raw===null?'—':joyNum(a.raw,3)} → ${joyNum(a.value)}`;
    }
    // Test view: every pad seen (name, identifier, tags), all its axes and the buttons held, numbered from 0 as in the
    // game's settings file. Rows are rebuilt only when the set of pads changes (a click is never lost in a rebuild).
    function joyDevicesView(){
      const box=$('joyDevices');if(!box||!box.replaceChildren)return;
      const pads=joy.reading?joy.pads:[],key=pads.map(p=>p.index+'|'+p.id).join(';');
      if(box.joyKey!==key){box.joyKey=key;box.replaceChildren();joy.rows=new Map();
        for(const p of pads){const row=document.createElement('div'),head=document.createElement('div'),axes=document.createElement('div'),buttons=document.createElement('div');row.className='joy-device';row.append(head,axes,buttons);let main=null;
          if(p.mapping!=='standard'&&p.vendor){const b=document.createElement('button'),model=J.modelOf(p);main=b;b.textContent='En faire la manette principale';
            b.onclick=()=>{joyProfile.devices.main=model;joyChanged();const users=joyUsersOf('main');
              toast(`Manette principale : ${model.name||'manette'} (${J.gameIdentifier(model).slice(0,9)}). ${users.length?`Commandes qui la lisent désormais : ${users.join(', ')}.`:'Aucune commande ne la lit encore.'}`);};row.append(b);}
          box.append(row);joy.rows.set(p.index,{head,axes,buttons,main});}}
      for(const p of pads){const v=joy.rows.get(p.index);if(!v)continue;const tags=[];if(v.main)v.main.hidden=J.sameModel(joyProfile.devices.main,p);
        if(J.isVirtual(p))tags.push('virtuelle (vJoy)');if(p.mapping==='standard')tags.push('manette de jeu standard : non prise en charge ici');
        for(const r of J.REFS)if(joy.res[r].includes(p.index))tags.push(JOY_REF_NAMES[r]+(joy.unconfirmed&&r!=='main'?' (proposé, à confirmer)':''));
        tags.push(joy.live.has(p.index)?'reçoit':'pas encore de signal');if(J.hatMute(joy.fresh,p.index))tags.push('chapeau muet');
        v.head.textContent=`n° ${p.index} · ${p.name||'manette sans nom'}${p.vendor?` · ${J.gameIdentifier(p).slice(0,9)}`:''} · ${tags.join(' · ')}`;
        const hat=J.hatKnown(p)?J.decodeHat(p.axes[J.presetHat(p)]):null,on=p.buttons.map((b,i)=>b?i:-1).filter(i=>i>=0);
        v.axes.textContent='Axes : '+p.axes.map((x,i)=>`${i} ${Math.abs(x)>1.05?'centré':joyNum(x)}`).join(' · ')+(hat?` · chapeau ${HAT_FR[hat]}`:'');
        v.buttons.textContent=`Boutons appuyés (numéros du jeu, à partir de 0) : ${on.length?on.join(', '):'aucun'}`;}
    }
    function joyPanel(){
      if(!joy.ready)return;
      $('joyRead').textContent=joy.reading?'Arrêter la lecture':'Lire les manettes';$('joyStatus').textContent=joyStatusText();
      joyMainOptions();joyDevicesView();
      for(const n of J.AXES){const a=joy.reading&&joy.frame?joy.frame.axes[n]:null,t=$(`joy${n}Live`),m=$(`joy${n}Meter`),l=$(`joy${n}Learn`),v=a?a.value:0;
        if(t)t.textContent=joyAxisText(n,a);
        if(m&&m.style){m.style.left=(50+Math.min(0,v)*50)+'%';m.style.width=(Math.abs(v)*50)+'%';}
        if(l)l.textContent=joy.learn===n?'Bouge l’axe…':'Détecter';}
    }
    // Import of the game's joystick section: the file the player picks is read here, in the page, and sent nowhere; a
    // preview lists what was found and asks which device of this PC each device of the file is.
    let joyApplying=null;   // the open preview's « Appliquer » (null once it is closed), for the test hook joyApply
    function joyPreviewClose(){const box=$('joyPreview');if(box){box.hidden=true;if(box.replaceChildren)box.replaceChildren();}joyApplying=null;}
    function joyPreview(parsed){
      const box=$('joyPreview');if(!box||!box.replaceChildren)return;box.replaceChildren();box.hidden=false;joyApplying=null;
      const line=text=>{const d=document.createElement('div');d.textContent=text;box.append(d);return d;};
      const dev=d=>d?`${d.name||'manette'} (${J.gameIdentifier(d).slice(0,9)})`:'aucune manette';
      // A hat direction of a device whose hat layout is not known (a vJoy POV can be 4-way or continuous) is not bound.
      const src=s=>!s?'':s.button>=0?`bouton ${s.button} de ${dev(s.device)}`:s.hat>=0&&s.dir?`chapeau ${s.hat} ${HAT_FR[s.dir]||s.dir} de ${dev(s.device)}${J.hatKnown(s.device)?'':' (codage du chapeau non vérifié sur cet appareil : non repris)'}`:'';
      line('Configuration joystick lue dans le fichier du jeu (rien n’est modifié dans le jeu) :').className='joy-tag';
      if(parsed.useHotas!==null)line(`HOTAS dans le jeu : ${parsed.useHotas?'activé. D’après des joueurs, la souris et le clavier ne pilotent alors plus l’hélicoptère ; l’entraîneur les garde actifs tant que ce n’est pas vérifié (supposé).':'désactivé.'}`);
      for(const n of JOY_ROWS){const a=parsed.axes[n];if(!a)continue;
        const parts=[a.device&&a.axis>=0?`${dev(a.device)}, axe ${a.axis}`:'aucun axe'];
        if(a.invert)parts.push('inversé');if(a.sensitivity!==null)parts.push('sensibilité '+joyFmt(a.sensitivity));if(a.deadZone!==null)parts.push('zone morte '+joyFmt(a.deadZone));
        const plus=src(a.positive),minus=src(a.negative);if(plus)parts.push('sens + : '+plus);if(minus)parts.push('sens − : '+minus);
        line(`${JOY_NAMES[n]} : ${parts.join(', ')}.`);}
      const kept=parsed.actions.filter(x=>x.action),other=parsed.actions.filter(x=>!x.action);
      if(kept.length)line('Boutons : '+kept.map(x=>`${labels[x.action]} = bouton ${x.button} de ${dev(x.device)}`).join(' ; ')+'.');
      if(other.length)line('Actions du jeu sans équivalent dans l’entraîneur, ignorées : '+other.map(x=>x.gameAction).join(', ')+'.');
      if(parsed.selfCentering)line('Collectif auto-centré activé dans le jeu : non reproduit (non mesuré).');
      for(const note of parsed.notes)line(note.code==='positional'?'Les numéros d’axe, de bouton et de chapeau sont lus par leur position : leur champ n’a pas de nom lisible dans le fichier du jeu.':note.code==='unreadable'?`${note.name} : ligne illisible, ignorée.`:'Une ligne trop longue a été ignorée.');
      // One question per device the file names (the game's identifier has no instance: two identical sticks look alike).
      const choice=new Map();
      J.gameDevices(parsed).forEach((d,i)=>{const label=document.createElement('label'),sel=document.createElement('select'),key=joyKey(d);label.textContent=`${dev(d)} est : `;
        joyFill(sel,[['main','la manette principale'],['left','le manche gauche'],['right','le manche droit']]);sel.value=J.REFS[Math.min(i,2)];choice.set(key,sel.value);
        sel.addEventListener('input',()=>choice.set(key,sel.value));label.append(sel);box.append(label);});
      const row=document.createElement('div'),apply=document.createElement('button'),cancel=document.createElement('button');row.className='actions';apply.textContent='Appliquer';cancel.textContent='Annuler';
      apply.onclick=()=>{const r=J.importGameJoystick(parsed,joyProfile,m=>choice.get(joyKey(m)));
        if(r.conflict.length){toast('Deux appareils du fichier sur la même manette : choisis un rôle différent pour chacun.');return;}
        joyProfile=r.profile;joy.roles=J.createRoles();joyPreviewClose();save();joySync();
        toast(`Configuration joystick du jeu appliquée : HOTAS ${joyProfile.useHotas?'activé':'désactivé'}, ${J.AXES.filter(n=>joyProfile.axes[n].device&&joyProfile.axes[n].axis>=0).length} axes et ${Object.keys(joyProfile.actions).length} boutons liés.`);};
      cancel.onclick=joyPreviewClose;joyApplying=apply.onclick;row.append(apply,cancel);box.append(row);
    }
    async function joyImport(file){
      try{if(file.size>400000)throw Error('too-large');const parsed=J.parseGameJoystick(await file.text());if(!parsed.found&&parsed.useHotas===null)throw Error('none');joyPreview(parsed);}
      catch(err){toast('Import refusé : '+({'too-large':'fichier trop volumineux',none:'aucune configuration joystick dans ce fichier'}[err.message]||'fichier illisible')+'.');}
    }
    function joyInit(){
      if(!$('joyUseHotas')||!$('joyPreview'))return;
      for(const n of J.AXES){
        joyFill($(`joy${n}Device`),[['','Aucune'],['main','Manette principale'],['left','Manche gauche'],['right','Manche droit']]);
        joyFill($(`joy${n}Axis`),[['-1','Aucun'],...Array.from({length:J.BOUNDS.axis+1},(_,i)=>[String(i),`Axe ${i}${HID_AXES[i]?' · '+HID_AXES[i]:''}`])]);
        const b=()=>joyProfile.axes[n],on=(id,fn)=>$(id).addEventListener('input',fn);
        on(`joy${n}Device`,()=>joyAxisDevice(n,$(`joy${n}Device`).value));
        on(`joy${n}Axis`,()=>{const v=parseInt($(`joy${n}Axis`).value,10);if(Number.isInteger(v))b().axis=v;joyChanged();});
        on(`joy${n}Invert`,()=>{b().invert=!!$(`joy${n}Invert`).checked;joyChanged();});
        on(`joy${n}Sens`,()=>{b().sensitivity=Number($(`joy${n}Sens`).value);joyChanged();});
        on(`joy${n}Dz`,()=>{b().deadZone=Number($(`joy${n}Dz`).value);joyChanged();});
        $(`joy${n}Learn`).onclick=()=>{joy.learn=joy.learn===n?null:n;joy.learnBase=new Map();if(joy.learn){joy.reading=true;joy.tick=0;}joyPanel();};
      }
      $('joyUseHotas').addEventListener('input',()=>joyHotas($('joyUseHotas').checked));
      $('joyConfirmRoles').addEventListener('input',()=>{joyProfile.confirmRoles=!!$('joyConfirmRoles').checked;joyChanged();});
      $('joyDeviceMatch').addEventListener('input',()=>{joyProfile.deviceMatch=$('joyDeviceMatch').value;joy.roles=J.createRoles();joyChanged();});
      $('joyMain').addEventListener('input',()=>{const v=$('joyMain').value;joyProfile.devices.main=v==='auto'?null:joyModelByKey(v);joyChanged();});
      $('joyRead').onclick=()=>joyReading(!joy.reading);
      $('joyIdentify').onclick=()=>{J.startIdentify(joy.roles);joy.reading=true;joy.tick=0;joyPanel();};
      $('joySwap').onclick=()=>{J.swapRoles(joy.roles,joyProfile.devices);joyChanged();toast('Manches gauche et droit inversés.');};
      $('importJoystick').onchange=async e=>{const file=e.target.files[0];if(!file)return;await joyImport(file);e.target.value='';};
      joy.ready=true;
    }
    document.addEventListener('keydown',e=>{
      if(capture(e.code)){e.preventDefault();return;}
      if(shopOpen){if(e.code==='Escape'||e.code===bindings.shop){e.preventDefault();closeShop();}return;}
      if(!running){if(e.code==='Escape'&&hasSession&&!summaryReason&&!$('pause').classList.contains('hidden')){e.preventDefault();resume();}return;}
      if(e.code==='Escape'){pause();return;}
      if(Object.values(bindings).includes(e.code))e.preventDefault();
      keySet.add(e.code);if(e.code===bindings.freeLook)lookDown(e.repeat);if(e.repeat)return;
      if(e.code===bindings.flares)flareRequest=true;
      if(e.code===bindings.shop)openShop();
      if(e.code===bindings.view){view=view==='cockpit'?'chase':'cockpit';toast(view==='chase'?'Vue poursuite':'Vue pilote');}
      if(e.code===bindings.reset){start();}
      if(e.code===bindings.neutral){P.resetInput(mouse);if(compatInput)virtualAnchor=lastPointer?{...lastPointer}:null;}
    });
    // Free look: held, or latched on by a double press until the next press. The latch is assumed from one public video
    // of a beta player (docs/SOURCES.md), not seen in the reference footage; whether the game holds or toggles it is not
    // measured yet.
    function lookDown(repeat){if(repeat)return;if(lookLatch){lookLatch=false;freeLookHeld=false;lookSkipUp=true;return;}freeLookHeld=true;if(performance.now()-lookUpAt<320)lookLatch=true;}
    function lookUp(){if(lookSkipUp){lookSkipUp=false;return;}lookUpAt=performance.now();if(!lookLatch)freeLookHeld=false;}
    // Alt alone would open the browser menu on release.
    document.addEventListener('keyup',e=>{keySet.delete(e.code);if(e.code===bindings.freeLook)lookUp();if(running&&Object.values(bindings).includes(e.code))e.preventDefault();});
    document.addEventListener('mousedown',e=>{if(capturing){e.preventDefault();e.stopPropagation();suppressClick=true;capture('Mouse'+e.button);return;}if(running&&(document.pointerLockElement||compatInput&&e.target===$('world'))){e.preventDefault();keySet.add('Mouse'+e.button);if('Mouse'+e.button===bindings.freeLook)lookDown(false);if('Mouse'+e.button===bindings.flares)flareRequest=true;}},true);
    document.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopPropagation();suppressClick=false;}},true);
    document.addEventListener('mouseup',e=>{keySet.delete('Mouse'+e.button);if('Mouse'+e.button===bindings.freeLook)lookUp();});
    document.addEventListener('contextmenu',e=>{if(running||capturing)e.preventDefault();});
    document.addEventListener('mousemove',e=>{
      if(!running||document.pointerLockElement!==$('world')&&!(compatInput&&e.target===$('world')))return;
      lastPointer={x:e.clientX,y:e.clientY};
      if(skipMouse){skipMouse=false;if(compatInput)virtualAnchor={...lastPointer};return;}
      let dx=e.movementX,dy=e.movementY;
      // Free look: the mouse turns the view; the helicopter keeps its attitude and the keys still fly (public player
      // videos, docs/SOURCES.md). 0.0025 rad per px and the limits +-149 / +-63 deg are chosen (not measured yet).
      if(freeLookHeld){lookYaw=P.clamp(lookYaw-dx*.0025,-2.6,2.6);lookPitch=P.clamp(lookPitch-dy*.0025,-1.1,1.1);return;}
      // Without capture the pointer's offset from its anchor is a stick deflection (both laws).
      if(compatInput){if(!virtualAnchor)virtualAnchor={...lastPointer};P.mouseStick(mouse,cfg,e.clientX-virtualAnchor.x,e.clientY-virtualAnchor.y);return;}
      // Captured pointer (movementX/Y in accelerated cursor px, as the measured K): shared input path.
      P.mouseMove(mouse,cfg,dx,dy);
    });
    document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement){compatInput=false;$('mouseMode').hidden=true;skipMouse=true;P.resetInput(mouse);}else if(running&&!compatInput)pause();});
    document.addEventListener('pointerlockerror',enableCompatibility);
    $('world').addEventListener('mouseleave',()=>{if(compatInput){clearInputs();skipMouse=true;virtualAnchor=null;}});
    // Joysticks: Chromium stops refreshing a hidden page's pads; shown again, their values are stale until a new report.
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause();if(document.hidden)joyStop();else J.markStale(joy.fresh);});
    window.addEventListener('blur',()=>{if(running)pause();else clearInputs();joyStop();});window.addEventListener('resize',resize);
    // In a browser tab, Ctrl+W closes the tab (Ctrl+Shift+W the window) and no page can cancel that shortcut, while the
    // game's default keys put collective down on Left Ctrl and pitch down on W. While a session is in progress (flying
    // or paused, not over) the page asks the browser to confirm leaving (chosen). The desktop app has no such shortcut
    // and closes without asking (desktop/main.cjs).
    window.addEventListener('beforeunload',e=>{if(hasSession&&!summaryReason){e.preventDefault();e.returnValue='';}});
    $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();pause();toast('Affichage 3D interrompu. Recharge la page pour reprendre.');});
    // ---- Map card of the menu (v12): generated maps, light presets of the game ----
    function renderMapCard(){
      if(!$('mapName'))return;
      $('mapName').textContent=W.name;
      const n=(a,s,p)=>`${a} ${a>1?p:s}`,info=[W.generated?`Carte générée n° ${W.seed}`:'Relief et échelle mesurés sur les enregistrements de référence',n(W.TOWERS.length,'tour','tours'),n(W.TOWNS.length,'village','villages'),n(W.FIELDS.length,'champ','champs')];
      if(W.BRIDGES.length)info.push(n(W.BRIDGES.length,'pont','ponts'));if(W.VIADUCT)info.push('viaduc');$('mapInfo').textContent=info.join(' · ');
      const c=$('mapPreview');if(!c||!c.getContext||!minimap)return;const g=c.getContext('2d');if(!g)return;
      // Play area (about 3.6 km): the helipad and the numbered towers.
      const x0=-1900,z0=-3150,span=3600,k=c.width/span,mk=MAP.px/MAP.size;g.drawImage(minimap,(x0-MAP.x0)*mk,(z0-MAP.z0)*mk,span*mk,span*mk,0,0,c.width,c.height);
      g.fillStyle='#e9ebe6';g.font='bold 12px Bahnschrift, Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('H',(W.PAD.x-x0)*k,(W.PAD.z-z0)*k);
      for(const t of W.TOWERS){const x=(t.x-x0)*k,y=(t.z-z0)*k;g.strokeStyle='#e9ebe6';g.strokeRect(x-6,y-6,12,12);g.fillText(String(t.id+1),x,y+1);}
    }
    function chooseMap(id,random=cfg.mapRandomEach){
      try{localStorage.setItem(W.STORE_KEY,JSON.stringify({id,random}));}catch(e){}save();
      try{location.hash='carte='+id;location.reload();}catch(e){toast('Recharge la page pour changer de carte.');}
    }
    if($('lighting')&&$('lighting').replaceChildren){const sel=$('lighting'),opt=(v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;sel.append(o);};sel.replaceChildren();opt('random','Au hasard à chaque partie (les 8 ambiances du jeu)');for(const [key,L] of Object.entries(W.LIGHTS))opt(key,L.label);}
    if($('mapNew'))$('mapNew').onclick=()=>chooseMap('gen-'+(1+Math.floor(Math.random()*999998)));
    if($('mapVideo'))$('mapVideo').onclick=()=>{cfg.mapRandomEach=false;chooseMap('vallee',false);};
    if($('mapRandomEach'))$('mapRandomEach').addEventListener('input',()=>{try{localStorage.setItem(W.STORE_KEY,JSON.stringify({id:W.id,random:$('mapRandomEach').checked}));}catch(e){}toast($('mapRandomEach').checked?'Une nouvelle carte sera générée à chaque chargement de la page.':'La carte actuelle sera gardée au prochain chargement.');});
    if($('lighting'))$('lighting').addEventListener('input',()=>{if(!hasSession)pickLight();});
    try{if(history.replaceState&&location.protocol!=='about:')history.replaceState(null,'','#carte='+W.id);}catch(e){}
    buildMinimap();joyInit();syncUI();renderMapCard();resize();createTargets();if(!window.__LB_MANUAL_CLOCK__)requestAnimationFrame(animate);$('start').disabled=false;showScreen('menu');selectTab('modes');$('saveState').textContent='Prêt — sauvegarde locale automatique';
    if(!storageOK)$('saveState').textContent='Stockage indisponible — utilise l’export de profil';
    if(notices.length){toast(notices.splice(0).join(' '));save();}
    // Read-only diagnostic state for verification; no telemetry leaves this computer.
    window.trainerDiagnostics=()=>({running,compatInput,view,time,mode:MODE_OF(run.scenario),stats:{...stats},position:flight.position.toArray(),velocity:flight.velocity.toArray(),quaternion:flight.quaternion.toArray(),collective:flight.collective,onGround:flight.onGround,attitude:flight.attitude(),gunSpin:gun.spin,heliAlive,look:{yaw:lookYaw,pitch:lookPitch,held:freeLookHeld},
      ammo,health,fuel,fuelOut,score,shopOpen,hot:hot?{center:hot.center.toArray(),next:hot.next}:null,
      targets:targets.map(t=>({active:t.active,position:t.group.position.toArray(),health:t.health,aa:!!t.aa,convoy:!!t.convoy,enemyHeli:!!t.enemyHeli})),towers:towers.map(t=>({captured:t.captured,progress:t.capture,height:t.structure})),
      battle:{structures:battle.structures.map(s=>({type:s.type,alive:s.alive,position:s.position.toArray()})),soldiers:battle.soldiers.map(s=>({state:s.state,alive:s.alive,role:s.role,pose:s.pose,position:s.position.toArray()})),vehicles:battle.vehicles.map(v=>({alive:v.alive,position:v.position.toArray()})),stats:{...battle.stats}},
      scenery:{trees:scenery.treeCount,solids:obstacles.items.length,wires:wires.length,bushes:scenery.forest.bushes?scenery.forest.bushes.count:0,rocks:scene.getObjectByName('rochers')?.count||0,houses:W.HOUSES.length,fields:W.FIELDS.length,bridges:W.BRIDGES.length,viaduct:!!W.VIADUCT,containers:scenery.containers},
      map:{id:W.id,name:W.name,generated:W.generated,seed:W.seed,towers:W.TOWERS.map(t=>({x:t.x,z:t.z,h:t.h}))},light:{name:lightName,sun:sunDirection.toArray(),fog:scene.fog.density},
      graphics:{post:!!post,environment:!!scene.environment,fovVertical:camera.fov,shadowMap:sun.shadow.mapSize.x},bullets:bullets.length,settings:{...cfg},run:{...run},bindings:{...bindings},webgl:renderer.info.render,mouse:{law:cfg.mouseLaw,pitch:mouse.mousePitch,yaw:mouse.mouseYaw,ratePitch:mouse.ratePitch,rateYaw:mouse.rateYaw,lagged:flight.mouseRate.toArray().map(x=>x*180/Math.PI)},fps:Math.round(fps),
      camera:{fovHorizontal:horizontalFov(),chaseZoom,chaseYaw,tapeHeading:tapeHeading(),position:camera.position.toArray()},
      audio:{state:sfx.state,lockGain:sfx.lockGain?sfx.lockGain.gain.value:0,rotorGain:sfx.rotorGain?sfx.rotorGain.gain.value:0,spinGain:sfx.spinGain?sfx.spinGain.gain.value:0,
        enemyVoices:sfx.voices?sfx.voices.size:0,enemyRotor:sfx.voices?Math.max(0,...[...sfx.voices.values()].map(v=>v.rotorGain.gain.value)):0,
        cabinShelfDb:sfx.cabin?sfx.cabin.gain.value:0,engineBus:sfx.bus?sfx.bus.engine.gain.value:0},
      air:{active:aaActive,warning:defense.warning,charges:defense.charges,cooldown:defense.cooldown,missiles:defense.missiles.map(m=>({position:m.position.toArray(),target:m.target})),flares:defense.flares.length,launchers:defense.launchers.map(l=>({site:l.site.id,kind:l.kind,unit:l.unit?l.unit.soldier?'verba':'sam':null,state:l.state,dead:l.dead,ammo:l.ammo,position:l.eye.toArray(),soldier:l.unit&&l.unit.soldier?l.unit.soldier.state:null})),
        samSites:samSites.map(u=>({alive:u.emp.alive,crew:!!(u.emp.crew&&u.emp.crew.alive),loaded:u.loaded.filter(Boolean).length})),stats:JSON.parse(JSON.stringify(defense.stats))},
      ciws:ciwsList.map(u=>({dead:u.dead,manned:!!(u.emp.crew&&u.emp.crew.alive),visible:u.visible,firing:!u.dead&&time<u.firingUntil,ammo:u.ammo,reserve:u.reserve,reloading:u.reloadTimer>0,health:u.target.health,position:u.view.group.position.toArray(),muzzle:u.muzzle.toArray()})),ciwsStats:{...ciwsStats},
      bots:bots.map(t=>({active:t.active,falling:t.bot.falling,skill:t.bot.pilot.skillName,mode:t.bot.pilot.mode,health:t.health,position:t.bot.flight.position.toArray(),speed:t.bot.flight.velocity.length(),distance:t.bot.flight.position.distanceTo(flight.position),firing:t.active&&time<t.bot.firingUntil,shots:t.bot.shots,
        weapon:t.bot.weapon,ammo:t.bot.ammo,rockets:t.bot.rockets,rearming:t.bot.rearming,flank:t.bot.pilot.flank})),
      enemyRounds:enemyRounds.length,duel:duel?{...duel}:null,rockets:{flying:rockets.length,...rocketStats},
      vehicles:battle.vehicles.map(v=>({kind:v.kind,armed:v.armed,alive:v.alive,firing:v.firing})),factions:[...new Set(battle.soldiers.map(s=>s.faction))]});
    // Test hook (mock DOM tests only): hands the internals to the harness.
    if(window.__LB_EXPOSE__)window.__LB_EXPOSE__({start,pause,resume,step,updateCamera,drawHud,flight,gun,camera,scene,scenery,obstacles,towers,wires,defense,battle,cockpit,createTargets,openShop,closeShop,finish,destroyHeli,applyLight,get lightName(){return lightName;},
      // v13: one display frame at time now (ms), the mouse input state, the helicopter group, chase zoom and tape heading.
      frame:animate,mouse,own,get chaseZoom(){return chaseZoom;},get chaseYaw(){return chaseYaw;},tapeHeading,get accumulator(){return accumulator;},
      lookDown,lookUp,get freeLook(){return {held:freeLookHeld,latch:lookLatch,yaw:lookYaw,pitch:lookPitch};},
      get running(){return running;},get time(){return time;},get view(){return view;},
      get targets(){return targets;},get samSites(){return samSites;},get stats(){return stats;},get cfg(){return cfg;},get run(){return run;},get bullets(){return bullets;},get heliAlive(){return heliAlive;},get bindings(){return bindings;},get ammo(){return ammo;},set ammo(v){ammo=v;},get health(){return health;},set health(v){health=v;},get fuel(){return fuel;},set fuel(v){fuel=v;},get score(){return score;},get hot(){return hot;},
      setConfig(values){Object.assign(cfg,values);run=sessionConfig();defense.cfg=run;battle.cfg=run;},pushRound(p,v){bullets.push({p,v,age:0,previous:p.clone()});},setTime(value){time=value;},setView(value){view=value;},setLook(yaw,pitch){lookYaw=yaw;lookPitch=pitch;freeLookHeld=!!(yaw||pitch);},
      get bots(){return bots;},get enemyRounds(){return enemyRounds;},get rockets(){return rockets;},get duel(){return duel;},addBot,placeBot,heliHits,get ciws(){return ciwsList;},get ciwsStats(){return ciwsStats;},addCiws,CIWS,
      addVerba,addSamSite,resetAir(){for(const u of samSites)scene.remove(u.view.group);samSites=[];targets=targets.filter(t=>!t.samSite);for(const u of ciwsList)scene.remove(u.view.group);ciwsList=[];targets=targets.filter(t=>!t.ciws);battle.reset();defense.reset([],1);aaActive=true;},
      // Joystick panel (J1) for the joystick golden suite and the specs, without the ids of its controls: each member runs what its control runs.
      joyReading,joyHotas,joyAxisDevice,joyImport,joyApply(){if(joyApplying)joyApplying();},joyCancel:joyPreviewClose,
      joyDevices(){return joy.reading?joy.pads.map(p=>p.name):[];},joyPreviewShown(){const box=$('joyPreview');return box&&!box.hidden?{rows:box.children.length,text:box.textContent}:null;}});
  }
  // Let the loading screen paint before the valley is built (2-3 s).
  if(window.__LB_SYNC__)boot();else requestAnimationFrame(()=>setTimeout(boot,30));
})();





