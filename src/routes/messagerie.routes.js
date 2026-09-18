import { Router } from 'express';
import { enregistrerClePublique, obtenirClePublique } from '../repositories/messagerie.repository.js';
import { trouverParNom } from '../repositories/utilisateur.repository.js';
import { verifierToken } from '../middlewares/auth.middleware.js';

// Sert à ce que 2 utilisateurs récupèrent la clé publique l'un de l'autre,
// pour calculer leur clé secrète commune (voir chiffrement-navigateur.js).
export function creerRoutesMessagerie(db) {
  const router = Router();

  router.post('/messagerie/cle-publique', verifierToken, (req, res) => {
    enregistrerClePublique(db, req.user.id, req.body.publicKey);
    res.json({ ok: true });
  });

  router.get('/messagerie/cle-publique/:nom', verifierToken, (req, res) => {
    const utilisateur = trouverParNom(db, req.params.nom);
    if (!utilisateur) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const clePublique = obtenirClePublique(db, utilisateur.id);
    if (!clePublique) {
      return res.status(404).json({ error: "Cet utilisateur n'a pas encore de clé publique." });
    }

    res.json({ id: utilisateur.id, nom: utilisateur.nom, publicKey: clePublique });
  });

  return router;
}
