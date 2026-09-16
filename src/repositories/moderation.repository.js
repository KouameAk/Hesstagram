// Un utilisateur par ligne, avec son nombre de signalements reçus.
export function listerUtilisateursSignales(db) {
  return db
    .prepare(
      `SELECT u.id, u.nom, u.role, u.banni, COUNT(s.id) AS nombre_signalements
       FROM utilisateur u
       JOIN signalement s ON s.id_signalé = u.id
       GROUP BY u.id
       ORDER BY nombre_signalements DESC`,
    )
    .all();
}

export function bannirUtilisateur(db, userId) {
  db.prepare('UPDATE utilisateur SET banni = 1 WHERE id = ?').run(userId);
}

export function debannirUtilisateur(db, userId) {
  db.prepare('UPDATE utilisateur SET banni = 0 WHERE id = ?').run(userId);
}

// ── File de signalements détaillée (console de modération) ───────────────────

// Un signalement par ligne, avec le compte visé, le signalant et l'état du compte.
export function listerSignalements(db) {
  return db
    .prepare(
      `SELECT s.id, s.raison, s.date,
              us.id AS id_signale, us.nom AS signale, us.role AS role_signale, us.banni,
              ur.id AS id_signalant, ur.nom AS signalant,
              (SELECT COUNT(*) FROM signalement s2 WHERE s2."id_signalé" = us.id) AS total_contre,
              (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = us.id) AS nb_publications,
              EXISTS(SELECT 1 FROM suspension sp WHERE sp.id_utilisateur = us.id AND (sp.fin IS NULL OR sp.fin > :maintenant)) AS suspendu
       FROM signalement s
       JOIN utilisateur us ON us.id = s."id_signalé"
       JOIN utilisateur ur ON ur.id = s.id_signalant
       ORDER BY s.date DESC, s.id DESC`,
    )
    .all({ maintenant: new Date().toISOString() });
}

export function trouverSignalement(db, id) {
  return db
    .prepare(
      `SELECT s.id, s.raison, us.id AS id_signale, us.nom AS signale, ur.nom AS signalant
       FROM signalement s
       JOIN utilisateur us ON us.id = s."id_signalé"
       JOIN utilisateur ur ON ur.id = s.id_signalant
       WHERE s.id = ?`,
    )
    .get(id);
}

export function creerSignalement(db, { idSignale, idSignalant, raison }) {
  return Number(
    db
      .prepare('INSERT INTO signalement ("id_signalé", id_signalant, raison, date) VALUES (?, ?, ?, ?)')
      .run(idSignale, idSignalant, raison, new Date().toISOString()).lastInsertRowid,
  );
}

// Clore un dossier retire le signalement de la file ; son contenu reste au journal.
export function supprimerSignalement(db, id) {
  return db.prepare('DELETE FROM signalement WHERE id = ?').run(id).changes > 0;
}
