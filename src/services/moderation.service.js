/**
 * moderation.service.js
 * ------------------------------------------------------------
 * Signalements : dépôt par un membre, file de traitement et
 * clôture des dossiers par la modération.
 * ------------------------------------------------------------
 */
import * as moderationRepository from '../repositories/moderation.repository.js';
import { trouverParId } from '../repositories/utilisateur.repository.js';
import { ErreurMetier } from './erreurs.js';
import { journaliser, cibleCompte } from './journal.service.js';

const LONGUEUR_RAISON = 500;

// Dépôt d'un signalement par n'importe quel membre connecté.
export function signaler(db, req, { idSignale, raison }) {
  const texte = String(raison ?? '').trim();
  const cibleId = Number(idSignale);
  if (!cibleId || !texte) throw new ErreurMetier('Utilisateur et raison obligatoires.');
  if (texte.length > LONGUEUR_RAISON) throw new ErreurMetier(`Raison trop longue (${LONGUEUR_RAISON} caractères maximum).`);
  if (cibleId === req.user.id) throw new ErreurMetier('Impossible de se signaler soi-même.');

  const signale = trouverParId(db, cibleId);
  if (!signale) throw new ErreurMetier('Utilisateur introuvable.', 404);

  const id = moderationRepository.creerSignalement(db, {
    idSignale: cibleId,
    idSignalant: req.user.id,
    raison: texte
  });
  journaliser(db, req, 'signalement_cree', {
    cible: cibleCompte(signale),
    details: `Signalement n°${id} — ${texte}`
  });
  return { id };
}

export function file(db) {
  return moderationRepository.listerSignalements(db);
}

// Clore un dossier : le signalement quitte la file, la décision reste au journal.
export function clore(db, req, idSignalement, decision) {
  const signalement = moderationRepository.trouverSignalement(db, idSignalement);
  if (!signalement) throw new ErreurMetier('Signalement introuvable.', 404);

  moderationRepository.supprimerSignalement(db, signalement.id);
  journaliser(db, req, 'signalement_classe', {
    cible: { type: 'utilisateur', id: signalement.id_signale, nom: signalement.signale },
    details: `Signalement n°${signalement.id} (par ${signalement.signalant}) ${String(decision ?? '').trim() || 'classé sans suite'} — ${signalement.raison}`
  });
}
