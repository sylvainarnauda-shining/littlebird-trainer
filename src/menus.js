/* Menus (original code): the modes of the preparation page and the handlers that the page's controls share. First step
   of the menus module: the screens and the settings pages join it with the later phases of the menus plan. It works on
   the page it is given (doc), reads no clock and draws nothing at random, so that the golden recorder, whose page is a
   minimal DOM, boots it as the browser does (tests/unit/menus-contract.test.js lists what it may call). */
(function(root){
  // The trainer's modes: title and crumb of the preparation page, its description, and the first line of the feed when a
  // session starts.
  const MODES={
    range:{title:'STAND DE TIR',crumb:'Entraînement au tir',text:'Cibles aériennes, terrestres ou mixtes devant l’hélipad. Mesure ta précision et ton suivi de cible avec la cadence et les dégâts mesurés sur les enregistrements de référence.',start:'STAND DE TIR · feu à volonté'},
    assault:{title:'ASSAUT AIR-SOL',crumb:'Nouveau mode',text:'Des camps ennemis tirés au hasard dans la vallée : miradors, cabanes, bunkers, tentes, dépôts de carburant et de munitions, antennes. Les fantassins patrouillent, se mettent à l’abri dans les bâtiments quand tu approches et ressortent ensuite ; des camions roulent sur la route. Détruis toutes les structures.',start:'ASSAUT · camps signalés en orange sur la mini-carte'},
    missiles:{title:'DÉFENSE SOL-AIR',crumb:'Esquive de missiles',text:'Des tireurs Verba (tube à l’épaule, sur les toits, les buttes, les clairières) et des emplacements SAM t’accrochent : bips, puis son continu au verrouillage. Le missile part du tube que tu vois. Abats le tireur avant le tir, casse l’accrochage en volant bas ou derrière le relief, lâche les leurres (V) 1 à 2 s avant l’impact. Le canon CIWS de 20 mm, pointé par un servant assis, tire à vue jusqu’à environ 1 km : reste hors de sa portée ou derrière le relief, ou abats le servant (sa coque encaisse environ 500 impacts de minigun).',start:'DÉFENSE SOL-AIR · écoute les bips'},
    match:{title:'PARTIE RÉELLE',crumb:'Nouveau mode · au plus près d’une partie',text:'Tout à la fois : camps et fantassins qui ripostent, convois, deux hélicoptères ennemis pilotés par des bots (même modèle de vol que toi), tireurs Verba dans les camps, emplacements SAM et canon CIWS de 20 mm. La zone chaude (cercle jaune) double les points et se déplace toutes les 3 minutes. Tu pars avec 300 coups (2 boîtes de 150) et 2 leurres, comme sur les enregistrements de référence : pose-toi sur l’hélipad et appuie sur B pour te réapprovisionner et réparer.',start:'PARTIE RÉELLE · zone chaude en jaune · B sur l’hélipad pour réarmer'},
    duel:{title:'DUEL D’HÉLICOPTÈRES',crumb:'Nouveau mode · combat aérien',text:'Un à trois hélicoptères ennemis pilotés par des bots, avec le même modèle de vol mesuré et les mêmes miniguns que toi (25 coups/s, 800 m/s). Ils anticipent ta trajectoire, tirent par rafales, cassent quand tu les alignes, gardent un peu de hauteur pour plonger sur toi et perdent ta trace derrière le relief. Le niveau règle leur temps de réaction, leur précision et leurs esquives ; en Réaliste, aucun repère : écoute leur rotor et leurs rafales.',start:'DUEL · les ennemis arrivent'},
    towers:{title:'TOURS',crumb:'Assaut et capture',text:'Trois tours numérotées, en blocs d’acier, d’environ 33 m jusqu’au toit (mesurées sur l’enregistrement 1). Élimine les défenses du toit puis reste 10 s au-dessus, entre 5 et 25 m, sous 40 km/h.',start:'TOURS · nettoie les toits'},
    free:{title:'VOL LIBRE',crumb:'Vol',text:'Départ posé dans la cour de l’hélipad, rotor au ralenti. Monte le collectif pour décoller, puis explore la carte : usine, villages, champs, viaduc et crêtes.',start:'VOL LIBRE · monte le collectif pour décoller'}};
  // Options that shape the exercise: changing one hides RESUME, the paused session no longer matches the menu.
  const EXERCISE_KEYS=['trajectory','duration','airHealth','groundHealth','baseHealth','indestructible','aaLaunchers','aaObjective','aaEverywhere','flareCharges','flareUnlimited','camps','infantryPerCamp','convoy','enemyFire','difficulty','unlimitedAmmo','duelBots','duelStart','duelRespawn','duelHealth','rpgPerCamp','aaRockets','ciwsCount','duelEnemy'];
  // env: doc (the page's document), S (HeliSettings), state (the live settings: cfg is replaced when the settings are
  // validated again, so it is read through state.cfg each time), commit (adopt validated settings), act (what the page's
  // session does for the menus), toast and sfx.
  function create({doc,S,state,commit,act,toast,sfx}){
    const $=id=>doc.getElementById(id);
    // The mode shown on the preparation page: its card, its text and the options that belong to it.
    function selectMode(mode){
      const cfg=state.cfg;if(mode==='range')cfg.scenario=cfg.rangeType||'air';else cfg.scenario=mode;
      doc.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
      const info=MODES[mode];$('modeTitle').textContent=info.title;$('modeCrumb').textContent=info.crumb;$('modeText').textContent=info.text;
      doc.querySelectorAll('.opt[data-for]').forEach(el=>el.hidden=!el.dataset.for.split(' ').includes(mode));
      doc.querySelectorAll('[data-scenario]').forEach(b=>b.classList.toggle('active',b.dataset.scenario===cfg.scenario));
    }
    // The handlers, in the order the page has always registered them. A control that has a setting stores its value and
    // validates the settings first: the light preset's own handler (app.js, registered later on the same element) reads the
    // settings that this one has just stored.
    doc.querySelectorAll('input[id],select[id]').forEach(el=>{if(!(el.id in state.cfg))return;el.addEventListener('input',()=>{
      state.cfg[el.id]=el.type==='checkbox'?el.checked:typeof S.defaults[el.id]==='number'?Number(el.value):el.value;
      if(el.id.startsWith('target')||EXERCISE_KEYS.includes(el.id))act.markExerciseDirty();
      if(el.id==='graphics')toast('Qualité graphique appliquée au prochain chargement de la page.');
      commit(S.sanitize(state.cfg));
      // Mouse law chosen in Commandes > Souris: the input state starts afresh.
      if(el.id==='mouseLaw'){act.resetMouse();toast(state.cfg.mouseLaw==='rate'?'Souris : loi mesurée sur les enregistrements de référence (vitesse du geste → vitesse de rotation).':'Souris : manche virtuel de la v12 (déviation gardée en mémoire, retour lent au neutre).');}
      act.syncUI();act.save();});});
    doc.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(b.disabled)return;selectMode(b.dataset.mode);act.markExerciseDirty();act.save();sfx.play('ui');});
    doc.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>{state.cfg.scenario=b.dataset.scenario;state.cfg.rangeType=b.dataset.scenario;selectMode('range');act.markExerciseDirty();act.save();});
    return {selectMode};
  }
  const api={MODES,create};
  if(typeof module!=='undefined')module.exports=api;else root.HeliMenus=api;
})(typeof window!=='undefined'?window:globalThis);
