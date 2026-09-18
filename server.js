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

// ── Interface intégrée (frontend V3) : fichiers ajoutés, aucun fichier du groupe modifié ──
import { installerDonneesInitiales } from './src/bdd/donnees-initiales.js';
import { config } from './src/config.js';
import { controleSession, exigerSession } from './src/middlewares/session.middleware.js';
import {
  validerInscription,
  controlerConnexion,
  suivreReaction,
  suivrePublicationMedia,
  suivreClePublique,
  protegerUploads
} from './src/middlewares/suivi.middleware.js';
import { creerRoutesFil } from './src/routes/fil.routes.js';
import { creerRoutesSignalements } from './src/routes/signalements.routes.js';
import { creerRoutesAdministration } from './src/routes/administration.routes.js';
import { creerRoutesCompte } from './src/routes/compte.routes.js';
import { creerRoutesConversations } from './src/routes/conversations.routes.js';
import { protegerMessagerie } from './src/websocket/protection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Chemin par défaut aligné sur DATABASE_PATH dans .env.example
const db = ouvrirBase(process.env.DATABASE_PATH || './data/hesstagram.sqlite');

// Interface intégrée : tables des consoles + comptes préconfigurés si la base est vide
installerDonneesInitiales(db);

app.use(express.json());

// Interface intégrée : servie AVANT src/public/ pour que /, /accueil.html,
// /messagerie.html… affichent la nouvelle interface. Les pages d'origine du
// groupe restent intactes dans src/public/ et accessibles sous /groupe/.
// Les fichiers communs (chiffrement-navigateur.js, logo, uploads/) sont
// toujours servis depuis src/public/.
app.use('/uploads', protegerUploads);
app.use(express.static(path.join(__dirname, 'src/interface')));
app.use('/groupe', express.static(path.join(__dirname, 'src/public')));

// Sert les fichiers du dossier src/public/ (dont index.html, la page de test)
// -> accessible directement sur http://localhost:3000/
app.use(express.static(path.join(__dirname, 'src/public')));

// Interface intégrée : contrôles posés devant les routes du groupe
app.get('/api/config', (req, res) => res.json(config));
app.use('/api', controleSession(db));
app.post('/api/auth/register', validerInscription(db));
app.post('/api/auth/login', controlerConnexion(db));
app.post(['/api/publications/photo', '/api/publications/video'], exigerSession, suivrePublicationMedia(db));
app.use(['/api/publications/:id/like', '/api/publications/:id/dislike'], exigerSession, suivreReaction(db));
app.post('/api/messagerie/cle-publique', suivreClePublique(db));

app.use('/api/auth', creerRoutesAuth(db));
app.use('/api/publications', creerRoutesPublication(db));
app.use('/api', creerRoutesUtilisateurs(db));
app.use('/api', creerRoutesModeration(db));
app.use('/api', creerRoutesMessagerie(db));
app.use('/api/publications', creerRoutesLikes(db));
app.use('/api/publications', creerRoutesDislikes(db));

// Interface intégrée : nouvelles routes
app.use('/api/publications', creerRoutesFil(db));
app.use('/api', creerRoutesSignalements(db));
app.use('/api', creerRoutesConversations(db));
app.use('/api/compte', creerRoutesCompte(db));
app.use('/api/admin', creerRoutesAdministration(db));

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
const serveurMessagerie = demarrerMessagerie(serveurHttp, db);

// Interface intégrée : garde-fou devant les messages reçus par le WebSocket
// (compte supprimé ou suspendu, destinataire inconnu, JSON invalide).
protegerMessagerie(serveurMessagerie, db);
