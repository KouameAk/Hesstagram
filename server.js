// server.js — API Hesstagram (Express + SQLite natif Node)
import express from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, hashPassword, verifyPassword } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Photos des publications : fichiers sur disque, nom enregistré dans publication.nom_fichier
const UPLOADS = path.join(__dirname, 'data', 'uploads');
mkdirSync(UPLOADS, { recursive: true });

app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'main')));
app.use('/uploads', express.static(UPLOADS, { maxAge: '7d' }));

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

function ouvrirSession(res, idUtilisateur) {
  const token = randomBytes(24).toString('hex');
  sessions.set(token, idUtilisateur);
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Lax`);
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
  compte_ferme: 'authentification',
  connexion_echouee: 'securite',
  connexion_refusee: 'securite',
  acces_refuse: 'securite',
  mdp_modifie: 'securite',
  publication_creee: 'contenu',
  publication_supprimee: 'contenu',
  commentaire_ajoute: 'contenu',
  like_ajoute: 'contenu',
  like_retire: 'contenu',
  dislike_ajoute: 'contenu',
  dislike_retire: 'contenu',
  abonnement_ajoute: 'social',
  abonnement_retire: 'social',
  signalement_cree: 'signalement',
  signalement_classe: 'signalement',
  publication_moderee: 'signalement',
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
const extrait = (texte, n = 80) => (texte.length > n ? texte.slice(0, n) + '…' : texte);

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

const estStaff = user => ['moderateur', 'administrateur'].includes(user.role);

// ── Suppressions en cascade (le schéma fourni n'a pas de ON DELETE CASCADE) ──

function effacerFichier(nom) {
  if (!nom) return;
  try { unlinkSync(path.join(UPLOADS, path.basename(nom))); } catch { /* déjà absent */ }
}

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function supprimerPublication(pub) {
  transaction(() => {
    db.prepare('DELETE FROM "like" WHERE id_pub = ?').run(pub.id);
    db.prepare('DELETE FROM dislike WHERE id_pub = ?').run(pub.id);
    db.prepare('DELETE FROM commentaire WHERE id_pub = ?').run(pub.id);
    db.prepare('DELETE FROM hashtag WHERE id_pub = ?').run(pub.id);
    db.prepare('DELETE FROM publication WHERE id = ?').run(pub.id);
  });
  effacerFichier(pub.nom_fichier);
}

// Supprime un compte et tout ce qui s'y rattache. `journal(bilan)` est appelé dans la transaction.
function supprimerCompte(id, journal) {
  const fichiers = db.prepare('SELECT nom_fichier FROM publication WHERE id_utilisateur = ? AND nom_fichier IS NOT NULL').all(id);
  const bilan = db.prepare(`
    SELECT (SELECT COUNT(*) FROM publication WHERE id_utilisateur = ?) AS publications,
           (SELECT COUNT(*) FROM commentaire WHERE id_utilisateur = ?) AS commentaires,
           (SELECT COUNT(*) FROM message WHERE id_utilisateur = ? OR id_util = ?) AS messages
  `).get(id, id, id, id);
  const sesPubs = 'SELECT id FROM publication WHERE id_utilisateur = ?';

  transaction(() => {
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
    journal(bilan);
  });
  fermerSessions(id);
  for (const f of fichiers) effacerFichier(f.nom_fichier);
  return bilan;
}

// ════════════════ AUTHENTIFICATION ════════════════

function erreurMdp(mdp) {
  if (mdp.length < MIN_MDP) return `Le mot de passe doit faire au moins ${MIN_MDP} caractères.`;
  if (mdp.length > MAX_LEN) return `Le mot de passe ne doit pas dépasser ${MAX_LEN} caractères.`;
  return null;
}

// Création de compte
app.post('/api/inscription', (req, res) => {
  const nom = String(req.body?.nom || '').trim();
  const mdp = String(req.body?.mdp || '');
  if (!nom || !mdp) return res.status(400).json({ erreur: 'Nom et mot de passe obligatoires.' });
  if (nom.length < MIN_NOM) return res.status(400).json({ erreur: `Le nom doit faire au moins ${MIN_NOM} caractères.` });
  if (nom.length > MAX_LEN) return res.status(400).json({ erreur: `Le nom ne doit pas dépasser ${MAX_LEN} caractères.` });
  if (!/^[\p{L}\p{N}._-]+$/u.test(nom)) return res.status(400).json({ erreur: 'Le nom ne peut contenir que lettres, chiffres, point, tiret et _.' });
  const errMdp = erreurMdp(mdp);
  if (errMdp) return res.status(400).json({ erreur: errMdp });

  const existe = db.prepare('SELECT id FROM utilisateur WHERE nom = ?').get(nom);
  if (existe) return res.status(409).json({ erreur: 'Ce nom est déjà pris.' });

  const r = db.prepare('INSERT INTO utilisateur (nom, mdp, date, role) VALUES (?, ?, ?, ?)')
    .run(nom, hashPassword(mdp), new Date().toISOString(), 'utilisateur');

  const nouveau = { id: Number(r.lastInsertRowid), nom, role: 'utilisateur' };
  ouvrirSession(res, nouveau.id);
  journaliser(req, 'inscription', { acteur: nouveau });
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
  ouvrirSession(res, user.id);
  journaliser(req, 'connexion', { acteur: user });
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

// ════════════════ MON COMPTE ════════════════

app.get('/api/moi', requireAuth, (req, res) => res.json(req.user));

// Changer son mot de passe (l'ancien est exigé)
app.put('/api/moi/mdp', requireAuth, (req, res) => {
  const ancien = String(req.body?.ancien || '');
  const nouveau = String(req.body?.nouveau || '');
  const { mdp } = db.prepare('SELECT mdp FROM utilisateur WHERE id = ?').get(req.user.id);
  if (!verifyPassword(ancien, mdp)) return res.status(400).json({ erreur: 'Mot de passe actuel incorrect.' });
  const errMdp = erreurMdp(nouveau);
  if (errMdp) return res.status(400).json({ erreur: errMdp });
  if (ancien === nouveau) return res.status(400).json({ erreur: 'Le nouveau mot de passe doit être différent.' });
  db.prepare('UPDATE utilisateur SET mdp = ? WHERE id = ?').run(hashPassword(nouveau), req.user.id);
  journaliser(req, 'mdp_modifie');
  res.json({ ok: true });
});

// Fermer son propre compte (mot de passe exigé). Un administrateur ne peut pas se supprimer.
app.delete('/api/moi', requireAuth, (req, res) => {
  const { mdp } = db.prepare('SELECT mdp FROM utilisateur WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(req.body?.mdp || ''), mdp)) {
    return res.status(400).json({ erreur: 'Mot de passe incorrect.' });
  }
  if (req.user.role === 'administrateur') {
    return res.status(403).json({ erreur: 'Un administrateur ne peut pas fermer son propre compte.' });
  }
  try {
    supprimerCompte(req.user.id, bilan => journaliser(req, 'compte_ferme', {
      details: `Fermé par l'utilisateur — ${bilan.publications} publication(s), ${bilan.messages} message(s)`
    }));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erreur: 'La fermeture a échoué, rien n’a été modifié.' });
  }
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// ════════════════ PUBLICATIONS ════════════════

