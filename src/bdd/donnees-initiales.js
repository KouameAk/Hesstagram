/**
 * donnees-initiales.js
 * ------------------------------------------------------------
 * Préparation de la base pour l'interface intégrée, appelée au
 * démarrage juste après ouvrirBase() (bdd/connexion.js, du groupe) :
 *
 *   1. ajoute les tables des consoles (schema-interface.sql) ;
 *   2. si la base est vide : crée les comptes préconfigurés et un
 *      petit jeu de démonstration (photos, j'aime, signalements) ;
 *   3. si aucun administrateur n'existe : rétablit le compte « admin ».
 *
 * Mots de passe : 12 à 64 caractères, comme à l'inscription.
 * ------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHEMIN_SCHEMA = path.join(__dirname, 'schema-interface.sql');
// Même dossier que les photos envoyées par upload.middleware.js (code du groupe)
const DOSSIER_PHOTOS = path.join(__dirname, '../public/uploads/temp');

// Comptes livrés avec le projet (identifiants rappelés dans INTEGRATION.md
// et proposés en un clic sur la page de connexion).
export const COMPTES_PRECONFIGURES = [
  { nom: 'admin', mdp: 'AdminHess2026!', role: 'admin' },
  { nom: 'moderateur', mdp: 'ModoHess2026!', role: 'modo' },
  { nom: 'lea.wagner', mdp: 'LeaHess2026!', role: 'user' },
  { nom: 'luca.c', mdp: 'LucaHess2026!', role: 'user' },
  { nom: 'tom.mercier', mdp: 'TomHess2026!', role: 'user' },
  { nom: 'sarah.b', mdp: 'SarahHess2026!', role: 'user' }
];

export function installerSchemaInterface(db) {
  db.exec(fs.readFileSync(CHEMIN_SCHEMA, 'utf-8'));
}

function creerCompte(db, { nom, mdp, role }, date) {
  const info = db
    .prepare('INSERT INTO utilisateur (nom, mdp, date, role, banni) VALUES (?, ?, ?, ?, 0)')
    .run(nom, bcrypt.hashSync(mdp, 10), date, role);
  return Number(info.lastInsertRowid);
}

export function installerDonneesInitiales(db, { avecDemonstration = true, silencieux = false } = {}) {
  const annoncer = (message) => { if (!silencieux) console.log(message); };
  installerSchemaInterface(db);

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM utilisateur').get();

  // Base déjà remplie : on vérifie seulement qu'un administrateur existe.
  if (total > 0) {
    const admin = db.prepare("SELECT id FROM utilisateur WHERE role = 'admin'").get();
    if (!admin) {
      const compte = COMPTES_PRECONFIGURES[0];
      const existant = db.prepare('SELECT id FROM utilisateur WHERE nom = ?').get(compte.nom);
      if (existant) {
        db.prepare("UPDATE utilisateur SET role = 'admin', banni = 0 WHERE id = ?").run(existant.id);
        db.prepare('DELETE FROM suspension WHERE id_utilisateur = ?').run(existant.id);
      } else {
        creerCompte(db, compte, new Date().toISOString());
      }
      annoncer(`Aucun administrateur en base : le compte « ${compte.nom} » a été rétabli.`);
    }
    return { cree: false };
  }

  const maintenant = new Date();
  const ids = {};
  for (const [index, compte] of COMPTES_PRECONFIGURES.entries()) {
    // Dates d'inscription échelonnées pour que le tableau de bord ait du relief
    const date = new Date(maintenant.getTime() - (COMPTES_PRECONFIGURES.length - index) * 86400000).toISOString();
    ids[compte.nom] = creerCompte(db, compte, date);
  }

  if (avecDemonstration) {
    installerDemonstration(db, ids, maintenant);
  }

  annoncer('Comptes préconfigurés créés (identifiants dans INTEGRATION.md).');
  return { cree: true, comptes: COMPTES_PRECONFIGURES.map(({ nom, role }) => ({ nom, role })) };
}

// Illustration vectorielle (ciel, soleil, reliefs) : de vraies photos de
// démonstration sans embarquer d'images dans le dépôt.
function illustration([ciel1, ciel2, soleil, loin, pres]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  <defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ciel1}"/><stop offset="1" stop-color="${ciel2}"/></linearGradient></defs>
  <rect width="1080" height="1080" fill="url(#c)"/>
  <circle cx="760" cy="360" r="120" fill="${soleil}"/>
  <path d="M0 700 L220 470 L400 620 L600 400 L820 610 L1080 450 L1080 1080 L0 1080Z" fill="${loin}"/>
  <path d="M0 860 L260 660 L480 800 L700 640 L1080 860 L1080 1080 L0 1080Z" fill="${pres}"/>
</svg>`;
}

// Quelques publications, j'aime et signalements, pour que le fil, la file de
// modération et le tableau de bord ne soient pas vides au premier lancement.
function installerDemonstration(db, ids, maintenant) {
  const ilYa = (heures) => new Date(maintenant.getTime() - heures * 3600000).toISOString();
  fs.mkdirSync(DOSSIER_PHOTOS, { recursive: true });

  const publier = (nom, heures, description, couleurs) => {
    const fichier = `demo-${nom.replace(/\W/g, '')}-${heures}.svg`;
    fs.writeFileSync(path.join(DOSSIER_PHOTOS, fichier), illustration(couleurs));
    return Number(
      db
        .prepare(
          `INSERT INTO publication (id_utilisateur, date, description, nom_fichier, type_fichier,
                                    vue, "like", "dislike", partage, republie)
           VALUES (?, ?, ?, ?, 'image/svg+xml', 0, 0, 0, 0, 0)`,
        )
        .run(ids[nom], ilYa(heures), description, fichier).lastInsertRowid,
    );
  };

  const p1 = publier('lea.wagner', 30, "Trois jours de crête, de la brume jusqu'au Hohneck. #vosges #rando",
    ['#ffd9a8', '#ff9d5c', '#fff3d6', '#c8643a', '#7a3418']);
  const p2 = publier('tom.mercier', 20, 'Inscriptions ouvertes pour la traversée de septembre, il reste deux places.',
    ['#bfe3ff', '#7fb8ea', '#ffffff', '#5a86b0', '#2f4f6e']);
  const p3 = publier('sarah.b', 6, 'Coucher de soleil au col de la Schlucht.',
    ['#ffb38a', '#e0605a', '#ffe7a1', '#8a3b4f', '#3f1f33']);
  publier('luca.c', 2, 'Première semaine de stage terminée : réseau, supervision et beaucoup de café.',
    ['#d9f2e3', '#8fd1b0', '#fffbe6', '#4f9a7a', '#24584a']);

  const reagir = (table, colonne, idPub, nom) =>
    db.prepare(`INSERT INTO ${table} (id_pub, ${colonne}) VALUES (?, ?)`).run(idPub, ids[nom]);
  reagir('"like"', 'id_utilisateur', p1, 'tom.mercier');
  reagir('"like"', 'id_utilisateur', p1, 'sarah.b');
  reagir('"like"', 'id_utilisateur', p2, 'luca.c');
  reagir('"like"', 'id_utilisateur', p3, 'lea.wagner');
  reagir('dislike', 'id_util', p2, 'sarah.b');
  // Les colonnes "like" / "dislike" de publication servent de compteurs (likes.routes.js)
  db.exec(`UPDATE publication SET "like" = (SELECT COUNT(*) FROM "like" WHERE id_pub = publication.id),
                                  "dislike" = (SELECT COUNT(*) FROM dislike WHERE id_pub = publication.id)`);

  const signaler = (signale, signalant, raison, heures) =>
    db.prepare('INSERT INTO signalement ("id_signalé", id_signalant, raison, date) VALUES (?, ?, ?, ?)')
      .run(ids[signale], ids[signalant], raison, ilYa(heures));
  signaler('tom.mercier', 'sarah.b', `Harcèlement — publication n°${p2}`, 12);
  signaler('tom.mercier', 'lea.wagner', `Spam — publication n°${p2} « Inscriptions ouvertes pour la traversée… »`, 5);
}
