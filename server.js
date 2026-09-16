/**
 * server.js
 * ------------------------------------------------------------
 * Point d'entrée du serveur. Ouvre la connexion à la base une
 * seule fois (via src/bdd/connexion.js), puis branche les
 * routes d'authentification, de gestion des rôles, de
 * modération, et la messagerie temps réel (WebSocket).
 * ------------------------------------------------------------
 */
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrirBase } from './src/bdd/connexion.js';
import { creerRoutesAuth } from './src/routes/auth.routes.js';
import { creerRoutesPublication } from './src/routes/publication.routes.js';
import { creerRoutesUtilisateurs } from './src/routes/utilisateurs.routes.js';
import { creerRoutesModeration } from './src/routes/moderation.routes.js';
import { creerRoutesMessagerie } from './src/routes/messagerie.routes.js';
import { demarrerMessagerie } from './src/websocket/connexion.js';
import { creerRoutesLikes } from './src/routes/likes.routes.js';
import { creerRoutesDislikes } from './src/routes/dislikes.routes.js';

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
app.use('/api/publications', creerRoutesPublication(db));
app.use('/api', creerRoutesUtilisateurs(db));
app.use('/api', creerRoutesModeration(db));
app.use('/api', creerRoutesMessagerie(db));
app.use('/api/publications', creerRoutesLikes(db));
app.use('/api/publications', creerRoutesDislikes(db));

// Middleware global de gestion d'erreurs (garantit une réponse JSON)
app.use((err, req, res, next) => {
  console.error('Erreur API non interceptée :', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erreur interne du serveur'
  });
});

const serveurHttp = app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});

// La messagerie WebSocket écoute sur ce même serveur et ce même port,
// pas un port séparé (ws://localhost:${PORT}?token=...).
demarrerMessagerie(serveurHttp, db);
