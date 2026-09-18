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

/**
 * Inscrit un nouvel utilisateur.
 *   1. Vérifie que nom et mdp sont fournis
 *   2. Vérifie que le mot de passe fait au moins 12 caractères
 *   3. Vérifie que ce nom d'utilisateur n'est pas déjà pris
 *   4. Hash le mot de passe (jamais stocké en clair en base)
 *   5. Insère le nouvel utilisateur (role "user" par défaut)
 */
export async function inscrire(db, { nom, mdp }) {
  if (!nom || !mdp) {
    throw new ErreurAuth("Nom d'utilisateur et mot de passe requis.", 400);
  }
  if (mdp.length < 12) {
    throw new ErreurAuth('Le mot de passe doit contenir au moins 12 caractères.', 400);
  }

  const existant = utilisateurRepository.trouverParNom(db, nom);
  if (existant) {
    throw new ErreurAuth("Ce nom d'utilisateur est déjà pris.", 409);
  }

  const mdpHash = await bcrypt.hash(mdp, 10);
  const date = new Date().toISOString();
  const result = utilisateurRepository.creerUtilisateur(db, { nom, mdpHash, date, role: 'user' });

  return { id: result.lastInsertRowid, nom, role: 'user' };
}

/**
 * Connecte un utilisateur existant.
 *   1. Vérifie que nom et mdp sont fournis
 *   2. Cherche l'utilisateur en base par son nom
 *   3. Compare le mot de passe envoyé avec le hash stocké
 *   4. Si tout est bon, génère un token JWT (valable 24h)
 */
export async function connecter(db, { nom, mdp }) {
  if (!nom || !mdp) {
    throw new ErreurAuth("Nom d'utilisateur et mot de passe requis.", 400);
  }

  const user = utilisateurRepository.trouverParNom(db, nom);

  // Même message pour "utilisateur inconnu" et "mdp incorrect"
  // (ne pas donner d'indice à un attaquant sur ce qui a échoué)
  if (!user) {
    throw new ErreurAuth('Identifiants incorrects.', 401);
  }

  const mdpValide = await bcrypt.compare(mdp, user.mdp);
  if (!mdpValide) {
    throw new ErreurAuth('Identifiants incorrects.', 401);
  }

  const token = jwt.sign(
    { id: user.id, nom: user.nom, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { token, user: { id: user.id, nom: user.nom, role: user.role } };
}