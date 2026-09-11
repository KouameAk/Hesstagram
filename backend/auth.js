/**
 * auth.js
 * ------------------------------------------------------------
 * Toutes les routes liées à l'authentification.
 * Pour l'instant : uniquement la connexion (POST /login).
 * L'inscription viendra dans une prochaine étape.
 * ------------------------------------------------------------
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const router = express.Router();

// Clé secrète utilisée pour signer les tokens de connexion.
// Une valeur par défaut est fournie pour que le projet fonctionne
// sans configuration supplémentaire (pas besoin de fichier .env).
const JWT_SECRET = process.env.JWT_SECRET || 'secret_temporaire_hesstagram';

/**
 * POST /register
 * Corps attendu (JSON) : { "nom": "...", "mdp": "..." }
 *
 * Étapes :
 *   1. Vérifie que nom et mdp sont fournis
 *   2. Vérifie que le mot de passe fait au moins 6 caractères
 *   3. Vérifie que ce nom d'utilisateur n'est pas déjà pris
 *   4. Hash le mot de passe (jamais stocké en clair en base)
 *   5. Insère le nouvel utilisateur (role "user" par défaut)
 */
router.post('/register', async (req, res) => {
  const { nom, mdp } = req.body;

  if (!nom || !mdp) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis." });
  }
  if (mdp.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }

  const existant = db.prepare('SELECT id FROM utilisateur WHERE nom = ?').get(nom);
  if (existant) {
    return res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris." });
  }

  const mdpHash = await bcrypt.hash(mdp, 10);
  const date = new Date().toISOString();
  const result = db
    .prepare('INSERT INTO utilisateur (nom, mdp, date, role) VALUES (?, ?, ?, ?)')
    .run(nom, mdpHash, date, 'user');

  res.status(201).json({
    message: 'Compte créé avec succès.',
    user: { id: result.lastInsertRowid, nom, role: 'user' }
  });
});

/**
 * POST /login
 * Corps attendu (JSON) : { "nom": "...", "mdp": "..." }
 *
 * Étapes :
 *   1. Vérifie que nom et mdp sont fournis
 *   2. Cherche l'utilisateur en base par son nom
 *   3. Compare le mot de passe envoyé avec le hash stocké
 *   4. Si tout est bon, génère un token JWT (valable 24h)
 */
router.post('/login', async (req, res) => {
  const { nom, mdp } = req.body;

  if (!nom || !mdp) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis." });
  }

  const user = db.prepare('SELECT * FROM utilisateur WHERE nom = ?').get(nom);

  // Même message pour "utilisateur inconnu" et "mdp incorrect"
  // (ne pas donner d'indice à un attaquant sur ce qui a échoué)
  if (!user) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  const mdpValide = await bcrypt.compare(mdp, user.mdp);
  if (!mdpValide) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  const token = jwt.sign(
    { id: user.id, nom: user.nom, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    message: 'Connexion réussie.',
    token,
    user: { id: user.id, nom: user.nom, role: user.role }
  });
});

module.exports = router;