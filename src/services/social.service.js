/**
 * social.service.js
 * ------------------------------------------------------------
 * Profils, abonnements, recherche, tendances, notifications.
 * ------------------------------------------------------------
 */
import * as socialRepository from '../repositories/social.repository.js';
import * as filRepository from '../repositories/fil.repository.js';
import { trouverParId } from '../repositories/utilisateur.repository.js';
import { ErreurMetier } from './erreurs.js';
import { journaliser, cibleCompte } from './journal.service.js';

export function profil(db, moi, id) {
  const fiche = socialRepository.profil(db, moi, id);
  if (!fiche) throw new ErreurMetier('Ce compte n’existe pas ou a été supprimé.', 404);
  return fiche;
}

export function relations(db, moi, id, type) {
  return socialRepository.relations(db, moi, id, type === 'abonnements' ? 'abonnements' : 'abonnes');
}

// Suivre / ne plus suivre (bascule)
export function basculerAbonnement(db, req, idCible) {
  const cible = trouverParId(db, idCible);
  if (!cible) throw new ErreurMetier('Utilisateur introuvable.', 404);
  if (cible.id === req.user.id) throw new ErreurMetier('Impossible de vous suivre vous-même.');

  const deja = socialRepository.estAbonne(db, req.user.id, cible.id);
  if (deja) socialRepository.retirerAbonnement(db, req.user.id, cible.id);
  else socialRepository.ajouterAbonnement(db, req.user.id, cible.id);

  journaliser(db, req, deja ? 'abonnement_retire' : 'abonnement_ajoute', { cible: cibleCompte(cible) });
  return { abonne: !deja };
}

export function suggestions(db, moi) {
  return socialRepository.suggestions(db, moi);
}

export function rechercher(db, moi, requete) {
  const q = String(requete ?? '').trim().replace(/^[@#]/, '');
  if (!q) return { comptes: [], hashtags: [] };
  return {
    comptes: socialRepository.chercherComptes(db, moi, q),
    hashtags: filRepository.chercherHashtags(db, q)
  };
}

export function tendances(db) {
  return filRepository.tendances(db);
}
