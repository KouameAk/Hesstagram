/**
 * administration.repository.js
 * ------------------------------------------------------------
 * SQL de la console d'administration : liste détaillée des
 * comptes, suspensions, suppression d'un compte, chiffres du
 * tableau de bord.
 * ------------------------------------------------------------
 */

const maintenant = () => new Date().toISOString();

// ── Suspensions ──────────────────────────────────────────────

// Suspension en cours d'un compte (fin NULL = sans date de fin), ou undefined.
export function suspensionActive(db, idUtilisateur) {
  return db
    .prepare('SELECT * FROM suspension WHERE id_utilisateur = ? AND (fin IS NULL OR fin > ?)')
    .get(idUtilisateur, maintenant());
}

// `banni` (colonne du schéma, utilisée par les écrans de modération existants)
// reste le reflet de la table `suspension`.
export function suspendre(db, { idUtilisateur, raison, fin, idAdmin }) {
  db.prepare(
    `INSERT INTO suspension (id_utilisateur, raison, date, fin, id_admin) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id_utilisateur) DO UPDATE SET raison = excluded.raison, date = excluded.date,
                                               fin = excluded.fin, id_admin = excluded.id_admin`,
  ).run(idUtilisateur, raison, maintenant(), fin, idAdmin);
  db.prepare('UPDATE utilisateur SET banni = 1 WHERE id = ?').run(idUtilisateur);
}

export function leverSuspension(db, idUtilisateur) {
  const r = db.prepare('DELETE FROM suspension WHERE id_utilisateur = ?').run(idUtilisateur);
  db.prepare('UPDATE utilisateur SET banni = 0 WHERE id = ?').run(idUtilisateur);
  return r.changes > 0;
}

// ── Comptes ──────────────────────────────────────────────────

export function listerComptesDetail(db) {
  return db
    .prepare(
      `SELECT u.id, u.nom, u.date, u.role, u.banni,
              (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications,
              (SELECT COUNT(*) FROM ami a WHERE a.id_utilisateur2 = u.id) AS nb_abonnes,
              (SELECT COUNT(*) FROM signalement s WHERE s."id_signalé" = u.id) AS nb_signalements,
              (SELECT MAX(j.date) FROM journal j WHERE j.id_utilisateur = u.id) AS derniere_activite,
              sp.raison AS suspension_raison, sp.date AS suspension_date, sp.fin AS suspension_fin
       FROM utilisateur u
       LEFT JOIN suspension sp ON sp.id_utilisateur = u.id AND (sp.fin IS NULL OR sp.fin > ?)
       ORDER BY u.id`,
    )
    .all(maintenant());
}

// Fiche d'un compte pour l'audit (chiffres + suspension en cours).
export function ficheAudit(db, id) {
  return db
    .prepare(
      `SELECT u.id, u.nom, u.role, u.date, u.banni,
              (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications,
              (SELECT COUNT(*) FROM commentaire c WHERE c.id_utilisateur = u.id) AS nb_commentaires,
              (SELECT COUNT(*) FROM ami a WHERE a.id_utilisateur2 = u.id) AS nb_abonnes,
              (SELECT COUNT(*) FROM signalement s WHERE s."id_signalé" = u.id) AS signalements_en_attente,
              (SELECT COUNT(*) FROM signalement s WHERE s.id_signalant = u.id) AS signalements_deposes,
              sp.raison AS suspension_raison, sp.date AS suspension_date, sp.fin AS suspension_fin
       FROM utilisateur u
       LEFT JOIN suspension sp ON sp.id_utilisateur = u.id AND (sp.fin IS NULL OR sp.fin > ?)
       WHERE u.id = ?`,
    )
    .get(maintenant(), id);
}

