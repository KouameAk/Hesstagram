/**
 * protection.js
 * ------------------------------------------------------------
 * Garde-fou autour de la messagerie temps réel du groupe
 * (websocket/connexion.js, inchangé).
 *
 * Dans connexion.js, une exception levée dans socket.on('message')
 * arrête tout le serveur : JSON invalide, destinataire supprimé
 * (clé étrangère refusée par SQLite), conversation inconnue…
 * Ce module s'intercale devant ce traitement :
 *
 *   - le compte est relu en base : supprimé ou suspendu → socket fermé ;
 *   - la demande est vérifiée (JSON, destinataire, appartenance au
 *     groupe, forme du contenu chiffré) avant d'être transmise ;
 *   - toute erreur restante est rattrapée et signalée au client
 *     ({ type: 'erreur', message }) au lieu d'arrêter le serveur.
 *
 * Le contenu des messages n'est jamais lu : il reste chiffré.
 * ------------------------------------------------------------
 */
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { trouverParId } from '../repositories/comptes.repository.js';
import { obtenirConversationsUtilisateur } from '../repositories/messagerie.repository.js';
import { blocageDuCompte } from '../middlewares/session.middleware.js';

const estChaine = (v) => typeof v === 'string' && v.length > 0 && v.length < 100000;

// Contenu chiffré au format de chiffrement-navigateur.js : { iv, ciphertext, authTag }
function contenuValide(contenu) {
  return Boolean(contenu) && estChaine(contenu.iv) && estChaine(contenu.ciphertext)
    && typeof contenu.authTag === 'string';
}

// Renvoie un message d'erreur si la demande doit être refusée, sinon null.
function verifierDemande(db, idUtilisateur, demande) {
  if (!demande || typeof demande !== 'object') return 'Demande illisible.';

  if (demande.type === 'message') {
    const destinataire = trouverParId(db, Number(demande.versId));
    if (!destinataire) return 'Ce destinataire n’existe plus.';
    if (destinataire.id === idUtilisateur) return 'Impossible de s’écrire à soi-même.';
    if (!contenuValide(demande.contenu)) return 'Message chiffré invalide.';
  }

  if (demande.type === 'message-groupe' || demande.type === 'rejoindre-groupe') {
    const mesConversations = obtenirConversationsUtilisateur(db, idUtilisateur).map(String);
    if (!mesConversations.includes(String(demande.groupId))) return 'Vous ne faites pas partie de ce groupe.';
    if (demande.type === 'message-groupe' && !contenuValide(demande.contenu)) return 'Message chiffré invalide.';
  }

  return null;
}

export function protegerMessagerie(wss, db) {
  // Écouteur ajouté APRÈS celui de connexion.js : le socket porte déjà le
  // traitement du groupe, qu'on enveloppe.
  wss.on('connection', (socket, requete) => {
    let idUtilisateur;
    try {
      const url = new URL(requete.url ?? '', 'http://localhost');
      idUtilisateur = jwt.verify(url.searchParams.get('token'), JWT_SECRET).id;
    } catch {
      return;   // token refusé : connexion.js a déjà fermé le socket
    }

    const compteUtilisable = () => {
      const compte = trouverParId(db, idUtilisateur);
      return compte && !blocageDuCompte(db, compte);
    };
    if (!compteUtilisable()) {
      socket.close(4003, 'Compte supprimé ou suspendu');
      return;
    }

    const refuser = (message) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'erreur', message }));
    };

    for (const traitementDuGroupe of socket.listeners('message')) {
      socket.off('message', traitementDuGroupe);
      socket.on('message', (data, ...suite) => {
        try {
          if (!compteUtilisable()) {
            socket.close(4003, 'Compte supprimé ou suspendu');
            return;
          }
          let demande;
          try {
            demande = JSON.parse(data.toString());
          } catch {
            return refuser('Demande illisible.');
          }
          const refus = verifierDemande(db, idUtilisateur, demande);
          if (refus) return refuser(refus);

          traitementDuGroupe(data, ...suite);
        } catch (err) {
          console.error('Messagerie : demande refusée après erreur :', err.message);
          refuser('Le message n’a pas pu être envoyé.');
        }
      });
    }
  });
}
