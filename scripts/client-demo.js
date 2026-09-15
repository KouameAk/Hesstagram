// Client de test en ligne de commande : tape un message dans un terminal,
// il arrive déchiffré dans l'autre. Sert à essayer la messagerie à la main,
// pas du vrai code applicatif (le vrai client sera une page web plus tard).
//
// Usage (après avoir lancé `npm start` et node scripts/seed-demo.js) :
//   node scripts/client-demo.js alice
//   node scripts/client-demo.js bob
import { WebSocket } from 'ws';
import { createInterface } from 'node:readline';
import { getSharedKey, encrypt, decrypt } from '../src/crypto/chiffrement.js';
import { CLES_DEMO, MDP_DEMO } from './cles-demo.js';

const monNom = process.argv[2];
if (monNom !== 'alice' && monNom !== 'bob') {
  console.error('Usage : node scripts/client-demo.js alice   (ou bob)');
  process.exit(1);
}
const nomDuCorrespondant = monNom === 'alice' ? 'bob' : 'alice';

const port = Number(process.env.PORT) || 3000;
const base = `http://localhost:${port}`;

async function connecter(nom) {
  const reponse = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom, mdp: MDP_DEMO }),
  });
  if (!reponse.ok) {
    console.error(`Connexion refusée pour ${nom}. Lance d'abord : node scripts/seed-demo.js`);
    process.exit(1);
  }
  return reponse.json();
}

const { token, user } = await connecter(monNom);
const { user: correspondant } = await connecter(nomDuCorrespondant);
const monId = user.id;
const idCorrespondant = correspondant.id;

const mesCles = CLES_DEMO[monNom];
const clePubliqueCorrespondant = CLES_DEMO[nomDuCorrespondant].publicKey;
const cleSecrete = getSharedKey(mesCles.privateKey, clePubliqueCorrespondant);

const socket = new WebSocket(`ws://localhost:${port}?token=${token}`);

socket.on('open', () => {
  console.log(`Connecté en tant que ${monNom}. Tape un message puis Entrée pour l'envoyer à ${nomDuCorrespondant}.`);
});

socket.on('message', (data) => {
  const recu = JSON.parse(data.toString());

  if (recu.type === 'historique') {
    for (const messagePasse of recu.messages) {
      const qui = messagePasse.expediteurId === monId ? 'moi' : nomDuCorrespondant;
      console.log(`[historique] ${qui} : ${decrypt(messagePasse, cleSecrete)}`);
    }
    return;
  }

  const messageClair = decrypt(recu.contenu, cleSecrete);
  console.log(`\n${nomDuCorrespondant} : ${messageClair}`);
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
  const chiffre = encrypt(ligne, cleSecrete);
  socket.send(JSON.stringify({ type: 'message', versId: String(idCorrespondant), contenu: chiffre }));
});
