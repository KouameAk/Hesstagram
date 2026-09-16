/**
 * utilisateur.repository.js
 * ------------------------------------------------------------
 * Seul endroit du projet où on a le droit d'écrire du SQL pour
 * la table `utilisateur`. Chaque fonction reçoit la connexion
 * `db` en paramètre (ouverte une seule fois au démarrage, voir
 * bdd/connexion.js) et fait une requête, rien d'autre.
 * ------------------------------------------------------------
 */

// Cherche un utilisateur par son nom.
// Utilisé à la fois pour la connexion (récupérer le hash à
// comparer) et pour l'inscription (vérifier que le nom est libre).
export function trouverParNom(db, nom) {
  return db.prepare('SELECT * FROM utilisateur WHERE nom = ?').get(nom);
}

// Cherche un utilisateur par son identifiant (vérification de session,
// cible d'une action d'administration...).
export function trouverParId(db, id) {
  return db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(id);
}

// Crée un nouvel utilisateur. Le mot de passe est déjà hashé
// en amont, ce fichier ne fait que la requête.
export function creerUtilisateur(db, { nom, mdpHash, date, role }) {
  return db
    .prepare('INSERT INTO utilisateur (nom, mdp, date, role) VALUES (?, ?, ?, ?)')
    .run(nom, mdpHash, date, role);
}

export function listerUtilisateurs(db) {
  return db.prepare('SELECT id, nom, role FROM utilisateur ORDER BY nom').all();
}

export function definirRole(db, userId, role) {
  db.prepare('UPDATE utilisateur SET role = ? WHERE id = ?').run(role, userId);
}

// Remplace le hash du mot de passe (page Paramètres).
export function definirMotDePasse(db, userId, mdpHash) {
  db.prepare('UPDATE utilisateur SET mdp = ? WHERE id = ?').run(mdpHash, userId);
}

// Annuaire visible par tout membre connecté : jamais le mot de passe.
export function listerComptes(db) {
  return db
    .prepare(
      `SELECT u.id, u.nom, u.role, u.date,
              (SELECT COUNT(*) FROM publication p WHERE p.id_utilisateur = u.id) AS nb_publications
       FROM utilisateur u
       ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'modo' THEN 1 ELSE 2 END, u.nom`,
    )
    .all();
}
