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

function currentUser(req) {
  const token = parseCookies(req).session;
  const userId = token && sessions.get(token);
  if (!userId) return null;
  return db.prepare('SELECT id, nom, date, role FROM utilisateur WHERE id = ?').get(userId) || null;
}

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
    if (!roles.includes(user.role)) return res.status(403).json({ erreur: 'Accès refusé pour ce rôle.' });
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

  const token = randomBytes(24).toString('hex');
  sessions.set(token, Number(r.lastInsertRowid));
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Lax`);
  res.status(201).json({ id: Number(r.lastInsertRowid), nom, role: 'utilisateur' });
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
    return res.status(401).json({ erreur: 'Nom ou mot de passe incorrect.' });
  }
  const token = randomBytes(24).toString('hex');
  sessions.set(token, user.id);
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Lax`);
  res.json({ id: user.id, nom: user.nom, role: user.role });
});

// Déconnexion
app.post('/api/deconnexion', (req, res) => {
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

  res.status(201).json({ id: idPub });
});

// J'aime (bascule ; retire le "je n'aime pas" éventuel)
app.post('/api/publications/:id/like', requireAuth, (req, res) => {
  const idPub = Number(req.params.id);
  const deja = db.prepare('SELECT 1 FROM "like" WHERE id_pub = ? AND id_utilisateur = ?').get(idPub, req.user.id);
  db.prepare('DELETE FROM dislike WHERE id_pub = ? AND id_util = ?').run(idPub, req.user.id);
  if (deja) {
    db.prepare('DELETE FROM "like" WHERE id_pub = ? AND id_utilisateur = ?').run(idPub, req.user.id);
  } else {
    db.prepare('INSERT INTO "like" (id_pub, id_utilisateur) VALUES (?, ?)').run(idPub, req.user.id);
  }
  res.json({ ok: true });
});

// Je n'aime pas (bascule ; retire le "j'aime" éventuel)
app.post('/api/publications/:id/dislike', requireAuth, (req, res) => {
  const idPub = Number(req.params.id);
  const deja = db.prepare('SELECT 1 FROM dislike WHERE id_pub = ? AND id_util = ?').get(idPub, req.user.id);
  db.prepare('DELETE FROM "like" WHERE id_pub = ? AND id_utilisateur = ?').run(idPub, req.user.id);
  if (deja) {
    db.prepare('DELETE FROM dislike WHERE id_pub = ? AND id_util = ?').run(idPub, req.user.id);
  } else {
    db.prepare('INSERT INTO dislike (id_pub, id_util) VALUES (?, ?)').run(idPub, req.user.id);
  }
  res.json({ ok: true });
});

// Commenter une publication
app.post('/api/publications/:id/commentaires', requireAuth, (req, res) => {
  const commentaire = String(req.body?.commentaire || '').trim();
  if (!commentaire) return res.status(400).json({ erreur: 'Le commentaire est vide.' });
  db.prepare('INSERT INTO commentaire (id_pub, id_utilisateur, commentaire) VALUES (?, ?, ?)')
    .run(Number(req.params.id), req.user.id, commentaire);
  res.status(201).json({ ok: true });
});

// Signaler l'auteur d'un contenu
app.post('/api/signalements', requireAuth, (req, res) => {
  const idSignale = Number(req.body?.id_signale);
  const raison = String(req.body?.raison || '').trim();
  if (!idSignale || !raison) return res.status(400).json({ erreur: 'Utilisateur et raison obligatoires.' });
  if (idSignale === req.user.id) return res.status(400).json({ erreur: 'Impossible de se signaler soi-même.' });
  db.prepare('INSERT INTO signalement ("id_signalé", id_signalant, raison, date) VALUES (?, ?, ?, ?)')
    .run(idSignale, req.user.id, raison, new Date().toISOString());
  res.status(201).json({ ok: true });
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
  const r = db.prepare('DELETE FROM signalement WHERE id = ?').run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ erreur: 'Signalement introuvable.' });
  res.json({ ok: true });
});

// ════════════════ ADMINISTRATION (administrateur) ════════════════

app.get('/api/utilisateurs', requireRole('administrateur'), (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.nom, u.date, u.role,
           (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications,
           (SELECT COUNT(*) FROM signalement s WHERE s."id_signalé" = u.id) AS nb_signalements
    FROM utilisateur u ORDER BY u.id
  `).all();
  res.json(rows);
});

app.put('/api/utilisateurs/:id/role', requireRole('administrateur'), (req, res) => {
  const role = String(req.body?.role || '');
  const roles = ['utilisateur', 'moderateur', 'administrateur'];
  if (!roles.includes(role)) return res.status(400).json({ erreur: `Rôle invalide (${roles.join(', ')}).` });
  const cible = Number(req.params.id);
  if (cible === req.user.id) return res.status(400).json({ erreur: 'Impossible de changer son propre rôle.' });
  const r = db.prepare('UPDATE utilisateur SET role = ? WHERE id = ?').run(role, cible);
  if (!r.changes) return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Hesstagram démarré sur http://localhost:${PORT}`);
  console.log('Comptes de test : admin/admin123 (admin), marc.r/modo123 (modérateur), luca.c/luca123 (utilisateur)');
});
