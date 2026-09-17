/**
 * fil.routes.js
 * ------------------------------------------------------------
 * Endpoints du fil d'actualité, montés sur /api/publications à
 * côté des routes du groupe (photo, video, videos, like, dislike) :
 *
 *   GET    /api/publications          fil (?type=photo|video, ?auteur=, ?id=)
 *   DELETE /api/publications/:id      auteur, modo ou admin
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as filService from '../services/fil.service.js';
import { repondreErreur } from '../services/erreurs.js';
import { exigerSession } from '../middlewares/session.middleware.js';

export function creerRoutesFil(db) {
  const router = Router();

  router.get('/', exigerSession, (req, res) => {
    try {
      res.json(filService.lireFil(db, req.user.id, req.query));
    } catch (err) { repondreErreur(res, err); }
  });

  router.delete('/:id(\\d+)', exigerSession, (req, res) => {
    try {
      filService.supprimer(db, req, Number(req.params.id));
      res.json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  return router;
}
