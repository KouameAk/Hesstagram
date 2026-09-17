/**
 * fil.service.js
 * ------------------------------------------------------------
 * Logique métier du fil d'actualité : lecture et retrait d'une
 * publication. L'envoi des photos et vidéos reste dans les routes
 * du groupe (publication.routes.js), les j'aime / je n'aime pas
 * dans likes.routes.js et dislikes.routes.js.
 * ------------------------------------------------------------
 */
import * as filRepository from '../repositories/fil.repository.js';
import { ErreurMetier } from './erreurs.js';
import { journaliser, extrait, ciblePublication } from './journal.service.js';
import { supprimerMedia } from './medias.service.js';

export function lireFil(db, moi, filtres) {
  return filRepository.listerPublications(db, moi, filtres);
}

// L'auteur retire sa publication ; un modérateur ou un admin peut retirer
// celle d'un autre compte (motif inscrit au journal).
export function supprimer(db, req, idPublication) {
  const publication = filRepository.trouverPublicationAvecAuteur(db, idPublication);
  if (!publication) throw new ErreurMetier('Publication introuvable.', 404);

  const parAuteur = publication.auteur_id === req.user.id;
  const estStaff = req.user.role === 'modo' || req.user.role === 'admin';
  if (!parAuteur && !estStaff) throw new ErreurMetier('Vous ne pouvez pas retirer cette publication.', 403);

  filRepository.supprimerPublication(db, publication.id);
  supprimerMedia(publication.nom_fichier, publication.type_fichier);   // photo ou vidéo sur le disque

  if (parAuteur) {
    journaliser(db, req, 'publication_supprimee', {
      cible: ciblePublication(publication),
      details: extrait(publication.description)
    });
  } else {
    const raison = String(req.body?.raison ?? '').trim() || 'Contenu contraire aux règles';
    journaliser(db, req, 'publication_moderee', {
      cible: { type: 'utilisateur', id: publication.auteur_id, nom: publication.auteur },
      details: `Publication n°${publication.id} retirée — ${raison} — « ${extrait(publication.description, 60)} »`
    });
  }
}
