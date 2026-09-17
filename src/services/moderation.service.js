/**
 * moderation.service.js
 * ------------------------------------------------------------
 * Signalements : dépôt par un membre (depuis une publication du
 * fil), file de traitement et clôture des dossiers.
 * ------------------------------------------------------------
 */
import * as signalementsRepository from '../repositories/signalements.repository.js';
import { trouverParId } from '../repositories/comptes.repository.js';
import { trouverPublicationAvecAuteur } from '../repositories/fil.repository.js';
import { ErreurMetier } from './erreurs.js';
import { journaliser, cibleCompte, extrait } from './journal.service.js';

const LONGUEUR_RAISON = 500;

/**
 * Dépôt d'un signalement par n'importe quel membre connecté.
 * La table `signalement` vise un compte : quand on signale une publication,
 * c'est son auteur qui est signalé, et la publication est rappelée dans la raison.
 */
export function signaler(db, req, { idSignale, idPublication, raison }) {
  let texte = String(raison ?? '').trim();
  if (!texte) throw new ErreurMetier('Le motif du signalement est obligatoire.');
  if (texte.length > LONGUEUR_RAISON) throw new ErreurMetier(`Motif trop long (${LONGUEUR_RAISON} caractères maximum).`);

  let cibleId = Number(idSignale);
  if (idPublication) {
    const publication = trouverPublicationAvecAuteur(db, Number(idPublication));
    if (!publication) throw new ErreurMetier('Publication introuvable.', 404);
    cibleId = publication.auteur_id;
    texte = `${texte} — publication n°${publication.id}${publication.description ? ` « ${extrait(publication.description, 60)} »` : ''}`;
  }

  if (!cibleId) throw new ErreurMetier('Compte ou publication à signaler manquant.');
  if (cibleId === req.user.id) throw new ErreurMetier('Impossible de vous signaler vous-même.');

  const signale = trouverParId(db, cibleId);
  if (!signale) throw new ErreurMetier('Utilisateur introuvable.', 404);

  const id = signalementsRepository.creerSignalement(db, {
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
  return signalementsRepository.listerSignalements(db);
}

// Clore un dossier : le signalement quitte la file, la décision reste au journal.
export function clore(db, req, idSignalement, decision) {
  const signalement = signalementsRepository.trouverSignalement(db, idSignalement);
  if (!signalement) throw new ErreurMetier('Signalement introuvable.', 404);

  signalementsRepository.supprimerSignalement(db, signalement.id);
  journaliser(db, req, 'signalement_classe', {
    cible: { type: 'utilisateur', id: signalement.id_signale, nom: signalement.signale },
    details: `Signalement n°${signalement.id} (par ${signalement.signalant}) ${String(decision ?? '').trim() || 'classé sans suite'} — ${signalement.raison}`
  });
}
