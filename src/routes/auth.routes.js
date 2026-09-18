/**
 * auth.routes.js
 * ------------------------------------------------------------
 * Endpoints d'authentification : inscription et connexion.
 * Reçoit la requête, la transmet au service, renvoie la
 * réponse. Pas de logique métier ni de SQL ici.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as authService from '../services/auth.service.js';

// db est injectée depuis server.js (ouverte une seule fois au
// démarrage, voir bdd/connexion.js), d'où la fonction "usine".
export function creerRoutesAuth(db) {
  const router = Router();

  router.post('/register', async (req, res) => {
    try {
      const user = await authService.inscrire(db, req.body);
      res.status(201).json({ message: 'Compte créé avec succès.', user });
    } catch (err) {
      res.status(err.statut ?? 500).json({ error: err.message });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { token, user } = await authService.connecter(db, req.body);
      res.json({ message: 'Connexion réussie.', token, user });
    } catch (err) {
      res.status(err.statut ?? 500).json({ error: err.message });
    }
  });

  return router;
}