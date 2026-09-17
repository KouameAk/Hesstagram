/**
 * journal.service.js
 * ------------------------------------------------------------
 * Chaque action significative laisse une trace horodatée. Elle
 * alimente la console d'administration : tableau de bord, suivi
 * des décisions, journal du site et fiche d'un compte.
 * ------------------------------------------------------------
 */
import * as journalRepository from '../repositories/journal.repository.js';

// Catégorie de chaque action : c'est elle qui alimente les filtres de la console.
export const ACTIONS = {
  inscription: 'authentification',
  connexion: 'authentification',
  compte_ferme: 'authentification',
  connexion_echouee: 'securite',
  connexion_refusee: 'securite',
  mdp_modifie: 'securite',
  publication_creee: 'contenu',
  publication_supprimee: 'contenu',
  like_ajoute: 'contenu',
  like_retire: 'contenu',
  dislike_ajoute: 'contenu',
  dislike_retire: 'contenu',
  signalement_cree: 'signalement',
  signalement_classe: 'signalement',
  publication_moderee: 'signalement',
  cle_publiee: 'messagerie',
  message_envoye: 'messagerie',
  role_modifie: 'administration',
  compte_suspendu: 'administration',
  suspension_levee: 'administration',
  compte_supprime: 'administration'
};

export const extrait = (texte, n = 80) => {
  const t = String(texte ?? '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

export const cibleCompte = (u) => ({ type: 'utilisateur', id: u.id, nom: u.nom });
export const ciblePublication = (p) => ({ type: 'publication', id: p.id, nom: p.auteur });

/**
 * Écrit une ligne de journal.
 *   acteur : compte qui agit (req.user par défaut)
 *   cible  : { type, id, nom } — compte ou publication concernée
 */
export function journaliser(db, req, action, { acteur = req?.user, cible = null, details = null } = {}) {
  journalRepository.enregistrerLigne(db, {
    date: new Date().toISOString(),
    idUtilisateur: acteur?.id ?? null,
    nomUtilisateur: acteur?.nom ?? null,
    roleUtilisateur: acteur?.role ?? null,
    categorie: ACTIONS[action] ?? 'autre',
    action,
    cibleType: cible?.type ?? null,
    cibleId: cible?.id ?? null,
    cibleNom: cible?.nom ?? null,
    details,
    ip: req?.ip ?? null
  });
}
