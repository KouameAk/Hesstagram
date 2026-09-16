/**
 * journal.repository.js
 * ------------------------------------------------------------
 * SQL de la table `journal` : écriture des traces, lecture pour
 * les logs du site, l'audit par profil et les notifications.
 * ------------------------------------------------------------
 */

export function enregistrerLigne(db, ligne) {
  db.prepare(
    `INSERT INTO journal (date, id_utilisateur, nom_utilisateur, role_utilisateur, categorie, action,
                          cible_type, cible_id, cible_nom, details, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ligne.date, ligne.idUtilisateur, ligne.nomUtilisateur, ligne.roleUtilisateur,
    ligne.categorie, ligne.action,
    ligne.cibleType, ligne.cibleId, ligne.cibleNom, ligne.details, ligne.ip,
  );
}

/**
 * Lecture filtrée du journal, page par page.
 * `avant` est l'id de la dernière ligne déjà reçue (pagination par curseur).
 * Renvoie une ligne de plus que demandé pour savoir s'il reste une suite.
 */
export function listerJournal(db, { utilisateur, recherche, categorie, action, du, au, avant, limite = 100 }) {
  const conditions = [];
  const params = [];

  if (utilisateur) {
    // Actions faites PAR ce compte ou le CONCERNANT (rôle changé, suspendu, signalé…)
    conditions.push("(id_utilisateur = ? OR (cible_type = 'utilisateur' AND cible_id = ?))");
    params.push(Number(utilisateur), Number(utilisateur));
  }
  if (recherche) {
    conditions.push('(nom_utilisateur LIKE ? OR cible_nom LIKE ? OR details LIKE ? OR ip LIKE ?)');
    const motif = `%${recherche}%`;
    params.push(motif, motif, motif, motif);
  }
  if (categorie) { conditions.push('categorie = ?'); params.push(String(categorie)); }
  if (action) { conditions.push('action = ?'); params.push(String(action)); }
  if (du) { conditions.push('date >= ?'); params.push(new Date(`${du}T00:00:00`).toISOString()); }
  if (au) { conditions.push('date <= ?'); params.push(new Date(`${au}T23:59:59.999`).toISOString()); }
  if (avant) { conditions.push('id < ?'); params.push(Number(avant)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const lignes = db.prepare(`SELECT * FROM journal ${where} ORDER BY id DESC LIMIT ?`).all(...params, limite + 1);
  return { lignes: lignes.slice(0, limite), suite: lignes.length > limite };
}

// Volume d'actions par catégorie pour un compte (audit).
export function compterParCategorie(db, idUtilisateur) {
  return db
    .prepare('SELECT categorie, COUNT(*) AS total FROM journal WHERE id_utilisateur = ? GROUP BY categorie')
    .all(idUtilisateur);
}

// Première action, dernière action, dernière connexion, échecs de connexion.
export function bornesActivite(db, idUtilisateur) {
  return db
    .prepare(
      `SELECT MIN(date) AS premiere, MAX(date) AS derniere,
              MAX(CASE WHEN action = 'connexion' THEN date END) AS derniere_connexion,
              SUM(action = 'connexion_echouee') AS echecs_connexion
       FROM journal WHERE id_utilisateur = ?`,
    )
    .get(idUtilisateur);
}

// Actions subies par un compte (rôle modifié, suspendu, signalé…).
export function actionsSubies(db, idUtilisateur) {
  return db
    .prepare(
      `SELECT action, COUNT(*) AS total FROM journal
       WHERE cible_type = 'utilisateur' AND cible_id = ? GROUP BY action ORDER BY total DESC`,
    )
    .all(idUtilisateur);
}

// Événements sensibles récents (tableau de bord).
export function evenementsSensibles(db, limite = 8) {
  return db
    .prepare(
      `SELECT * FROM journal WHERE categorie IN ('securite', 'administration', 'signalement')
       ORDER BY id DESC LIMIT ?`,
    )
    .all(limite);
}

// Dates et actions des N derniers jours, pour le graphique d'activité.
export function activiteDepuis(db, depuisIso) {
  return db.prepare('SELECT date, action FROM journal WHERE date >= ?').all(depuisIso);
}

/**
 * Notifications d'un compte, déduites du journal (aucune table en plus) :
 * j'aime et commentaires sur ses publications, nouveaux abonnés, messages reçus,
 * décisions de l'équipe le concernant.
 */
export function notificationsPour(db, idUtilisateur) {
  return db
    .prepare(
      `SELECT j.id, j.date, j.action, j.details, j.id_utilisateur AS acteur_id, j.nom_utilisateur AS acteur,
              j.cible_type, j.cible_id,
              CASE
                WHEN p.nom_fichier IS NULL THEN NULL
                WHEN p.type_fichier LIKE 'video/%' THEN '/uploads/videos/' || p.nom_fichier
                ELSE '/uploads/temp/' || p.nom_fichier
              END AS image,
              p.description
       FROM journal j
       LEFT JOIN publication p ON j.cible_type = 'publication' AND p.id = j.cible_id
       WHERE (j.id_utilisateur IS NULL OR j.id_utilisateur != :moi)
         AND ((j.action IN ('like_ajoute', 'commentaire_ajoute') AND p.id_utilisateur = :moi)
           OR (j.action IN ('abonnement_ajoute', 'message_envoye', 'role_modifie', 'publication_moderee',
                            'compte_suspendu', 'suspension_levee')
               AND j.cible_type = 'utilisateur' AND j.cible_id = :moi))
       ORDER BY j.id DESC LIMIT 80`,
    )
    .all({ moi: idUtilisateur });
}