// Liste filtrable : ?filtre=abonnements · ?tag=vosges · ?auteur=3 · ?id=12
app.get('/api/publications', requireAuth, (req, res) => {
  const moi = req.user.id;
  const conditions = [];
  const params = [moi, moi, moi];
  if (req.query.filtre === 'abonnements') {
    conditions.push('(p.id_utilisateur = ? OR p.id_utilisateur IN (SELECT id_utilisateur2 FROM ami WHERE id_utilisateur1 = ?))');
    params.push(moi, moi);
  }
  if (req.query.tag) {
    conditions.push('p.id IN (SELECT id_pub FROM hashtag WHERE nom = ?)');
    params.push('#' + String(req.query.tag).replace(/^#/, '').toLowerCase());
  }
  if (req.query.auteur) { conditions.push('p.id_utilisateur = ?'); params.push(Number(req.query.auteur)); }
  if (req.query.id) { conditions.push('p.id = ?'); params.push(Number(req.query.id)); }

  const pubs = db.prepare(`
    SELECT p.id, p.date, p.description, p.type_fichier,
           CASE WHEN p.nom_fichier IS NOT NULL THEN '/uploads/' || p.nom_fichier END AS image,
           u.id AS auteur_id, u.nom AS auteur, u.role AS auteur_role,
           (SELECT COUNT(*) FROM "like" l WHERE l.id_pub = p.id) AS nb_like,
           (SELECT COUNT(*) FROM dislike d WHERE d.id_pub = p.id) AS nb_dislike,
           (SELECT COUNT(*) FROM commentaire c WHERE c.id_pub = p.id) AS nb_commentaires,
           EXISTS(SELECT 1 FROM "like" l WHERE l.id_pub = p.id AND l.id_utilisateur = ?) AS mon_like,
           EXISTS(SELECT 1 FROM dislike d WHERE d.id_pub = p.id AND d.id_util = ?) AS mon_dislike,
           EXISTS(SELECT 1 FROM ami a WHERE a.id_utilisateur1 = ? AND a.id_utilisateur2 = u.id) AS auteur_suivi
    FROM publication p
    JOIN utilisateur u ON u.id = p.id_utilisateur
    ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
    ORDER BY p.date DESC, p.id DESC
    LIMIT 100
  `).all(...params);

  const getComs = db.prepare(`
    SELECT c.id, c.commentaire, u.id AS auteur_id, u.nom AS auteur, u.role AS auteur_role
    FROM commentaire c JOIN utilisateur u ON u.id = c.id_utilisateur
    WHERE c.id_pub = ? ORDER BY c.id
  `);
  for (const p of pubs) p.commentaires = getComs.all(p.id);
  res.json(pubs);
});

// Image envoyée en data URL : type vérifié sur les premiers octets, pas seulement sur l'en-tête
const SIGNATURES = {
  png: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpeg: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: b => b.subarray(0, 4).toString('ascii') === 'GIF8',
  webp: b => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP'
};

function lireImage(dataUrl) {
  const m = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) return { erreur: 'Format d’image non pris en charge (PNG, JPEG, GIF ou WebP).' };
  const octets = Buffer.from(m[2], 'base64');
  if (octets.length > 5 * 1024 * 1024) return { erreur: 'Image trop lourde (5 Mo maximum).' };
  if (!SIGNATURES[m[1]](octets)) return { erreur: 'Le fichier ne correspond pas à une image valide.' };
  return { type: m[1], octets };
}

// Nouvelle publication (texte et/ou photo) — les #hashtags sont enregistrés dans la table hashtag
app.post('/api/publications', requireAuth, (req, res) => {
  const description = String(req.body?.description || '').trim();
  if (description.length > 2200) return res.status(400).json({ erreur: 'Publication trop longue (2 200 caractères maximum).' });
  let fichier = null;
  let type = 'texte';
  if (req.body?.image) {
    const img = lireImage(req.body.image);
    if (img.erreur) return res.status(400).json({ erreur: img.erreur });
    fichier = `${randomBytes(12).toString('hex')}.${img.type === 'jpeg' ? 'jpg' : img.type}`;
    type = `image/${img.type}`;
    writeFileSync(path.join(UPLOADS, fichier), img.octets);
  }
  if (!description && !fichier) return res.status(400).json({ erreur: 'Ajoutez un texte ou une photo.' });

  const r = db.prepare(`
    INSERT INTO publication (id_utilisateur, date, description, nom_fichier, type_fichier, vue, "like", "dislike", partage, republie)
    VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0)
  `).run(req.user.id, new Date().toISOString(), description, fichier, type);
  const idPub = Number(r.lastInsertRowid);

  const tags = description.match(/#([\p{L}\p{N}_]+)/gu) || [];
  const insTag = db.prepare('INSERT INTO hashtag (nom, nombre_utilisation, id_pub) VALUES (?, 1, ?)');
  for (const t of new Set(tags.map(t => t.toLowerCase()))) insTag.run(t, idPub);

  journaliser(req, 'publication_creee', {
    cible: { type: 'publication', id: idPub, nom: req.user.nom },
    details: (fichier ? '[photo] ' : '') + extrait(description)
  });
  res.status(201).json({ id: idPub });
});

// Supprimer une publication : son auteur, ou un modérateur / administrateur (modération)
app.delete('/api/publications/:id', requireAuth, (req, res) => {
  const pub = db.prepare(`
    SELECT p.id, p.description, p.nom_fichier, u.id AS auteur_id, u.nom AS auteur
    FROM publication p JOIN utilisateur u ON u.id = p.id_utilisateur WHERE p.id = ?
  `).get(Number(req.params.id));
  if (!pub) return res.status(404).json({ erreur: 'Publication introuvable.' });
  const parAuteur = pub.auteur_id === req.user.id;
  if (!parAuteur && !estStaff(req.user)) return res.status(403).json({ erreur: 'Vous ne pouvez pas supprimer cette publication.' });

  supprimerPublication(pub);
  if (parAuteur) {
    journaliser(req, 'publication_supprimee', { cible: { type: 'publication', id: pub.id, nom: pub.auteur }, details: extrait(pub.description) });
  } else {
    const raison = String(req.body?.raison || '').trim() || 'Contenu contraire aux règles';
    journaliser(req, 'publication_moderee', {
      cible: { type: 'utilisateur', id: pub.auteur_id, nom: pub.auteur },
      details: `Publication n°${pub.id} retirée — ${raison} — « ${extrait(pub.description, 60)} »`
    });
  }
  res.json({ ok: true });
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

// Qui a aimé une publication
app.get('/api/publications/:id/likes', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.nom, u.role,
           EXISTS(SELECT 1 FROM ami a WHERE a.id_utilisateur1 = ? AND a.id_utilisateur2 = u.id) AS je_suis_abonne
    FROM "like" l JOIN utilisateur u ON u.id = l.id_utilisateur
    WHERE l.id_pub = ? ORDER BY u.nom
  `).all(req.user.id, Number(req.params.id));
  res.json(rows);
});

// Commenter une publication
app.post('/api/publications/:id/commentaires', requireAuth, (req, res) => {
  const commentaire = String(req.body?.commentaire || '').trim();
  if (!commentaire) return res.status(400).json({ erreur: 'Le commentaire est vide.' });
  if (commentaire.length > 500) return res.status(400).json({ erreur: 'Commentaire trop long (500 caractères maximum).' });
  const pub = trouverPublication(Number(req.params.id));
  if (!pub) return res.status(404).json({ erreur: 'Publication introuvable.' });
  db.prepare('INSERT INTO commentaire (id_pub, id_utilisateur, commentaire) VALUES (?, ?, ?)')
    .run(pub.id, req.user.id, commentaire);
  journaliser(req, 'commentaire_ajoute', { cible: ciblePublication(pub), details: extrait(commentaire) });
  res.status(201).json({ ok: true });
});

// ════════════════ COMPTES, ABONNEMENTS, RECHERCHE ════════════════
// Table `ami` du schéma : (id_utilisateur1 suit id_utilisateur2)

// Annuaire des comptes visible par tout membre connecté : nom + statut, jamais le mot de passe
app.get('/api/comptes', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.nom, u.role, u.date,
           (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications
    FROM utilisateur u
    ORDER BY CASE u.role WHEN 'administrateur' THEN 0 WHEN 'moderateur' THEN 1 ELSE 2 END, u.nom
  `).all();
  res.json(rows);
});

const SQL_PROFIL = `
  SELECT u.id, u.nom, u.role, u.date,
         (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications,
         (SELECT COUNT(*) FROM ami a WHERE a.id_utilisateur2 = u.id) AS nb_abonnes,
         (SELECT COUNT(*) FROM ami a WHERE a.id_utilisateur1 = u.id) AS nb_abonnements,
         (SELECT COUNT(*) FROM "like" l JOIN publication p ON p.id = l.id_pub WHERE p.id_utilisateur = u.id) AS nb_likes_recus,
         EXISTS(SELECT 1 FROM ami a WHERE a.id_utilisateur1 = :moi AND a.id_utilisateur2 = u.id) AS je_suis_abonne,
         EXISTS(SELECT 1 FROM ami a WHERE a.id_utilisateur1 = u.id AND a.id_utilisateur2 = :moi) AS me_suit
  FROM utilisateur u`;

app.get('/api/profils/:id', requireAuth, (req, res) => {
  const profil = db.prepare(`${SQL_PROFIL} WHERE u.id = :id`).get({ moi: req.user.id, id: Number(req.params.id) });
  if (!profil) return res.status(404).json({ erreur: 'Ce compte n’existe pas ou a été supprimé.' });
  res.json(profil);
});

// Abonnés ou abonnements d'un compte : ?type=abonnes|abonnements
app.get('/api/profils/:id/relations', requireAuth, (req, res) => {
  const [colListe, colFiltre] = req.query.type === 'abonnements'
    ? ['id_utilisateur2', 'id_utilisateur1'] : ['id_utilisateur1', 'id_utilisateur2'];
  const rows = db.prepare(`
    ${SQL_PROFIL} WHERE u.id IN (SELECT ${colListe} FROM ami WHERE ${colFiltre} = :id) ORDER BY u.nom
  `).all({ moi: req.user.id, id: Number(req.params.id) });
  res.json(rows);
});

// Suivre / ne plus suivre (bascule)
app.post('/api/abonnements/:id', requireAuth, (req, res) => {
  const cible = db.prepare('SELECT id, nom FROM utilisateur WHERE id = ?').get(Number(req.params.id));
  if (!cible) return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
  if (cible.id === req.user.id) return res.status(400).json({ erreur: 'Impossible de vous suivre vous-même.' });
  const deja = db.prepare('SELECT 1 FROM ami WHERE id_utilisateur1 = ? AND id_utilisateur2 = ?').get(req.user.id, cible.id);
  if (deja) db.prepare('DELETE FROM ami WHERE id_utilisateur1 = ? AND id_utilisateur2 = ?').run(req.user.id, cible.id);
  else db.prepare('INSERT INTO ami (id_utilisateur1, id_utilisateur2) VALUES (?, ?)').run(req.user.id, cible.id);
  journaliser(req, deja ? 'abonnement_retire' : 'abonnement_ajoute', { cible: cibleCompte(cible) });
  res.json({ abonne: !deja });
});

// Comptes suggérés : ceux que je ne suis pas encore, les plus suivis d'abord
app.get('/api/suggestions', requireAuth, (req, res) => {
  const rows = db.prepare(`
    ${SQL_PROFIL}
    WHERE u.id != :moi AND u.id NOT IN (SELECT id_utilisateur2 FROM ami WHERE id_utilisateur1 = :moi)
    ORDER BY nb_abonnes DESC, nb_publications DESC, u.nom LIMIT 5
  `).all({ moi: req.user.id });
  res.json(rows);
});

// Recherche de comptes et de hashtags
app.get('/api/recherche', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().replace(/^[@#]/, '');
  if (!q) return res.json({ comptes: [], hashtags: [] });
  const motif = `%${q}%`;
  const comptes = db.prepare(`${SQL_PROFIL} WHERE u.nom LIKE :motif ORDER BY nb_abonnes DESC, u.nom LIMIT 20`)
    .all({ moi: req.user.id, motif });
  const hashtags = db.prepare(`
    SELECT nom, COUNT(*) AS total FROM hashtag WHERE nom LIKE ? GROUP BY nom ORDER BY total DESC LIMIT 10
  `).all(`#${motif}`);
  res.json({ comptes, hashtags });
});

// Hashtags les plus utilisés
app.get('/api/tendances', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT nom, COUNT(*) AS total FROM hashtag GROUP BY nom ORDER BY total DESC, nom LIMIT 10
  `).all());
});

// Notifications : lues dans le journal (aucune table supplémentaire).
// J'aime et commentaires sur mes publications, nouveaux abonnés, messages reçus, décisions me concernant.
app.get('/api/notifications', requireAuth, (req, res) => {
  const moi = req.user.id;
  const rows = db.prepare(`
    SELECT j.id, j.date, j.action, j.details, j.id_utilisateur AS acteur_id, j.nom_utilisateur AS acteur,
           j.cible_type, j.cible_id,
           CASE WHEN p.nom_fichier IS NOT NULL THEN '/uploads/' || p.nom_fichier END AS image,
           p.description
    FROM journal j
    LEFT JOIN publication p ON j.cible_type = 'publication' AND p.id = j.cible_id
    WHERE (j.id_utilisateur IS NULL OR j.id_utilisateur != :moi)
      AND ((j.action IN ('like_ajoute', 'commentaire_ajoute') AND p.id_utilisateur = :moi)
        OR (j.action IN ('abonnement_ajoute', 'message_envoye', 'role_modifie', 'publication_moderee')
            AND j.cible_type = 'utilisateur' AND j.cible_id = :moi))
    ORDER BY j.id DESC LIMIT 80
  `).all({ moi });

  // Un j'aime retiré puis remis, ou un abonnement refait, ne produit qu'une notification
  const vues = new Set();
  const uniques = rows.filter(n => {
    if (!['like_ajoute', 'abonnement_ajoute'].includes(n.action)) return true;
    const cle = `${n.action}:${n.acteur_id}:${n.cible_id}`;
    if (vues.has(cle)) return false;
    vues.add(cle);
    return true;
  });
  res.json(uniques.slice(0, 50));
});

// Signaler un compte
app.post('/api/signalements', requireAuth, (req, res) => {
  const idSignale = Number(req.body?.id_signale);
  const raison = String(req.body?.raison || '').trim();
  if (!idSignale || !raison) return res.status(400).json({ erreur: 'Utilisateur et raison obligatoires.' });
  if (raison.length > 500) return res.status(400).json({ erreur: 'Raison trop longue (500 caractères maximum).' });
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
    SELECT u.id, u.nom, u.role, c.cle FROM utilisateur u
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
  if (!dest) return res.status(404).json({ erreur: 'Destinataire introuvable.' });
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
           ur.id AS id_signalant, ur.nom AS signalant,
           (SELECT COUNT(*) FROM signalement s2 WHERE s2."id_signalé" = us.id) AS total_contre,
           (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = us.id) AS nb_publications,
           EXISTS(SELECT 1 FROM suspension sp WHERE sp.id_utilisateur = us.id AND (sp.fin IS NULL OR sp.fin > :maintenant)) AS suspendu
    FROM signalement s
    JOIN utilisateur us ON us.id = s."id_signalé"
    JOIN utilisateur ur ON ur.id = s.id_signalant
    ORDER BY s.date DESC, s.id DESC
  `).all({ maintenant: new Date().toISOString() });
  res.json(rows);
});

// Classer sans suite (supprime le signalement ; le journal en garde le contenu complet)
app.delete('/api/signalements/:id', requireRole('moderateur', 'administrateur'), (req, res) => {
  const s = db.prepare(`
    SELECT s.id, s.raison, us.id AS id_signale, us.nom AS signale, ur.nom AS signalant
    FROM signalement s
    JOIN utilisateur us ON us.id = s."id_signalé"
    JOIN utilisateur ur ON ur.id = s.id_signalant
    WHERE s.id = ?
  `).get(Number(req.params.id));
  if (!s) return res.status(404).json({ erreur: 'Signalement introuvable.' });
  db.prepare('DELETE FROM signalement WHERE id = ?').run(s.id);
  const decision = String(req.body?.decision || '').trim();
  journaliser(req, 'signalement_classe', {
    cible: { type: 'utilisateur', id: s.id_signale, nom: s.signale },
    details: `Signalement n°${s.id} (par ${s.signalant}) ${decision || 'classé sans suite'} — ${s.raison}`
  });
  res.json({ ok: true });
});

// ════════════════ ADMINISTRATION (administrateur) ════════════════

app.get('/api/utilisateurs', requireRole('administrateur'), (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.nom, u.date, u.role,
           (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications,
           (SELECT COUNT(*) FROM ami a WHERE a.id_utilisateur2 = u.id) AS nb_abonnes,
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
  try {
    supprimerCompte(cible.id, bilan => journaliser(req, 'compte_supprime', {
      cible: cibleCompte(cible),
      details: `${raison} — supprimés : ${bilan.publications} publication(s), `
        + `${bilan.commentaires} commentaire(s), ${bilan.messages} message(s)`
    }));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erreur: 'La suppression a échoué, rien n’a été modifié.' });
  }
  res.json({ ok: true });
});

