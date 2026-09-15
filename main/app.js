// app.js — socle partagé par toutes les pages : API, icônes, coquille, toasts, fenêtres, composeur

// ════════════════ API ════════════════

// Appel API : JSON + gestion d'erreur ; redirige vers la connexion si la session a expiré
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (res.status === 401 && !location.pathname.endsWith('/login.html')) {
    location.href = '/login.html';
    return new Promise(() => {});   // la page part : on fige la suite du script plutôt que de lever une erreur
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erreur || `Erreur ${res.status}`);
  return data;
}

// ════════════════ Texte ════════════════

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Échappe le texte ET transforme les #hashtags en liens, en un seul passage.
// Deux passages successifs casseraient les entités : « l'année » devient « l&#39;année »
// et la regex des hashtags y attraperait « #39 ».
function texteAvecHashtags(texte) {
  const ECHAPPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(texte).replace(/#[\p{L}\p{N}_]+|[&<>"']/gu, m =>
    m[0] === '#'
      ? `<a class="hashtag" href="/explorer.html?tag=${encodeURIComponent(m.slice(1).toLowerCase())}">${m}</a>`
      : ECHAPPE[m]
  );
}

function initiales(nom) {
  return String(nom).split(/[.\s_-]+/).filter(Boolean).slice(0, 2)
    .map(p => p[0].toUpperCase()).join('') || '?';
}

const pluriel = (n, mot, motPluriel = mot + 's') => `${n} ${n > 1 ? motPluriel : mot}`;

