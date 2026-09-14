import { WebSocketServer } from 'ws';
import { creerRegistre } from '../services/messagerie.service.js';
import { ouvrirBase } from '../bdd/connexion.js';
import {
  creerConversationPrivee,
  enregistrerMessage,
  obtenirConversationsUtilisateur,
  obtenirHistorique,
} from '../repositories/messagerie.repository.js';

// Branche les connexions WebSocket sur le service (routage) et la BDD (sauvegarde).
// TODO: pour l'instant ouvre son propre port, à connecter au serveur Express
// commun plus tard (new WebSocketServer({ server }) au lieu de { port }).
export function demarrerServeur(port, cheminBase) {
  const db = ouvrirBase(cheminBase);
  const registre = creerRegistre();
  const wss = new WebSocketServer({ port });

  wss.on('connection', (socket, requete) => {
    // TODO: identification bidon (?userId=3), remplacer par la vraie auth
    const url = new URL(requete.url ?? '', 'http://localhost');
    const userId = Number(url.searchParams.get('userId'));

    if (!userId) {
      socket.close();
      return;
    }

    registre.connecter(String(userId), (message) => socket.send(message));

    // rejoint ses groupes existants pour recevoir les messages en direct
    const conversations = obtenirConversationsUtilisateur(db, userId);
    for (const conversationId of conversations) {
      registre.rejoindreGroupe(String(conversationId), String(userId));
    }

    // renvoie l'historique pour rattraper ce qui a été raté hors ligne
    for (const conversationId of conversations) {
      const historique = obtenirHistorique(db, conversationId);
      socket.send(JSON.stringify({ type: 'historique', conversationId, messages: historique }));
    }

    socket.on('message', (data) => {
      const demande = JSON.parse(data.toString());

      if (demande.type === 'rejoindre-groupe') {
        registre.rejoindreGroupe(demande.groupId, String(userId));
      }

      if (demande.type === 'message') {
        const destinataireId = Number(demande.versId);
        const conversationId = creerConversationPrivee(db, userId, destinataireId);
        enregistrerMessage(db, conversationId, userId, demande.contenu);
        registre.envoyerMessagePrive(String(userId), demande.versId, demande.contenu);
      }

      if (demande.type === 'message-groupe') {
        enregistrerMessage(db, Number(demande.groupId), userId, demande.contenu);
        registre.envoyerMessageGroupe(String(userId), demande.groupId, demande.contenu);
      }
    });

    socket.on('close', () => {
      registre.deconnecter(String(userId));
    });
  });

  console.log(`Serveur de messagerie WebSocket démarré sur le port ${port}`);
  return wss;
}

// lancé avec `npm run ws` ; PORT et DB_PATH pour changer les valeurs par défaut
demarrerServeur(Number(process.env.PORT) || 8080, process.env.DB_PATH || 'data/hesstagram.sqlite');
