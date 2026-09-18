/**
 * erreurs.js
 * ------------------------------------------------------------
 * Erreur « métier » partagée par les services : le service
 * décide du statut HTTP, la route n'a qu'à le transmettre.
 * (même principe que ErreurAuth dans auth.service.js)
 * ------------------------------------------------------------
 */
export class ErreurMetier extends Error {
  constructor(message, statut = 400) {
    super(message);
    this.name = 'ErreurMetier';
    this.statut = statut;
  }
}

// Petit raccourci pour les routes : renvoie le bon statut et le message.
export function repondreErreur(res, err) {
  if (!(err instanceof ErreurMetier)) console.error(err);
  res.status(err.statut ?? 500).json({ error: err.statut ? err.message : 'Erreur interne du serveur.' });
}
