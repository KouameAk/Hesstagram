/**
 * donnees-initiales.js
 * ------------------------------------------------------------
 * Comptes préconfigurés et jeu de démonstration.
 *
 * Appelé au démarrage du serveur : ne fait rien si la base
 * contient déjà des comptes, sauf s'il manque l'administrateur
 * de base (il est alors recréé pour ne jamais rester dehors).
 *
 * Mots de passe : 12 caractères minimum, comme à l'inscription.
 * ------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import * as filRepository from '../repositories/fil.repository.js';

// Comptes livrés avec le projet (identifiants rappelés dans le README
// et proposés en un clic sur la page de connexion).
export const COMPTES_PRECONFIGURES = [
  { nom: 'admin', mdp: 'AdminHess2026!', role: 'admin' },
  { nom: 'moderateur', mdp: 'ModoHess2026!', role: 'modo' },
  { nom: 'lea.wagner', mdp: 'LeaHess2026!', role: 'user' },
  { nom: 'luca.c', mdp: 'LucaHess2026!', role: 'user' },
  { nom: 'tom.mercier', mdp: 'TomHess2026!', role: 'user' },
  { nom: 'sarah.b', mdp: 'SarahHess2026!', role: 'user' }
];

function creerCompte(db, { nom, mdp, role }, date) {
  const info = db
    .prepare('INSERT INTO utilisateur (nom, mdp, date, role, banni) VALUES (?, ?, ?, ?, 0)')
    .run(nom, bcrypt.hashSync(mdp, 10), date, role);
  return Number(info.lastInsertRowid);
}

export function installerDonneesInitiales(db, { avecDemonstration = true, silencieux = false } = {}) {
  const annoncer = (message) => { if (!silencieux) console.log(message); };
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM utilisateur').get();

  // Base déjà remplie : on vérifie seulement qu'un administrateur existe.
  if (total > 0) {
    const admin = db.prepare("SELECT id FROM utilisateur WHERE role = 'admin'").get();
    if (!admin) {
      const compte = COMPTES_PRECONFIGURES[0];
      const existant = db.prepare('SELECT id FROM utilisateur WHERE nom = ?').get(compte.nom);
      if (existant) {
        db.prepare("UPDATE utilisateur SET role = 'admin', banni = 0 WHERE id = ?").run(existant.id);
      } else {
        creerCompte(db, compte, new Date().toISOString());
      }
      annoncer(`Aucun administrateur en base : le compte « ${compte.nom} » a été rétabli.`);
    }
    filRepository.rattraperHashtags(db);
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

  annoncer('Comptes préconfigurés créés (voir le README pour les identifiants).');
  return { cree: true, comptes: COMPTES_PRECONFIGURES.map(({ nom, role }) => ({ nom, role })) };
}

// Quelques publications, commentaires, abonnements et signalements, pour que
// le fil, la file de modération et le tableau de bord ne soient pas vides.
function installerDemonstration(db, ids, maintenant) {
  const ilYa = (heures) => new Date(maintenant.getTime() - heures * 3600000).toISOString();

  const publier = (nom, heures, description) => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO publication (id_utilisateur, date, description, nom_fichier, type_fichier,
                                    vue, "like", "dislike", partage, republie)
           VALUES (?, ?, ?, NULL, 'texte', 0, 0, 0, 0, 0)`,
        )
        .run(ids[nom], ilYa(heures), description).lastInsertRowid,
    );
    filRepository.enregistrerHashtags(db, id, description);
    return id;
  };

  const p1 = publier('lea.wagner', 30,
    "Trois jours de crête, de la brume jusqu'au Hohneck. Le meilleur moment de l'année pour monter. #vosges #rando #alsace");
  const p2 = publier('tom.mercier', 20,
    'Inscriptions ouvertes pour la traversée de septembre. On part à six, il reste deux places. #rando #foehn');
  publier('sarah.b', 6, 'Quelqu’un connaît un bon parking près du col de la Schlucht ? #rando');
  publier('luca.c', 2, 'Première semaine de stage terminée : réseau, supervision et beaucoup de café. #but3 #reseaux');

  const commenter = (idPub, nom, texte) =>
    db.prepare('INSERT INTO commentaire (id_pub, id_utilisateur, commentaire) VALUES (?, ?, ?)')
      .run(idPub, ids[nom], texte);
  commenter(p1, 'tom.mercier', "Le passage sous la brume, c'est exactement ça.");
  commenter(p1, 'sarah.b', 'Tu partais de quel parking ?');
  commenter(p2, 'lea.wagner', 'On refait la même en octobre ?');

  const aimer = (idPub, nom) =>
    db.prepare('INSERT INTO "like" (id_pub, id_utilisateur) VALUES (?, ?)').run(idPub, ids[nom]);
  aimer(p1, 'tom.mercier');
  aimer(p1, 'sarah.b');
  aimer(p2, 'luca.c');
  filRepository.synchroniserCompteurs(db, p1);
  filRepository.synchroniserCompteurs(db, p2);

  const suivre = (a, b) =>
    db.prepare('INSERT INTO ami (id_utilisateur1, id_utilisateur2) VALUES (?, ?)').run(ids[a], ids[b]);
  suivre('luca.c', 'lea.wagner');
  suivre('sarah.b', 'lea.wagner');
  suivre('lea.wagner', 'tom.mercier');

  const signaler = (signale, signalant, raison, heures) =>
    db.prepare('INSERT INTO signalement ("id_signalé", id_signalant, raison, date) VALUES (?, ?, ?, ?)')
      .run(ids[signale], ids[signalant], raison, ilYa(heures));
  signaler('tom.mercier', 'sarah.b', 'Harcèlement — commentaires déplacés répétés sous mes publications.', 12);
  signaler('tom.mercier', 'lea.wagner', 'Spam — liens externes publiés en boucle.', 5);
}
