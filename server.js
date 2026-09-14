// server.js — API Hesstagram (Express + SQLite natif Node)
import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, hashPassword, verifyPassword } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'main')));

// Longueurs autorisées pour l'authentification (12 caractères maximum)
const MAX_LEN = 12;
const MIN_NOM = 3;
const MIN_MDP = 6;

// ── Sessions en mémoire (token de cookie → id utilisateur) ──
const sessions = new Map();

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Suspension en cours d'un compte (fin NULL = sans date de fin), ou undefined
function suspensionActive(idUtilisateur) {
  return db.prepare('SELECT * FROM suspension WHERE id_utilisateur = ? AND (fin IS NULL OR fin > ?)')
    .get(idUtilisateur, new Date().toISOString());
}

// Ferme toutes les sessions ouvertes d'un compte (suspension, suppression)
function fermerSessions(idUtilisateur) {
  for (const [token, id] of sessions) if (id === idUtilisateur) sessions.delete(token);
}

function currentUser(req) {
  const token = parseCookies(req).session;
  const userId = token && sessions.get(token);
  if (!userId) return null;
  const user = db.prepare('SELECT id, nom, date, role FROM utilisateur WHERE id = ?').get(userId);
  // Compte supprimé ou suspendu entre-temps : la session ne vaut plus rien
  if (!user || suspensionActive(user.id)) {
    sessions.delete(token);
    return null;
  }
  return user;
}

// ── Journal : chaque action significative laisse une trace horodatée ──
// La catégorie sert aux filtres de l'espace administration.
const ACTIONS = {
  inscription: 'authentification',
  connexion: 'authentification',
  deconnexion: 'authentification',
  connexion_echouee: 'securite',
  connexion_refusee: 'securite',
  acces_refuse: 'securite',
  publication_creee: 'contenu',
  commentaire_ajoute: 'contenu',
  like_ajoute: 'contenu',
  like_retire: 'contenu',
  dislike_ajoute: 'contenu',
  dislike_retire: 'contenu',
  signalement_cree: 'signalement',
  signalement_classe: 'signalement',
  cle_publiee: 'messagerie',
  message_envoye: 'messagerie',
  role_modifie: 'administration',
  compte_suspendu: 'administration',
  suspension_levee: 'administration',
  compte_supprime: 'administration'
};

const insJournal = db.prepare(`
  INSERT INTO journal (date, id_utilisateur, nom_utilisateur, role_utilisateur, categorie, action,
                       cible_type, cible_id, cible_nom, details, ip)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// acteur : compte qui agit (req.user par défaut) — cible : { type, id, nom }
function journaliser(req, action, { acteur = req.user, cible = null, details = null } = {}) {
  insJournal.run(
    new Date().toISOString(),
    acteur?.id ?? null, acteur?.nom ?? null, acteur?.role ?? null,
    ACTIONS[action], action,
    cible?.type ?? null, cible?.id ?? null, cible?.nom ?? null,
    details, req.ip ?? null
  );
}

const cibleCompte = u => ({ type: 'utilisateur', id: u.id, nom: u.nom });

// Middlewares de garde
function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ erreur: 'Connexion requise.' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ erreur: 'Connexion requise.' });
    if (!roles.includes(user.role)) {
      journaliser(req, 'acces_refuse', { acteur: user, details: `${req.method} ${req.originalUrl}` });
      return res.status(403).json({ erreur: 'Accès refusé pour ce rôle.' });
    }
    req.user = user;
    next();
  };
}

// ════════════════ AUTHENTIFICATION ════════════════

// Création de compte
app.post('/api/inscription', (req, res) => {
  const nom = String(req.body?.nom || '').trim();
  const mdp = String(req.body?.mdp || '');
  if (!nom || !mdp) return res.status(400).json({ erreur: 'Nom et mot de passe obligatoires.' });
  if (nom.length < MIN_NOM) return res.status(400).json({ erreur: `Le nom doit faire au moins ${MIN_NOM} caractères.` });
  if (nom.length > MAX_LEN) return res.status(400).json({ erreur: `Le nom ne doit pas dépasser ${MAX_LEN} caractères.` });
  if (mdp.length < MIN_MDP) return res.status(400).json({ erreur: `Le mot de passe doit faire au moins ${MIN_MDP} caractères.` });
  if (mdp.length > MAX_LEN) return res.status(400).json({ erreur: `Le mot de passe ne doit pas dépasser ${MAX_LEN} caractères.` });

  const existe = db.prepare('SELECT id FROM utilisateur WHERE nom = ?').get(nom);
  if (existe) return res.status(409).json({ erreur: 'Ce nom est déjà pris.' });

  const r = db.prepare('INSERT INTO utilisateur (nom, mdp, date, role) VALUES (?, ?, ?, ?)')
    .run(nom, hashPassword(mdp), new Date().toISOString(), 'utilisateur');

  const nouveau = { id: Number(r.lastInsertRowid), nom, role: 'utilisateur' };
  const token = randomBytes(24).toString('hex');
  sessions.set(token, nouveau.id);
  journaliser(req, 'inscription', { acteur: nouveau });
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Lax`);
  res.status(201).json(nouveau);
});

