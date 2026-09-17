/**
 * suivi.middleware.js
 * ------------------------------------------------------------
 * Compléments posés DEVANT les routes du groupe, sans modifier
 * leurs fichiers :
 *
 *   - inscription : règles de nom et plafond de 64 caractères ;
 *   - connexion   : refus des comptes suspendus ;
 *   - journal     : une fois la réponse du groupe envoyée, on
 *     écrit la trace (connexion, j'aime, publication, clé…).
 * ------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import { trouverParNom } from '../repositories/utilisateur.repository.js';
import { trouverPublicationAvecAuteur, dernierePublicationDe } from '../repositories/fil.repository.js';
import { journaliser, ciblePublication, extrait } from '../services/journal.service.js';
import { blocageDuCompte } from './session.middleware.js';
import { NOM_MIN, NOM_MAX, MDP_MIN, MDP_MAX, MOTIF_NOM } from '../config.js';

// Garde le corps JSON renvoyé par la route, puis appelle `apres` quand la
// réponse est partie (la route du groupe a fini son travail).
function quandTermine(res, apres) {
  const envoyerJson = res.json.bind(res);
  res.json = (corps) => {
    res.locals.corps = corps;
    return envoyerJson(corps);
  };
  res.on('finish', () => {
    try {
      apres(res.statusCode, res.locals.corps ?? {});
    } catch (err) {
      console.error('Journal : trace non écrite :', err);
    }
  });
}

// POST /api/auth/register
export function validerInscription(db) {
  return function (req, res, next) {
    const nom = String(req.body?.nom ?? '').trim();
    const mdp = String(req.body?.mdp ?? '');

    if (nom && (nom.length < NOM_MIN || nom.length > NOM_MAX)) {
      return res.status(400).json({ error: `Le nom d'utilisateur doit faire entre ${NOM_MIN} et ${NOM_MAX} caractères.` });
    }
    if (nom && !MOTIF_NOM.test(nom)) {
      return res.status(400).json({ error: "Le nom d'utilisateur ne peut contenir que lettres, chiffres, point, tiret et _." });
    }
    if (mdp.length > MDP_MAX) {
      return res.status(400).json({ error: `Le mot de passe ne doit pas dépasser ${MDP_MAX} caractères.` });
    }
    if (mdp && mdp.length < MDP_MIN) {
      return res.status(400).json({ error: `Le mot de passe doit contenir au moins ${MDP_MIN} caractères.` });
    }
    if (req.body) req.body.nom = nom;

    quandTermine(res, (statut, corps) => {
      if (statut === 201 && corps.user) {
        journaliser(db, req, 'inscription', { acteur: { ...corps.user, id: Number(corps.user.id) } });
      }
    });
    next();
  };
}

// POST /api/auth/login
export function controlerConnexion(db) {
  return async function (req, res, next) {
    const nom = String(req.body?.nom ?? '');
    const mdp = String(req.body?.mdp ?? '');
    const compte = nom ? trouverParNom(db, nom) : undefined;

    // Compte suspendu : on ne le dit qu'à quelqu'un qui connaît le mot de passe.
    try {
      if (compte && mdp && (await bcrypt.compare(mdp, compte.mdp))) {
        const blocage = blocageDuCompte(db, compte);
        if (blocage) {
          journaliser(db, req, 'connexion_refusee', { acteur: compte, details: 'Compte suspendu' });
          return res.status(403).json({ error: blocage.message, suspendu: true });
        }
      }
    } catch (err) {
      return next(err);
    }

    quandTermine(res, (statut) => {
      if (statut === 200 && compte) {
        journaliser(db, req, 'connexion', { acteur: compte });
      } else if (statut === 401) {
        journaliser(db, req, 'connexion_echouee', {
          acteur: compte ?? { id: null, nom, role: null },
          details: compte ? 'Mot de passe incorrect' : 'Compte inconnu'
        });
      }
    });
    next();
  };
}

// POST / DELETE /api/publications/:id/like et /dislike
export function suivreReaction(db) {
  return function (req, res, next) {
    const reaction = req.baseUrl.endsWith('/dislike') ? 'dislike' : 'like';
    quandTermine(res, (statut, corps) => {
      const ajout = req.method === 'POST' && statut === 201;
      const retrait = req.method === 'DELETE' && statut === 200
        && /retiré$/.test(corps.message ?? '');
      if (!ajout && !retrait) return;
      const publication = trouverPublicationAvecAuteur(db, Number(corps.publicationId));
      if (publication) {
        journaliser(db, req, `${reaction}_${ajout ? 'ajoute' : 'retire'}`, { cible: ciblePublication(publication) });
      }
    });
    next();
  };
}

// POST /api/publications/photo et /video
export function suivrePublicationMedia(db) {
  return function (req, res, next) {
    quandTermine(res, (statut) => {
      if (statut !== 201) return;
      const publication = dernierePublicationDe(db, req.user.id);
      if (!publication) return;
      const genre = String(publication.type_fichier).startsWith('video/') ? 'vidéo' : 'photo';
      journaliser(db, req, 'publication_creee', {
        cible: { type: 'publication', id: publication.id, nom: req.user.nom },
        details: `[${genre}] ${extrait(publication.description)}`
      });
    });
    next();
  };
}

// POST /api/messagerie/cle-publique
export function suivreClePublique(db) {
  return function (req, res, next) {
    quandTermine(res, (statut) => {
      if (statut === 200) journaliser(db, req, 'cle_publiee');
    });
    next();
  };
}

// Fichiers envoyés par les membres : jamais exécutés comme une page (une image
// SVG piégée ne peut pas lancer de script sur le site).
export function protegerUploads(req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}
