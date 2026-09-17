// theme.js — apparence de l'interface : Auto, Clair, Sombre, Nuit
// Chargé dans le <head> de chaque page pour poser le thème AVANT le premier affichage
// (pas de flash blanc). Le sélecteur est ensuite ajouté tout seul dans la barre latérale,
// la console staff, l'en-tête mobile, la page de connexion et la page « Mon compte ».
(function () {
  const CLE = 'hess-theme';
  const THEMES = {
    auto:   { libelle: 'Auto',   aide: 'Suit le système', couleur: null },
    clair:  { libelle: 'Clair',  aide: 'Lumineux',        couleur: '#faf6f2' },
    sombre: { libelle: 'Sombre', aide: 'Contraste doux',  couleur: '#110d15' },
    nuit:   { libelle: 'Nuit',   aide: 'Sans lumière bleue', couleur: '#120e0a' }
  };
  const ORDRE = ['auto', 'clair', 'sombre', 'nuit'];

  const TRAITS = {
    auto: '<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6v16.8" /><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"/>',
    clair: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
    sombre: '<path d="M19.6 14.6A8 8 0 0 1 9.4 4.4a8 8 0 1 0 10.2 10.2z"/>',
    nuit: '<path d="M19.6 14.6A8 8 0 0 1 9.4 4.4a8 8 0 1 0 10.2 10.2z"/><path d="M16.5 3.5v3M15 5h3M20 8.5v2M19 9.5h2"/>'
  };
  const svg = nom => `<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAITS[nom]}</svg>`;

  const systemeSombre = window.matchMedia('(prefers-color-scheme: dark)');

  function lireChoix() {
    try { const v = localStorage.getItem(CLE); return THEMES[v] ? v : 'auto'; } catch { return 'auto'; }
  }
  const resoudre = choix => choix === 'auto' ? (systemeSombre.matches ? 'sombre' : 'clair') : choix;

  function appliquer(choix, { anime = false } = {}) {
    const racine = document.documentElement;
    if (anime) {
      racine.classList.add('theme-bascule');
      setTimeout(() => racine.classList.remove('theme-bascule'), 400);
    }
    const theme = resoudre(choix);
    racine.dataset.theme = theme;
    racine.dataset.themeChoix = choix;

    // Couleur de la barre du navigateur mobile
    let meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      if (!meta.dataset.origine) meta.dataset.origine = meta.content;
      meta.content = theme === 'clair' ? meta.dataset.origine.replace('#f6f4f1', THEMES.clair.couleur) : THEMES[theme].couleur;
    }
    majControles();
  }

  function choisir(choix) {
    try { localStorage.setItem(CLE, choix); } catch { /* stockage indisponible : le choix vaut pour la page */ }
    appliquer(choix, { anime: true });
  }

  // ── Contrôles ──
  function majControles() {
    const choix = document.documentElement.dataset.themeChoix;
    document.querySelectorAll('[data-theme-valeur]').forEach(b => {
      const actif = String(b.dataset.themeValeur === choix);
      if (b.getAttribute('aria-checked') === actif) return;
      b.setAttribute('aria-checked', actif);
      b.tabIndex = actif === 'true' ? 0 : -1;
    });
    document.querySelectorAll('.theme-rapide').forEach(b => {
      if (b.dataset.affiche === choix) return;   // évite de réécrire le DOM (et de relancer l'observateur)
      b.dataset.affiche = choix;
      const t = THEMES[choix];
      b.innerHTML = svg(choix);
      b.setAttribute('aria-label', `Apparence : ${t.libelle}. Changer`);
      b.title = `Apparence : ${t.libelle}`;
    });
  }

  // Groupe radio accessible : flèches gauche/droite pour naviguer
  function groupeRadio(conteneur) {
    conteneur.setAttribute('role', 'radiogroup');
    conteneur.setAttribute('aria-label', 'Apparence');
    conteneur.addEventListener('click', e => {
      const b = e.target.closest('[data-theme-valeur]');
      if (b) choisir(b.dataset.themeValeur);
    });
    conteneur.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const pas = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const i = ORDRE.indexOf(document.documentElement.dataset.themeChoix);
      const suivant = ORDRE[(i + pas + ORDRE.length) % ORDRE.length];
      choisir(suivant);
      conteneur.querySelector(`[data-theme-valeur="${suivant}"]`)?.focus();
    });
  }

  function selecteurCompact() {
    const frag = document.createDocumentFragment();
    const titre = document.createElement('div');
    titre.className = 'theme-choix-titre';
    titre.textContent = 'Apparence';
    const groupe = document.createElement('div');
    groupe.className = 'theme-choix';
    groupe.innerHTML = ORDRE.map(n =>
      `<button type="button" role="radio" data-theme-valeur="${n}" title="${THEMES[n].aide}">${svg(n)}<span>${THEMES[n].libelle}</span></button>`
    ).join('');
    groupeRadio(groupe);
    frag.append(titre, groupe);
    return frag;
  }

  function boutonRapide() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-icon theme-rapide';
    b.onclick = () => {
      const i = ORDRE.indexOf(document.documentElement.dataset.themeChoix);
      const suivant = ORDRE[(i + 1) % ORDRE.length];
      choisir(suivant);
      if (typeof window.toast === 'function') window.toast(`Apparence : ${THEMES[suivant].libelle} · ${THEMES[suivant].aide}`, { duree: 1800 });
    };
    return b;
  }

  function carteReglages() {
    const section = document.createElement('section');
    section.className = 'card section-reglage';
    section.innerHTML = `
      <h2>${svg('nuit')}Apparence</h2>
      <p class="intro">Choisissez l’ambiance de Hesstagram. Le mode Nuit supprime la lumière bleue et atténue les photos pour ménager vos yeux le soir.</p>
      <div class="theme-vignettes">
        ${ORDRE.map(n => `
          <button type="button" class="theme-vignette" role="radio" data-theme-valeur="${n}">
            <span class="mini mini-${n}" aria-hidden="true"><i class="cote"></i><span class="contenu"><i></i><i></i><i></i></span></span>
            <span class="legende-theme">${svg(n)}${THEMES[n].libelle}</span>
            <span class="sous-legende">${THEMES[n].aide}</span>
          </button>`).join('')}
      </div>`;
    groupeRadio(section.querySelector('.theme-vignettes'));
    return section;
  }

  // Ajoute les contrôles là où la structure de la page les attend (une seule fois par zone)
  function installer() {
    const pose = (sel, fn) => document.querySelectorAll(sel).forEach(el => {
      if (el.dataset.themePose) return;
      el.dataset.themePose = '1';
      fn(el);
    });

    pose('.sidebar', nav => nav.insertBefore(selecteurCompact(), nav.querySelector('.moi-carte')));
    pose('.console-nav', nav => {
      nav.insertBefore(selecteurCompact(), nav.querySelector('.moi-carte'));
      nav.appendChild(boutonRapide());
    });
    pose('.entete', entete => (entete.querySelector('.actions') || entete).appendChild(boutonRapide()));
    pose('.auth-form', zone => zone.appendChild(boutonRapide()));
    pose('.reglages', page => {
      const premiere = page.querySelector('.section-reglage');
      page.insertBefore(carteReglages(), premiere ? premiere.nextSibling : null);
    });
    majControles();
  }

  // ── Démarrage ──
  appliquer(lireChoix());

  systemeSombre.addEventListener('change', () => { if (lireChoix() === 'auto') appliquer('auto', { anime: true }); });
  window.addEventListener('storage', e => { if (e.key === CLE) appliquer(lireChoix(), { anime: true }); });

  // Les barres de navigation sont construites après le chargement (app.js) : on surveille le DOM
  let prevu = false;
  const planifier = () => {
    if (prevu) return;
    prevu = true;
    requestAnimationFrame(() => { prevu = false; installer(); });
  };
  document.addEventListener('DOMContentLoaded', () => {
    installer();
    new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
  });

  window.hessTheme = { choisir, lireChoix };
})();
