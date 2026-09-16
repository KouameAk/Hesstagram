/**
 * server.js
 * ------------------------------------------------------------
 * Point d'entrée du serveur. Ouvre la connexion à la base une
 * seule fois (via src/bdd/connexion.js), installe les comptes
 * préconfigurés si la base est vide, puis branche les routes
 * d'authentification, du fil d'actualité, des profils, de la
 * gestion des rôles, de la modération, de l'administration et
 * la messagerie temps réel (WebSocket).
 * ------------------------------------------------------------
 */
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrirBase } from './src/bdd/connexion.js';
import { installerDonneesInitiales } from './src/bdd/donnees-initiales.js';
import { creerRoutesAuth } from './src/routes/auth.routes.js';
import { creerRoutesPublication } from './src/routes/publication.routes.js';
import { creerRoutesFil } from './src/routes/fil.routes.js';
import { creerRoutesSocial } from './src/routes/social.routes.js';
import { creerRoutesUtilisateurs } from './src/routes/utilisateurs.routes.js';
import { creerRoutesModeration } from './src/routes/moderation.routes.js';
import { creerRoutesAdministration } from './src/routes/administration.routes.js';
import { creerRoutesMessagerie } from './src/routes/messagerie.routes.js';
import { demarrerMessagerie } from './src/websocket/connexion.js';
import { creerRoutesLikes } from './src/routes/likes.routes.js';
import { creerRoutesDislikes } from './src/routes/dislikes.routes.js';
import { config } from './src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Chemin par défaut aligné sur DATABASE_PATH dans .env.example
const db = ouvrirBase(process.env.DATABASE_PATH || './data/hesstagram.sqlite');

// Comptes préconfigurés (admin, modérateur, membres de démonstration)
installerDonneesInitiales(db);

// limit : les requêtes JSON restent petites tant que les médias sont en pause
app.use(express.json({ limit: '2mb' }));

// Sert les fichiers du dossier src/public/ (l'interface complète)
// -> accessible directement sur http://localhost:3000/
app.use(express.static(path.join(__dirname, 'src/public')));

// Réglages communs au serveur et à l'interface (longueurs de mot de passe,
// publication de médias activée ou non).
app.get('/api/config', (req, res) => res.json(config));

app.use('/api/auth', creerRoutesAuth(db));
app.use('/api/publications', creerRoutesPublication(db));
app.use('/api/publications', creerRoutesLikes(db));
app.use('/api/publications', creerRoutesDislikes(db));
app.use('/api/publications', creerRoutesFil(db));
app.use('/api', creerRoutesSocial(db));
app.use('/api', creerRoutesUtilisateurs(db));
app.use('/api', creerRoutesModeration(db));
app.use('/api', creerRoutesMessagerie(db));
app.use('/api/admin', creerRoutesAdministration(db));

const serveurHttp = app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});

// La messagerie WebSocket écoute sur ce même serveur et ce même port,
// pas un port séparé (ws://localhost:${PORT}?token=...).
demarrerMessagerie(serveurHttp, db);
