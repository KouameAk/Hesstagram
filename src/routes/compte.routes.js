/**
 * compte.routes.js
 * ------------------------------------------------------------
 * Compte connecté (page « Mon compte ») :
 *   GET    /api/compte                 compte relu en base (rôle, date)
 *   PUT    /api/compte/mot-de-passe    { ancien, nouveau }
 *   DELETE /api/compte                 { mdp } fermeture du compte
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as compteService from '../services/compte.service.js';
import { repondreErreur } from '../services/erreurs.js';
import { exigerSession } from '../middlewares/session.middleware.js';

export function creerRoutesCompte(db) {
  const router = Router();
  router.use(exigerSession);

  router.get('/', (req, res) => {
    res.json(req.user);
  });

  router.put('/mot-de-passe', async (req, res) => {
    try {
      await compteService.changerMotDePasse(db, req, req.body ?? {});
      res.json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  router.delete('/', async (req, res) => {
    try {
      await compteService.fermerCompte(db, req, req.body?.mdp);
      res.json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  return router;
}
