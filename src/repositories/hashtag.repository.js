// Enregistre chaque hashtag pour cette publication. nombre_utilisation est
// recalculé à chaque fois (nombre total de publications utilisant ce hashtag).
export function enregistrerHashtags(db, idPublication, noms) {
  const compterUtilisations = db.prepare('SELECT COUNT(*) AS total FROM hashtag WHERE nom = ?');
  const inserer = db.prepare(
    'INSERT INTO hashtag (nom, nombre_utilisation, id_pub) VALUES (?, ?, ?)',
  );

  for (const nom of noms) {
    const utilisationsPrecedentes = compterUtilisations.get(nom).total;
    inserer.run(nom, utilisationsPrecedentes + 1, idPublication);
  }
}

// Les publications qui utilisent un hashtag donné, les plus récentes d'abord.
export function trouverPublicationsParHashtag(db, nom) {
  return db
    .prepare(
      `SELECT p.* FROM publication p
       JOIN hashtag h ON h.id_pub = p.id
       WHERE h.nom = ?
       ORDER BY p.date DESC`,
    )
    .all(nom);
}

// Même chose, mais avec les infos attendues par le fil du frontend (auteur,
// média, compteurs...). Requête reprise de fil.repository.js pour rester
// cohérent avec le fil normal, sans modifier ce fichier.
const SQL_MEDIA = `
  CASE
    WHEN p.nom_fichier IS NULL THEN NULL
    WHEN p.type_fichier LIKE 'video/%' THEN '/uploads/videos/' || p.nom_fichier
    ELSE '/uploads/temp/' || p.nom_fichier
  END`;

export function trouverPublicationsParHashtagPourLeFil(db, moi, nom) {
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
       JOIN hashtag h ON h.id_pub = p.id
       WHERE h.nom = ?
       ORDER BY p.date DESC, p.id DESC`,
    )
    .all(moi, moi, nom);
}

export function listerListeNoire(db) {
  return db.prepare('SELECT nom FROM hashtag_interdit ORDER BY nom').all().map((l) => l.nom);
}

export function estInterdit(db, nom) {
  const nomPropre = String(nom ?? '').replace(/^#+/, '').trim().toLowerCase();
  if (!nomPropre) return false;
  return Boolean(db.prepare('SELECT 1 FROM hashtag_interdit WHERE nom = ?').get(nomPropre));
}

export function ajouterAListeNoire(db, nom) {
  const nomPropre = String(nom ?? '').replace(/^#+/, '').trim().toLowerCase();
  if (!nomPropre) return;
  db.prepare('INSERT OR IGNORE INTO hashtag_interdit (nom) VALUES (?)').run(nomPropre);
  db.prepare('DELETE FROM hashtag WHERE nom = ?').run(nomPropre);
}

export function retirerDeListeNoire(db, nom) {
  const nomPropre = String(nom ?? '').replace(/^#+/, '').trim().toLowerCase();
  if (!nomPropre) return;
  db.prepare('DELETE FROM hashtag_interdit WHERE nom = ?').run(nomPropre);
}

// Liste les hashtags les plus utilisés qui ne sont pas interdits
export function listerHashtagsPopulaires(db, limite = 20) {
  return db
    .prepare(
      `SELECT h.nom, COUNT(*) AS total
       FROM hashtag h
       WHERE h.nom NOT IN (SELECT nom FROM hashtag_interdit)
       GROUP BY h.nom
       ORDER BY total DESC, h.nom ASC
       LIMIT ?`,
    )
    .all(limite);
}

// Calcule les tendances des hashtags (les plus utilisés), avec période optionnelle (24h, 7j ou global)
export function obtenirTendancesHashtags(db, { limite = 10, periode = null } = {}) {
  let clauseDate = '';
  if (periode === '24h') {
    clauseDate = "AND p.date >= datetime('now', '-1 day')";
  } else if (periode === '7j') {
    clauseDate = "AND p.date >= datetime('now', '-7 days')";
  }

  let resultats = [];
  if (clauseDate) {
    resultats = db
      .prepare(
        `SELECT h.nom, COUNT(*) AS total
         FROM hashtag h
         JOIN publication p ON p.id = h.id_pub
         WHERE h.nom NOT IN (SELECT nom FROM hashtag_interdit)
         ${clauseDate}
         GROUP BY h.nom
         ORDER BY total DESC, h.nom ASC
         LIMIT ?`,
      )
      .all(limite);
  }

  // Si aucun résultat récent ou sans période spécifiée, calcul sur le volume global
  if (!resultats.length) {
    resultats = db
      .prepare(
        `SELECT h.nom, COUNT(*) AS total
         FROM hashtag h
         WHERE h.nom NOT IN (SELECT nom FROM hashtag_interdit)
         GROUP BY h.nom
         ORDER BY total DESC, h.nom ASC
         LIMIT ?`,
      )
      .all(limite);
  }

  return resultats;
}