// ════════════════ Dates ════════════════

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function horodatage(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

// « à l'instant », « il y a 5 min », « hier », « 12 sept. »
function ilYa(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  if (s < 2 * 86400) return 'hier';
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

// ════════════════ Icônes (trait arrondi 1,8 px, style des maquettes) ════════════════

const ICONES = {
  logo: '<path d="M8.5 5v14M8.5 12.5c0-2.2 1.6-3.8 3.7-3.8s3.8 1.6 3.8 3.8V19"/>',
  accueil: '<path d="M4 10.4 12 4l8 6.4v8.1A1.5 1.5 0 0 1 18.5 20H15v-5.2a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1V20H5.5A1.5 1.5 0 0 1 4 18.5z"/>',
  recherche: '<circle cx="11" cy="11" r="6.8"/><path d="m20 20-3.9-3.9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cloche: '<path d="M6.2 16.5v-5.2a5.8 5.8 0 0 1 11.6 0v5.2l1.4 1.8H4.8z"/><path d="M10 20.6a2.3 2.3 0 0 0 4 0"/>',
  messages: '<path d="M20 11.5c0 4.1-3.6 7.5-8 7.5-1.2 0-2.3-.2-3.3-.7L4 19.5l1.2-3.6A7.2 7.2 0 0 1 4 11.5C4 7.4 7.6 4 12 4s8 3.4 8 7.5z"/><path d="M8.5 10.3h7M8.5 13.3h4.3"/>',
  commentaire: '<path d="M20 11.5c0 4.1-3.6 7.5-8 7.5-1.2 0-2.3-.2-3.3-.7L4 19.5l1.2-3.6A7.2 7.2 0 0 1 4 11.5C4 7.4 7.6 4 12 4s8 3.4 8 7.5z"/>',
  profil: '<circle cx="12" cy="8.2" r="3.8"/><path d="M4.8 20.2c1.1-3.4 3.8-5.3 7.2-5.3s6.1 1.9 7.2 5.3"/>',
  comptes: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.4c.9-3 3.3-4.7 6.2-4.7s5.3 1.7 6.2 4.7"/><path d="M15.4 4.9a3.4 3.4 0 0 1 0 6.2M17.4 14.8c1.9.6 3.2 2.1 3.8 4.4"/>',
  reglages: '<circle cx="12" cy="12" r="2.8"/><path d="M19.2 14.6a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.2a1.8 1.8 0 0 1-3.6 0v-.1a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9h-.2a1.8 1.8 0 0 1 0-3.6h.1a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.8 1.8 0 0 1 3.6 0v.1a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.2a1.8 1.8 0 0 1 0 3.6h-.1a1.5 1.5 0 0 0-1.4.9z"/>',
  bouclier: '<path d="M12 3.5 19 6v5.4c0 4.4-2.9 7.8-7 9.1-4.1-1.3-7-4.7-7-9.1V6z"/><path d="m9.2 12 2 2 3.8-3.9"/>',
  tableau: '<rect x="4" y="4" width="7" height="7" rx="2.2"/><rect x="13" y="4" width="7" height="7" rx="2.2"/><rect x="4" y="13" width="7" height="7" rx="2.2"/><rect x="13" y="13" width="7" height="7" rx="2.2"/>',
  drapeau: '<path d="M5.5 20.5V4.5M5.5 4.5h11.2l-2.2 4.2 2.2 4.2H5.5"/>',
  journal: '<path d="M17 10.5v-4A2.5 2.5 0 0 0 14.5 4h-7A2.5 2.5 0 0 0 5 6.5v11A2.5 2.5 0 0 0 7.5 20H11"/><path d="M8.5 8.3h5M8.5 11.8h3"/><circle cx="16.5" cy="16.5" r="4"/><path d="m14.8 16.6 1.2 1.2 2.2-2.4"/>',
  sortie: '<path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14"/><path d="M9.8 16.4 5.4 12l4.4-4.4M5.4 12H15"/>',
  coeur: '<path d="M12 19.8s-7.6-4.6-7.6-10.1A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.6 2.6c0 5.5-7.6 10.1-7.6 10.1z"/>',
  pouce_bas: '<path d="M7.5 13.3V4.6M7.5 13.3l3.5 6.1a1.9 1.9 0 0 0 3.5-1.3l-.6-3.3h4.1a2 2 0 0 0 2-2.4l-1.1-5.9a2.5 2.5 0 0 0-2.4-2H7.5M7.5 13.3H5a1.5 1.5 0 0 1-1.5-1.5V6.1A1.5 1.5 0 0 1 5 4.6h2.5"/>',
  partager: '<path d="M12 14.5V4M8.2 7.6 12 4l3.8 3.6"/><path d="M8.5 10.8H7A2.5 2.5 0 0 0 4.5 13.3v4.2A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5v-4.2a2.5 2.5 0 0 0-2.5-2.5h-1.5"/>',
  envoyer: '<path d="M20.4 3.6 10.2 13.8M20.4 3.6 14 20.2l-3.8-6.4-6.4-3.8z"/>',
  image: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="9.2" cy="9.4" r="1.6"/><path d="m20 15.2-4.4-4.4L7.2 19.6"/>',
  fermer: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus_options: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
  retour: '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
  cadenas: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/><path d="M12 14.4v2.2"/>',
  coche: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  verifie: '<path d="M12 2.9l2.2 1.6 2.7-.1.8 2.6 2.3 1.5-.9 2.5.9 2.5-2.3 1.5-.8 2.6-2.7-.1L12 19.1l-2.2-1.6-2.7.1-.8-2.6L4 13.5l.9-2.5L4 8.5l2.3-1.5.8-2.6 2.7.1z" fill="currentColor" stroke="none"/><path d="m8.9 11.1 2.1 2.1 4.1-4.1" stroke="#fff"/>',
  poubelle: '<path d="M4.5 6.5h15M9.5 6.5V4.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v1.7M6.5 6.5l.8 11.9a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8l.8-11.9"/><path d="M10 10.5v5.6M14 10.5v5.6"/>',
  crayon: '<path d="M4.5 19.5 5.4 15 15.8 4.7a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L9 18.6z"/><path d="m14 6.5 3.5 3.5"/>',
  oeil: '<path d="M2.8 12S6 5.6 12 5.6 21.2 12 21.2 12 18 18.4 12 18.4 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8M12 3.6c2.2 2.3 3.4 5.1 3.4 8.4s-1.2 6.1-3.4 8.4c-2.2-2.3-3.4-5.1-3.4-8.4S9.8 5.9 12 3.6z"/>',
  horloge: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.9"/>',
  alerte: '<path d="M10.3 4.9a2 2 0 0 1 3.4 0l7 12.1a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3z"/><path d="M12 10v3.6M12 16.6v.1"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5M12 8.1v.1"/>',
  interdit: '<circle cx="12" cy="12" r="8.4"/><path d="m6.1 6.1 11.8 11.8"/>',
  suivre: '<circle cx="10" cy="8.2" r="3.8"/><path d="M3.2 20.2c1-3.4 3.6-5.3 6.8-5.3 1.4 0 2.7.4 3.8 1.1"/><path d="M18.5 13.8v6M15.5 16.8h6"/>',
  suivi: '<circle cx="10" cy="8.2" r="3.8"/><path d="M3.2 20.2c1-3.4 3.6-5.3 6.8-5.3 1.4 0 2.7.4 3.8 1.1"/><path d="m15.4 17.3 2 2 3.6-4"/>',
  retirer_role: '<circle cx="10" cy="8.2" r="3.8"/><path d="M3.2 20.2c1-3.4 3.6-5.3 6.8-5.3 1.4 0 2.7.4 3.8 1.1"/><path d="M15.5 16.8h6"/>',
  couronne: '<path d="M4 8.2l4 3.8 4-6 4 6 4-3.8-1.6 10H5.6z"/>',
  diese: '<path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h15.5M4 15h15.5"/>',
  telecharger: '<path d="M12 4v10.5M7.6 10.2 12 14.6l4.4-4.4M5 19.5h14"/>',
  actualiser: '<path d="M19.4 12A7.4 7.4 0 1 1 17 6.5"/><path d="M19.4 4.2v4h-4"/>',
  chevron_bas: '<path d="m6.5 9.2 5.5 5.5 5.5-5.5"/>',
  chevron_droite: '<path d="m9.2 6.5 5.5 5.5-5.5 5.5"/>',
  tri: '<path d="M8 5v14M4.8 15.8 8 19l3.2-3.2M16 19V5M12.8 8.2 16 5l3.2 3.2"/>',
  cle: '<circle cx="8" cy="15" r="4"/><path d="m10.9 12.1 8.6-8.6M16.4 6.6l2.6 2.6M13.8 9.2l2 2"/>',
  activite: '<path d="M3.5 12h3.8l2.6-6.2 4.2 12.4 2.6-6.2h3.8"/>',
  calendrier: '<rect x="4" y="5.5" width="16" height="14.5" rx="3.2"/><path d="M4 10.2h16M8.5 3.5v4M15.5 3.5v4"/>',
  lien: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  tendance: '<path d="M3.5 17 9.5 11l4 4 7-7.5"/><path d="M15.5 7.5h5v5"/>',
  filtre: '<path d="M4 6h16M7 12h10M10 18h4"/>'
};

function icone(nom, classe = '') {
  return `<svg class="icone ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom] || ''}</svg>`;
}

// ════════════════ Avatars ════════════════

// Dégradé orange stable par nom : chaque compte garde sa teinte sur toutes les pages
const DEGRADES = [
  ['#ffb35c', '#ff7a1a'], ['#ff9a6b', '#f0520f'], ['#ffcf70', '#f59a0b'], ['#f7a26f', '#d6530c'],
  ['#ffb49a', '#ff6a4d'], ['#d9955e', '#9a5222'], ['#ffd79a', '#ff9d3c'], ['#ee8d5c', '#b2470d']
];

function avatar(nom, taille = 44, { anneau = false, pointille = false, inactif = false } = {}) {
  let h = 0;
  for (const c of String(nom)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = DEGRADES[h % DEGRADES.length];
  const rond = `<span class="avatar" style="--taille:${taille}px;background:linear-gradient(135deg,${a},${b})">${escapeHtml(initiales(nom))}</span>`;
  if (!anneau) return rond;
  return `<span class="avatar-anneau${pointille ? ' pointille' : ''}${inactif ? ' inactif' : ''}">${rond}</span>`;
}

// ════════════════ Statuts de compte ════════════════
// Un seul endroit décrit les trois statuts : libellé, classe CSS, page d'accueil.
const STATUTS = {
  administrateur: { label: 'Administrateur', court: 'Admin', classe: 'statut-admin', icone: 'couronne', accueil: '/admin.html' },
  moderateur:     { label: 'Modérateur',     court: 'Modo',  classe: 'statut-modo',  icone: 'bouclier', accueil: '/moderation.html' },
  utilisateur:    { label: 'Utilisateur',    court: 'Membre', classe: 'statut-user', icone: 'profil',   accueil: '/' }
};

const statutInfo = role => STATUTS[role] || STATUTS.utilisateur;
const accueilSelonRole = role => statutInfo(role).accueil;
const estStaff = role => role === 'moderateur' || role === 'administrateur';

// Pastille de statut. `discret` : rien pour un simple utilisateur (fil, commentaires)
function badgeStatut(role, { discret = false } = {}) {
  if (discret && !estStaff(role)) return '';
  const s = statutInfo(role);
  return `<span class="statut ${s.classe}">${estStaff(role) ? icone(s.icone) : ''}${s.label}</span>`;
}

// Garde côté page : renvoie vers son propre espace si le statut n'a pas accès
function exigerRole(user, rolesAutorises) {
  if (rolesAutorises.includes(user.role)) return true;
  location.href = accueilSelonRole(user.role);
  return false;
}

// ════════════════ Toasts ════════════════

function toast(texte, { type = 'ok', action = null, duree = 3200 } = {}) {
  let zone = document.querySelector('.toasts');
  if (!zone) {
    zone = document.createElement('div');
    zone.className = 'toasts';
    zone.setAttribute('role', 'status');
    document.body.appendChild(zone);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'erreur' ? 'erreur' : ''}`;
  el.innerHTML = `${icone(type === 'erreur' ? 'alerte' : 'coche', 'icone-sm')}<span></span>`;
  el.querySelector('span').textContent = texte;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.libelle;
    b.onclick = () => { action.fn(); fermer(); };
    el.appendChild(b);
  }
  zone.appendChild(el);
  const fermer = () => { el.classList.add('sortie'); setTimeout(() => el.remove(), 200); };
  setTimeout(fermer, duree);
}
const toastErreur = err => toast(err?.message || String(err), { type: 'erreur', duree: 4500 });

// ════════════════ Fenêtres modales ════════════════
// Sur mobile elles s'ouvrent en feuille depuis le bas (voir style.css).

function ouvrirModal({ titre = '', corps = '', pied = '', largeur = null, onFerme = null } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  if (largeur) dialog.style.width = `min(${largeur}px, calc(100vw - 32px))`;
  dialog.innerHTML = `
    <div class="poignee"></div>
    ${titre ? `<div class="modal-tete"><h2></h2><button class="btn btn-icon btn-sm" data-fermer aria-label="Fermer">${icone('fermer')}</button></div>` : ''}
    <div class="modal-corps">${corps}</div>
    ${pied ? `<div class="modal-pied">${pied}</div>` : ''}`;
  if (titre) dialog.querySelector('h2').textContent = titre;
  document.body.appendChild(dialog);

  const fermer = () => dialog.close();
  dialog.addEventListener('close', () => { onFerme?.(); dialog.remove(); });
  // Clic sur le fond = fermer
  dialog.addEventListener('mousedown', e => { if (e.target === dialog) fermer(); });
  dialog.querySelectorAll('[data-fermer]').forEach(b => { b.onclick = fermer; });
  dialog.showModal();
  return { dialog, fermer, $: sel => dialog.querySelector(sel) };
}

// Confirmation explicite : le bouton décrit l'action, pas « OK »
function confirmer({ titre, message, bouton = 'Confirmer', danger = false, iconeAlerte = null }) {
  return new Promise(resolve => {
    let reponse = false;
    const m = ouvrirModal({
      titre,
      largeur: 440,
      corps: `${iconeAlerte ? `<div class="alerte ${danger ? 'alerte-danger' : 'alerte-info'}">${icone(iconeAlerte)}<span data-msg></span></div>` : '<p data-msg></p>'}`,
      pied: `<button class="btn" data-fermer>Annuler</button>
             <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-ok></button>`,
      onFerme: () => resolve(reponse)
    });
    m.$('[data-msg]').textContent = message;
    m.$('[data-ok]').textContent = bouton;
    m.$('[data-ok]').onclick = () => { reponse = true; m.fermer(); };
    m.$('[data-ok]').focus();
  });
}

// ════════════════ Menu contextuel ════════════════

function ouvrirMenu(ancre, items) {
  document.querySelector('.menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    if (item === '-') { menu.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    if (item.danger) b.className = 'danger';
    b.innerHTML = `${icone(item.icone, 'icone-sm')}<span></span>`;
    b.querySelector('span').textContent = item.libelle;
    b.onclick = () => { fermer(); item.action(); };
    menu.appendChild(b);
  }
  document.body.appendChild(menu);

  const r = ancre.getBoundingClientRect();
  const largeur = menu.offsetWidth;
  const hauteur = menu.offsetHeight;
  menu.style.left = `${Math.max(12, Math.min(r.right - largeur, innerWidth - largeur - 12))}px`;
  menu.style.top = `${r.bottom + 6 + hauteur > innerHeight ? Math.max(12, r.top - hauteur - 6) : r.bottom + 6}px`;
  menu.querySelector('button')?.focus();

  function fermer() {
    menu.remove();
    document.removeEventListener('mousedown', dehors, true);
    document.removeEventListener('keydown', echap);
    removeEventListener('scroll', fermer, true);
  }
  const dehors = e => { if (!menu.contains(e.target)) fermer(); };
  const echap = e => { if (e.key === 'Escape') fermer(); };
  setTimeout(() => {
    document.addEventListener('mousedown', dehors, true);
    document.addEventListener('keydown', echap);
    addEventListener('scroll', fermer, true);
  });
}

// ════════════════ Coquille de l'application ════════════════

let MOI = null;

function lienNav(id, href, libelle, ic, actif, badge = null) {
  return `<a class="nav-item ${id === actif ? 'active' : ''}" href="${href}">${icone(ic)}<span>${libelle}</span>${badge ? `<span class="compteur-badge" data-badge="${badge}" hidden></span>` : ''}</a>`;
}

// Démarre une page de l'application : vérifie la session, construit la navigation, affiche la page
async function demarrerApp(actif) {
  MOI = await api('/api/moi');
  const app = document.getElementById('app');

  const sidebar = document.createElement('nav');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = `
    <a class="logo" href="/"><span class="logo-marque">${icone('logo')}</span>Hesstagram</a>
    ${lienNav('accueil', '/', 'Accueil', 'accueil', actif)}
    ${lienNav('explorer', '/explorer.html', 'Explorer', 'recherche', actif)}
    ${lienNav('notifications', '/notifications.html', 'Notifications', 'cloche', actif, 'notifications')}
    ${lienNav('messages', '/messages.html', 'Messages', 'messages', actif, 'messages')}
    ${lienNav('profil', `/profil.html?id=${MOI.id}`, 'Mon profil', 'profil', actif)}
    ${lienNav('parametres', '/parametres.html', 'Paramètres', 'reglages', actif)}
    <button class="btn btn-primary btn-creer" data-creer>${icone('plus')}Nouvelle publication</button>
    ${estStaff(MOI.role) ? `
      <div class="nav-section">Espace staff</div>
      ${lienNav('moderation', '/moderation.html', 'Modération', 'bouclier', actif, 'signalements')}
      ${MOI.role === 'administrateur' ? lienNav('admin', '/admin.html', 'Administration', 'tableau', actif) : ''}` : ''}
    <div class="moi-carte">
      ${avatar(MOI.nom, 40)}
      <div class="infos">
        <div class="nom ellipsis"></div>
        <div class="muted" style="font-size:12.5px">${statutInfo(MOI.role).label}</div>
      </div>
      <button class="btn btn-icon btn-sm" data-menu-moi aria-label="Options du compte">${icone('plus_options')}</button>
    </div>`;
  sidebar.querySelector('.moi-carte .nom').textContent = MOI.nom;
  app.prepend(sidebar);

  const bas = document.createElement('nav');
  bas.className = 'bottom-nav';
  const lienBas = (id, href, ic, libelle, badge) =>
    `<a href="${href}" class="${id === actif ? 'active' : ''}" aria-label="${libelle}">${icone(ic)}${badge ? `<span class="compteur-badge" data-badge="${badge}" hidden></span>` : ''}</a>`;
  bas.innerHTML = `
    ${lienBas('accueil', '/', 'accueil', 'Accueil')}
    ${lienBas('explorer', '/explorer.html', 'recherche', 'Explorer')}
    <button class="fab" data-creer aria-label="Nouvelle publication">${icone('plus')}</button>
    ${lienBas('messages', '/messages.html', 'messages', 'Messages', 'messages')}
    ${lienBas('profil', `/profil.html?id=${MOI.id}`, 'profil', 'Mon profil')}`;
  document.body.appendChild(bas);

  // Actions d'en-tête (recherche + cloche), comme sur les maquettes
  document.querySelectorAll('[data-actions-entete]').forEach(zone => {
    zone.innerHTML = `
      ${actif !== 'explorer' ? `<a class="btn btn-icon" href="/explorer.html" aria-label="Rechercher">${icone('recherche')}</a>` : ''}
      ${actif !== 'notifications' ? `<a class="btn btn-icon" href="/notifications.html" aria-label="Notifications" data-point="notifications">${icone('cloche')}</a>` : ''}`;
  });

  document.querySelectorAll('[data-creer]').forEach(b => { b.onclick = () => ouvrirComposeur(); });
  sidebar.querySelector('[data-menu-moi]').onclick = e => ouvrirMenu(e.currentTarget, [
    { libelle: 'Voir mon profil', icone: 'profil', action: () => { location.href = `/profil.html?id=${MOI.id}`; } },
    { libelle: 'Paramètres du compte', icone: 'reglages', action: () => { location.href = '/parametres.html'; } },
    '-',
    { libelle: 'Se déconnecter', icone: 'sortie', danger: true, action: deconnexion }
  ]);

  app.hidden = false;
  majCompteurs();
  setInterval(majCompteurs, 30000);
  return MOI;
}

async function deconnexion() {
  await api('/api/deconnexion', { method: 'POST' }).catch(() => {});
  location.href = '/login.html';
}

// ── Compteurs non lus (notifications, messages, signalements) ──
const cleNotifsVues = () => `hess-notifs-vues-${MOI.id}`;

function lireStockage(cle, defaut = null) {
  try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; }
}
function ecrireStockage(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch { /* stockage indisponible */ }
}

async function majCompteurs() {
  if (!MOI) return;
  const afficher = (nom, n) => {
    document.querySelectorAll(`[data-badge="${nom}"]`).forEach(el => {
      el.hidden = !n;
      el.textContent = n > 99 ? '99+' : n;
    });
    document.querySelectorAll(`[data-point="${nom}"]`).forEach(el => el.classList.toggle('pastille-point', n > 0));
  };
  try {
    const [notifs, contacts] = await Promise.all([api('/api/notifications'), api('/api/messages/contacts')]);
    const vues = lireStockage(cleNotifsVues(), 0);
    afficher('notifications', notifs.filter(n => n.id > vues).length);
    afficher('messages', contacts.reduce((t, c) => t + c.non_lus, 0));
    if (estStaff(MOI.role)) afficher('signalements', (await api('/api/signalements')).length);
  } catch { /* hors ligne : on réessaiera */ }
}

// ════════════════ Composeur de publication (disponible partout via « + ») ════════════════

// Réduit la photo côté navigateur (1600 px, JPEG) : envoi rapide, même depuis un téléphone
function preparerImage(fichier) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(fichier.type)) {
      reject(new Error('Choisissez une image PNG, JPEG, GIF ou WebP.'));
      return;
    }
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture de l’image impossible.'));
    lecteur.onload = () => {
      if (fichier.type === 'image/gif') {                  // GIF animé : envoyé tel quel
        if (fichier.size > 5 * 1024 * 1024) reject(new Error('GIF trop lourd (5 Mo maximum).'));
        else resolve(lecteur.result);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        const echelle = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * echelle);
        canvas.height = Math.round(img.height * echelle);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

function ouvrirComposeur() {
  const MAX = 2200;
  let image = null;
  const m = ouvrirModal({
    titre: 'Nouvelle publication',
    largeur: 560,
    corps: `
      <div class="composeur">
        ${avatar(MOI.nom, 46)}
        <div class="zone">
          <div style="font-weight:500"></div>
          <textarea data-texte rows="4" maxlength="${MAX}" placeholder="Quoi de neuf ? Ajoutez des #hashtags pour être trouvé."></textarea>
          <div class="apercu-image" data-apercu hidden>
            <img alt="Aperçu de la photo">
            <button class="retirer" data-retirer aria-label="Retirer la photo">${icone('fermer', 'icone-sm')}</button>
          </div>
        </div>
      </div>`,
    pied: `
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-fichier hidden>
      <button class="btn btn-soft" data-choisir>${icone('image')}Photo</button>
      <span class="compteur" data-compteur style="margin-right:auto;align-self:center">0 / ${MAX}</span>
      <button class="btn btn-primary" data-publier disabled>Publier</button>`
  });
  m.$('.zone > div').textContent = MOI.nom;
  const texte = m.$('[data-texte]');
  const publier = m.$('[data-publier]');
  const maj = () => {
    const n = texte.value.length;
    m.$('[data-compteur]').textContent = `${n} / ${MAX}`;
    m.$('[data-compteur]').classList.toggle('plein', n > MAX * 0.9);
    publier.disabled = !texte.value.trim() && !image;
  };
  texte.oninput = maj;
  texte.focus();

  m.$('[data-choisir]').onclick = () => m.$('[data-fichier]').click();
  m.$('[data-fichier]').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      image = await preparerImage(f);
      m.$('[data-apercu] img').src = image;
      m.$('[data-apercu]').hidden = false;
    } catch (err) { toastErreur(err); }
    e.target.value = '';
    maj();
  };
  m.$('[data-retirer]').onclick = () => { image = null; m.$('[data-apercu]').hidden = true; maj(); };

  // Ctrl/Cmd + Entrée pour publier
  texte.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !publier.disabled) publier.click(); };
  publier.onclick = async () => {
    publier.disabled = true;
    publier.textContent = 'Publication…';
    try {
      await api('/api/publications', { method: 'POST', body: { description: texte.value.trim(), image } });
      m.fermer();
      toast('Publication partagée');
      document.dispatchEvent(new CustomEvent('publication:creee'));
    } catch (err) {
      toastErreur(err);
      publier.textContent = 'Publier';
      maj();
    }
  };
}

// ════════════════ Console staff (modération + administration) ════════════════

async function demarrerConsole(actif, rolesAutorises) {
  MOI = await api('/api/moi');
  if (!exigerRole(MOI, rolesAutorises)) return null;
  const racine = document.getElementById('console');
  const admin = MOI.role === 'administrateur';
  const lien = (id, href, libelle, ic, badge) => lienNav(id, href, libelle, ic, actif, badge);

  const nav = document.createElement('nav');
  nav.className = 'console-nav';
  nav.innerHTML = `
    <a class="logo" href="${admin ? '/admin.html' : '/moderation.html'}"><span class="logo-marque">${icone('logo')}</span><span>Hesstagram<small>Console ${admin ? 'administrateur' : 'modération'}</small></span></a>
    ${admin ? `
      <div class="nav-section">Pilotage</div>
      ${lien('dashboard', '/admin.html#tableau', 'Vue d’ensemble', 'tableau')}
      ${lien('comptes', '/admin.html#comptes', 'Comptes & rôles', 'comptes')}` : ''}
    <div class="nav-section">Modération</div>
    ${lien('moderation', '/moderation.html', 'File de signalements', 'drapeau', 'signalements')}
    ${admin ? `
      ${lien('historique', '/admin.html#historique', 'Suivi des décisions', 'bouclier')}
      <div class="nav-section">Traçabilité</div>
      ${lien('journal', '/admin.html#journal', 'Journal du site', 'journal')}` : ''}
    <div class="nav-section">Application</div>
    ${lien('app', '/', 'Retour à Hesstagram', 'retour')}
    <div class="moi-carte" style="margin-top:auto">
      ${avatar(MOI.nom, 38)}
      <div class="infos"><div class="nom ellipsis"></div><div class="muted" style="font-size:12.5px">${statutInfo(MOI.role).label}</div></div>
      <button class="btn btn-icon btn-sm" style="color:#fff" data-sortie aria-label="Se déconnecter" title="Se déconnecter">${icone('sortie')}</button>
    </div>`;
  nav.querySelector('.nom').textContent = MOI.nom;
  nav.querySelector('[data-sortie]').onclick = deconnexion;
  racine.prepend(nav);
  racine.hidden = false;

  const majBadge = async () => {
    try {
      const n = (await api('/api/signalements')).length;
      nav.querySelectorAll('[data-badge="signalements"]').forEach(el => { el.hidden = !n; el.textContent = n; });
    } catch { /* ignoré */ }
  };
  majBadge();
  setInterval(majBadge, 30000);
  return MOI;
}

// Met en surbrillance l'entrée de la console correspondant à l'onglet courant (#ancre)
function activerLienConsole(id) {
  document.querySelectorAll('.console-nav .nav-item').forEach(a => {
    const cible = a.getAttribute('href');
    a.classList.toggle('active', cible.endsWith(`#${id}`) || (id === 'moderation' && cible === '/moderation.html'));
  });
}
