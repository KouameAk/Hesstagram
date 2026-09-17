/**
 * session.middleware.js
 * ------------------------------------------------------------
 * Contrôle de session de l'interface intégrée, placé DEVANT les
 * routes /api (celles du groupe comme les nouvelles) :
 *
 *   - la signature du token est vérifiée (jwt.verify) : un token
 *     fabriqué à la main est refusé avant d'atteindre une route ;
 *   - le compte est relu en base à chaque requête : supprimé → 401,
 *     suspendu ou banni → 403 avec la raison, rôle modifié depuis
 *     la connexion → 401 (il faut se reconnecter) ;
 *   - req.user est posé à partir de la base, pas du token.
 *
 * Sans en-tête Authorization, la requête continue telle quelle :
 * chaque route décide si elle exige une connexion (verifierToken
 * du groupe, ou exigerSession ci-dessous).
 * ------------------------------------------------------------
 */
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { trouverParId } from '../repositories/comptes.repository.js';
import { suspensionActive, nettoyerSuspensionExpiree } from '../repositories/administration.repository.js';

// Texte affiché à un compte bloqué (connexion refusée ou session coupée).
export function messageSuspension(suspension) {
  const fin = suspension?.fin
    ? `jusqu'au ${new Date(suspension.fin).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
    : 'sans date de fin';
  return `Compte suspendu ${fin}.${suspension?.raison ? ` Raison : ${suspension.raison}` : ''}`;
}

// État de blocage d'un compte : suspension de la console ou bannissement (écran du groupe).
export function blocageDuCompte(db, utilisateur) {
  nettoyerSuspensionExpiree(db, utilisateur.id);
  const suspension = suspensionActive(db, utilisateur.id);
  const banni = Boolean(db.prepare('SELECT banni FROM utilisateur WHERE id = ?').get(utilisateur.id)?.banni);
  return suspension || banni ? { suspension, message: messageSuspension(suspension) } : null;
}

export function controleSession(db) {
  return function (req, res, next) {
    // Connexion et inscription : un ancien token resté dans le navigateur ne
    // doit pas empêcher de se reconnecter.
    if (req.path.startsWith('/auth/') || req.path === '/config') return next();

    const entete = req.headers.authorization;
    if (!entete) return next();

    let contenu;
    try {
      contenu = jwt.verify(entete.split(' ')[1], JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Session expirée ou invalide, reconnectez-vous.' });
    }

    const utilisateur = trouverParId(db, contenu.id);
    if (!utilisateur) {
      return res.status(401).json({ error: 'Ce compte n’existe plus.' });
    }

    const blocage = blocageDuCompte(db, utilisateur);
    if (blocage) {
      return res.status(403).json({ error: blocage.message, suspendu: true });
    }

    // Les routes du groupe lisent le rôle dans le token : s'il a changé depuis la
    // connexion, on demande de se reconnecter pour obtenir un token à jour.
    if (contenu.role !== utilisateur.role) {
      return res.status(401).json({ error: 'Votre rôle a changé : reconnectez-vous.' });
    }

    req.user = { id: utilisateur.id, nom: utilisateur.nom, role: utilisateur.role, date: utilisateur.date };
    next();
  };
}

// À placer sur une route : exige une session valide (posée par controleSession).
export function exigerSession(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Connexion requise.' });
  }
  next();
}

// À placer après exigerSession : restreint la route à certains rôles.
export function exigerRoles(...roles) {
  return function (req, res, next) {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Droits insuffisants.' });
    }
    next();
  };
}
