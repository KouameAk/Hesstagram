// editeur-image.js — retouche d'une photo avant publication : recadrage (rognage) et
// filtres de couleur. Contrairement à une fenêtre modale, l'éditeur est construit
// directement DANS la page de publication (étape 2 de publier.html), à côté de la
// description : l'utilisateur voit sa photo, la retouche, écrit sa légende et publie,
// le tout sur un seul écran. Dépend de app.js (icone).
//
// Fonctionnement d'ensemble :
//   1. creerEditeurImage(conteneur, fichier) construit l'interface de retouche
//      (onglets Recadrer/Filtres, cadre de recadrage, vignettes de filtres) à
//      l'intérieur de `conteneur`, et branche toute l'interactivité (glisser,
//      redimensionner, changer de filtre…).
//   2. La retouche est « vivante » : il n'y a pas de bouton « Appliquer » séparé —
//      le cadre et le filtre choisis à l'écran SONT l'état courant à tout instant.
//   3. Au moment de publier, la page appelante appelle `editeur.obtenirFichier()`,
//      qui redessine uniquement la zone cadrée (avec le filtre choisi) sur un
//      <canvas> hors écran et retourne le fichier final (Blob → File). Si
//      l'utilisateur n'a rien touché, on obtient simplement une copie de la
//      photo d'origine (aucun recadrage, filtre « Normal »).
//   4. `editeur.detruire()` doit être appelé quand on quitte l'édition (retour à
//      l'étape 1 pour changer de fichier) pour libérer l'URL de l'aperçu et les
//      écouteurs globaux posés sur `document` pour le glisser-déposer du cadre.
//
// Tout se passe côté navigateur : aucune requête serveur n'est nécessaire pour
// prévisualiser ou calculer le recadrage/filtre, seul le résultat final (déjà
// recadré et filtré) est envoyé au moment de la publication.

// ── Filtres de couleur proposés ──
// Chaque filtre est une chaîne de fonctions CSS `filter` (grayscale, sepia, etc.).
// Cette même chaîne sert deux fois : une fois posée sur l'aperçu <img> à l'écran
// (rendu instantané par le navigateur), une fois posée sur le contexte 2D du
// <canvas> final (CanvasRenderingContext2D.filter accepte la même syntaxe que le
// CSS) : le rendu exporté est donc rigoureusement identique à l'aperçu.
const FILTRES_IMAGE = [
  { id: 'aucun', nom: 'Normal', css: 'none' },
  { id: 'nb', nom: 'Noir & blanc', css: 'grayscale(1) contrast(1.05)' },
  { id: 'sepia', nom: 'Sépia', css: 'sepia(.7) saturate(1.3) contrast(1.05)' },
  { id: 'contraste', nom: 'Contraste+', css: 'contrast(1.4) saturate(1.1)' },
  { id: 'saturation', nom: 'Saturation+', css: 'saturate(1.9) contrast(1.05)' },
  { id: 'vintage', nom: 'Vintage', css: 'sepia(.35) contrast(.92) brightness(1.05) saturate(1.35)' },
  { id: 'froid', nom: 'Froid', css: 'saturate(1.15) hue-rotate(-6deg) brightness(1.02) contrast(1.08)' }
];

// Taille minimale (en pixels affichés) sous laquelle le cadre de recadrage ne peut
// pas descendre, pour éviter un cadre invisible ou un export vide.
const EDIT_TAILLE_MIN = 32;

/**
 * Construit l'éditeur de recadrage/filtres à l'intérieur de `conteneur`, pour
 * la photo `fichierSource`. `conteneur` doit déjà être visible dans la page
 * (pas de `hidden`/`display:none`) : ses dimensions servent à calculer la
 * taille d'affichage de la photo.
 * @param {HTMLElement} conteneur élément vide qui accueille l'interface de retouche
 * @param {File} fichierSource photo choisie par l'utilisateur (input type="file")
 * @returns {{ obtenirFichier: () => Promise<File>, detruire: () => void }}
 */
