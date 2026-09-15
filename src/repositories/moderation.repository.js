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
