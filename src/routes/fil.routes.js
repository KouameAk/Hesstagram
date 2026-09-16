/**
 * fil.routes.js
 * ------------------------------------------------------------
 * Endpoints du fil d'actualité. Les réactions ont leurs propres
 * fichiers (likes.routes.js et dislikes.routes.js), montés sur le
 * même préfixe.
 *
 *   GET    /api/publications                 fil filtrable
 *   POST   /api/publications                 publier un texte
 *   DELETE /api/publications/:id             auteur, modo ou admin
 *   GET    /api/publications/:id/likes       qui a aimé
 *   POST   /api/publications/:id/commentaires
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as filService from '../services/fil.service.js';
import * as filRepository from '../repositories/fil.repository.js';
import { repondreErreur } from '../services/erreurs.js';
import { verifierToken, creerCompteActif } from '../middlewares/auth.middleware.js';

export function creerRoutesFil(db) {
  const router = Router();
  const connecte = [verifierToken, creerCompteActif(db)];

  router.get('/', connecte, (req, res) => {
    try {
      res.json(filService.lireFil(db, req.user.id, req.query));
    } catch (err) { repondreErreur(res, err); }
  });

  router.post('/', connecte, (req, res) => {
    try {
      res.status(201).json(filService.publier(db, req, req.body ?? {}));
    } catch (err) { repondreErreur(res, err); }
  });

  router.delete('/:id', connecte, (req, res) => {
    try {
      filService.supprimer(db, req, Number(req.params.id));
      res.json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  router.get('/:id/likes', connecte, (req, res) => {
    try {
      res.json(filRepository.listerLikes(db, Number(req.params.id), req.user.id));
    } catch (err) { repondreErreur(res, err); }
  });

  router.post('/:id/commentaires', connecte, (req, res) => {
    try {
      filService.commenter(db, req, Number(req.params.id), req.body?.commentaire);
      res.status(201).json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  return router;
}
