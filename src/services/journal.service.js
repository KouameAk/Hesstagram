/**
 * journal.service.js
 * ------------------------------------------------------------
 * Chaque action significative laisse une trace horodatée. Elle
 * sert à trois écrans : le journal du site, l'audit par profil
 * et les notifications des membres.
 * ------------------------------------------------------------
 */
import * as journalRepository from '../repositories/journal.repository.js';

// Catégorie de chaque action : c'est elle qui alimente les filtres de la console.
export const ACTIONS = {
  inscription: 'authentification',
  connexion: 'authentification',
  deconnexion: 'authentification',
  compte_ferme: 'authentification',
  connexion_echouee: 'securite',
  connexion_refusee: 'securite',
  acces_refuse: 'securite',
  mdp_modifie: 'securite',
  publication_creee: 'contenu',
  publication_supprimee: 'contenu',
  commentaire_ajoute: 'contenu',
  like_ajoute: 'contenu',
  like_retire: 'contenu',
  dislike_ajoute: 'contenu',
  dislike_retire: 'contenu',
  abonnement_ajoute: 'social',
  abonnement_retire: 'social',
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

/**
 * Notifications d'un membre. Un j'aime retiré puis remis, ou un abonnement
 * refait, ne doit produire qu'une seule notification : on garde la plus récente.
 */
export function notifications(db, idUtilisateur) {
  const lignes = journalRepository.notificationsPour(db, idUtilisateur);
  const vues = new Set();
  return lignes
    .filter((n) => {
      if (!['like_ajoute', 'abonnement_ajoute'].includes(n.action)) return true;
      const cle = `${n.action}:${n.acteur_id}:${n.cible_id}`;
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    })
    .slice(0, 50);
}
