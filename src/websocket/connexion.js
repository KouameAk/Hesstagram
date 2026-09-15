import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { creerRegistre } from '../services/messagerie.service.js';
import {
  creerConversationPrivee,
  enregistrerMessage,
  obtenirConversationsUtilisateur,
  obtenirHistorique,
} from '../repositories/messagerie.repository.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_temporaire_hesstagram';

// Branche la messagerie temps réel sur le serveur HTTP et la BDD déjà
// ouverts par server.js. Un WebSocket ne permet pas d'en-tête Authorization,
// donc le token JWT passe en ?token=... dans l'URL de connexion.
export function demarrerMessagerie(serveurHttp, db) {
  const registre = creerRegistre();
  const wss = new WebSocketServer({ server: serveurHttp });

  wss.on('connection', (socket, requete) => {
    const url = new URL(requete.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');

    let userId;
    try {
      userId = jwt.verify(token, JWT_SECRET).id;
    } catch {
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

  console.log('Messagerie WebSocket branchée sur le serveur HTTP');
  return wss;
}