// Connexion
app.post('/api/connexion', (req, res) => {
  const nom = String(req.body?.nom || '').trim();
  const mdp = String(req.body?.mdp || '');
  if (nom.length > MAX_LEN || mdp.length > MAX_LEN) {
    return res.status(400).json({ erreur: `Nom et mot de passe sont limités à ${MAX_LEN} caractères.` });
  }
  const user = db.prepare('SELECT * FROM utilisateur WHERE nom = ?').get(nom);
  if (!user || !verifyPassword(mdp, user.mdp)) {
    journaliser(req, 'connexion_echouee', {
      acteur: user ? { id: user.id, nom: user.nom, role: user.role } : { id: null, nom, role: null },
      details: user ? 'Mot de passe incorrect' : 'Compte inconnu'
    });
    return res.status(401).json({ erreur: 'Nom ou mot de passe incorrect.' });
  }
  const suspension = suspensionActive(user.id);
  if (suspension) {
    journaliser(req, 'connexion_refusee', { acteur: user, details: 'Compte suspendu' });
    const jusqua = suspension.fin
      ? `jusqu'au ${new Date(suspension.fin).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
      : 'sans date de fin';
    return res.status(403).json({ erreur: `Compte suspendu ${jusqua}. Raison : ${suspension.raison}` });
  }
  const token = randomBytes(24).toString('hex');
  sessions.set(token, user.id);
  journaliser(req, 'connexion', { acteur: user });
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Lax`);
  res.json({ id: user.id, nom: user.nom, role: user.role });
});

