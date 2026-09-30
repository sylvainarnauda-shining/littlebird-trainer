/* Synthesised sounds matched to the reference recordings of the game (original
   synthesis, no sample copied). Measured on their audio (docs/analyse/son.md):
   - flight: low rumble peaking at 120-250 Hz, tone near 225 Hz, blade
     modulation around 31-38 Hz, almost no change with speed (no wind hiss);
   - minigun: a sharp report every 33 ms (30 per second) dominated by the
     20-120 Hz band with a bright crack, 50 % decay in 2 ms, 10 % in 25 ms;
     barrel spin: high-frequency rattle (4-16 kHz) before the first round.
   Offline synthesis functions are pure (testable in Node); SoundEngine
   plays them with Web Audio in the browser. */
(function(root){
  const pow=typeof module!=='undefined'?require('./core/pow.js').pow:root.HeliPow.pow; // same double on every platform
  // Octave bands used for the measurements (Hz).
  const BANDS=[[20,60],[60,120],[120,250],[250,500],[500,1000],[1000,2000],[2000,4000],[4000,8000],[8000,16000]];
  // Band levels measured on the recordings (dB, arbitrary reference).
  const MEASURED={rotor:[18,22,26,20,10,9,5,-4,-12],gun:[44,40,31,28,26,26,22,18,14]};
  function rng(seed){let s=(seed>>>0)||1;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296*2-1;};}
  // RBJ biquad applied offline.
  function biquad(x,sr,type,f0,q=.7071,gainDb=0){
    const A=pow(10,gainDb/40),w=2*Math.PI*f0/sr,c=Math.cos(w),s=Math.sin(w),al=s/(2*q);let b0,b1,b2,a0,a1,a2;
    if(type==='lowpass'){b0=(1-c)/2;b1=1-c;b2=(1-c)/2;a0=1+al;a1=-2*c;a2=1-al;}
    else if(type==='highpass'){b0=(1+c)/2;b1=-(1+c);b2=(1+c)/2;a0=1+al;a1=-2*c;a2=1-al;}
    else if(type==='bandpass'){b0=al;b1=0;b2=-al;a0=1+al;a1=-2*c;a2=1-al;}
    else {b0=1+al*A;b1=-2*c;b2=1-al*A;a0=1+al/A;a1=-2*c;a2=1-al/A;}   // peaking
    const out=new Float32Array(x.length);let x1=0,x2=0,y1=0,y2=0;
    for(let i=0;i<x.length;i++){const y=(b0*x[i]+b1*x1+b2*x2-a1*y1-a2*y2)/a0;x2=x1;x1=x[i];y2=y1;y1=y;out[i]=y;}
    return out;
  }
  const mixInto=(dst,src,g)=>{for(let i=0;i<dst.length;i++)dst[i]+=src[i]*g;return dst;};
  const peak=x=>{let m=0;for(const v of x)m=Math.max(m,Math.abs(v));return m||1;};
  function normalise(x,level=.9){const k=level/peak(x);for(let i=0;i<x.length;i++)x[i]*=k;return x;}
  // One minigun report: sub thump + body + bright crack.
  function synthShot(sr,seed=1){
    const n=Math.round(sr*.09),r=rng(seed),x=new Float32Array(n),noise=new Float32Array(n);
    for(let i=0;i<n;i++)noise[i]=r();
    const env=new Float32Array(n);for(let i=0;i<n;i++){const t=i/sr;env[i]=(t<.0004?t/.0004:1)*(.42*Math.exp(-t/.0035)+.58*Math.exp(-t/.027));}
    // Crack: broadband noise with a gentle downward tilt.
    const crack=biquad(biquad(biquad(noise,sr,'highpass',300),sr,'lowpass',6500,.5),sr,'peaking',700,.7,3);for(let i=0;i<n;i++)crack[i]*=env[i];
    // Body: 60-500 Hz noise, slightly longer.
    const body=biquad(biquad(noise,sr,'lowpass',200,.8),sr,'highpass',45);for(let i=0;i<n;i++){const t=i/sr;body[i]*=Math.exp(-t/.022);}
    // Sub thump: decaying sine around 50 Hz with a pitch drop.
    const sub=new Float32Array(n);let ph=0;for(let i=0;i<n;i++){const t=i/sr,f=62-22*Math.min(1,t/.03);ph+=2*Math.PI*f/sr;sub[i]=Math.sin(ph)*Math.exp(-t/.022)*(t<.001?t/.001:1);}
    mixInto(x,crack,3.2);mixInto(x,body,5);mixInto(x,sub,.8);
    return normalise(x,.95);
  }
  // Rotor and turbine loop (seconds long, seamless).
  function synthRotor(sr,seconds=2,seed=7){
    const n=Math.round(sr*seconds),r=rng(seed),noise=new Float32Array(n);for(let i=0;i<n;i++)noise[i]=r();
    const blade=35.5;   // blade-pass rate (measured 31-38 Hz)
    // Periodic: choose a rate with an integer number of cycles in the loop.
    const f=Math.round(blade*seconds)/seconds,tone=Math.round(225*seconds)/seconds,sub=Math.round(37*seconds)/seconds;
    const low=biquad(biquad(biquad(noise,sr,'lowpass',420,.8),sr,'highpass',70),sr,'peaking',180,.8,6);
    const air=biquad(biquad(biquad(noise,sr,'lowpass',3000,.5),sr,'lowpass',12000,.7),sr,'highpass',500);
    const x=new Float32Array(n);
    for(let i=0;i<n;i++){
      const t=i/sr,beat=.5+.5*Math.cos(2*Math.PI*f*t),slap=.55+.45*(beat*beat);
      x[i]=low[i]*slap*1.0+air[i]*.3*(.8+.2*slap)+Math.sin(2*Math.PI*tone*t)*.055*(.85+.15*slap)+Math.sin(2*Math.PI*tone*2*t)*.012+Math.sin(2*Math.PI*sub*t)*.018;
    }
    // Crossfade the ends so the loop is seamless.
    const fade=Math.round(sr*.05);for(let i=0;i<fade;i++){const a=i/fade;x[i]=x[i]*a+x[n-fade+i]*(1-a);}
    return normalise(x.subarray(0,n-fade).slice(),.8);
  }
  // Explosion: deep boom with crackle.
  function synthExplosion(sr,seed=3,size=1){
    const n=Math.round(sr*2.4),r=rng(seed),noise=new Float32Array(n);for(let i=0;i<n;i++)noise[i]=r();
    const boom=biquad(biquad(noise,sr,'lowpass',140,.9),sr,'highpass',25),crack=biquad(noise,sr,'highpass',900),x=new Float32Array(n);
    for(let i=0;i<n;i++){const t=i/sr,e=(t<.004?t/.004:1)*Math.exp(-t/(.35*size)),c=Math.exp(-t/.06)*(r()>.992?1:.35);x[i]=boom[i]*e*4+crack[i]*c*.5;}
    return normalise(x,.95);
  }
  // Mean power per band (dB) of a signal: Welch, Hann window.
  function bandLevels(x,sr){
    const N=4096,win=new Float32Array(N);for(let i=0;i<N;i++)win[i]=.5-.5*Math.cos(2*Math.PI*i/(N-1));
    const power=new Float64Array(N/2+1);let frames=0;
    for(let s=0;s+N<=x.length;s+=N/2){const re=new Float64Array(N),im=new Float64Array(N);for(let i=0;i<N;i++)re[i]=x[s+i]*win[i];fft(re,im);for(let k=0;k<=N/2;k++)power[k]+=re[k]*re[k]+im[k]*im[k];frames++;}
    if(!frames){const re=new Float64Array(N),im=new Float64Array(N);for(let i=0;i<Math.min(N,x.length);i++)re[i]=x[i]*win[i];fft(re,im);for(let k=0;k<=N/2;k++)power[k]+=re[k]*re[k]+im[k]*im[k];frames=1;}
    return BANDS.map(([a,b])=>{let sum=0,c=0;for(let k=0;k<=N/2;k++){const f=k*sr/N;if(f>=a&&f<b){sum+=power[k]/frames;c++;}}return 10*Math.log10(sum/Math.max(1,c)+1e-20);});
  }
  function fft(re,im){
    const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
    for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const ur=re[i+j],ui=im[i+j],vr=re[i+j+len/2]*cr-im[i+j+len/2]*ci,vi=re[i+j+len/2]*ci+im[i+j+len/2]*cr;re[i+j]=ur+vr;im[i+j]=ui+vi;re[i+j+len/2]=ur-vr;im[i+j+len/2]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}
  }
  // Minigun report times: one every 33 ms while the barrels are at speed.
  const SHOT_INTERVAL=1/30;
  function scheduleShots(from,to,next,interval=SHOT_INTERVAL){const out=[];let t=Math.max(from,next);while(t<to){out.push(t);t+=interval;}return {times:out,next:t};}

  // ---- Web Audio engine (browser only) ----
  class SoundEngine{
    constructor(){this.ctx=null;this.ready=false;this.nextShot=0;this.shotVariant=0;this.voices=new Map();}
    start(volume=.22){
      if(this.ctx){this.ctx.resume().catch(()=>{});return true;}
      const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return false;
      try{
        const ac=this.ctx=new AC(),sr=ac.sampleRate,buffer=data=>{const b=ac.createBuffer(1,data.length,sr);b.getChannelData(0).set(data);return b;};
        this.master=ac.createGain();this.master.gain.value=volume;
        const comp=ac.createDynamicsCompressor();comp.threshold.value=-14;comp.knee.value=12;comp.ratio.value=4;comp.attack.value=.003;comp.release.value=.2;
        this.master.connect(comp);comp.connect(ac.destination);
        // Short outdoor reverb for weapons and explosions.
        const ir=ac.createBuffer(2,Math.round(sr*1.3),sr);for(let c=0;c<2;c++){const d=ir.getChannelData(c),r=rng(11+c);for(let i=0;i<d.length;i++){const t=i/sr;d[i]=r()*Math.exp(-t/.28)*(t<.02?t/.02:1)*.6;}}
        this.reverb=ac.createConvolver();this.reverb.buffer=ir;this.wet=ac.createGain();this.wet.gain.value=.22;this.reverb.connect(this.wet);this.wet.connect(this.master);
        this.bus={engine:ac.createGain(),weapons:ac.createGain(),alerts:ac.createGain(),world:ac.createGain()};
        for(const k of Object.keys(this.bus))this.bus[k].connect(this.master);this.bus.weapons.connect(this.reverb);this.bus.world.connect(this.reverb);
        // v12: cabin of the pilot view (measured on the recordings, docs/analyse/son.md: the flight
        // sound is about 6 dB louder at 60-400 Hz in the pilot view than in the chase view, 2-3 dB
        // weaker at 2.5-6 kHz and 10 dB weaker above 10 kHz).
        this.bus.engine.disconnect();this.cabin=ac.createBiquadFilter();this.cabin.type='highshelf';this.cabin.frequency.value=4500;this.cabin.gain.value=0;
        this.bus.engine.connect(this.cabin);this.cabin.connect(this.master);
        // Rotor loop; playback rate follows the load a little.
        this.rotorBuffer=buffer(synthRotor(sr,2));this.rotor=ac.createBufferSource();this.rotor.buffer=this.rotorBuffer;this.rotor.loop=true;this.rotorGain=ac.createGain();this.rotorGain.gain.value=0;
        this.rotor.connect(this.rotorGain);this.rotorGain.connect(this.bus.engine);this.rotor.start();
        // Soft airflow, only perceptible at high speed (the game has almost none).
        const noise=new Float32Array(sr*2),r=rng(5);for(let i=0;i<noise.length;i++)noise[i]=r();this.noise=buffer(noise);
        this.air=ac.createBufferSource();this.air.buffer=this.noise;this.air.loop=true;this.airFilter=ac.createBiquadFilter();this.airFilter.type='bandpass';this.airFilter.frequency.value=600;this.airFilter.Q.value=.6;
        this.airGain=ac.createGain();this.airGain.gain.value=0;this.air.connect(this.airFilter);this.airFilter.connect(this.airGain);this.airGain.connect(this.bus.engine);this.air.start();
        // Barrel spin: high rattle (4-16 kHz) modulated at 50 Hz, rising with the spin.
        this.spin=ac.createBufferSource();this.spin.buffer=this.noise;this.spin.loop=true;this.spinFilter=ac.createBiquadFilter();this.spinFilter.type='highpass';this.spinFilter.frequency.value=3500;
        this.spinGain=ac.createGain();this.spinGain.gain.value=0;this.spinMod=ac.createGain();this.spinMod.gain.value=.5;
        this.spinLfo=ac.createOscillator();this.spinLfo.frequency.value=50;const lfoDepth=ac.createGain();lfoDepth.gain.value=.5;this.spinLfo.connect(lfoDepth);lfoDepth.connect(this.spinMod.gain);this.spinLfo.start();
        this.spin.connect(this.spinFilter);this.spinFilter.connect(this.spinMod);this.spinMod.connect(this.spinGain);this.spinGain.connect(this.bus.weapons);this.spin.start();
        // Reports: a few variants of the synthesised shot.
        this.shots=[1,2,3,4].map(s=>buffer(synthShot(sr,s)));
        this.explosions=[1,2].map(s=>buffer(synthExplosion(sr,s)));
        // Lock warning tone.
        this.lockOsc=ac.createOscillator();this.lockOsc.type='square';this.lockFilter=ac.createBiquadFilter();this.lockFilter.type='lowpass';this.lockFilter.frequency.value=3200;this.lockGain=ac.createGain();this.lockGain.gain.value=0;
        this.lockOsc.connect(this.lockFilter);this.lockFilter.connect(this.lockGain);this.lockGain.connect(this.bus.alerts);this.lockOsc.start();
        // Incoming missile motor, panned toward the nearest missile.
        this.missile=ac.createBufferSource();this.missile.buffer=this.noise;this.missile.loop=true;this.missileFilter=ac.createBiquadFilter();this.missileFilter.type='bandpass';this.missileFilter.frequency.value=1400;this.missileFilter.Q.value=.8;
        this.missileGain=ac.createGain();this.missileGain.gain.value=0;this.missilePan=ac.createStereoPanner?ac.createStereoPanner():null;
        this.missile.connect(this.missileFilter);this.missileFilter.connect(this.missileGain);if(this.missilePan){this.missileGain.connect(this.missilePan);this.missilePan.connect(this.bus.world);}else this.missileGain.connect(this.bus.world);this.missile.start();
        this.ready=true;return true;
      }catch(e){this.ready=false;return false;}
    }
    get state(){return this.ctx?this.ctx.state:'none';}
    // Per-frame update. s: {running, alive, volume, mix:{engine,weapons,alerts}, collective, speed (m/s), spin (0-1), firing, warning, beepOn, toneHz, missileDistance, missilePan, view:'cockpit'|'chase'}
    update(s){
      if(!this.ready)return;const ac=this.ctx,now=ac.currentTime,on=s.running&&s.alive,mix=s.mix||{};
      this.master.gain.setTargetAtTime(s.volume,now,.08);
      const cabin=s.view==='cockpit';this.cabin.gain.setTargetAtTime(cabin?-8:0,now,.1);
      this.bus.engine.gain.setTargetAtTime((mix.engine??1)*(cabin?1.95:1),now,.1);this.bus.weapons.gain.setTargetAtTime(mix.weapons??1,now,.1);this.bus.alerts.gain.setTargetAtTime(mix.alerts??1,now,.1);
      this.rotorGain.gain.setTargetAtTime(on?.5+.08*s.collective:0,now,.15);this.rotor.playbackRate.setTargetAtTime(1+.035*s.collective,now,.3);
      const fast=Math.max(0,Math.min(1,(s.speed-40)/40));this.airGain.gain.setTargetAtTime(on?fast*fast*.035:0,now,.4);this.airFilter.frequency.setTargetAtTime(500+fast*500,now,.4);
      this.spinGain.gain.setTargetAtTime(on?s.spin*.12:0,now,.04);this.spinLfo.frequency.setTargetAtTime(20+30*s.spin,now,.05);
      // Reports scheduled 60 ms ahead at 30 per second.
      if(on&&s.firing&&s.spin>=1){
        if(this.nextShot<now)this.nextShot=now+.005;
        const {times,next}=scheduleShots(now,now+.06,this.nextShot);this.nextShot=next;
        for(const t of times){const src=ac.createBufferSource(),g=ac.createGain(),v=this.shotVariant++%this.shots.length;src.buffer=this.shots[v];src.playbackRate.value=.94+.12*Math.random();g.gain.value=.55+.15*Math.random();
          let out=g;if(ac.createStereoPanner){const p=ac.createStereoPanner();p.pan.value=v%2?.18:-.18;g.connect(p);out=p;}src.connect(g);out.connect(this.bus.weapons);src.start(t);}
      }else this.nextShot=0;
      this.lockOsc.frequency.setTargetAtTime(s.toneHz||1000,now,.01);this.lockGain.gain.setTargetAtTime(on&&s.beepOn?.075:0,now,.004);
      const md=s.missileDistance;this.missileGain.gain.setTargetAtTime(s.running&&md!=null?Math.min(1,70/md)*.45:0,now,.05);
      if(md!=null){this.missileFilter.frequency.setTargetAtTime(900+Math.min(1,600/md)*2200,now,.05);if(this.missilePan)this.missilePan.pan.setTargetAtTime(s.missilePan||0,now,.05);}
      this.updateEnemies(s.enemies||[],now,!!s.running);
    }
    // Enemy helicopters and guns (not measured: same synthesis as the player's, heard
    // from afar). A helicopter has its rotor loop and its minigun reports; a CIWS
    // (rotor:false) only its reports, lower (pitch) and faster (interval). Both are
    // delayed (340 m/s), attenuated and darkened with the distance, and panned.
    enemyVoice(id){
      let v=this.voices.get(id);if(v)return v;
      const ac=this.ctx;v={rotor:ac.createBufferSource(),rotorFilter:ac.createBiquadFilter(),rotorGain:ac.createGain(),gunFilter:ac.createBiquadFilter(),gunGain:ac.createGain(),pan:ac.createStereoPanner?ac.createStereoPanner():null,next:0};
      v.rotor.buffer=this.rotorBuffer;v.rotor.loop=true;v.rotor.playbackRate.value=.96+.08*Math.random();v.rotorFilter.type='lowpass';v.rotorGain.gain.value=0;v.gunFilter.type='lowpass';v.gunGain.gain.value=0;
      v.rotor.connect(v.rotorFilter);v.rotorFilter.connect(v.rotorGain);v.gunFilter.connect(v.gunGain);
      const out=v.pan||this.bus.world;v.rotorGain.connect(out);v.gunGain.connect(out);if(v.pan)v.pan.connect(this.bus.world);
      v.rotor.start(0,Math.random()*1.5);this.voices.set(id,v);return v;
    }
    updateEnemies(list,now,running){
      const ac=this.ctx,active=new Set();
      for(const e of list){
        const v=this.enemyVoice(e.id),d=Math.max(5,e.distance||0),on=running&&e.alive;active.add(e.id);
        v.rotorGain.gain.setTargetAtTime(on&&e.rotor!==false?.55*Math.min(1,40/d):0,now,.2);v.rotorFilter.frequency.setTargetAtTime(Math.max(250,3500-d*2.2),now,.2);
        v.gunGain.gain.setTargetAtTime(running?(e.loud||.6)*Math.min(1,60/d):0,now,.05);v.gunFilter.frequency.setTargetAtTime(Math.max(700,9000-d*6),now,.2);
        if(v.pan)v.pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,e.pan||0)),now,.08);
        if(running&&e.firing){
          if(v.next<now)v.next=now+.005;
          const {times,next}=scheduleShots(now,now+.06,v.next,e.interval||SHOT_INTERVAL);v.next=next;
          for(const t of times){const src=ac.createBufferSource();src.buffer=this.shots[this.shotVariant++%this.shots.length];src.playbackRate.value=(e.pitch||1)*(.92+.12*Math.random());src.connect(v.gunFilter);src.start(t+d/340);}
        }else v.next=0;
      }
      for(const [id,v] of this.voices)if(!active.has(id)){v.rotorGain.gain.setTargetAtTime(0,now,.3);v.gunGain.gain.setTargetAtTime(0,now,.3);v.next=0;}
    }
    // One-shot world sounds, delayed by distance (sound speed 340 m/s).
    play(kind,{distance=0,pan=0,gain=1}={}){
      if(!this.ready)return;const ac=this.ctx,t=ac.currentTime+distance/340,att=Math.min(1,120/Math.max(1,distance));
      const src=ac.createBufferSource(),g=ac.createGain();let out=g;if(ac.createStereoPanner){const p=ac.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));g.connect(p);out=p;}
      if(kind==='explosion'||kind==='hit'){src.buffer=this.explosions[Math.floor(Math.random()*2)];src.playbackRate.value=kind==='hit'?.8:.9+.2*Math.random();g.gain.value=gain*att*(kind==='hit'?1.6:1.1);src.connect(g);out.connect(this.bus.world);src.start(t);return;}
      const f=ac.createBiquadFilter();src.buffer=this.noise;src.loop=true;src.connect(f);f.connect(g);out.connect(kind==='click'?this.bus.alerts:this.bus.world);
      // crack: supersonic snap of an enemy round passing close by (not measured).
      const env={launch:['lowpass',650,.9,.03,1.8],flare:['bandpass',1900,.3,.004,.3],click:['highpass',2600,.12,.001,.05],impact:['bandpass',2400,.18,.001,.06],ui:['bandpass',1800,.06,.001,.04],crack:['highpass',2800,.2,.0005,.03]}[kind];if(!env)return;
      f.type=env[0];f.frequency.value=env[1];if(kind==='launch'){f.frequency.setValueAtTime(260,t);f.frequency.exponentialRampToValueAtTime(1800,t+.6);}
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(env[2]*gain*(kind==='click'||kind==='ui'?1:att),t+env[3]);g.gain.exponentialRampToValueAtTime(.0005,t+env[3]+env[4]);
      src.start(t,Math.random()*.5);src.stop(t+env[3]+env[4]+.1);
    }
  }
  const api={SoundEngine,synthShot,synthRotor,synthExplosion,bandLevels,biquad,scheduleShots,SHOT_INTERVAL,BANDS,MEASURED};
  if(typeof module!=='undefined')module.exports=api;else root.HeliAudio=api;
})(typeof window!=='undefined'?window:globalThis);
