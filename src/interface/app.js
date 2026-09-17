// app.js — socle partagé par toutes les pages : API, icônes, avatars, navigation, toasts, fenêtres

// ════════════════ API ════════════════

// Token de connexion (JWT) : émis par POST /api/auth/login (route du groupe),
// conservé par le navigateur et renvoyé à chaque appel dans l'en-tête Authorization.
// Mêmes clés de stockage que les pages du groupe (token, nom, role).
const PAGE_CONNEXION = '/index.html';

function jetonDeSession() {
  return localStorage.getItem('token') || '';
}

function enregistrerSession(token, utilisateur) {
  localStorage.setItem('token', token);
  localStorage.setItem('nom', utilisateur.nom);
  localStorage.setItem('role', utilisateur.role);
}

function oublierSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('nom');
  localStorage.removeItem('role');
}

const surLaPageDeConnexion = () => location.pathname === '/' || location.pathname.endsWith('/index.html');

// Session terminée côté serveur (token expiré, compte supprimé, suspendu, rôle
// changé) : on oublie le token et on repart sur la connexion avec l'explication.
function quitterSession(message) {
  oublierSession();
  try { sessionStorage.setItem('hess-message-connexion', message); } catch { /* stockage indisponible */ }
  location.href = PAGE_CONNEXION;
  return new Promise(() => {});   // la page part : on fige la suite du script
}

// Appel API : JSON + token + gestion d'erreur.
async function api(url, options = {}) {
  const jeton = jetonDeSession();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!surLaPageDeConnexion() && (res.status === 401 || (res.status === 403 && data.suspendu))) {
    return quitterSession(data.error || 'Votre session a expiré, reconnectez-vous.');
  }
  if (!res.ok) throw new Error(data.error || data.erreur || data.message || `Erreur ${res.status}`);
  return data;
}

// ════════════════ Texte ════════════════

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
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

// ════════════════ Icônes (trait arrondi 1,8 px) ════════════════

const ICONES = {
  accueil: '<path d="M4 10.4 12 4l8 6.4v8.1A1.5 1.5 0 0 1 18.5 20H15v-5.2a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1V20H5.5A1.5 1.5 0 0 1 4 18.5z"/>',
  recherche: '<circle cx="11" cy="11" r="6.8"/><path d="m20 20-3.9-3.9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  messages: '<path d="M20 11.5c0 4.1-3.6 7.5-8 7.5-1.2 0-2.3-.2-3.3-.7L4 19.5l1.2-3.6A7.2 7.2 0 0 1 4 11.5C4 7.4 7.6 4 12 4s8 3.4 8 7.5z"/><path d="M8.5 10.3h7M8.5 13.3h4.3"/>',
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
  envoyer: '<path d="M20.4 3.6 10.2 13.8M20.4 3.6 14 20.2l-3.8-6.4-6.4-3.8z"/>',
  camera: '<rect x="3.5" y="6.5" width="12" height="11" rx="3"/><path d="m15.5 11 5-2.7v7.4l-5-2.7z"/>',
  image: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="9.2" cy="9.4" r="1.6"/><path d="m20 15.2-4.4-4.4L7.2 19.6"/>',
  fermer: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus_options: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
  retour: '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
  cadenas: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/><path d="M12 14.4v2.2"/>',
  coche: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  verifie: '<path d="M12 2.9l2.2 1.6 2.7-.1.8 2.6 2.3 1.5-.9 2.5.9 2.5-2.3 1.5-.8 2.6-2.7-.1L12 19.1l-2.2-1.6-2.7.1-.8-2.6L4 13.5l.9-2.5L4 8.5l2.3-1.5.8-2.6 2.7.1z" fill="currentColor" stroke="none"/><path d="m8.9 11.1 2.1 2.1 4.1-4.1" stroke="#fff"/>',
  poubelle: '<path d="M4.5 6.5h15M9.5 6.5V4.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8v1.7M6.5 6.5l.8 11.9a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8l.8-11.9"/><path d="M10 10.5v5.6M14 10.5v5.6"/>',
  oeil: '<path d="M2.8 12S6 5.6 12 5.6 21.2 12 21.2 12 18 18.4 12 18.4 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8M12 3.6c2.2 2.3 3.4 5.1 3.4 8.4s-1.2 6.1-3.4 8.4c-2.2-2.3-3.4-5.1-3.4-8.4S9.8 5.9 12 3.6z"/>',
  horloge: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.9"/>',
  alerte: '<path d="M10.3 4.9a2 2 0 0 1 3.4 0l7 12.1a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3z"/><path d="M12 10v3.6M12 16.6v.1"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5M12 8.1v.1"/>',
  interdit: '<circle cx="12" cy="12" r="8.4"/><path d="m6.1 6.1 11.8 11.8"/>',
  suivre: '<circle cx="10" cy="8.2" r="3.8"/><path d="M3.2 20.2c1-3.4 3.6-5.3 6.8-5.3 1.4 0 2.7.4 3.8 1.1"/><path d="M18.5 13.8v6M15.5 16.8h6"/>',
  retirer_role: '<circle cx="10" cy="8.2" r="3.8"/><path d="M3.2 20.2c1-3.4 3.6-5.3 6.8-5.3 1.4 0 2.7.4 3.8 1.1"/><path d="M15.5 16.8h6"/>',
  couronne: '<path d="M4 8.2l4 3.8 4-6 4 6 4-3.8-1.6 10H5.6z"/>',
  telecharger: '<path d="M12 4v10.5M7.6 10.2 12 14.6l4.4-4.4M5 19.5h14"/>',
  actualiser: '<path d="M19.4 12A7.4 7.4 0 1 1 17 6.5"/><path d="M19.4 4.2v4h-4"/>',
  tri: '<path d="M8 5v14M4.8 15.8 8 19l3.2-3.2M16 19V5M12.8 8.2 16 5l3.2 3.2"/>',
  cle: '<circle cx="8" cy="15" r="4"/><path d="m10.9 12.1 8.6-8.6M16.4 6.6l2.6 2.6M13.8 9.2l2 2"/>',
  activite: '<path d="M3.5 12h3.8l2.6-6.2 4.2 12.4 2.6-6.2h3.8"/>',
  filtre: '<path d="M4 6h16M7 12h10M10 18h4"/>'
};