// Déconnexion
app.post('/api/deconnexion', (req, res) => {
  const user = currentUser(req);
  if (user) journaliser(req, 'deconnexion', { acteur: user });
  const token = parseCookies(req).session;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// Utilisateur connecté
app.get('/api/moi', requireAuth, (req, res) => res.json(req.user));

// ════════════════ FIL D'ACTUALITÉ ════════════════

// Liste des publications (avec compteurs et commentaires)
app.get('/api/publications', requireAuth, (req, res) => {
  const pubs = db.prepare(`
    SELECT p.id, p.date, p.description, p.nom_fichier, p.type_fichier,
           u.id AS auteur_id, u.nom AS auteur, u.role AS auteur_role,
           (SELECT COUNT(*) FROM "like" l WHERE l.id_pub = p.id) AS nb_like,
           (SELECT COUNT(*) FROM dislike d WHERE d.id_pub = p.id) AS nb_dislike,
           EXISTS(SELECT 1 FROM "like" l WHERE l.id_pub = p.id AND l.id_utilisateur = ?) AS mon_like,
           EXISTS(SELECT 1 FROM dislike d WHERE d.id_pub = p.id AND d.id_util = ?) AS mon_dislike
    FROM publication p
    JOIN utilisateur u ON u.id = p.id_utilisateur
    ORDER BY p.date DESC, p.id DESC
  `).all(req.user.id, req.user.id);

  const getComs = db.prepare(`
    SELECT c.id, c.commentaire, u.nom AS auteur, u.role AS auteur_role
    FROM commentaire c JOIN utilisateur u ON u.id = c.id_utilisateur
    WHERE c.id_pub = ? ORDER BY c.id
  `);
  for (const p of pubs) p.commentaires = getComs.all(p.id);
  res.json(pubs);
});

// Annuaire des comptes visible par tout membre connecté : nom + statut, jamais le mot de passe
app.get('/api/comptes', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.nom, u.role, u.date,
           (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications
    FROM utilisateur u
    ORDER BY CASE u.role
               WHEN 'administrateur' THEN 0
               WHEN 'moderateur' THEN 1
               ELSE 2
             END, u.nom
  `).all();
  res.json(rows);
});

// Nouvelle publication (texte) — les #hashtags sont enregistrés dans la table hashtag
app.post('/api/publications', requireAuth, (req, res) => {
  const description = String(req.body?.description || '').trim();
  if (!description) return res.status(400).json({ erreur: 'La publication est vide.' });

  const r = db.prepare(`
    INSERT INTO publication (id_utilisateur, date, description, nom_fichier, type_fichier, vue, "like", "dislike", partage, republie)
    VALUES (?, ?, ?, NULL, 'texte', 0, 0, 0, 0, 0)
  `).run(req.user.id, new Date().toISOString(), description);
  const idPub = Number(r.lastInsertRowid);

  const tags = description.match(/#([\p{L}\p{N}_]+)/gu) || [];
  const insTag = db.prepare('INSERT INTO hashtag (nom, nombre_utilisation, id_pub) VALUES (?, 1, ?)');
  for (const t of new Set(tags.map(t => t.toLowerCase()))) insTag.run(t, idPub);

  journaliser(req, 'publication_creee', {
    cible: { type: 'publication', id: idPub, nom: req.user.nom },
    details: description.length > 80 ? description.slice(0, 80) + '…' : description
  });
  res.status(201).json({ id: idPub });
});

// Publication + nom de son auteur (cible des entrées du journal), ou undefined
function trouverPublication(id) {
  return db.prepare(`
    SELECT p.id, u.nom AS auteur FROM publication p JOIN utilisateur u ON u.id = p.id_utilisateur WHERE p.id = ?
  `).get(id);
}
const ciblePublication = p => ({ type: 'publication', id: p.id, nom: p.auteur });

// J'aime (bascule ; retire le "je n'aime pas" éventuel)
app.post('/api/publications/:id/like', requireAuth, (req, res) => {
  const idPub = Number(req.params.id);
  const pub = trouverPublication(idPub);
  if (!pub) return res.status(404).json({ erreur: 'Publication introuvable.' });
  const deja = db.prepare('SELECT 1 FROM "like" WHERE id_pub = ? AND id_utilisateur = ?').get(idPub, req.user.id);
  db.prepare('DELETE FROM dislike WHERE id_pub = ? AND id_util = ?').run(idPub, req.user.id);
  if (deja) {
    db.prepare('DELETE FROM "like" WHERE id_pub = ? AND id_utilisateur = ?').run(idPub, req.user.id);
  } else {
    db.prepare('INSERT INTO "like" (id_pub, id_utilisateur) VALUES (?, ?)').run(idPub, req.user.id);
  }
  journaliser(req, deja ? 'like_retire' : 'like_ajoute', { cible: ciblePublication(pub) });
  res.json({ ok: true });
});

// Je n'aime pas (bascule ; retire le "j'aime" éventuel)
app.post('/api/publications/:id/dislike', requireAuth, (req, res) => {
  const idPub = Number(req.params.id);
  const pub = trouverPublication(idPub);
  if (!pub) return res.status(404).json({ erreur: 'Publication introuvable.' });
  const deja = db.prepare('SELECT 1 FROM dislike WHERE id_pub = ? AND id_util = ?').get(idPub, req.user.id);
  db.prepare('DELETE FROM "like" WHERE id_pub = ? AND id_utilisateur = ?').run(idPub, req.user.id);
  if (deja) {
    db.prepare('DELETE FROM dislike WHERE id_pub = ? AND id_util = ?').run(idPub, req.user.id);
  } else {
    db.prepare('INSERT INTO dislike (id_pub, id_util) VALUES (?, ?)').run(idPub, req.user.id);
  }
  journaliser(req, deja ? 'dislike_retire' : 'dislike_ajoute', { cible: ciblePublication(pub) });
  res.json({ ok: true });
});

// Commenter une publication
app.post('/api/publications/:id/commentaires', requireAuth, (req, res) => {
  const commentaire = String(req.body?.commentaire || '').trim();
  if (!commentaire) return res.status(400).json({ erreur: 'Le commentaire est vide.' });
  const pub = trouverPublication(Number(req.params.id));
  if (!pub) return res.status(404).json({ erreur: 'Publication introuvable.' });
  db.prepare('INSERT INTO commentaire (id_pub, id_utilisateur, commentaire) VALUES (?, ?, ?)')
    .run(pub.id, req.user.id, commentaire);
  journaliser(req, 'commentaire_ajoute', {
    cible: ciblePublication(pub),
    details: commentaire.length > 80 ? commentaire.slice(0, 80) + '…' : commentaire
  });
  res.status(201).json({ ok: true });
});

// Signaler l'auteur d'un contenu
app.post('/api/signalements', requireAuth, (req, res) => {
  const idSignale = Number(req.body?.id_signale);
  const raison = String(req.body?.raison || '').trim();
  if (!idSignale || !raison) return res.status(400).json({ erreur: 'Utilisateur et raison obligatoires.' });
  if (idSignale === req.user.id) return res.status(400).json({ erreur: 'Impossible de se signaler soi-même.' });
  const signale = db.prepare('SELECT id, nom FROM utilisateur WHERE id = ?').get(idSignale);
  if (!signale) return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
  const r = db.prepare('INSERT INTO signalement ("id_signalé", id_signalant, raison, date) VALUES (?, ?, ?, ?)')
    .run(idSignale, req.user.id, raison, new Date().toISOString());
  journaliser(req, 'signalement_cree', {
    cible: cibleCompte(signale),
    details: `Signalement n°${r.lastInsertRowid} — ${raison}`
  });
  res.status(201).json({ ok: true });
});

// ════════════════ MESSAGERIE CHIFFRÉE DE BOUT EN BOUT ════════════════
// Le serveur ne voit que des clés publiques et des messages déjà chiffrés par le navigateur.
// Il ne peut rien déchiffrer : il stocke et relaie.

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// Publier (ou remplacer) sa clé publique RSA — format SPKI encodé en base64
app.put('/api/cles/moi', requireAuth, (req, res) => {
  const cle = String(req.body?.cle || '');
  if (!BASE64.test(cle) || cle.length < 300 || cle.length > 2000) {
    return res.status(400).json({ erreur: 'Clé publique invalide.' });
  }
  db.prepare(`
    INSERT INTO cle_publique (id_utilisateur, cle, date) VALUES (?, ?, ?)
    ON CONFLICT(id_utilisateur) DO UPDATE SET cle = excluded.cle, date = excluded.date
  `).run(req.user.id, cle, new Date().toISOString());
  journaliser(req, 'cle_publiee');
  res.json({ ok: true });
});

// Clé publique d'un compte (null s'il n'a pas encore activé la messagerie)
app.get('/api/cles/:id', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT u.id, u.nom, c.cle FROM utilisateur u
    LEFT JOIN cle_publique c ON c.id_utilisateur = u.id
    WHERE u.id = ?
  `).get(Number(req.params.id));
  if (!row) return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
  res.json(row);
});

// Contacts : tous les comptes, avec l'état de leur clé et le nombre de messages non lus
app.get('/api/messages/contacts', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.nom, u.role,
           c.cle IS NOT NULL AS a_cle,
           (SELECT COUNT(*) FROM message m
             WHERE m.id_utilisateur = u.id AND m.id_util = ? AND m.vue = 0) AS non_lus,
           (SELECT MAX(m.id) FROM message m
             WHERE (m.id_utilisateur = u.id AND m.id_util = ?)
                OR (m.id_utilisateur = ? AND m.id_util = u.id)) AS dernier
    FROM utilisateur u
    LEFT JOIN cle_publique c ON c.id_utilisateur = u.id
    WHERE u.id != ?
    ORDER BY dernier IS NULL, dernier DESC, u.nom
  `).all(req.user.id, req.user.id, req.user.id, req.user.id);
  res.json(rows);
});

// Conversation avec un compte (?apres=id pour ne récupérer que les nouveaux messages).
// Les messages reçus sont marqués comme vus.
app.get('/api/messages/:id', requireAuth, (req, res) => {
  const autre = Number(req.params.id);
  const apres = Number(req.query.apres) || 0;
  const rows = db.prepare(`
    SELECT id, id_utilisateur AS id_exp, id_util AS id_dest, message, vue
    FROM message
    WHERE id > ?
      AND ((id_utilisateur = ? AND id_util = ?) OR (id_utilisateur = ? AND id_util = ?))
    ORDER BY id
  `).all(apres, req.user.id, autre, autre, req.user.id);
  db.prepare('UPDATE message SET vue = 1 WHERE id_utilisateur = ? AND id_util = ? AND vue = 0')
    .run(autre, req.user.id);
  res.json(rows);
});

// Envoi d'un message : le serveur vérifie seulement la FORME du paquet chiffré
// (iv + texte chiffré + clé AES chiffrée pour le destinataire et pour l'expéditeur).
// Un texte en clair est refusé.
app.post('/api/messages', requireAuth, (req, res) => {
  const idDest = Number(req.body?.id_dest);
  const paquet = req.body?.paquet;
  if (!idDest || idDest === req.user.id) return res.status(400).json({ erreur: 'Destinataire invalide.' });
  const dest = db.prepare('SELECT id, nom FROM utilisateur WHERE id = ?').get(idDest);
  if (!dest) {
    return res.status(404).json({ erreur: 'Destinataire introuvable.' });
  }
  const champs = ['iv', 'contenu', 'cle_dest', 'cle_exp'];
  const valide = paquet && typeof paquet === 'object'
    && champs.every(k => typeof paquet[k] === 'string' && BASE64.test(paquet[k]));
  if (!valide) return res.status(400).json({ erreur: 'Message non chiffré ou mal formé.' });
  if (paquet.contenu.length > 20000) return res.status(400).json({ erreur: 'Message trop long.' });

  const stocke = JSON.stringify({ v: 1, iv: paquet.iv, contenu: paquet.contenu, cle_dest: paquet.cle_dest, cle_exp: paquet.cle_exp });
  const r = db.prepare('INSERT INTO message (id_utilisateur, id_util, message, vue) VALUES (?, ?, ?, 0)')
    .run(req.user.id, idDest, stocke);
  // Seules les métadonnées sont journalisées : le contenu est chiffré et illisible pour le serveur
  journaliser(req, 'message_envoye', { cible: cibleCompte(dest), details: 'Contenu chiffré de bout en bout' });
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// ════════════════ MODÉRATION (modérateur + administrateur) ════════════════

app.get('/api/signalements', requireRole('moderateur', 'administrateur'), (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.raison, s.date,
           us.id AS id_signale, us.nom AS signale, us.role AS role_signale,
           ur.nom AS signalant,
           (SELECT COUNT(*) FROM signalement s2 WHERE s2."id_signalé" = us.id) AS total_contre
    FROM signalement s
    JOIN utilisateur us ON us.id = s."id_signalé"
    JOIN utilisateur ur ON ur.id = s.id_signalant
    ORDER BY s.date DESC, s.id DESC
  `).all();
  res.json(rows);
});

