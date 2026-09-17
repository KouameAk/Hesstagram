/**
 * compte.service.js
 * ------------------------------------------------------------
 * Page « Mon compte » : changement de mot de passe et fermeture
 * de son propre compte. Mêmes règles que l'inscription du groupe
 * (auth.service.js), avec le plafond de 64 caractères en plus.
 * ------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import * as comptesRepository from '../repositories/comptes.repository.js';
import * as administrationRepository from '../repositories/administration.repository.js';
import { mediasDUnCompte } from '../repositories/fil.repository.js';
import { ErreurMetier } from './erreurs.js';
import { journaliser } from './journal.service.js';
import { supprimerMedia } from './medias.service.js';
import { MDP_MIN, MDP_MAX } from '../config.js';

export function verifierMotDePasse(mdp) {
  if (mdp.length < MDP_MIN) {
    throw new ErreurMetier(`Le mot de passe doit contenir au moins ${MDP_MIN} caractères.`);
  }
  if (mdp.length > MDP_MAX) {
    throw new ErreurMetier(`Le mot de passe ne doit pas dépasser ${MDP_MAX} caractères.`);
  }
}

// L'ancien mot de passe est exigé ; le nouveau suit les règles de l'inscription.
export async function changerMotDePasse(db, req, { ancien, nouveau }) {
  const user = comptesRepository.trouverParId(db, req.user.id);
  if (!user || !(await bcrypt.compare(String(ancien ?? ''), user.mdp))) {
    throw new ErreurMetier('Mot de passe actuel incorrect.');
  }
  const mdp = String(nouveau ?? '');
  verifierMotDePasse(mdp);
  if (mdp === ancien) {
    throw new ErreurMetier('Le nouveau mot de passe doit être différent de l’ancien.');
  }

  comptesRepository.definirMotDePasse(db, user.id, await bcrypt.hash(mdp, 10));
  journaliser(db, req, 'mdp_modifie');
}

/**
 * Fermeture de son propre compte : mot de passe exigé.
 * Un administrateur ne peut pas se supprimer lui-même — sinon la plateforme
 * pourrait se retrouver sans administrateur.
 */
export async function fermerCompte(db, req, mdp) {
  const user = comptesRepository.trouverParId(db, req.user.id);
  if (!user || !(await bcrypt.compare(String(mdp ?? ''), user.mdp))) {
    throw new ErreurMetier('Mot de passe incorrect.');
  }
  if (user.role === 'admin') {
    throw new ErreurMetier('Un administrateur ne peut pas fermer son propre compte.', 403);
  }

  const medias = mediasDUnCompte(db, user.id);
  administrationRepository.supprimerCompte(db, user.id, (bilan) => {
    journaliser(db, req, 'compte_ferme', {
      details: `Fermé par l'utilisateur — ${bilan.publications} publication(s), ${bilan.messages} message(s)`
    });
  });
  for (const media of medias) supprimerMedia(media.nom_fichier, media.type_fichier);
}
