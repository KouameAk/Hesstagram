/**
 * server.js
 * ------------------------------------------------------------
 * Point d'entrée du serveur. Branche les routes d'authentification
 * (auth.js) qui gèrent elles-mêmes la connexion à la BDD.
 * ------------------------------------------------------------
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const authRoutes = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Sert les fichiers du dossier public/ (dont index.html, la page de test)
// -> accessible directement sur http://localhost:3000/
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});