// Classer sans suite (supprime le signalement)
app.delete('/api/signalements/:id', requireRole('moderateur', 'administrateur'), (req, res) => {
  // Le signalement disparaît de la table : le journal en garde le contenu complet
  const s = db.prepare(`
    SELECT s.id, s.raison, us.id AS id_signale, us.nom AS signale, ur.nom AS signalant
    FROM signalement s
    JOIN utilisateur us ON us.id = s."id_signalé"
    JOIN utilisateur ur ON ur.id = s.id_signalant
    WHERE s.id = ?
  `).get(Number(req.params.id));
  if (!s) return res.status(404).json({ erreur: 'Signalement introuvable.' });
  db.prepare('DELETE FROM signalement WHERE id = ?').run(s.id);
  journaliser(req, 'signalement_classe', {
    cible: { type: 'utilisateur', id: s.id_signale, nom: s.signale },
    details: `Signalement n°${s.id} (par ${s.signalant}) classé sans suite — ${s.raison}`
  });
  res.json({ ok: true });
});

// ════════════════ ADMINISTRATION (administrateur) ════════════════

app.get('/api/utilisateurs', requireRole('administrateur'), (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.nom, u.date, u.role,
           (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications,
           (SELECT COUNT(*) FROM signalement s WHERE s."id_signalé" = u.id) AS nb_signalements,
           (SELECT MAX(j.date) FROM journal j WHERE j.id_utilisateur = u.id) AS derniere_activite,
           sp.raison AS suspension_raison, sp.date AS suspension_date, sp.fin AS suspension_fin
    FROM utilisateur u
    LEFT JOIN suspension sp ON sp.id_utilisateur = u.id AND (sp.fin IS NULL OR sp.fin > ?)
    ORDER BY u.id
  `).all(new Date().toISOString());
  res.json(rows);
});

// Compte visé par une action d'administration. Envoie l'erreur et renvoie null si l'action est
// impossible : compte inconnu, soi-même, ou autre administrateur (les administrateurs sont protégés).
function cibleAdministrable(req, res) {
  const cible = db.prepare('SELECT id, nom, role FROM utilisateur WHERE id = ?').get(Number(req.params.id));
  if (!cible) { res.status(404).json({ erreur: 'Utilisateur introuvable.' }); return null; }
  if (cible.id === req.user.id) { res.status(400).json({ erreur: 'Action impossible sur votre propre compte.' }); return null; }
  if (cible.role === 'administrateur') {
    res.status(403).json({ erreur: 'Un compte administrateur est protégé : action impossible.' });
    return null;
  }
  return cible;
}

// Attribution des rôles : nommer un modérateur ou le retirer (retour au statut utilisateur)
app.put('/api/utilisateurs/:id/role', requireRole('administrateur'), (req, res) => {
  const role = String(req.body?.role || '');
  const roles = ['utilisateur', 'moderateur', 'administrateur'];
  if (!roles.includes(role)) return res.status(400).json({ erreur: `Rôle invalide (${roles.join(', ')}).` });
  const cible = cibleAdministrable(req, res);
  if (!cible) return;
  if (cible.role === role) return res.status(400).json({ erreur: 'Ce compte a déjà ce rôle.' });
  db.prepare('UPDATE utilisateur SET role = ? WHERE id = ?').run(role, cible.id);
  journaliser(req, 'role_modifie', { cible: cibleCompte(cible), details: `${cible.role} → ${role}` });
  res.json({ ok: true });
});

// Suspendre un compte : raison obligatoire, durée en jours (null = sans date de fin)
app.post('/api/utilisateurs/:id/suspension', requireRole('administrateur'), (req, res) => {
  const raison = String(req.body?.raison || '').trim();
  const jours = req.body?.jours == null ? null : Number(req.body.jours);
  if (!raison) return res.status(400).json({ erreur: 'La raison de la suspension est obligatoire.' });
  if (jours !== null && !(Number.isInteger(jours) && jours >= 1 && jours <= 365)) {
    return res.status(400).json({ erreur: 'Durée invalide (1 à 365 jours, ou sans date de fin).' });
  }
  const cible = cibleAdministrable(req, res);
  if (!cible) return;

  const maintenant = new Date();
  const fin = jours === null ? null : new Date(maintenant.getTime() + jours * 86400000).toISOString();
  db.prepare(`
    INSERT INTO suspension (id_utilisateur, raison, date, fin, id_admin) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id_utilisateur) DO UPDATE SET raison = excluded.raison, date = excluded.date,
                                             fin = excluded.fin, id_admin = excluded.id_admin
  `).run(cible.id, raison, maintenant.toISOString(), fin, req.user.id);
  fermerSessions(cible.id);   // déconnecté immédiatement
  journaliser(req, 'compte_suspendu', {
    cible: cibleCompte(cible),
    details: `${jours === null ? 'Sans date de fin' : `${jours} jour(s)`} — ${raison}`
  });
  res.json({ ok: true, fin });
});

// Lever une suspension
app.delete('/api/utilisateurs/:id/suspension', requireRole('administrateur'), (req, res) => {
  const cible = cibleAdministrable(req, res);
  if (!cible) return;
  const r = db.prepare('DELETE FROM suspension WHERE id_utilisateur = ?').run(cible.id);
  if (!r.changes) return res.status(404).json({ erreur: 'Ce compte n’est pas suspendu.' });
  journaliser(req, 'suspension_levee', { cible: cibleCompte(cible) });
  res.json({ ok: true });
});

// Supprimer définitivement un compte et tout ce qui lui est rattaché (transaction)
app.delete('/api/utilisateurs/:id', requireRole('administrateur'), (req, res) => {
  const raison = String(req.body?.raison || '').trim();
  if (!raison) return res.status(400).json({ erreur: 'La raison de la suppression est obligatoire.' });
  const cible = cibleAdministrable(req, res);
  if (!cible) return;

  const id = cible.id;
  const sesPubs = 'SELECT id FROM publication WHERE id_utilisateur = ?';
  const bilan = db.prepare(`
    SELECT (SELECT COUNT(*) FROM publication WHERE id_utilisateur = ?) AS publications,
           (SELECT COUNT(*) FROM commentaire WHERE id_utilisateur = ?) AS commentaires,
           (SELECT COUNT(*) FROM message WHERE id_utilisateur = ? OR id_util = ?) AS messages
  `).get(id, id, id, id);

  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM "like" WHERE id_utilisateur = ? OR id_pub IN (${sesPubs})`).run(id, id);
    db.prepare(`DELETE FROM dislike WHERE id_util = ? OR id_pub IN (${sesPubs})`).run(id, id);
    db.prepare(`DELETE FROM commentaire WHERE id_utilisateur = ? OR id_pub IN (${sesPubs})`).run(id, id);
    db.prepare(`DELETE FROM hashtag WHERE id_pub IN (${sesPubs})`).run(id);
    db.prepare('DELETE FROM publication WHERE id_utilisateur = ?').run(id);
    db.prepare('DELETE FROM message WHERE id_utilisateur = ? OR id_util = ?').run(id, id);
    db.prepare('DELETE FROM notification WHERE id_utilisateur = ?').run(id);
    db.prepare('DELETE FROM signalement WHERE "id_signalé" = ? OR id_signalant = ?').run(id, id);
    db.prepare('DELETE FROM ami WHERE id_utilisateur1 = ? OR id_utilisateur2 = ?').run(id, id);
    db.prepare('DELETE FROM cle_publique WHERE id_utilisateur = ?').run(id);
    db.prepare('DELETE FROM suspension WHERE id_utilisateur = ?').run(id);
    db.prepare('DELETE FROM utilisateur WHERE id = ?').run(id);
    journaliser(req, 'compte_supprime', {
      cible: cibleCompte(cible),
      details: `${raison} — supprimés : ${bilan.publications} publication(s), `
        + `${bilan.commentaires} commentaire(s), ${bilan.messages} message(s)`
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    return res.status(500).json({ erreur: 'La suppression a échoué, rien n’a été modifié.' });
  }
  fermerSessions(id);
  res.json({ ok: true });
});