// Ce qui sera effacé avec le compte (affiché avant de confirmer la suppression).
export function bilanSuppression(db, id) {
  return db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM publication WHERE id_utilisateur = ?) AS publications,
              (SELECT COUNT(*) FROM commentaire WHERE id_utilisateur = ?) AS commentaires,
              (SELECT COUNT(*) FROM message WHERE id_utilisateur = ?) AS messages`,
    )
    .get(id, id, id);
}

/**
 * Supprime un compte et tout ce qui s'y rattache.
 * `avantCommit(bilan)` est appelé dans la transaction : c'est là qu'on écrit la
 * trace au journal, pour qu'elle soit annulée elle aussi en cas d'échec.
 * Le schéma n'a pas de ON DELETE CASCADE : chaque table est vidée à la main.
 */
export function supprimerCompte(db, id, avantCommit) {
  const bilan = bilanSuppression(db, id);
  const sesPubs = 'SELECT id FROM publication WHERE id_utilisateur = ?';
  const sesConversations = 'SELECT id_conversation FROM conversation_membre WHERE id_utilisateur = ?';

  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM "like" WHERE id_utilisateur = ? OR id_pub IN (${sesPubs})`).run(id, id);
    db.prepare(`DELETE FROM dislike WHERE id_util = ? OR id_pub IN (${sesPubs})`).run(id, id);
    db.prepare(`DELETE FROM commentaire WHERE id_utilisateur = ? OR id_pub IN (${sesPubs})`).run(id, id);
    db.prepare(`DELETE FROM hashtag WHERE id_pub IN (${sesPubs})`).run(id);
    db.prepare('DELETE FROM publication WHERE id_utilisateur = ?').run(id);
    db.prepare(`DELETE FROM message WHERE id_utilisateur = ? OR id_conversation IN (${sesConversations})`).run(id, id);
    db.prepare(`DELETE FROM cle_groupe_partagee WHERE id_utilisateur = ? OR id_conversation IN (${sesConversations})`).run(id, id);
    db.prepare(`DELETE FROM conversation WHERE id IN (${sesConversations})`).run(id);
    db.prepare('DELETE FROM conversation_membre WHERE id_utilisateur = ?').run(id);
    db.prepare('DELETE FROM notification WHERE id_utilisateur = ?').run(id);
    db.prepare('DELETE FROM signalement WHERE "id_signalé" = ? OR id_signalant = ?').run(id, id);
    db.prepare('DELETE FROM ami WHERE id_utilisateur1 = ? OR id_utilisateur2 = ?').run(id, id);
    db.prepare('DELETE FROM suspension WHERE id_utilisateur = ?').run(id);
    db.prepare('DELETE FROM utilisateur WHERE id = ?').run(id);
    avantCommit?.(bilan);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return bilan;
}

// ── Tableau de bord ──────────────────────────────────────────

export function chiffresCles(db, { ilYa7j, ilYa24h }) {
  return db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM utilisateur) AS comptes,
              (SELECT COUNT(*) FROM utilisateur WHERE date >= :j7) AS nouveaux_7j,
              (SELECT COUNT(DISTINCT id_utilisateur) FROM journal WHERE date >= :j7 AND action = 'connexion') AS actifs_7j,
              (SELECT COUNT(*) FROM utilisateur WHERE role = 'modo') AS moderateurs,
              (SELECT COUNT(*) FROM suspension WHERE fin IS NULL OR fin > :maintenant) AS suspendus,
              (SELECT COUNT(*) FROM signalement) AS signalements,
              (SELECT COUNT(*) FROM publication) AS publications,
              (SELECT COUNT(*) FROM message) AS messages,
              (SELECT COUNT(*) FROM journal WHERE action = 'connexion_echouee' AND date >= :j1) AS echecs_24h`,
    )
    .get({ j7: ilYa7j, j1: ilYa24h, maintenant: maintenant() });
}

// Comptes les plus signalés (encadré « à surveiller »).
export function comptesASurveiller(db, limite = 5) {
  return db
    .prepare(
      `SELECT u.id, u.nom, u.role, COUNT(s.id) AS signalements,
              EXISTS(SELECT 1 FROM suspension sp WHERE sp.id_utilisateur = u.id AND (sp.fin IS NULL OR sp.fin > ?)) AS suspendu
       FROM utilisateur u JOIN signalement s ON s."id_signalé" = u.id
       GROUP BY u.id ORDER BY signalements DESC, u.nom LIMIT ?`,
    )
    .all(maintenant(), limite);
}
