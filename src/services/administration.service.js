/**
 * administration.service.js
 * ------------------------------------------------------------
 * Console d'administration : attribution des rôles, suspensions,
 * suppression de comptes, tableau de bord, journal et audit.
 * Les règles de protection (pas d'action sur soi-même ni sur un
 * autre administrateur) sont appliquées ici, pas dans l'interface.
 * ------------------------------------------------------------
 */
import * as administrationRepository from '../repositories/administration.repository.js';
import * as journalRepository from '../repositories/journal.repository.js';
import { trouverParId, definirRole } from '../repositories/utilisateur.repository.js';
import { ErreurMetier } from './erreurs.js';
import { journaliser, cibleCompte } from './journal.service.js';
import { supprimerMedia } from './medias.service.js';
import { mediasDUnCompte } from '../repositories/fil.repository.js';
import { ROLES } from '../config.js';

/**
 * Compte visé par une action d'administration.
 * Refuse : compte inconnu, soi-même, autre administrateur.
 */
function cibleAdministrable(db, req, id) {
  const cible = trouverParId(db, Number(id));
  if (!cible) throw new ErreurMetier('Utilisateur introuvable.', 404);
  if (cible.id === req.user.id) throw new ErreurMetier('Action impossible sur votre propre compte.');
  if (cible.role === 'admin') throw new ErreurMetier('Un compte administrateur est protégé : action impossible.', 403);
  return cible;
}

export function listerComptes(db) {
  return administrationRepository.listerComptesDetail(db);
}

// Nommer un modérateur ou lui retirer le rôle.
export function changerRole(db, req, id, role) {
  if (!ROLES.includes(role)) throw new ErreurMetier(`Rôle invalide, attendu : ${ROLES.join(', ')}`);
  const cible = cibleAdministrable(db, req, id);
  if (cible.role === role) throw new ErreurMetier('Ce compte a déjà ce rôle.');

  definirRole(db, cible.id, role);
  journaliser(db, req, 'role_modifie', { cible: cibleCompte(cible), details: `${cible.role} → ${role}` });
  return { id: cible.id, role };
}

// Suspendre : durée en jours (null = sans date de fin), raison obligatoire.
export function suspendre(db, req, id, { raison, jours }) {
  const texte = String(raison ?? '').trim();
  const duree = jours == null ? null : Number(jours);
  if (!texte) throw new ErreurMetier('La raison de la suspension est obligatoire.');
  if (duree !== null && !(Number.isInteger(duree) && duree >= 1 && duree <= 365)) {
    throw new ErreurMetier('Durée invalide (1 à 365 jours, ou sans date de fin).');
  }
  const cible = cibleAdministrable(db, req, id);
  const fin = duree === null ? null : new Date(Date.now() + duree * 86400000).toISOString();

  administrationRepository.suspendre(db, { idUtilisateur: cible.id, raison: texte, fin, idAdmin: req.user.id });
  journaliser(db, req, 'compte_suspendu', {
    cible: cibleCompte(cible),
    details: `${duree === null ? 'Sans date de fin' : `${duree} jour(s)`} — ${texte}`
  });
  return { fin };
}

export function leverSuspension(db, req, id) {
  const cible = cibleAdministrable(db, req, id);
  if (!administrationRepository.leverSuspension(db, cible.id)) {
    throw new ErreurMetier('Ce compte n’est pas suspendu.', 404);
  }
  journaliser(db, req, 'suspension_levee', { cible: cibleCompte(cible) });
}

// Suppression définitive : raison obligatoire, tout est effacé en une transaction.
export function supprimerCompte(db, req, id, raison) {
  const texte = String(raison ?? '').trim();
  if (!texte) throw new ErreurMetier('La raison de la suppression est obligatoire.');
  const cible = cibleAdministrable(db, req, id);
  const medias = mediasDUnCompte(db, cible.id);   // relevé avant la suppression en base

  try {
    administrationRepository.supprimerCompte(db, cible.id, (bilan) => {
      journaliser(db, req, 'compte_supprime', {
        cible: cibleCompte(cible),
        details: `${texte} — supprimés : ${bilan.publications} publication(s), `
          + `${bilan.commentaires} commentaire(s), ${bilan.messages} message(s)`
      });
    });
  } catch (err) {
    console.error(err);
    throw new ErreurMetier('La suppression a échoué, rien n’a été modifié.', 500);
  }

  // La base est à jour : on peut retirer les photos et vidéos du disque.
  for (const media of medias) supprimerMedia(media.nom_fichier, media.type_fichier);
}

// ── Tableau de bord ──────────────────────────────────────────

export function tableauDeBord(db) {
  const maintenant = new Date();
  const ilYa = (jours) => new Date(maintenant.getTime() - jours * 86400000).toISOString();

  const chiffres = administrationRepository.chiffresCles(db, { ilYa7j: ilYa(7), ilYa24h: ilYa(1) });

  // Regroupement par jour, en heure locale du serveur
  const jourLocal = (iso) => new Date(iso).toLocaleDateString('sv-SE');
  const activite = [];
  for (let i = 13; i >= 0; i--) {
    activite.push({ jour: jourLocal(new Date(maintenant.getTime() - i * 86400000)), actions: 0, connexions: 0, publications: 0 });
  }
  const parJour = Object.fromEntries(activite.map((a) => [a.jour, a]));
  for (const { date, action } of journalRepository.activiteDepuis(db, ilYa(14))) {
    const jour = parJour[jourLocal(date)];
    if (!jour) continue;
    jour.actions++;
    if (action === 'connexion') jour.connexions++;
    if (action === 'publication_creee') jour.publications++;
  }

  return {
    chiffres,
    activite,
    evenements: journalRepository.evenementsSensibles(db),
    aSurveiller: administrationRepository.comptesASurveiller(db)
  };
}

export function journal(db, filtres) {
  const limite = Math.min(Number(filtres.limite) || 100, 1000);
  return journalRepository.listerJournal(db, { ...filtres, limite });
}

// Audit d'un profil : fiche, volume d'actions par catégorie, actions subies.
export function audit(db, id) {
  const compte = administrationRepository.ficheAudit(db, Number(id));
  if (!compte) throw new ErreurMetier('Utilisateur introuvable.', 404);
  return {
    compte,
    parCategorie: journalRepository.compterParCategorie(db, compte.id),
    subies: journalRepository.actionsSubies(db, compte.id),
    ...journalRepository.bornesActivite(db, compte.id)
  };
}