// Journal du site, filtrable. Pagination par curseur : ?avant=<id de la dernière ligne reçue>
app.get('/api/admin/journal', requireRole('administrateur'), (req, res) => {
  const { utilisateur, recherche, categorie, action, du, au, avant } = req.query;
  const limite = Math.min(Number(req.query.limite) || 100, 500);
  const conditions = [];
  const params = [];

  if (utilisateur) {
    // Actions faites PAR ce compte ou le CONCERNANT (rôle changé, suspendu, signalé…)
    conditions.push("(id_utilisateur = ? OR (cible_type = 'utilisateur' AND cible_id = ?))");
    params.push(Number(utilisateur), Number(utilisateur));
  }
  if (recherche) {
    conditions.push('(nom_utilisateur LIKE ? OR cible_nom LIKE ? OR details LIKE ?)');
    const motif = `%${recherche}%`;
    params.push(motif, motif, motif);
  }
  if (categorie) { conditions.push('categorie = ?'); params.push(String(categorie)); }
  if (action) { conditions.push('action = ?'); params.push(String(action)); }
  if (du) { conditions.push('date >= ?'); params.push(new Date(`${du}T00:00:00`).toISOString()); }
  if (au) { conditions.push('date <= ?'); params.push(new Date(`${au}T23:59:59.999`).toISOString()); }
  if (avant) { conditions.push('id < ?'); params.push(Number(avant)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM journal ${where} ORDER BY id DESC LIMIT ?`).all(...params, limite + 1);
  res.json({ lignes: rows.slice(0, limite), suite: rows.length > limite });
});

// Audit d'un profil : volume d'actions par catégorie + première et dernière activité
app.get('/api/admin/audit/:id', requireRole('administrateur'), (req, res) => {
  const id = Number(req.params.id);
  const compte = db.prepare(`
    SELECT u.id, u.nom, u.role, u.date,
           (SELECT COUNT(*) FROM signalement s WHERE s."id_signalé" = u.id) AS signalements_en_attente,
           sp.raison AS suspension_raison, sp.fin AS suspension_fin
    FROM utilisateur u
    LEFT JOIN suspension sp ON sp.id_utilisateur = u.id AND (sp.fin IS NULL OR sp.fin > ?)
    WHERE u.id = ?
  `).get(new Date().toISOString(), id);
  if (!compte) return res.status(404).json({ erreur: 'Utilisateur introuvable.' });

  const parCategorie = db.prepare(`
    SELECT categorie, COUNT(*) AS total FROM journal WHERE id_utilisateur = ? GROUP BY categorie
  `).all(id);
  const bornes = db.prepare(`
    SELECT MIN(date) AS premiere, MAX(date) AS derniere,
           MAX(CASE WHEN action = 'connexion' THEN date END) AS derniere_connexion
    FROM journal WHERE id_utilisateur = ?
  `).get(id);
  const subies = db.prepare(`
    SELECT action, COUNT(*) AS total FROM journal
    WHERE cible_type = 'utilisateur' AND cible_id = ? GROUP BY action
  `).all(id);
  res.json({ compte, parCategorie, subies, ...bornes });
});

app.listen(PORT, () => {
  console.log(`Hesstagram démarré sur http://localhost:${PORT}`);
  console.log('Comptes de test : admin/admin123 (admin), marc.r/modo123 (modérateur), luca.c/luca123 (utilisateur)');
});
