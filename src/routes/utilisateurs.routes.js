import { Router } from 'express';
import { listerUtilisateurs, definirRole } from '../repositories/utilisateur.repository.js';
import { verifierToken, estAdmin } from '../middlewares/auth.middleware.js';

const ROLES_VALIDES = ['user', 'modo', 'admin'];

// Seul un admin peut changer les rôles des autres utilisateurs.
export function creerRoutesUtilisateurs(db) {
  const router = Router();

  router.get('/utilisateurs', verifierToken, estAdmin, (req, res) => {
    res.json(listerUtilisateurs(db));
  });

  router.post('/utilisateurs/:id/role', verifierToken, estAdmin, (req, res) => {
    const { role } = req.body;
    if (!ROLES_VALIDES.includes(role)) {
      return res.status(400).json({ error: `Rôle invalide, attendu : ${ROLES_VALIDES.join(', ')}` });
    }
    definirRole(db, Number(req.params.id), role);
    res.json({ id: Number(req.params.id), role });
  });

  return router;
}
