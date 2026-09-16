/**
 * fil.repository.js
 * ------------------------------------------------------------
 * SQL du fil d'actualité : publications, j'aime / je n'aime pas,
 * commentaires et hashtags.
 * ------------------------------------------------------------
 */

/**
 * Publications du fil, avec les compteurs et ce que l'utilisateur courant a déjà fait.
 * Filtres : abonnements (ses comptes suivis), tag, auteur, id.
 */
export function listerPublications(db, moi, { filtre, tag, auteur, id } = {}) {
  const conditions = [];
  const params = [moi, moi, moi];

  if (filtre === 'abonnements') {
    conditions.push('(p.id_utilisateur = ? OR p.id_utilisateur IN (SELECT id_utilisateur2 FROM ami WHERE id_utilisateur1 = ?))');
    params.push(moi, moi);
  }
  if (tag) {
    conditions.push('p.id IN (SELECT id_pub FROM hashtag WHERE nom = ?)');
    params.push('#' + String(tag).replace(/^#/, '').toLowerCase());
  }
  if (auteur) { conditions.push('p.id_utilisateur = ?'); params.push(Number(auteur)); }
  if (id) { conditions.push('p.id = ?'); params.push(Number(id)); }

  const publications = db
    .prepare(
      `SELECT p.id, p.date, p.description, p.type_fichier,
              CASE
                WHEN p.nom_fichier IS NULL THEN NULL
                WHEN p.type_fichier LIKE 'video/%' THEN '/uploads/videos/' || p.nom_fichier
                ELSE '/uploads/temp/' || p.nom_fichier
              END AS media,
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
       LIMIT 100`,
    )
    .all(...params);

  const commentaires = db.prepare(
    `SELECT c.id, c.commentaire, u.id AS auteur_id, u.nom AS auteur, u.role AS auteur_role
     FROM commentaire c JOIN utilisateur u ON u.id = c.id_utilisateur
     WHERE c.id_pub = ? ORDER BY c.id`,
  );
  for (const p of publications) p.commentaires = commentaires.all(p.id);
  return publications;
}

export function creerPublication(db, { idUtilisateur, description, nomFichier = null, typeFichier = 'texte' }) {
  const info = db
    .prepare(
      `INSERT INTO publication (id_utilisateur, date, description, nom_fichier, type_fichier,
                                vue, "like", "dislike", partage, republie)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0)`,
    )
    .run(idUtilisateur, new Date().toISOString(), description, nomFichier, typeFichier);
  return Number(info.lastInsertRowid);
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

export function publicationsDUnCompte(db, idUtilisateur) {
  return db
    .prepare(
      `SELECT p.id, p.date, p.description, p.type_fichier,
              CASE
                WHEN p.nom_fichier IS NULL THEN NULL
                WHEN p.type_fichier LIKE 'video/%' THEN '/uploads/videos/' || p.nom_fichier
                ELSE '/uploads/temp/' || p.nom_fichier
              END AS media,
              (SELECT COUNT(*) FROM "like" l WHERE l.id_pub = p.id) AS nb_like,
              (SELECT COUNT(*) FROM commentaire c WHERE c.id_pub = p.id) AS nb_commentaires
       FROM publication p WHERE p.id_utilisateur = ? ORDER BY p.date DESC, p.id DESC`,
    )
    .all(idUtilisateur);
}

// Fichiers (photos, vidéos) publiés par un compte : sert à les effacer du disque
// quand le compte est supprimé.
export function mediasDUnCompte(db, idUtilisateur) {
  return db
    .prepare('SELECT nom_fichier, type_fichier FROM publication WHERE id_utilisateur = ? AND nom_fichier IS NOT NULL')
    .all(idUtilisateur);
}

// ── Hashtags ─────────────────────────────────────────────────

export function enregistrerHashtags(db, idPublication, description) {
  const tags = String(description).match(/#[\p{L}\p{N}_]+/gu) || [];
  const insertion = db.prepare('INSERT INTO hashtag (nom, nombre_utilisation, id_pub) VALUES (?, 1, ?)');
  for (const tag of new Set(tags.map((t) => t.toLowerCase()))) insertion.run(tag, idPublication);
}

export function tendances(db, limite = 10) {
  return db
    .prepare('SELECT nom, COUNT(*) AS total FROM hashtag GROUP BY nom ORDER BY total DESC, nom LIMIT ?')
    .all(limite);
}

export function chercherHashtags(db, motif, limite = 10) {
  return db
    .prepare('SELECT nom, COUNT(*) AS total FROM hashtag WHERE nom LIKE ? GROUP BY nom ORDER BY total DESC LIMIT ?')
    .all(`#%${motif}%`, limite);
}

// Rattrapage : publications enregistrées sans passer par l'API (jeu de données de
// départ) dont les #hashtags ne sont pas encore dans la table.
export function rattraperHashtags(db) {
  const sansTags = db
    .prepare(
      `SELECT id, description FROM publication p
       WHERE description LIKE '%#%' AND NOT EXISTS (SELECT 1 FROM hashtag h WHERE h.id_pub = p.id)`,
    )
    .all();
  for (const p of sansTags) enregistrerHashtags(db, p.id, p.description);
  return sansTags.length;
}

// ── J'aime / Je n'aime pas ───────────────────────────────────

export function aDejaLike(db, idPublication, idUtilisateur) {
  return Boolean(db.prepare('SELECT 1 FROM "like" WHERE id_pub = ? AND id_utilisateur = ?').get(idPublication, idUtilisateur));
}

export function aDejaDislike(db, idPublication, idUtilisateur) {
  return Boolean(db.prepare('SELECT 1 FROM dislike WHERE id_pub = ? AND id_util = ?').get(idPublication, idUtilisateur));
}

export function ajouterLike(db, idPublication, idUtilisateur) {
  db.prepare('INSERT INTO "like" (id_pub, id_utilisateur) VALUES (?, ?)').run(idPublication, idUtilisateur);
  synchroniserCompteurs(db, idPublication);
}

export function retirerLike(db, idPublication, idUtilisateur) {
  db.prepare('DELETE FROM "like" WHERE id_pub = ? AND id_utilisateur = ?').run(idPublication, idUtilisateur);
  synchroniserCompteurs(db, idPublication);
}

export function ajouterDislike(db, idPublication, idUtilisateur) {
  db.prepare('INSERT INTO dislike (id_pub, id_util) VALUES (?, ?)').run(idPublication, idUtilisateur);
  synchroniserCompteurs(db, idPublication);
}

export function retirerDislike(db, idPublication, idUtilisateur) {
  db.prepare('DELETE FROM dislike WHERE id_pub = ? AND id_util = ?').run(idPublication, idUtilisateur);
  synchroniserCompteurs(db, idPublication);
}

// Les colonnes "like"/"dislike" de la table publication servent de compteurs :
// on les recalcule après chaque changement pour qu'elles restent justes.
export function synchroniserCompteurs(db, idPublication) {
  db.prepare(
    `UPDATE publication
     SET "like" = (SELECT COUNT(*) FROM "like" WHERE id_pub = ?),
         "dislike" = (SELECT COUNT(*) FROM dislike WHERE id_pub = ?)
     WHERE id = ?`,
  ).run(idPublication, idPublication, idPublication);
}

export function listerLikes(db, idPublication, moi) {
  return db
    .prepare(
      `SELECT u.id, u.nom, u.role,
              EXISTS(SELECT 1 FROM ami a WHERE a.id_utilisateur1 = ? AND a.id_utilisateur2 = u.id) AS je_suis_abonne
       FROM "like" l JOIN utilisateur u ON u.id = l.id_utilisateur
       WHERE l.id_pub = ? ORDER BY u.nom`,
    )
    .all(moi, idPublication);
}

// ── Commentaires ─────────────────────────────────────────────

export function ajouterCommentaire(db, { idPublication, idUtilisateur, commentaire }) {
  db.prepare('INSERT INTO commentaire (id_pub, id_utilisateur, commentaire) VALUES (?, ?, ?)')
    .run(idPublication, idUtilisateur, commentaire);
}
