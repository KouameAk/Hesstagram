/**
 * fil.service.js
 * ------------------------------------------------------------
 * Logique métier du fil d'actualité : publier, supprimer,
 * commenter. Vérifie les droits, écrit au journal, ne
 * contient ni SQL (repositories/) ni route Express (routes/).
 * ------------------------------------------------------------
 */
import * as filRepository from '../repositories/fil.repository.js';
import { ErreurMetier } from './erreurs.js';
import { journaliser, extrait, ciblePublication } from './journal.service.js';
import { MEDIAS_ACTIFS } from '../config.js';

const LONGUEUR_PUBLICATION = 2200;
const LONGUEUR_COMMENTAIRE = 500;

export function lireFil(db, moi, filtres) {
  return filRepository.listerPublications(db, moi, filtres);
}

export function publier(db, req, { description, media }) {
  const texte = String(description ?? '').trim();

  // Photos et vidéos en pause : l'interface garde les boutons, l'API refuse.
  if (media && !MEDIAS_ACTIFS) {
    throw new ErreurMetier('La publication de photos et de vidéos est désactivée pour le moment.', 503);
  }
  if (!texte) throw new ErreurMetier('Écrivez un message avant de publier.');
  if (texte.length > LONGUEUR_PUBLICATION) {
    throw new ErreurMetier(`Publication trop longue (${LONGUEUR_PUBLICATION} caractères maximum).`);
  }

  const id = filRepository.creerPublication(db, { idUtilisateur: req.user.id, description: texte });
  filRepository.enregistrerHashtags(db, id, texte);
  journaliser(db, req, 'publication_creee', {
    cible: { type: 'publication', id, nom: req.user.nom },
    details: extrait(texte)
  });
  return { id };
}

export function supprimer(db, req, idPublication) {
  const publication = filRepository.trouverPublicationAvecAuteur(db, idPublication);
  if (!publication) throw new ErreurMetier('Publication introuvable.', 404);

  const parAuteur = publication.auteur_id === req.user.id;
  const estStaff = req.user.role === 'modo' || req.user.role === 'admin';
  if (!parAuteur && !estStaff) throw new ErreurMetier('Vous ne pouvez pas supprimer cette publication.', 403);

  filRepository.supprimerPublication(db, publication.id);

  if (parAuteur) {
    journaliser(db, req, 'publication_supprimee', {
      cible: ciblePublication(publication),
      details: extrait(publication.description)
    });
  } else {
    // Retrait par la modération : tracé au nom du compte visé, qui sera notifié.
    const raison = String(req.body?.raison ?? '').trim() || 'Contenu contraire aux règles';
    journaliser(db, req, 'publication_moderee', {
      cible: { type: 'utilisateur', id: publication.auteur_id, nom: publication.auteur },
      details: `Publication n°${publication.id} retirée — ${raison} — « ${extrait(publication.description, 60)} »`
    });
  }
}

export function commenter(db, req, idPublication, commentaire) {
  const texte = String(commentaire ?? '').trim();
  if (!texte) throw new ErreurMetier('Le commentaire est vide.');
  if (texte.length > LONGUEUR_COMMENTAIRE) {
    throw new ErreurMetier(`Commentaire trop long (${LONGUEUR_COMMENTAIRE} caractères maximum).`);
  }
  const publication = filRepository.trouverPublicationAvecAuteur(db, idPublication);
  if (!publication) throw new ErreurMetier('Publication introuvable.', 404);

  filRepository.ajouterCommentaire(db, { idPublication: publication.id, idUtilisateur: req.user.id, commentaire: texte });
  journaliser(db, req, 'commentaire_ajoute', { cible: ciblePublication(publication), details: extrait(texte) });
}
