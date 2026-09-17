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
 *   GET    /api/admin/journal                    journal filtrable
 *   GET    /api/admin/audit/:id                  fiche d'un compte
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as administrationService from '../services/administration.service.js';
import { repondreErreur } from '../services/erreurs.js';
import { exigerSession, exigerRoles } from '../middlewares/session.middleware.js';

export function creerRoutesAdministration(db) {
  const router = Router();
  router.use(exigerSession, exigerRoles('admin'));

  router.get('/comptes', (req, res) => {
    res.json(administrationService.listerComptes(db));
  });

  router.post('/comptes/:id/role', (req, res) => {
    try {
      res.json(administrationService.changerRole(db, req, req.params.id, req.body?.role));
    } catch (err) { repondreErreur(res, err); }
  });

  router.post('/comptes/:id/suspension', (req, res) => {
    try {
      const { fin } = administrationService.suspendre(db, req, req.params.id, {
        raison: req.body?.raison,
        jours: req.body?.jours
      });
      res.json({ ok: true, fin });
    } catch (err) { repondreErreur(res, err); }
  });

  router.delete('/comptes/:id/suspension', (req, res) => {
    try {
      administrationService.leverSuspension(db, req, req.params.id);
      res.json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  router.delete('/comptes/:id', (req, res) => {
    try {
      administrationService.supprimerCompte(db, req, req.params.id, req.body?.raison);
      res.json({ ok: true });
    } catch (err) { repondreErreur(res, err); }
  });

  router.get('/stats', (req, res) => {
    res.json(administrationService.tableauDeBord(db));
  });

  router.get('/journal', (req, res) => {
    res.json(administrationService.journal(db, req.query));
  });

  router.get('/audit/:id', (req, res) => {
    try {
      res.json(administrationService.audit(db, req.params.id));
    } catch (err) { repondreErreur(res, err); }
  });

  return router;
}
