/**
 * signalements.routes.js
 * ------------------------------------------------------------
 * Dépôt d'un signalement et file de la console de modération.
 * Les routes du groupe (GET /api/moderation/signalements et
 * POST /api/moderation/utilisateurs/:id/banni) restent en place.
 *
 *   POST   /api/signalements                   tout membre connecté
 *   GET    /api/moderation/file                modo, admin
 *   DELETE /api/moderation/signalements/:id    modo, admin (clôture)
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as moderationService from '../services/moderation.service.js';
import { repondreErreur } from '../services/erreurs.js';
import { exigerSession, exigerRoles } from '../middlewares/session.middleware.js';

export function creerRoutesSignalements(db) {
  const router = Router();
  const staff = [exigerSession, exigerRoles('modo', 'admin')];

  router.post('/signalements', exigerSession, (req, res) => {
    try {
      const { id } = moderationService.signaler(db, req, {
        idSignale: req.body?.id_signale,
        idPublication: req.body?.id_publication,
        raison: req.body?.raison
      });
      res.status(201).json({ ok: true, id });
    } catch (err) { repondreErreur(res, err); }
  });

  router.get('/moderation/file', staff, (req, res) => {
    res.json(moderationService.file(db));
  });

  router.delete('/moderation/signalements/:id', staff, (req, res) => {
    try {
      moderationService.clore(db, req, Number(req.params.id), req.body?.decision);
      res.json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  return router;
}
