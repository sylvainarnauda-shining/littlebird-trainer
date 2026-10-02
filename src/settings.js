/* Settings logic (original code): the defaults, the migration of a stored profile through the tuning revisions, the
   validation of settings and key bindings, and the reading of a game settings file. Pure: no DOM, no clock, no random
   draw, so that it runs in Node as in the page and a profile means the same thing everywhere (tests/unit/settings-*.test.js,
   the golden settings oracle). The data (actions, key names, bounds) is settings-data.js. */
(function(root){
  const P=typeof module!=='undefined'?require('./physics.js'):root.HeliPhysics;
  const M=typeof module!=='undefined'?require('./missiles.js'):root.HeliMissiles;
  const G=typeof module!=='undefined'?require('./ground.js'):root.HeliGround;
  const W=typeof module!=='undefined'?require('./world.js'):root.HeliWorld;
  const D=typeof module!=='undefined'?require('./settings-data.js'):root.HeliSettingsData;
  const {ACTIONS,KEY_NAMES,BOUNDS}=D;
  const DEFAULTS={...P.defaults,...M.defaults,...G.defaults,graphics:'high',difficulty:'normal',rangeType:'air',unlimitedAmmo:true,volEngine:1,volWeapons:1,volAlerts:1,showTelemetry:true,showMinimap:true,showKeyHints:true,
    duelBots:1,duelStart:'front',duelRespawn:true,duelHealth:40,duelEnemy:'ah6m',ciwsCount:1,lighting:'random',mapRandomEach:false};
  // Retired options (no control any more, always their default): camera vibration and speed widening (effects the
  // game does not have), the v3 flight aids (auto-level, anti-drift, linear drag) and the mouse DPI note. Stored
  // profiles may still hold them; the flight model keeps its general form (the fidelity checks compare the v3 drag).
  const RETIRED=['cameraMotion','speedFov','stability','hoverAssist','drag','dpi'];
  const KEY_PATTERN=/^(Key[A-Z]|Digit[0-9]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Mouse[012])$/;
  const baseBindings=Object.fromEntries(ACTIONS.map(a=>[a.id,a.key])),labels=Object.fromEntries(ACTIONS.map(a=>[a.id,a.label]));
  // Choices of the settings that hold a word (a light name is one of the world's presets: see sanitize).
  const ENUMS={scenario:['air','ground','mixed','free','towers','missiles','assault','match','duel'],rangeType:['air','ground','mixed'],trajectory:['cross','circle','zigzag','static','evasive'],
    aaObjective:['survive','destroy'],graphics:['high','medium','low'],difficulty:['easy','normal','real'],duelStart:['front','behind','random'],duelEnemy:['ah6m','ah6r','mix'],mouseLaw:['rate','stick']};
  const REVISION=16;
  // Flight-model values of the v6 model identified on the videos. Earlier
  // revisions used another model: their values have no equivalent here.
  const FLIGHT_KEYS=['pitchRate','rollRate','yawRate','cyclicResponse','response','mouseYawBoost','mousePitchBoost','stability','altitudeHold','collectiveUpRate','collectiveDownRate','holdGain','holdDamping','collectiveAccel','collectiveDownAccel','verticalDamping','drag','quadraticDrag','bodyFlowDrag','lateralDrag','weathervane','hoverAssist'];
  // v13 values measured on the recordings (physics.js comments, docs/analyse/souris.md).
  const V13_KEYS=['mouseLaw','mouseRateScale','mouseYawScale','mouseLag','mouseFine','mouseClamp','cyclicYaw','responseYaw','leverHover'];
  // A stored profile document brought to the current tuning revision: { doc, notices, migratedFrom }. The settings are
  // upgraded but not validated (sanitize does that); the notices say what an upgrade changed for the player.
  function upgrade(saved){
    const data={...saved.settings},revision=saved.tuningRevision||0,notices=[];
    if(revision<2){
      if(data.fov===80)data.fov=58;
      if(data.trajectory==='cross')data.trajectory=DEFAULTS.trajectory;
    }
    if(revision<3&&data.rpm===6000)data.rpm=DEFAULTS.rpm;
    if(revision<7){
      // Keys, mouse sensitivities, exercise and weapon choices are kept.
      for(const key of FLIGHT_KEYS)delete data[key];
      for(const key of ['collectiveSpring','aeroCoupling','maxLift','liftResponse','collectiveRate'])delete data[key];
      // 36.02 was only the previous default: the observed distribution replaces it.
      if(data.impactDamage===36.02)data.impactDamage=0;
    }
    // Revisions 8 and 9 only add settings: their defaults apply.
    // Revision 10 (v9): Verba lock range after the guides (about 1 000 m); 1 500 was only the old default.
    if(revision<10&&data.aaLockRange===1500)delete data.aaLockRange;
    // Revision 11 (v10) only adds the duel settings: their defaults apply.
    // Revision 12 (v11): horizontal fields of view as the game gives them, no camera vibration
    // and no widening with speed (neither is in the game), and the default sensitivities when
    // the profile still had the earlier defaults (16 / 8). A custom vertical FOV becomes its
    // 16:9 equivalent.
    if(revision<12){
      if(typeof data.fov==='number'&&data.fov!==58){const h=Math.round(2*Math.atan(Math.tan(data.fov*Math.PI/360)*16/9)*180/Math.PI);data.fovCockpit=h;data.fovChase=h;}
      delete data.fov;if(data.cameraMotion===.35)delete data.cameraMotion;if(data.speedFov===5)delete data.speedFov;
      if(data.pitchSens===16&&data.yawSens===8){delete data.pitchSens;delete data.yawSens;notices.push('Sensibilités de la souris remises aux valeurs par défaut.');}
    }
    // Revision 13 (v12): missiles of the community databases (450 m/s, 200 of the 400 hull points
    // on a direct hit) replace the earlier defaults (300 m/s, one hit brings the helicopter down).
    if(revision<13){if(data.aaHitsToKill===1)delete data.aaHitsToKill;if(data.aaMissileSpeed===300)delete data.aaMissileSpeed;}
    // Revision 14 (v13): the mouse law measured on the recordings (pointer speed -> rotation rate) replaces
    // the v12 virtual stick; single 0.40 s yaw lag, hover lever -0.14 and the chase view widening with speed
    // take their measured defaults. Earlier profiles have none of these keys; sensitivities, fields of view,
    // keys, the v12 stick's own settings and every other personal value are kept.
    if(revision<14){for(const key of [...V13_KEYS,'chaseSpeedView'])delete data[key];
      notices.push('v13 : la souris suit la loi mesurée sur les enregistrements de référence (vitesse du geste → vitesse de rotation). L’ancien manche virtuel reste dans Commandes › Souris.');}
    // Revision 15 (v13 fix): yaw inertia 0.35 s (chosen inside the measured CI90 so that the chase heading after D meets
    // M6) replaces the 0.40 default of revision 14; a value set by the player is kept.
    if(revision===14&&data.responseYaw===.4){delete data.responseYaw;notices.push('Inertie du lacet : 0,35 s au lieu de 0,40 (cap en vue poursuite après un lacet plus proche des enregistrements).');}
    // Revision 16: corrected reading of the reference recordings' sensitivity product (0.08, not 0.1). Measured K 0.0271
    // deg/px -> mouseRateScale 0.339 (0.271 was K / 0.1); mouseYawScale assumed equal. Only the old default 0.271 moves
    // (revisions 14 and 15 saved it; earlier profiles have no such key); a value set by the player is kept, and so is the
    // fine factor, named in the notice since it multiplies the new gain. A profile flown with the v12 stick law (mouseLaw
    // 'stick') ignores these gains: the value still moves (it applies after a switch to the measured law), but the notice
    // says the stick does not change.
    if(revision<16){const moved=['mouseRateScale','mouseYawScale'].filter(k=>data[k]===.271);moved.forEach(k=>delete data[k]);
      if(moved.length){const axis=moved.length===2?'':moved[0]==='mouseRateScale'?' en tangage':' en lacet',f=typeof data.mouseFine==='number'&&Number.isFinite(data.mouseFine)&&data.mouseFine!==1?P.clamp(data.mouseFine,.7,1.4):null;
        notices.push(data.mouseLaw==='stick'?`Souris, loi mesurée : gain${axis} 0,339 au lieu de 0,271 (mesure corrigée). Le manche virtuel v12 que tu utilises ne change pas.`
          :`Souris : gain${axis} 0,339 au lieu de 0,271 (mesure corrigée) : à réglages égaux, un même geste tourne 25 % de plus.${f?` L’ajustement fin ×${String(f).replace('.',',')} reste appliqué en plus.`:''}`);}}
    return {doc:{...saved,settings:data,tuningRevision:REVISION},notices,migratedFrom:revision};
  }
  // The settings of a profile as the page can use them: every key present, a value of the wrong type or outside its
  // bounds replaced (by the default, or by the nearest bound), retired keys at their default.
  function sanitize(data){
    const out={...DEFAULTS}; if(!data||typeof data!=='object')return out;
    for(const k of Object.keys(out)) {
      const val=data[k];
      if(typeof out[k]==='number' && typeof val==='number' && Number.isFinite(val)) {
        const b=BOUNDS[k];
        out[k]=b?P.clamp(val,b[0],b[1]):val;
        if(b&&b[2]>=1)out[k]=Math.round(out[k]);
      }else if(typeof out[k]==='boolean'&&typeof val==='boolean')out[k]=val;
      else if(typeof out[k]==='string'&&typeof val==='string') {
        if(ENUMS[k]?.includes(val))out[k]=val;
        // Own keys only: an imported "constructor" or "__proto__" is not a light preset.
        if(k==='lighting'&&(val==='random'||W.LIGHTS&&Object.hasOwn(W.LIGHTS,val)))out[k]=val;
      }
    }
    // Numbers without a control of their own (chosen bounds): missile fuse radius 1-20 m, launcher minimum range 0-1000 m.
    out.aaFuse=P.clamp(out.aaFuse,1,20);out.aaMinRange=P.clamp(out.aaMinRange,0,1000);
    for(const k of RETIRED)out[k]=DEFAULTS[k];
    if(![0,60,120,300,600,900].includes(out.duration))out.duration=120;
    if(![0,18.01,30.01,36.01,54.02,74.12,78.01,85.81,150.02].includes(out.impactDamage)){
      // Values offered by earlier versions map to the nearest observed value.
      const legacy={30.02:30.01,36.02:36.01};out.impactDamage=legacy[out.impactDamage]??DEFAULTS.impactDamage;
    }
    if(![0,1,2,3].includes(out.aaHitsToKill))out.aaHitsToKill=0;
    return out;
  }
  // The key bindings of a profile: every action has a valid code, "Unbound" or its default. Two actions on one key are
  // refused (an imported profile is not repaired silently); an action a newer version added takes its default key only if free.
  function validBindings(data){
    const out={...baseBindings}; if(!data||typeof data!=='object')return out;
    const used=new Set(),saved=k=>typeof data[k]==='string'&&(KEY_PATTERN.test(data[k])||data[k]==='Unbound');
    for(const k of Object.keys(out))if(saved(k)){out[k]=data[k];if(out[k]==='Unbound')continue;if(used.has(out[k]))throw Error('Deux actions utilisent la même touche.');used.add(out[k]);}
    // Actions added by a newer version take their default key only if it is free.
    for(const k of Object.keys(out))if(!saved(k)){if(used.has(out[k]))out[k]='Unbound';else used.add(out[k]);}
    return out;
  }
  // The helicopter settings of a game settings file (only the lines of its user-settings section are read: another
  // section could hold a key of the same name), read locally, nothing written back: { settings, found, warn }, the
  // settings by their key here, the labels of what was read, and a warning when the mouse axes are not yaw and pitch.
  function parseGameIni(text,sectionName){
    const lines=String(text).replace(/^﻿/,'').split(/\r?\n/),head=lines.findIndex(l=>l.trimEnd()==='['+sectionName+']');
    const body=head<0?[]:lines.slice(head+1),end=body.findIndex(l=>/^\[/.test(l)),section=(end<0?body:body.slice(0,end)).join('\n');
    const get=k=>{const m=new RegExp('^'+k+'=(.*)$','m').exec(section);return m?m[1].trim():null;},num=k=>{const v=parseFloat(get(k));return Number.isFinite(v)?v:null;};
    const settings={},found=[],set=(key,val,label)=>{if(val===null)return;settings[key]=val;found.push(label);};
    const pitch=num('RotaryMousePitchSensitivity'),yaw=num('RotaryMouseYawSensitivity'),mult=num('AirVehicleSensitivityMultiplier'),inv=get('bInvertYAxisHelicopters'),iso=num('RotaryMouseAxisIsolation'),f1=num('FirstPersonVehicleFieldOfView'),f3=num('ThirdPersonVehicleFieldOfView');
    set('pitchSens',pitch,`tangage ${pitch} %`);set('yawSens',yaw,`lacet ${yaw} %`);set('vehicleMultiplier',mult,`multiplicateur ×${mult}`);
    set('invertY',inv===null?null:inv==='True',`axe ${inv==='True'?'inversé':'normal'}`);set('isolation',iso,`isolation ${iso}`);set('fovCockpit',f1,`champ pilote ${f1}°`);set('fovChase',f3,`champ poursuite ${f3}°`);
    const x=get('RotaryMouseXFunction'),y=get('RotaryMouseYFunction');
    return {settings,found,warn:x&&x!=='Yaw'||y&&y!=='Pitch'?` Attention : dans le jeu, souris X = ${x} et Y = ${y} ; l'entraîneur fait lacet et tangage.`:''};
  }
  const api={defaults:DEFAULTS,RETIRED,KEY_PATTERN,ACTIONS,KEY_NAMES,BOUNDS,baseBindings,labels,REVISION,FLIGHT_KEYS,V13_KEYS,upgrade,sanitize,validBindings,parseGameIni};
  if(typeof module!=='undefined')module.exports=api;else root.HeliSettings=api;
})(typeof window!=='undefined'?window:globalThis);
