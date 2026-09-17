/**
 * fil.repository.js
 * ------------------------------------------------------------
 * SQL du fil d'actualité : lecture des publications (photos et
 * vidéos envoyées par les routes du groupe), avec les compteurs
 * de j'aime / je n'aime pas, et retrait d'une publication.
 * ------------------------------------------------------------
 */

// URL publique du média, au même endroit que les modules du groupe :
// photos → uploads/temp (upload.middleware.js), vidéos → uploads/videos (video.service.js).
const SQL_MEDIA = `
  CASE
    WHEN p.nom_fichier IS NULL THEN NULL
    WHEN p.type_fichier LIKE 'video/%' THEN '/uploads/videos/' || p.nom_fichier
    ELSE '/uploads/temp/' || p.nom_fichier
  END`;

/**
 * Publications du fil, avec les compteurs et ce que l'utilisateur courant a déjà fait.
 * Filtres : type (photo | video), auteur, id.
 */
export function listerPublications(db, moi, { type, auteur, id } = {}) {
  const conditions = [];
  const params = [moi, moi];

  if (type === 'photo') conditions.push("p.type_fichier LIKE 'image/%'");
  if (type === 'video') conditions.push("p.type_fichier LIKE 'video/%'");
  if (auteur) { conditions.push('p.id_utilisateur = ?'); params.push(Number(auteur)); }
  if (id) { conditions.push('p.id = ?'); params.push(Number(id)); }

  return db
    .prepare(
      `SELECT p.id, p.date, p.description, p.type_fichier, ${SQL_MEDIA} AS media,
              u.id AS auteur_id, u.nom AS auteur, u.role AS auteur_role,
              (SELECT COUNT(*) FROM "like" l WHERE l.id_pub = p.id) AS nb_like,
              (SELECT COUNT(*) FROM dislike d WHERE d.id_pub = p.id) AS nb_dislike,
              EXISTS(SELECT 1 FROM "like" l WHERE l.id_pub = p.id AND l.id_utilisateur = ?) AS mon_like,
              EXISTS(SELECT 1 FROM dislike d WHERE d.id_pub = p.id AND d.id_util = ?) AS mon_dislike
       FROM publication p
       JOIN utilisateur u ON u.id = p.id_utilisateur
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY p.date DESC, p.id DESC
       LIMIT 100`,
    )
    .all(...params);
}

// Publication + nom de son auteur (cible des entrées du journal), ou undefined.
export function trouverPublicationAvecAuteur(db, id) {
  return db
    .prepare(
      `SELECT p.id, p.description, p.nom_fichier, p.type_fichier, u.id AS auteur_id, u.nom AS auteur
       FROM publication p JOIN utilisateur u ON u.id = p.id_utilisateur WHERE p.id = ?`,
    )
    .get(id);
}

// Dernière publication d'un compte (trace au journal après un envoi photo / vidéo).
export function dernierePublicationDe(db, idUtilisateur) {
  return db
    .prepare('SELECT id, description, type_fichier FROM publication WHERE id_utilisateur = ? ORDER BY id DESC LIMIT 1')
    .get(idUtilisateur);
}

// Le schéma n'a pas de ON DELETE CASCADE : j'aime, je n'aime pas, commentaires
// et hashtags sont retirés à la main, dans une transaction.
export function supprimerPublication(db, idPublication) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM "like" WHERE id_pub = ?').run(idPublication);
    db.prepare('DELETE FROM dislike WHERE id_pub = ?').run(idPublication);
    db.prepare('DELETE FROM commentaire WHERE id_pub = ?').run(idPublication);
    db.prepare('DELETE FROM hashtag WHERE id_pub = ?').run(idPublication);
    db.prepare('DELETE FROM publication WHERE id = ?').run(idPublication);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Fichiers (photos, vidéos) publiés par un compte : sert à les effacer du disque
// quand le compte est supprimé.
export function mediasDUnCompte(db, idUtilisateur) {
  return db
    .prepare('SELECT nom_fichier, type_fichier FROM publication WHERE id_utilisateur = ? AND nom_fichier IS NOT NULL')
    .all(idUtilisateur);
}
