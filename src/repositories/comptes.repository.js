/**
 * comptes.repository.js
 * ------------------------------------------------------------
 * Compléments SQL sur la table `utilisateur` pour l'interface
 * intégrée (utilisateur.repository.js, du groupe, reste inchangé).
 * ------------------------------------------------------------
 */

// Cherche un utilisateur par son identifiant (contrôle de session, cible
// d'une action d'administration, destinataire d'un message…).
export function trouverParId(db, id) {
  return db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(id);
}

// Remplace le hash du mot de passe (page Mon compte).
export function definirMotDePasse(db, userId, mdpHash) {
  db.prepare('UPDATE utilisateur SET mdp = ? WHERE id = ?').run(mdpHash, userId);
}