function icone(nom, classe = '') {
  return `<svg class="icone ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom] || ''}</svg>`;
}

// Remplace les <span data-ic="nom"> du HTML par l'icône correspondante
function poserIcones(racine = document) {
  racine.querySelectorAll('[data-ic]').forEach(s => { s.outerHTML = icone(s.dataset.ic); });
}

// ════════════════ Avatars ════════════════

// Dégradé stable par nom, tiré des couleurs du logo : chaque compte garde sa teinte sur toutes les pages
const DEGRADES = [
  ['#ffb627', '#ff6a2b'], ['#ff6a2b', '#ec2f7b'], ['#ec2f7b', '#8b3cf0'], ['#ffb627', '#ec2f7b'],
  ['#ff8a3d', '#d01b66'], ['#f8629b', '#8b3cf0'], ['#ffc54d', '#ff6a2b'], ['#b04ae8', '#6a2fd1']
];

function avatar(nom, taille = 44, { anneau = false } = {}) {
  let h = 0;
  for (const c of String(nom)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = DEGRADES[h % DEGRADES.length];
  const rond = `<span class="avatar" style="--taille:${taille}px;background:linear-gradient(135deg,${a},${b})">${escapeHtml(initiales(nom))}</span>`;
  return anneau ? `<span class="avatar-anneau">${rond}</span>` : rond;
}

// ════════════════ Statuts de compte ════════════════
// Rôles du projet : user, modo, admin (utilisateurs.routes.js du groupe)
const STATUTS = {
  admin: { label: 'Administrateur', classe: 'statut-admin', icone: 'couronne' },
  modo:  { label: 'Modérateur',     classe: 'statut-modo',  icone: 'bouclier' },
  user:  { label: 'Membre',         classe: 'statut-user',  icone: 'profil' }
};

const statutInfo = role => STATUTS[role] || STATUTS.user;
const estStaff = role => role === 'modo' || role === 'admin';

// Pastille de statut. `discret` : rien pour un simple membre
function badgeStatut(role, { discret = false } = {}) {
  if (discret && !estStaff(role)) return '';
  const s = statutInfo(role);
  return `<span class="statut ${s.classe}">${estStaff(role) ? icone(s.icone) : ''}${s.label}</span>`;
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
  const fermer = () => { el.classList.add('sortie'); setTimeout(() => el.remove(), 200); };
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.libelle;
    b.onclick = () => { action.fn(); fermer(); };
    el.appendChild(b);
  }
  zone.appendChild(el);
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
  dialog.addEventListener('mousedown', e => { if (e.target === dialog) fermer(); });   // clic sur le fond
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
      corps: iconeAlerte
        ? `<div class="alerte ${danger ? 'alerte-danger' : 'alerte-info'}">${icone(iconeAlerte)}<span data-msg></span></div>`
        : '<p data-msg></p>',
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

// Compte connecté, relu en base (rôle à jour, compte suspendu refusé)
async function chargerMoi() {
  if (!jetonDeSession()) { location.href = PAGE_CONNEXION; return new Promise(() => {}); }
  MOI = await api('/api/compte');
  return MOI;
}

// Démarre une page de l'application : vérifie la session, construit la navigation, affiche la page
async function demarrerApp(actif) {
  await chargerMoi();
  const app = document.getElementById('app');

  const sidebar = document.createElement('nav');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = `
    <a class="logo" href="/accueil.html"><img class="logo-marque" src="/logo_Hesstagram.png" alt="">Hesstagram</a>
    ${lienNav('accueil', '/accueil.html', 'Accueil', 'accueil', actif)}
    ${lienNav('messages', '/messagerie.html', 'Messagerie', 'messages', actif, 'messages')}
    ${lienNav('compte', '/compte.html', 'Mon compte', 'reglages', actif)}
    <a class="btn btn-primary btn-creer" href="/publier.html">${icone('plus')}Publier</a>
    ${estStaff(MOI.role) ? `
      <div class="nav-section">Espace staff</div>
      ${lienNav('moderation', '/moderation.html', 'Modération', 'bouclier', actif, 'signalements')}
      ${MOI.role === 'admin' ? lienNav('admin', '/admin.html', 'Administration', 'tableau', actif) : ''}` : ''}
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
    ${lienBas('accueil', '/accueil.html', 'accueil', 'Accueil')}
    ${estStaff(MOI.role) ? lienBas('moderation', MOI.role === 'admin' ? '/admin.html' : '/moderation.html', 'bouclier', 'Console', 'signalements') : ''}
    <a class="fab" href="/publier.html" aria-label="Publier">${icone('plus')}</a>
    ${lienBas('messages', '/messagerie.html', 'messages', 'Messagerie', 'messages')}
    ${lienBas('compte', '/compte.html', 'reglages', 'Mon compte')}`;
  document.body.appendChild(bas);

  sidebar.querySelector('[data-menu-moi]').onclick = e => ouvrirMenu(e.currentTarget, [
    { libelle: 'Mon compte', icone: 'reglages', action: () => { location.href = '/compte.html'; } },
    '-',
    { libelle: 'Se déconnecter', icone: 'sortie', danger: true, action: deconnexion }
  ]);

  app.hidden = false;
  majCompteurs();
  setInterval(majCompteurs, 30000);
  return MOI;
}

// Le token JWT reste valable côté serveur jusqu'à expiration (24 h) :
// se déconnecter, c'est l'oublier dans ce navigateur.
function deconnexion() {
  oublierSession();
  location.href = PAGE_CONNEXION;
}

// ── Compteurs (messages non lus, signalements en attente) ──
async function majCompteurs() {
  if (!MOI) return;
  const afficher = (nom, n) => {
    document.querySelectorAll(`[data-badge="${nom}"]`).forEach(el => {
      el.hidden = !n;
      el.textContent = n > 99 ? '99+' : n;
    });
  };
  try {
    const contacts = await api('/api/messagerie/contacts');
    afficher('messages', contacts.reduce((t, c) => t + c.non_lus, 0));
    if (estStaff(MOI.role)) afficher('signalements', (await api('/api/moderation/file')).length);
  } catch { /* hors ligne : on réessaiera */ }
}

// ════════════════ Console staff (modération + administration) ════════════════

async function demarrerConsole(actif, rolesAutorises) {
  await chargerMoi();
  if (!rolesAutorises.includes(MOI.role)) {
    location.href = MOI.role === 'modo' ? '/moderation.html' : '/accueil.html';
    return null;
  }
  const racine = document.getElementById('console');
  const admin = MOI.role === 'admin';
  const lien = (id, href, libelle, ic, badge) => lienNav(id, href, libelle, ic, actif, badge);

  const nav = document.createElement('nav');
  nav.className = 'console-nav';
  nav.innerHTML = `
    <a class="logo" href="${admin ? '/admin.html' : '/moderation.html'}"><img class="logo-marque" src="/logo_Hesstagram.png" alt=""><span>Hesstagram<small>Console ${admin ? 'administrateur' : 'modération'}</small></span></a>
    ${admin ? `
      <div class="nav-section">Pilotage</div>
      ${lien('tableau', '/admin.html#tableau', 'Tableau de bord', 'tableau')}
      ${lien('comptes', '/admin.html#comptes', 'Comptes & rôles', 'comptes')}` : ''}
    <div class="nav-section">Modération</div>
    ${lien('moderation', '/moderation.html', 'File de signalements', 'drapeau', 'signalements')}
    ${admin ? `
      ${lien('historique', '/admin.html#historique', 'Suivi des décisions', 'bouclier')}
      <div class="nav-section">Traçabilité</div>
      ${lien('journal', '/admin.html#journal', 'Journal du site', 'journal')}` : ''}
    <div class="nav-section">Application</div>
    ${lien('app', '/accueil.html', 'Retour à Hesstagram', 'retour')}
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
      const n = (await api('/api/moderation/file')).length;
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
