import { Router } from 'express';
import {
  trouverPublicationsParHashtagPourLeFil,
  listerListeNoire,
  ajouterAListeNoire,
  retirerDeListeNoire,
  estInterdit,
  listerHashtagsPopulaires,
} from '../repositories/hashtag.repository.js';
import { exigerSession, exigerRoles } from '../middlewares/session.middleware.js';

export function creerRoutesHashtags(db) {
  const router = Router();

  // Liste des hashtags populaires/tendances (hors interdits)
  // Accessible aux membres connectés pour les suggestions
  router.get('/hashtags', exigerSession, (req, res) => {
    res.json(listerHashtagsPopulaires(db));
  });

  // Vérifier si un hashtag est interdit (accessible aux membres connectés)
  router.get('/hashtags/verifier/:nom', exigerSession, (req, res) => {
    const nom = req.params.nom.replace(/^#+/, '').trim().toLowerCase();
    res.json({ nom, interdit: estInterdit(db, nom) });
  });

  // Publications qui utilisent ce hashtag, au même format que le fil
  // (utilisé par le lien cliquable sur les hashtags dans le frontend).
  router.get('/hashtags/:nom', exigerSession, (req, res) => {
    const nom = req.params.nom.replace(/^#+/, '').trim().toLowerCase();
    res.json(trouverPublicationsParHashtagPourLeFil(db, req.user.id, nom));
  });

  // Liste noire des hashtags interdits, réservée aux admins.
  router.get('/hashtags-interdits', exigerSession, exigerRoles('admin'), (req, res) => {
    res.json(listerListeNoire(db));
  });

  router.post('/hashtags-interdits', exigerSession, exigerRoles('admin'), (req, res) => {
    const nom = String(req.body?.nom ?? '').replace(/^#+/, '').trim().toLowerCase();
    if (!nom) {
      return res.status(400).json({ error: 'Nom de hashtag manquant.' });
    }
    ajouterAListeNoire(db, nom);
    res.status(201).json({ nom });
  });

  router.delete('/hashtags-interdits/:nom', exigerSession, exigerRoles('admin'), (req, res) => {
    const nom = req.params.nom.replace(/^#+/, '').trim().toLowerCase();
    retirerDeListeNoire(db, nom);
    res.status(204).end();
  });

  return router;
}

