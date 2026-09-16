/**
 * social.repository.js
 * ------------------------------------------------------------
 * SQL des profils et des abonnements. La table `ami` du schéma
 * sert d'abonnement : id_utilisateur1 suit id_utilisateur2.
 * ------------------------------------------------------------
 */

// Bloc réutilisé partout : profil + compteurs + relation avec le compte courant.
const SQL_PROFIL = `
  SELECT u.id, u.nom, u.role, u.date,
         (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications,
         (SELECT COUNT(*) FROM ami a WHERE a.id_utilisateur2 = u.id) AS nb_abonnes,
         (SELECT COUNT(*) FROM ami a WHERE a.id_utilisateur1 = u.id) AS nb_abonnements,
         (SELECT COUNT(*) FROM "like" l JOIN publication p ON p.id = l.id_pub WHERE p.id_utilisateur = u.id) AS nb_likes_recus,
         EXISTS(SELECT 1 FROM ami a WHERE a.id_utilisateur1 = :moi AND a.id_utilisateur2 = u.id) AS je_suis_abonne,
         EXISTS(SELECT 1 FROM ami a WHERE a.id_utilisateur1 = u.id AND a.id_utilisateur2 = :moi) AS me_suit
  FROM utilisateur u`;

export function profil(db, moi, id) {
  return db.prepare(`${SQL_PROFIL} WHERE u.id = :id`).get({ moi, id });
}

// Abonnés (type = 'abonnes') ou abonnements (type = 'abonnements') d'un compte.
export function relations(db, moi, id, type) {
  const [colonneListe, colonneFiltre] =
    type === 'abonnements' ? ['id_utilisateur2', 'id_utilisateur1'] : ['id_utilisateur1', 'id_utilisateur2'];
  return db
    .prepare(`${SQL_PROFIL} WHERE u.id IN (SELECT ${colonneListe} FROM ami WHERE ${colonneFiltre} = :id) ORDER BY u.nom`)
    .all({ moi, id });
}

export function estAbonne(db, moi, cible) {
  return Boolean(db.prepare('SELECT 1 FROM ami WHERE id_utilisateur1 = ? AND id_utilisateur2 = ?').get(moi, cible));
}

export function ajouterAbonnement(db, moi, cible) {
  db.prepare('INSERT INTO ami (id_utilisateur1, id_utilisateur2) VALUES (?, ?)').run(moi, cible);
}

export function retirerAbonnement(db, moi, cible) {
  db.prepare('DELETE FROM ami WHERE id_utilisateur1 = ? AND id_utilisateur2 = ?').run(moi, cible);
}

// Comptes que je ne suis pas encore, les plus suivis d'abord.
export function suggestions(db, moi, limite = 5) {
  return db
    .prepare(
      `${SQL_PROFIL}
       WHERE u.id != :moi AND u.id NOT IN (SELECT id_utilisateur2 FROM ami WHERE id_utilisateur1 = :moi)
       ORDER BY nb_abonnes DESC, nb_publications DESC, u.nom LIMIT :limite`,
    )
    .all({ moi, limite });
}

export function chercherComptes(db, moi, motif, limite = 20) {
  return db
    .prepare(`${SQL_PROFIL} WHERE u.nom LIKE :motif ORDER BY nb_abonnes DESC, u.nom LIMIT :limite`)
    .all({ moi, motif: `%${motif}%`, limite });
}
