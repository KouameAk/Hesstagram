import { Router } from 'express';
import { listerUtilisateursSignales, bannirUtilisateur, debannirUtilisateur } from '../repositories/moderation.repository.js';
import * as moderationService from '../services/moderation.service.js';
import { repondreErreur } from '../services/erreurs.js';
import { verifierToken, estAdminOuModo, creerCompteActif } from '../middlewares/auth.middleware.js';

// Modo et admin peuvent voir les signalements, clore les dossiers et bannir.
export function creerRoutesModeration(db) {
  const router = Router();
  const staff = [verifierToken, creerCompteActif(db), estAdminOuModo];

  // Vue « un utilisateur par ligne » (écran historique du projet)
  router.get('/moderation/signalements', staff, (req, res) => {
    res.json(listerUtilisateursSignales(db));
  });

  // File détaillée : un signalement par ligne, avec le motif et le signalant
  router.get('/moderation/file', staff, (req, res) => {
    res.json(moderationService.file(db));
  });

  // Clore un dossier : le signalement quitte la file, la décision reste au journal
  router.delete('/moderation/signalements/:id', staff, (req, res) => {
    try {
      moderationService.clore(db, req, Number(req.params.id), req.body?.decision);
      res.json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  router.post('/moderation/utilisateurs/:id/banni', staff, (req, res) => {
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
