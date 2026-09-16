/**
 * administration.routes.js
 * ------------------------------------------------------------
 * Console d'administration (réservée au rôle admin) :
 *   GET    /api/admin/comptes
 *   POST   /api/admin/comptes/:id/role
 *   POST   /api/admin/comptes/:id/suspension     (suspendre)
 *   DELETE /api/admin/comptes/:id/suspension     (lever)
 *   DELETE /api/admin/comptes/:id                (supprimer)
 *   GET    /api/admin/stats                      tableau de bord
 *   GET    /api/admin/journal                    logs filtrables
 *   GET    /api/admin/audit/:id                  audit d'un profil
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as administrationService from '../services/administration.service.js';
import { repondreErreur } from '../services/erreurs.js';
import { verifierToken, estAdmin, creerCompteActif } from '../middlewares/auth.middleware.js';

export function creerRoutesAdministration(db) {
  const router = Router();
  const admin = [verifierToken, creerCompteActif(db), estAdmin];

  router.get('/comptes', admin, (req, res) => {
    res.json(administrationService.listerComptes(db));
  });

  router.post('/comptes/:id/role', admin, (req, res) => {
    try {
      res.json(administrationService.changerRole(db, req, req.params.id, req.body?.role));
    } catch (err) { repondreErreur(res, err); }
  });

  router.post('/comptes/:id/suspension', admin, (req, res) => {
    try {
      const { fin } = administrationService.suspendre(db, req, req.params.id, {
        raison: req.body?.raison,
        jours: req.body?.jours
      });
      res.json({ ok: true, fin });
    } catch (err) { repondreErreur(res, err); }
  });

  router.delete('/comptes/:id/suspension', admin, (req, res) => {
    try {
      administrationService.leverSuspension(db, req, req.params.id);
      res.json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  router.delete('/comptes/:id', admin, (req, res) => {
    try {
      administrationService.supprimerCompte(db, req, req.params.id, req.body?.raison);
      res.json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  router.get('/stats', admin, (req, res) => {
    res.json(administrationService.tableauDeBord(db));
  });

  router.get('/journal', admin, (req, res) => {
    res.json(administrationService.journal(db, req.query));
  });

  router.get('/audit/:id', admin, (req, res) => {
    try {
      res.json(administrationService.audit(db, req.params.id));
    } catch (err) { repondreErreur(res, err); }
  });

  return router;
}
