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