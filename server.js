/**
 * server.js
 * ------------------------------------------------------------
 * Point d'entrée du serveur. Ouvre la connexion à la base une
 * seule fois (via src/bdd/connexion.js), puis branche les
 * routes d'authentification.
 * ------------------------------------------------------------
 */
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrirBase } from './src/bdd/connexion.js';
import { creerRoutesAuth } from './src/routes/auth.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Chemin par défaut aligné sur DATABASE_PATH dans .env.example
const db = ouvrirBase(process.env.DATABASE_PATH || './data/hesstagram.sqlite');

app.use(express.json());

// Sert les fichiers du dossier src/public/ (dont index.html, la page de test)
// -> accessible directement sur http://localhost:3000/
app.use(express.static(path.join(__dirname, 'src/public')));

app.use('/api/auth', creerRoutesAuth(db));

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});