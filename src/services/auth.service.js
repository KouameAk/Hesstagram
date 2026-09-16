/**
 * auth.service.js
 * ------------------------------------------------------------
 * Logique métier de l'authentification : vérifications, hash
 * du mot de passe, génération du token. Aucune requête SQL ici
 * (ça, c'est repositories/), aucune route Express ici (ça,
 * c'est routes/).
 * ------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as utilisateurRepository from '../repositories/utilisateur.repository.js';
import * as administrationRepository from '../repositories/administration.repository.js';
import { journaliser } from './journal.service.js';
import { supprimerMedia } from './medias.service.js';
import { mediasDUnCompte } from '../repositories/fil.repository.js';
import { NOM_MIN, NOM_MAX, MDP_MIN, MDP_MAX, MOTIF_NOM } from '../config.js';

// Clé secrète utilisée pour signer les tokens de connexion.
// Une valeur par défaut est fournie pour que le projet fonctionne
// sans configuration supplémentaire (pas besoin de fichier .env).
const JWT_SECRET = process.env.JWT_SECRET || 'secret_temporaire_hesstagram';

// Erreur "métier" : le service décide du statut HTTP à renvoyer,
// la route n'a qu'à le transmettre tel quel.
export class ErreurAuth extends Error {
  constructor(message, statut) {
    super(message);
    this.statut = statut;
  }
}

// Règles du mot de passe : au moins 12 caractères (exigence du projet) et pas
// plus de 64, comme sur les sites professionnels — au-delà, bcrypt ignorerait
// la fin du mot de passe.
function verifierMotDePasse(mdp) {
  if (mdp.length < MDP_MIN) {
    throw new ErreurAuth(`Le mot de passe doit contenir au moins ${MDP_MIN} caractères.`, 400);
  }
  if (mdp.length > MDP_MAX) {
    throw new ErreurAuth(`Le mot de passe ne doit pas dépasser ${MDP_MAX} caractères.`, 400);
  }
}

/**
 * Inscrit un nouvel utilisateur.
 *   1. Vérifie que nom et mdp sont fournis
 *   2. Vérifie la forme du nom (3 à 20 caractères autorisés)
 *   3. Vérifie la longueur du mot de passe (12 à 64 caractères)
 *   4. Vérifie que ce nom d'utilisateur n'est pas déjà pris
 *   5. Hash le mot de passe (jamais stocké en clair en base)
 *   6. Insère le nouvel utilisateur (role "user" par défaut)
 */
export async function inscrire(db, { nom, mdp }, req) {
  if (!nom || !mdp) {
    throw new ErreurAuth("Nom d'utilisateur et mot de passe requis.", 400);
  }
  if (nom.length < NOM_MIN || nom.length > NOM_MAX) {
    throw new ErreurAuth(`Le nom d'utilisateur doit faire entre ${NOM_MIN} et ${NOM_MAX} caractères.`, 400);
  }
  if (!MOTIF_NOM.test(nom)) {
    throw new ErreurAuth("Le nom d'utilisateur ne peut contenir que lettres, chiffres, point, tiret et _.", 400);
  }
  verifierMotDePasse(mdp);

  const existant = utilisateurRepository.trouverParNom(db, nom);
  if (existant) {
    throw new ErreurAuth("Ce nom d'utilisateur est déjà pris.", 409);
  }

  const mdpHash = await bcrypt.hash(mdp, 10);
  const date = new Date().toISOString();
  const result = utilisateurRepository.creerUtilisateur(db, { nom, mdpHash, date, role: 'user' });

  const user = { id: Number(result.lastInsertRowid), nom, role: 'user' };
  journaliser(db, req, 'inscription', { acteur: user });
  return user;
}

/**
 * Connecte un utilisateur existant.
 *   1. Vérifie que nom et mdp sont fournis
 *   2. Cherche l'utilisateur en base par son nom
 *   3. Compare le mot de passe envoyé avec le hash stocké
 *   4. Refuse les comptes suspendus (avec la raison et la date de fin)
 *   5. Si tout est bon, génère un token JWT (valable 24h)
 */
export async function connecter(db, { nom, mdp }, req) {
  if (!nom || !mdp) {
    throw new ErreurAuth("Nom d'utilisateur et mot de passe requis.", 400);
  }

  const user = utilisateurRepository.trouverParNom(db, nom);

  // Même message pour "utilisateur inconnu" et "mdp incorrect"
  // (ne pas donner d'indice à un attaquant sur ce qui a échoué)
  if (!user) {
    journaliser(db, req, 'connexion_echouee', {
      acteur: { id: null, nom, role: null },
      details: 'Compte inconnu'
    });
    throw new ErreurAuth('Identifiants incorrects.', 401);
  }

  const mdpValide = await bcrypt.compare(mdp, user.mdp);
  if (!mdpValide) {
    journaliser(db, req, 'connexion_echouee', { acteur: user, details: 'Mot de passe incorrect' });
    throw new ErreurAuth('Identifiants incorrects.', 401);
  }

  const suspension = administrationRepository.suspensionActive(db, user.id);
  if (suspension || user.banni) {
    journaliser(db, req, 'connexion_refusee', { acteur: user, details: 'Compte suspendu' });
    const jusqua = suspension?.fin
      ? `jusqu'au ${new Date(suspension.fin).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
      : 'sans date de fin';
    throw new ErreurAuth(
      `Compte suspendu ${jusqua}.${suspension?.raison ? ` Raison : ${suspension.raison}` : ''}`,
      403
    );
  }

  const token = jwt.sign(
    { id: user.id, nom: user.nom, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  journaliser(db, req, 'connexion', { acteur: user });
  return { token, user: { id: user.id, nom: user.nom, role: user.role, date: user.date } };
}

/**
 * Change le mot de passe du compte connecté : l'ancien est exigé,
 * le nouveau suit les mêmes règles que celles de l'inscription.
 */
export async function changerMotDePasse(db, req, { ancien, nouveau }) {
  const user = utilisateurRepository.trouverParId(db, req.user.id);
  if (!user || !(await bcrypt.compare(String(ancien ?? ''), user.mdp))) {
    throw new ErreurAuth('Mot de passe actuel incorrect.', 400);
  }
  verifierMotDePasse(String(nouveau ?? ''));
  if (ancien === nouveau) {
    throw new ErreurAuth('Le nouveau mot de passe doit être différent de l’ancien.', 400);
  }

  utilisateurRepository.definirMotDePasse(db, user.id, await bcrypt.hash(nouveau, 10));
  journaliser(db, req, 'mdp_modifie');
}

/**
 * Fermeture de son propre compte (page Paramètres) : mot de passe exigé.
 * Un administrateur ne peut pas se supprimer lui-même — sinon la plateforme
 * pourrait se retrouver sans administrateur.
 */
export async function fermerCompte(db, req, mdp) {
  const user = utilisateurRepository.trouverParId(db, req.user.id);
  if (!user || !(await bcrypt.compare(String(mdp ?? ''), user.mdp))) {
    throw new ErreurAuth('Mot de passe incorrect.', 400);
  }
  if (user.role === 'admin') {
    throw new ErreurAuth('Un administrateur ne peut pas fermer son propre compte.', 403);
  }

  const medias = mediasDUnCompte(db, user.id);
  administrationRepository.supprimerCompte(db, user.id, (bilan) => {
    journaliser(db, req, 'compte_ferme', {
      details: `Fermé par l'utilisateur — ${bilan.publications} publication(s), ${bilan.messages} message(s)`
    });
  });
  for (const media of medias) supprimerMedia(media.nom_fichier, media.type_fichier);
}
