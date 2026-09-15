// Client de test en ligne de commande pour la messagerie de GROUPE.
// Usage (après seed-demo.js puis seed-groupe-demo.js) :
//   node scripts/client-demo-groupe.js alice
//   node scripts/client-demo-groupe.js bob
//   node scripts/client-demo-groupe.js charlie
import { WebSocket } from 'ws';
import { createInterface } from 'node:readline';
import { receiveGroupKey, encrypt, decrypt } from '../src/crypto/chiffrement.js';
import { ouvrirBase } from '../src/bdd/connexion.js';
import { obtenirCleGroupe } from '../src/repositories/messagerie.repository.js';
import { CLES_DEMO, MDP_DEMO } from './cles-demo.js';

const NOM_GROUPE = 'Groupe démo';
const monNom = process.argv[2];
if (!CLES_DEMO[monNom]) {
  console.error('Usage : node scripts/client-demo-groupe.js alice   (ou bob, charlie)');
  process.exit(1);
}

const db = ouvrirBase(process.env.DB_PATH || 'data/hesstagram.sqlite');

function idDe(nom) {
  return db.prepare('SELECT id FROM utilisateur WHERE nom = ?').get(nom)?.id;
}

const monId = idDe(monNom);
const groupe = db.prepare("SELECT id, id_createur FROM conversation WHERE type = 'groupe' AND nom = ?").get(NOM_GROUPE);

if (!monId || !groupe) {
  console.error("Le groupe de démo n'existe pas encore. Lance d'abord :");
  console.error('  node scripts/seed-demo.js');
  console.error('  node scripts/seed-groupe-demo.js');
  process.exit(1);
}

const nomCreateur = Object.keys(CLES_DEMO).find((nom) => idDe(nom) === groupe.id_createur);
const clePubliqueCreateur = CLES_DEMO[nomCreateur].publicKey;

// Ma copie de la clé de groupe, chiffrée pour moi, à déchiffrer avec ma clé secrète.
const clePersonnelle = obtenirCleGroupe(db, groupe.id, monId);
const cleGroupe = receiveGroupKey(clePersonnelle, CLES_DEMO[monNom].privateKey, clePubliqueCreateur);

// Pour afficher le nom de l'expéditeur plutôt que son id.
const nomParId = {};
for (const nom of Object.keys(CLES_DEMO)) nomParId[idDe(nom)] = nom;

const port = Number(process.env.PORT) || 3000;

const reponseLogin = await fetch(`http://localhost:${port}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nom: monNom, mdp: MDP_DEMO }),
});
const { token } = await reponseLogin.json();

const socket = new WebSocket(`ws://localhost:${port}?token=${token}`);

socket.on('open', () => {
  console.log(`Connecté en tant que ${monNom} dans "${NOM_GROUPE}". Tape un message puis Entrée.`);
});

socket.on('message', (data) => {
  const recu = JSON.parse(data.toString());

  if (recu.type === 'historique' && recu.conversationId === groupe.id) {
    for (const messagePasse of recu.messages) {
      const qui = messagePasse.expediteurId === monId ? 'moi' : nomParId[messagePasse.expediteurId];
      console.log(`[historique] ${qui} : ${decrypt(messagePasse, cleGroupe)}`);
    }
    return;
  }

  if (recu.type === 'message-groupe') {
    console.log(`\n${nomParId[Number(recu.de)]} : ${decrypt(recu.contenu, cleGroupe)}`);
  }
});

socket.on('error', (erreur) => {
  console.error('Erreur de connexion — le serveur est-il lancé ? (npm start)', erreur.message);
});

const lecteur = createInterface({ input: process.stdin });
lecteur.on('line', (ligne) => {
  if (socket.readyState !== WebSocket.OPEN) {
    console.log('Pas encore connecté au serveur, réessaie dans un instant.');
    return;
  }
  const chiffre = encrypt(ligne, cleGroupe);
  socket.send(JSON.stringify({ type: 'message-groupe', groupId: String(groupe.id), contenu: chiffre }));
});
