/**
 * auth.routes.js
 * ------------------------------------------------------------
 * Endpoints d'authentification : inscription, connexion, compte
 * courant, changement de mot de passe et fermeture de compte.
 * Reçoit la requête, la transmet au service, renvoie la
 * réponse. Pas de logique métier ni de SQL ici.
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as authService from '../services/auth.service.js';
import { journaliser } from '../services/journal.service.js';
import { verifierToken, creerCompteActif } from '../middlewares/auth.middleware.js';

// db est injectée depuis server.js (ouverte une seule fois au
// démarrage, voir bdd/connexion.js), d'où la fonction "usine".
export function creerRoutesAuth(db) {
  const router = Router();
  const connecte = [verifierToken, creerCompteActif(db)];

  router.post('/register', async (req, res) => {
    try {
      const user = await authService.inscrire(db, req.body, req);
      res.status(201).json({ message: 'Compte créé avec succès.', user });
    } catch (err) {
      res.status(err.statut ?? 500).json({ error: err.message });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { token, user } = await authService.connecter(db, req.body, req);
      res.json({ message: 'Connexion réussie.', token, user });
    } catch (err) {
      res.status(err.statut ?? 500).json({ error: err.message });
    }
  });

  // Compte connecté : c'est la base qui fait foi (rôle, suspension), pas le token.
  router.get('/moi', connecte, (req, res) => {
    res.json(req.user);
  });

  router.post('/deconnexion', connecte, (req, res) => {
    journaliser(db, req, 'deconnexion');
    res.json({ ok: true });
  });

  router.put('/mot-de-passe', connecte, async (req, res) => {
    try {
      await authService.changerMotDePasse(db, req, req.body ?? {});
      res.json({ ok: true });
    } catch (err) {
      res.status(err.statut ?? 500).json({ error: err.message });
    }
  });

  router.delete('/moi', connecte, async (req, res) => {
    try {
      await authService.fermerCompte(db, req, req.body?.mdp);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.statut ?? 500).json({ error: err.message });
    }
  });

  return router;
}