// Tableau de bord : chiffres clés, activité des 14 derniers jours, événements sensibles
app.get('/api/admin/stats', requireRole('administrateur'), (req, res) => {
  const maintenant = new Date();
  const il_y_a = jours => new Date(maintenant.getTime() - jours * 86400000).toISOString();

  const chiffres = db.prepare(`
    SELECT (SELECT COUNT(*) FROM utilisateur) AS comptes,
           (SELECT COUNT(*) FROM utilisateur WHERE date >= :j7) AS nouveaux_7j,
           (SELECT COUNT(DISTINCT id_utilisateur) FROM journal WHERE date >= :j7 AND action = 'connexion') AS actifs_7j,
           (SELECT COUNT(*) FROM utilisateur WHERE role = 'moderateur') AS moderateurs,
           (SELECT COUNT(*) FROM suspension WHERE fin IS NULL OR fin > :maintenant) AS suspendus,
           (SELECT COUNT(*) FROM signalement) AS signalements,
           (SELECT COUNT(*) FROM publication) AS publications,
           (SELECT COUNT(*) FROM message) AS messages,
           (SELECT COUNT(*) FROM journal WHERE action = 'connexion_echouee' AND date >= :j1) AS echecs_24h
  `).get({ j7: il_y_a(7), j1: il_y_a(1), maintenant: maintenant.toISOString() });

  // Regroupement par jour en heure locale du serveur
  const jourLocal = iso => new Date(iso).toLocaleDateString('sv-SE');
  const activite = [];
  for (let i = 13; i >= 0; i--) {
    activite.push({ jour: jourLocal(new Date(maintenant.getTime() - i * 86400000)), actions: 0, connexions: 0, publications: 0 });
  }
  const parJour = Object.fromEntries(activite.map(a => [a.jour, a]));
  for (const { date, action } of db.prepare('SELECT date, action FROM journal WHERE date >= ?').all(il_y_a(14))) {
    const a = parJour[jourLocal(date)];
    if (!a) continue;
    a.actions++;
    if (action === 'connexion') a.connexions++;
    if (action === 'publication_creee') a.publications++;
  }

  const evenements = db.prepare(`
    SELECT * FROM journal WHERE categorie IN ('securite', 'administration', 'signalement')
    ORDER BY id DESC LIMIT 8
  `).all();

  const aSurveiller = db.prepare(`
    SELECT u.id, u.nom, u.role, COUNT(s.id) AS signalements,
           EXISTS(SELECT 1 FROM suspension sp WHERE sp.id_utilisateur = u.id AND (sp.fin IS NULL OR sp.fin > ?)) AS suspendu
    FROM utilisateur u JOIN signalement s ON s."id_signalé" = u.id
    GROUP BY u.id ORDER BY signalements DESC, u.nom LIMIT 5
  `).all(maintenant.toISOString());

  res.json({ chiffres, activite, evenements, aSurveiller });
});

