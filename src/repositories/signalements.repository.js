/**
 * signalements.repository.js
 * ------------------------------------------------------------
 * File de signalements détaillée pour la console de modération.
 * La vue « un utilisateur par ligne » du groupe reste dans
 * moderation.repository.js, inchangée.
 * ------------------------------------------------------------
 */

// Un signalement par ligne, avec le compte visé, le signalant et l'état du compte.
export function listerSignalements(db) {
  return db
    .prepare(
      `SELECT s.id, s.raison, s.date,
              us.id AS id_signale, us.nom AS signale, us.role AS role_signale, us.banni,
              ur.id AS id_signalant, ur.nom AS signalant,
              (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = us.id) AS nb_publications,
              (us.banni = 1 OR EXISTS(SELECT 1 FROM suspension sp WHERE sp.id_utilisateur = us.id
                                        AND (sp.fin IS NULL OR sp.fin > :maintenant))) AS suspendu
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

// Clore un dossier retire le signalement de la file ; la décision reste au journal.
export function supprimerSignalement(db, id) {
  return db.prepare('DELETE FROM signalement WHERE id = ?').run(id).changes > 0;
}
