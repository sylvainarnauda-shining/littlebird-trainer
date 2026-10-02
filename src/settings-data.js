/* Data of the settings (original data, no game text): the key-binding actions with their default keys and labels, the
   display names of the keys and the bounds of the numeric settings. Data only, no logic (settings.js reads it). The
   labels are those of the trainer's own interface. */
(function(root){
  // Key-binding actions, in the order of the stored profile and of the page. key = default physical position: the game's
  // helicopter defaults as the guides give them (read: collective Left Shift / Left Ctrl, cyclic W / S and A / D, yaw
  // Q / E, fire on the left mouse button, flares V, camera C, free look Left Alt); the trainer's own actions on B
  // (resupply), R (restart) and X (re-centre the mouse). docs/REGLAGES.md.
  const ACTIONS=[
    {id:'collectiveUp',key:'ShiftLeft',label:'Augmenter le collectif'},
    {id:'collectiveDown',key:'ControlLeft',label:'Réduire le collectif'},
    {id:'pitchUp',key:'KeyS',label:'Cabrer'},
    {id:'pitchDown',key:'KeyW',label:'Piquer (complément)'},
    {id:'yawLeft',key:'KeyQ',label:'Lacet gauche'},
    {id:'yawRight',key:'KeyE',label:'Lacet droit'},
    {id:'rollLeft',key:'KeyA',label:'Roulis gauche'},
    {id:'rollRight',key:'KeyD',label:'Roulis droit'},
    {id:'fire',key:'Mouse0',label:'Tirer aux miniguns'},
    {id:'flares',key:'KeyV',label:'Leurres (flares)'},
    {id:'freeLook',key:'AltLeft',label:'Regard libre (maintenir)'},
    {id:'shop',key:'KeyB',label:'Munitions / fournitures (hélipad)'},
    {id:'view',key:'KeyC',label:'Changer de vue'},
    {id:'reset',key:'KeyR',label:'Recommencer'},
    {id:'neutral',key:'KeyX',label:'Recentrer la souris'}];
  // Names of the keys as the French AZERTY layout prints them (the physical positions are QWERTY codes).
  const KEY_NAMES={KeyW:'Z',KeyA:'Q',KeyQ:'A',KeyZ:'W',KeyS:'S',KeyD:'D',KeyE:'E',KeyR:'R',KeyX:'X',KeyV:'V',KeyB:'B',ShiftLeft:'Maj gauche',ShiftRight:'Maj droite',ControlLeft:'Ctrl gauche',ControlRight:'Ctrl droit',AltLeft:'Alt gauche',AltRight:'Alt droite',Space:'Espace',Mouse0:'Clic gauche',Mouse1:'Clic molette',Mouse2:'Clic droit',ArrowUp:'Flèche haut',ArrowDown:'Flèche bas',ArrowLeft:'Flèche gauche',ArrowRight:'Flèche droite'};
  // Bounds [min, max, step] of the numeric settings (chosen: the ranges of the page's sliders, which
  // tests/unit/settings-sanitize.test.js keeps equal to the template's input attributes while the template holds them).
  // A step of 1 or more rounds the value to an integer.
  const BOUNDS={
    targetCount:[1,8,1], targetSpeed:[0,180,5], targetDistance:[80,600,10], targetSize:[0.5,2.5,0.1], targetAltitude:[15,220,5],
    airHealth:[10,1000,10], groundHealth:[10,1500,10], duelBots:[1,3,1], duelHealth:[20,200,10],
    camps:[1,8,1], infantryPerCamp:[0,12,1], convoy:[0,8,1], rpgPerCamp:[0,3,1],
    aaLaunchers:[1,8,1], aaLockRange:[500,3000,50], ciwsCount:[0,3,1], aaRockets:[0,4,1], baseHealth:[10,500,10], aaLockTime:[0.5,6,0.1],
    aaMinAltitude:[0,40,1], aaLaunchDelay:[0,3,0.1], aaMissileSpeed:[150,700,10], aaAgility:[5,60,1], aaReload:[3,40,1], aaMaxConcurrent:[1,4,1],
    pitchSens:[1,100,1], yawSens:[1,100,1], vehicleMultiplier:[0.1,2,0.05], isolation:[0,1,0.05],
    volume:[0,0.6,0.02], volEngine:[0,2,0.05], volWeapons:[0,2,0.05], volAlerts:[0,2,0.05], aaToneHz:[400,2500,50], aaBeepRate:[1,12,0.5],
    fovCockpit:[60,120,1], fovChase:[60,120,1],
    rpm:[600,12000,100], spinUp:[0,1,0.01], bulletSpeed:[300,1200,10], spread:[0,2,0.05], gunConvergence:[50,1000,10],
    flareCharges:[1,10,1], flareCooldown:[0,30,1],
    mouseRateScale:[0.15,0.5,0.001], mouseYawScale:[0.1,0.6,0.001], mouseLag:[0.02,0.4,0.01], mouseFine:[0.7,1.4,0.01], gain:[0.005,0.15,0.005], mouseReturn:[0,12,0.2],
    mouseYawBoost:[0.5,3,0.05], mousePitchBoost:[0.5,3,0.05],
    rollRate:[20,240,5], yawRate:[15,180,1], pitchRate:[20,200,1], cyclicResponse:[0.02,0.8,0.02], cyclicYaw:[0,0.8,0.02],
    response:[0.04,1.2,0.02], responseYaw:[0.04,1.2,0.01], collectiveUpRate:[0.5,6,0.1], collectiveDownRate:[0.3,4,0.1],
    leverHover:[-0.4,0.2,0.01], collectiveAccel:[3,14,0.5], collectiveDownAccel:[1,10,0.5], holdGain:[0,0.4,0.002], holdDamping:[0,0.3,0.005],
    verticalDamping:[0,1.5,0.05], bodyFlowDrag:[0,1.5,0.05], quadraticDrag:[0,0.0015,0.00005], lateralDrag:[0,1,0.02], weathervane:[0,2,0.05]};
  const api={ACTIONS,KEY_NAMES,BOUNDS};
  if(typeof module!=='undefined')module.exports=api;else root.HeliSettingsData=api;
})(typeof window!=='undefined'?window:globalThis);
