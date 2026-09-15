import { Router } from 'express';
import { listerUtilisateursSignales, bannirUtilisateur, debannirUtilisateur } from '../repositories/moderation.repository.js';
import { verifierToken, estAdminOuModo } from '../middlewares/auth.middleware.js';

// Modo et admin peuvent voir les signalements et bannir.
export function creerRoutesModeration(db) {
  const router = Router();

  router.get('/moderation/signalements', verifierToken, estAdminOuModo, (req, res) => {
    res.json(listerUtilisateursSignales(db));
  });

  router.post('/moderation/utilisateurs/:id/banni', verifierToken, estAdminOuModo, (req, res) => {
    const id = Number(req.params.id);
    if (req.body.banni) {
      bannirUtilisateur(db, id);
    } else {
      debannirUtilisateur(db, id);
    }
    res.json({ id, banni: Boolean(req.body.banni) });
  });

  return router;
}
