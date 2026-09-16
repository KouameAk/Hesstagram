/**
 * social.routes.js
 * ------------------------------------------------------------
 * Profils, abonnements, annuaire, recherche, tendances,
 * notifications et dépôt de signalement.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as socialService from '../services/social.service.js';
import * as moderationService from '../services/moderation.service.js';
import { notifications } from '../services/journal.service.js';
import { listerComptes } from '../repositories/utilisateur.repository.js';
import { repondreErreur } from '../services/erreurs.js';
import { verifierToken, creerCompteActif } from '../middlewares/auth.middleware.js';

export function creerRoutesSocial(db) {
  const router = Router();
  const connecte = [verifierToken, creerCompteActif(db)];

  // Annuaire : nom + statut, jamais le mot de passe
  router.get('/comptes', connecte, (req, res) => {
    res.json(listerComptes(db));
  });

  router.get('/profils/:id', connecte, (req, res) => {
    try {
      res.json(socialService.profil(db, req.user.id, Number(req.params.id)));
    } catch (err) { repondreErreur(res, err); }
  });

  router.get('/profils/:id/relations', connecte, (req, res) => {
    res.json(socialService.relations(db, req.user.id, Number(req.params.id), req.query.type));
  });

  router.post('/abonnements/:id', connecte, (req, res) => {
    try {
      res.json(socialService.basculerAbonnement(db, req, Number(req.params.id)));
    } catch (err) { repondreErreur(res, err); }
  });

  router.get('/suggestions', connecte, (req, res) => {
    res.json(socialService.suggestions(db, req.user.id));
  });

  router.get('/recherche', connecte, (req, res) => {
    res.json(socialService.rechercher(db, req.user.id, req.query.q));
  });

  router.get('/tendances', connecte, (req, res) => {
    res.json(socialService.tendances(db));
  });

  router.get('/notifications', connecte, (req, res) => {
    res.json(notifications(db, req.user.id));
  });

  // Signaler un compte (n'importe quel membre connecté)
  router.post('/signalements', connecte, (req, res) => {
    try {
      const { id } = moderationService.signaler(db, req, {
        idSignale: req.body?.id_signale,
        raison: req.body?.raison
      });
      res.status(201).json({ ok: true, id });
    } catch (err) { repondreErreur(res, err); }
  });

  return router;
}
