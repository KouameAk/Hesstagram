import jwt from 'jsonwebtoken';
import { trouverParId } from '../repositories/utilisateur.repository.js';
import { suspensionActive } from '../repositories/administration.repository.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_temporaire_hesstagram';

// Vérifie que l'utilisateur a bien envoyé un token pour se connecter.
export function verifierToken(req, res, next) {
  const entete = req.headers.authorization;

  if (!entete) {
    return res.status(401).json({ error: 'Connexion requise.' });
  }

  // L'en-tête ressemble à "Bearer eyJhbGciOi...", on ne garde que le token.
  const token = entete.split(' ')[1];

  // jwt.verify (et non jwt.decode) : sans vérifier la signature, n'importe qui
  // pourrait fabriquer un token « role: admin » et entrer dans la console.
  let utilisateur;
  try {
    utilisateur = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }

  req.user = utilisateur;
  next();
}

// À utiliser après verifierToken : bloque si ce n'est pas un admin.
export function estAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Droits insuffisants.' });
  }
  next();
}

// À utiliser après verifierToken : bloque si ce n'est ni un admin ni un modo.
export function estAdminOuModo(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'modo') {
    return res.status(403).json({ error: 'Droits insuffisants.' });
  }
  next();
}

/**
 * Relit le compte en base à chaque requête (le token, lui, est figé 24 h) :
 *   - compte supprimé  → 401, le navigateur repart sur la page de connexion ;
 *   - compte suspendu ou banni → 403 avec la raison ;
 *   - rôle changé entre-temps → c'est le rôle de la base qui fait foi.
 * S'utilise juste après verifierToken : [verifierToken, compteActif].
 */
export function creerCompteActif(db) {
  return function compteActif(req, res, next) {
    const utilisateur = trouverParId(db, req.user.id);
    if (!utilisateur) {
      return res.status(401).json({ error: 'Ce compte n’existe plus.' });
    }

    const suspension = suspensionActive(db, utilisateur.id);
    if (suspension || utilisateur.banni) {
      const fin = suspension?.fin
        ? `jusqu'au ${new Date(suspension.fin).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
        : 'sans date de fin';
      return res.status(403).json({
        error: `Compte suspendu ${fin}.${suspension?.raison ? ` Raison : ${suspension.raison}` : ''}`,
        suspendu: true
      });
    }

    req.user = { id: utilisateur.id, nom: utilisateur.nom, role: utilisateur.role, date: utilisateur.date };
    next();
  };
}