function creerEditeurImage(conteneur, fichierSource) {
  const urlSource = URL.createObjectURL(fichierSource);
  let filtreActif = FILTRES_IMAGE[0];
  let ratioActif = null;             // null = format « libre » ; sinon largeur / hauteur imposée

  // Cadre de recadrage exprimé en pixels *affichés* (coordonnées de #edit-stage,
  // pas les pixels réels de la photo — la conversion se fait dans obtenirFichier()).
  let rect = { x: 0, y: 0, w: 0, h: 0 };
  let stageW = 0, stageH = 0;

  conteneur.innerHTML = `
    <div class="segmented" style="margin-bottom:14px">
      <button type="button" class="active" data-edit-onglet="cadrage">${icone('recadrer')}Recadrer</button>
      <button type="button" data-edit-onglet="filtres">${icone('filtre')}Filtres</button>
    </div>

    <div class="edit-stage-conteneur">
      <div class="edit-stage" id="edit-stage">
        <img class="edit-image" id="edit-image" alt="Photo à retoucher">
        <div class="edit-rideau" data-rideau="haut"></div>
        <div class="edit-rideau" data-rideau="bas"></div>
        <div class="edit-rideau" data-rideau="gauche"></div>
        <div class="edit-rideau" data-rideau="droite"></div>
        <div class="edit-cadre" id="edit-cadre">
          <div class="edit-grille"></div>
          <span class="edit-poignee n" data-poignee="n"></span>
          <span class="edit-poignee s" data-poignee="s"></span>
          <span class="edit-poignee e" data-poignee="e"></span>
          <span class="edit-poignee w" data-poignee="w"></span>
          <span class="edit-poignee nw" data-poignee="nw"></span>
          <span class="edit-poignee ne" data-poignee="ne"></span>
          <span class="edit-poignee sw" data-poignee="sw"></span>
          <span class="edit-poignee se" data-poignee="se"></span>
        </div>
      </div>
    </div>

    <div class="edit-panneau" id="edit-panneau-cadrage">
      <span class="label">Format du recadrage</span>
      <div class="chips" id="edit-ratios" style="margin-top:8px">
        <button type="button" class="chip active" data-ratio="libre">Libre</button>
        <button type="button" class="chip" data-ratio="1:1">1:1</button>
        <button type="button" class="chip" data-ratio="4:5">4:5</button>
        <button type="button" class="chip" data-ratio="16:9">16:9</button>
      </div>
    </div>

    <div class="edit-panneau" id="edit-panneau-filtres" hidden>
      <span class="label">Filtre de couleur</span>
      <div class="edit-filtres" id="edit-filtres" style="margin-top:8px"></div>
    </div>`;

  const stage = conteneur.querySelector('#edit-stage');
  const cadre = conteneur.querySelector('#edit-cadre');
  const image = conteneur.querySelector('#edit-image');
  const rideaux = {
    haut: conteneur.querySelector('[data-rideau="haut"]'),
    bas: conteneur.querySelector('[data-rideau="bas"]'),
    gauche: conteneur.querySelector('[data-rideau="gauche"]'),
    droite: conteneur.querySelector('[data-rideau="droite"]')
  };
  image.src = urlSource;

  // ── Onglets Recadrer / Filtres ──
  conteneur.querySelectorAll('[data-edit-onglet]').forEach(bouton => {
    bouton.onclick = () => {
      conteneur.querySelectorAll('[data-edit-onglet]').forEach(b => b.classList.toggle('active', b === bouton));
      conteneur.querySelector('#edit-panneau-cadrage').hidden = bouton.dataset.editOnglet !== 'cadrage';
      conteneur.querySelector('#edit-panneau-filtres').hidden = bouton.dataset.editOnglet !== 'filtres';
    };
  });

  // ── Vignettes de filtres : une miniature par filtre, avec le filtre CSS déjà appliqué ──
  const zoneFiltres = conteneur.querySelector('#edit-filtres');
  zoneFiltres.innerHTML = FILTRES_IMAGE.map(f => `
    <button type="button" class="edit-filtre ${f.id === 'aucun' ? 'active' : ''}" data-filtre="${f.id}">
      <span class="edit-filtre-vignette" style="background-image:url('${urlSource}');filter:${f.css}"></span>
      <span>${f.nom}</span>
    </button>`).join('');
  zoneFiltres.querySelectorAll('[data-filtre]').forEach(bouton => {
    bouton.onclick = () => {
      filtreActif = FILTRES_IMAGE.find(f => f.id === bouton.dataset.filtre);
      zoneFiltres.querySelectorAll('[data-filtre]').forEach(b => b.classList.toggle('active', b === bouton));
      image.style.filter = filtreActif.css;   // aperçu immédiat sur la photo entière
    };
  });

  // ── Formats de recadrage (Libre / 1:1 / 4:5 / 16:9) ──
  // En format imposé, seules les 4 poignées d'angle restent actives (voir CSS
  // `.edit-cadre.ratio-fixe`) : redimensionner un seul bord casserait le ratio.
  conteneur.querySelector('#edit-ratios').querySelectorAll('.chip').forEach(bouton => {
    bouton.onclick = () => {
      conteneur.querySelector('#edit-ratios').querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b === bouton));
      if (bouton.dataset.ratio === 'libre') {
        ratioActif = null;
      } else {
        const [largeur, hauteur] = bouton.dataset.ratio.split(':').map(Number);
        ratioActif = largeur / hauteur;
      }
      cadre.classList.toggle('ratio-fixe', ratioActif !== null);
      appliquerRatioAuCadre();
    };
  });

  // Recentre un cadre respectant `ratioActif`, aussi grand que possible dans la
  // zone affichée. Appelé au choix d'un format, pas en mode « Libre ».
  function appliquerRatioAuCadre() {
    if (ratioActif === null || !stageW) { dessinerCadre(); return; }
    let largeur = stageW, hauteur = stageW / ratioActif;
    if (hauteur > stageH) { hauteur = stageH; largeur = stageH * ratioActif; }
    rect = { x: (stageW - largeur) / 2, y: (stageH - hauteur) / 2, w: largeur, h: hauteur };
    dessinerCadre();
  }

  // Reflète `rect` (le cadre de recadrage) dans le DOM : position/taille du
  // cadre lui-même, et les 4 « rideaux » qui assombrissent tout ce qui est en
  // dehors du cadre (technique des 4 rectangles, plus simple ici qu'un clip-path
  // car elle n'empêche pas les poignées de déborder légèrement du cadre).
  function dessinerCadre() {
    cadre.style.left = `${rect.x}px`;
    cadre.style.top = `${rect.y}px`;
    cadre.style.width = `${rect.w}px`;
    cadre.style.height = `${rect.h}px`;
    rideaux.haut.style.cssText = `left:0px;top:0px;width:${stageW}px;height:${rect.y}px`;
    rideaux.bas.style.cssText = `left:0px;top:${rect.y + rect.h}px;width:${stageW}px;height:${stageH - rect.y - rect.h}px`;
    rideaux.gauche.style.cssText = `left:0px;top:${rect.y}px;width:${rect.x}px;height:${rect.h}px`;
    rideaux.droite.style.cssText = `left:${rect.x + rect.w}px;top:${rect.y}px;width:${stageW - rect.x - rect.w}px;height:${rect.h}px`;
  }

  const limiter = (valeur, min, max) => Math.min(Math.max(valeur, min), max);

  // ── Déplacement et redimensionnement du cadre (souris ou tactile) ──
  // `glisse` mémorise la manipulation en cours entre pointerdown et pointerup ;
  // les écouteurs move/up sont posés sur `document` (et non sur le cadre) pour
  // continuer à suivre le pointeur même s'il sort du cadre pendant le geste.
  let glisse = null;

  cadre.addEventListener('pointerdown', e => {
    if (e.target.closest('.edit-poignee')) return;   // les poignées gèrent leur propre geste
    glisse = { type: 'deplacer', depart: { x: e.clientX, y: e.clientY }, rectDepart: { ...rect } };
    e.preventDefault();
  });

  cadre.querySelectorAll('.edit-poignee').forEach(poignee => {
    poignee.addEventListener('pointerdown', e => {
      glisse = { type: 'redimensionner', poignee: poignee.dataset.poignee, ancre: ancrePourPoignee(poignee.dataset.poignee) };
      e.preventDefault();
      e.stopPropagation();   // ne pas déclencher aussi le pointerdown du cadre (déplacement)
    });
  });

  // Le « point d'ancrage » d'une poignée est le coin ou le bord opposé, qui ne
  // bouge pas pendant le redimensionnement (ex. tirer la poignée « se » agrandit
  // le cadre depuis le coin haut-gauche, qui reste fixe).
  function ancrePourPoignee(nom) {
    const { x, y, w, h } = rect;
    return {
      nw: { x: x + w, y: y + h }, ne: { x, y: y + h }, sw: { x: x + w, y }, se: { x, y },
      n: { y: y + h }, s: { y }, e: { x }, w: { x: x + w }
    }[nom];
  }

  document.addEventListener('pointermove', surDeplacementPointeur);
  document.addEventListener('pointerup', surRelachementPointeur);

  function surDeplacementPointeur(e) {
    if (!glisse) return;
    if (glisse.type === 'deplacer') {
      const dx = e.clientX - glisse.depart.x, dy = e.clientY - glisse.depart.y;
      rect = {
        ...glisse.rectDepart,
        x: limiter(glisse.rectDepart.x + dx, 0, stageW - glisse.rectDepart.w),
        y: limiter(glisse.rectDepart.y + dy, 0, stageH - glisse.rectDepart.h)
      };
    } else {
      const stageRect = stage.getBoundingClientRect();
      const px = limiter(e.clientX - stageRect.left, 0, stageW);
      const py = limiter(e.clientY - stageRect.top, 0, stageH);
      rect = redimensionnerCadre(glisse.poignee, glisse.ancre, px, py);
    }
    dessinerCadre();
  }

  function surRelachementPointeur() { glisse = null; }

  // Calcule le nouveau cadre pendant un redimensionnement.
  // `direction` indique, pour chaque poignée, de quel côté de l'ancre se trouve
  // le point que l'utilisateur déplace (ex. « se » grandit vers la droite/bas).
  function redimensionnerCadre(nomPoignee, ancre, px, py) {
    const DIRECTIONS = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1], n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
    const [dx, dy] = DIRECTIONS[nomPoignee];
    let { x, y, w, h } = rect;

    if (dx !== 0) {
      w = Math.max(EDIT_TAILLE_MIN, dx === 1 ? px - ancre.x : ancre.x - px);
      x = dx === 1 ? ancre.x : ancre.x - w;
    }
    if (dy !== 0) {
      h = Math.max(EDIT_TAILLE_MIN, dy === 1 ? py - ancre.y : ancre.y - py);
      y = dy === 1 ? ancre.y : ancre.y - h;
    }

    // Poignée d'angle + format imposé : on ajuste la dimension la moins tirée
    // pour respecter le ratio, ancrée sur le coin opposé.
    if (ratioActif && dx !== 0 && dy !== 0) {
      if (w / ratioActif > h) h = w / ratioActif; else w = h * ratioActif;
      x = dx === 1 ? ancre.x : ancre.x - w;
      y = dy === 1 ? ancre.y : ancre.y - h;
    }

    // Le cadre ne doit jamais déborder de l'image affichée.
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > stageW) w = stageW - x;
    if (y + h > stageH) h = stageH - y;
    return { x, y, w: Math.max(EDIT_TAILLE_MIN, w), h: Math.max(EDIT_TAILLE_MIN, h) };
  }

  // ── Chargement de la photo : une fois ses dimensions connues, on calcule la
  // taille d'affichage (jamais agrandie au-delà de sa taille réelle, et limitée
  // à la largeur disponible dans `conteneur` puisqu'on est maintenant dans la
  // page et non plus dans une fenêtre centrée) et on initialise le cadre sur
  // l'image entière (= aucun recadrage par défaut). `imagePrete` permet à
  // obtenirFichier() d'attendre que ce calcul ait eu lieu avant d'exporter. ──
  let resoudreImagePrete;
  const imagePrete = new Promise(resolve => { resoudreImagePrete = resolve; });
  image.onload = () => {
    // `|| 560`/`|| 420` : filet de sécurité si la page n'a pas encore de mise en
    // page utilisable à cet instant précis (conteneur ou fenêtre à 0px) — sans
    // ça, le cadre se retrouverait figé à 0×0 pour le reste de l'édition.
    const largeurMax = Math.min(560, conteneur.clientWidth || 560);
    const hauteurMax = Math.min(420, (window.innerHeight || 840) * 0.5);
    const echelle = Math.min(largeurMax / image.naturalWidth, hauteurMax / image.naturalHeight, 1);
    stageW = Math.round(image.naturalWidth * echelle);
    stageH = Math.round(image.naturalHeight * echelle);
    stage.style.width = `${stageW}px`;
    stage.style.height = `${stageH}px`;
    rect = { x: 0, y: 0, w: stageW, h: stageH };
    dessinerCadre();
    resoudreImagePrete();
  };

  // ── Export : appelé par la page au moment de publier. On redessine uniquement
  // la zone cadrée, avec le filtre choisi, sur un <canvas> hors écran, puis on
  // exporte ce canvas en fichier (remplace le fichier d'origine dans l'envoi). ──
  async function obtenirFichier() {
    await imagePrete;
    const echelleReelle = image.naturalWidth / stageW;   // pixels affichés → pixels réels
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.w * echelleReelle);
    canvas.height = Math.round(rect.h * echelleReelle);
    const ctx = canvas.getContext('2d');
    ctx.filter = filtreActif.css;
    ctx.drawImage(
      image,
      rect.x * echelleReelle, rect.y * echelleReelle, rect.w * echelleReelle, rect.h * echelleReelle,
      0, 0, canvas.width, canvas.height
    );

    // Le PNG conserve la transparence, sinon on ré-encode en JPEG (plus léger).
    // Un GIF animé perdrait son animation en passant par le canvas : il est
    // donc lui aussi aplati en une seule image (limitation assumée, voir le
    // fichier valentin-filtreposte.md à la racine du projet).
    const type = fichierSource.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const extension = type === 'image/png' ? 'png' : 'jpg';
    const nom = `${fichierSource.name.replace(/\.\w+$/, '')}.${extension}`;
    const blob = await new Promise(res => canvas.toBlob(res, type, 0.92));
    return new File([blob], nom, { type });
  }

  // ── Nettoyage : à appeler quand on quitte l'édition (retour à l'étape 1). ──
  function detruire() {
    document.removeEventListener('pointermove', surDeplacementPointeur);
    document.removeEventListener('pointerup', surRelachementPointeur);
    URL.revokeObjectURL(urlSource);
  }

  return { obtenirFichier, detruire };
}