// Journal du site, filtrable. Pagination par curseur : ?avant=<id de la dernière ligne reçue>
app.get('/api/admin/journal', requireRole('administrateur'), (req, res) => {
  const { utilisateur, recherche, categorie, action, du, au, avant } = req.query;
  const limite = Math.min(Number(req.query.limite) || 100, 1000);
  const conditions = [];
  const params = [];

  if (utilisateur) {
    // Actions faites PAR ce compte ou le CONCERNANT (rôle changé, suspendu, signalé…)
    conditions.push("(id_utilisateur = ? OR (cible_type = 'utilisateur' AND cible_id = ?))");
    params.push(Number(utilisateur), Number(utilisateur));
  }
  if (recherche) {
    conditions.push('(nom_utilisateur LIKE ? OR cible_nom LIKE ? OR details LIKE ? OR ip LIKE ?)');
    const motif = `%${recherche}%`;
    params.push(motif, motif, motif, motif);
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
           (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications,
           (SELECT COUNT(*) FROM commentaire c WHERE c.id_utilisateur = u.id) AS nb_commentaires,
           (SELECT COUNT(*) FROM ami a WHERE a.id_utilisateur2 = u.id) AS nb_abonnes,
           (SELECT COUNT(*) FROM signalement s WHERE s."id_signalé" = u.id) AS signalements_en_attente,
           (SELECT COUNT(*) FROM signalement s WHERE s.id_signalant = u.id) AS signalements_deposes,
           sp.raison AS suspension_raison, sp.date AS suspension_date, sp.fin AS suspension_fin
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
           MAX(CASE WHEN action = 'connexion' THEN date END) AS derniere_connexion,
           SUM(action = 'connexion_echouee') AS echecs_connexion
    FROM journal WHERE id_utilisateur = ?
  `).get(id);
  const subies = db.prepare(`
    SELECT action, COUNT(*) AS total FROM journal
    WHERE cible_type = 'utilisateur' AND cible_id = ? GROUP BY action ORDER BY total DESC
  `).all(id);
  res.json({ compte, parCategorie, subies, ...bornes });
});

app.listen(PORT, () => {
  console.log(`Hesstagram démarré sur http://localhost:${PORT}`);
  console.log('Comptes de test : admin/admin123 (admin), marc.r/modo123 (modérateur), luca.c/luca123 (utilisateur)');
});
