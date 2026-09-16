import { Router } from 'express';
import { listerUtilisateurs } from '../repositories/utilisateur.repository.js';
import { changerRole } from '../services/administration.service.js';
import { repondreErreur } from '../services/erreurs.js';
import { verifierToken, estAdmin, creerCompteActif } from '../middlewares/auth.middleware.js';

// Seul un admin peut changer les rôles des autres utilisateurs.
// (le changement passe par administration.service : mêmes protections et
// même trace au journal que depuis la console)
export function creerRoutesUtilisateurs(db) {
  const router = Router();
  const admin = [verifierToken, creerCompteActif(db), estAdmin];

  router.get('/utilisateurs', admin, (req, res) => {
    res.json(listerUtilisateurs(db));
  });

  router.post('/utilisateurs/:id/role', admin, (req, res) => {
    try {
      res.json(changerRole(db, req, req.params.id, req.body?.role));
    } catch (err) { repondreErreur(res, err); }
  });

  return router;
}
