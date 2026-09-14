// db.js — ouverture de la base SQLite + création du schéma fourni (schema.sql) + jeu de données de départ
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { scryptSync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'hesstagram.db');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR);

const firstRun = !existsSync(DB_PATH);
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

// ── Hachage des mots de passe (scrypt, natif Node — pas de dépendance) ──
export function hashPassword(mdp) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(mdp, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(mdp, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  return scryptSync(mdp, salt, 32).toString('hex') === hash;
}

// ── Création du schéma (fichier BDD fourni) + seed au premier lancement ──
if (firstRun) {
  const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  seed();
  console.log('Base créée depuis schema.sql et données de départ insérées.');
}

// ── Messagerie chiffrée : clé publique RSA de chaque compte ──
// Ajoutée à côté du schéma fourni (sans le modifier) ; créée aussi sur une base déjà existante.
// Seule la clé PUBLIQUE arrive ici : la clé privée ne quitte jamais le navigateur.
db.exec(`
  CREATE TABLE IF NOT EXISTS cle_publique (
    id_utilisateur INTEGER PRIMARY KEY,
    cle TEXT NOT NULL,
    date DATETIME,
    FOREIGN KEY (id_utilisateur) REFERENCES utilisateur (id)
  );
`);

// ── Administration : journal des actions + suspensions de comptes ──
// Le journal n'a volontairement pas de clé étrangère : il copie le nom et le statut de
// l'auteur au moment de l'action, pour que la trace survive à la suppression du compte.
db.exec(`
  CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATETIME NOT NULL,
    id_utilisateur INTEGER,
    nom_utilisateur TEXT,
    role_utilisateur TEXT,
    categorie TEXT NOT NULL,
    action TEXT NOT NULL,
    cible_type TEXT,
    cible_id INTEGER,
    cible_nom TEXT,
    details TEXT,
    ip TEXT
  );
  CREATE INDEX IF NOT EXISTS journal_utilisateur ON journal (id_utilisateur);
  CREATE INDEX IF NOT EXISTS journal_cible ON journal (cible_type, cible_id);

  CREATE TABLE IF NOT EXISTS suspension (
    id_utilisateur INTEGER PRIMARY KEY,
    raison TEXT NOT NULL,
    date DATETIME NOT NULL,
    fin DATETIME,
    id_admin INTEGER,
    FOREIGN KEY (id_utilisateur) REFERENCES utilisateur (id)
  );
`);

function seed() {
  const now = new Date().toISOString();
  const insUser = db.prepare(
    'INSERT INTO utilisateur (nom, mdp, date, role) VALUES (?, ?, ?, ?)'
  );

  const users = [
    ['admin', 'admin123', 'administrateur'],
    ['marc.r', 'modo123', 'moderateur'],
    ['luca.c', 'luca123', 'utilisateur'],
    ['lea.wagner', 'lea123', 'utilisateur'],
    ['tom.mercier', 'tom123', 'utilisateur'],
    ['sarah.b', 'sarah123', 'utilisateur']
  ];
  const ids = {};
  for (const [nom, mdp, role] of users) {
    const r = insUser.run(nom, hashPassword(mdp), now, role);
    ids[nom] = Number(r.lastInsertRowid);
  }

  const insPub = db.prepare(
    `INSERT INTO publication (id_utilisateur, date, description, nom_fichier, type_fichier, vue, "like", "dislike", partage, republie)
     VALUES (?, ?, ?, NULL, 'texte', 0, 0, 0, 0, 0)`
  );
  const p1 = Number(insPub.run(ids['lea.wagner'], now,
    "Trois jours de crête, de la brume jusqu'au Hohneck. Le meilleur moment de l'année pour monter. #vosges #rando #alsace").lastInsertRowid);
  const p2 = Number(insPub.run(ids['tom.mercier'], now,
    'À garder pour la sortie de septembre. Inscriptions ouvertes pour la traversée. #foehn').lastInsertRowid);
  insPub.run(ids['sarah.b'], now, 'Quelqu’un connaît un bon parking près du col de la Schlucht ? #rando');

  const insCom = db.prepare('INSERT INTO commentaire (id_pub, id_utilisateur, commentaire) VALUES (?, ?, ?)');
  insCom.run(p1, ids['tom.mercier'], "Le passage sous la brume, c'est exactement ça.");
  insCom.run(p1, ids['sarah.b'], 'Tu partais de quel parking ?');
  insCom.run(p2, ids['lea.wagner'], 'On refait la même en octobre ?');

  db.prepare('INSERT INTO "like" (id_pub, id_utilisateur) VALUES (?, ?)').run(p1, ids['tom.mercier']);
  db.prepare('INSERT INTO "like" (id_pub, id_utilisateur) VALUES (?, ?)').run(p1, ids['sarah.b']);
  db.prepare('INSERT INTO dislike (id_pub, id_util) VALUES (?, ?)').run(p2, ids['sarah.b']);

  const insSig = db.prepare(
    'INSERT INTO signalement ("id_signalé", id_signalant, raison, date) VALUES (?, ?, ?, ?)'
  );
  insSig.run(ids['tom.mercier'], ids['sarah.b'],
    'Harcèlement — commentaires déplacés répétés sous mes publications.', now);
  insSig.run(ids['luca.c'], ids['lea.wagner'],
    'Spam — liens externes publiés en boucle.', now);
}
