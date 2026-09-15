// Crée un groupe de démo (alice, bob, charlie) avec sa clé de groupe.
// À lancer une fois, APRÈS seed-demo.js.
// Usage : node scripts/seed-groupe-demo.js
import { ouvrirBase } from '../src/bdd/connexion.js';
import { creerGroupe, enregistrerCleGroupe } from '../src/repositories/messagerie.repository.js';
import { createGroupKey, shareGroupKey } from '../src/crypto/chiffrement.js';
import { CLES_DEMO } from './cles-demo.js';

const NOM_GROUPE = 'Groupe démo';
const db = ouvrirBase(process.env.DB_PATH || 'data/hesstagram.sqlite');

function idDe(nom) {
  const ligne = db.prepare('SELECT id FROM utilisateur WHERE nom = ?').get(nom);
  if (!ligne) {
    console.error(`"${nom}" n'existe pas encore. Lance d'abord : node scripts/seed-demo.js`);
    process.exit(1);
  }
  return ligne.id;
}

const idAlice = idDe('alice'); // alice = créatrice du groupe pour cette démo
const idBob = idDe('bob');
const idCharlie = idDe('charlie');

const dejaExistant = db
  .prepare("SELECT id FROM conversation WHERE type = 'groupe' AND nom = ?")
  .get(NOM_GROUPE);

if (dejaExistant) {
  console.log(`Le groupe "${NOM_GROUPE}" existe déjà (id ${dejaExistant.id}).`);
  process.exit(0);
}

const conversationId = creerGroupe(db, NOM_GROUPE, idAlice, [idAlice, idBob, idCharlie]);

// La clé de groupe est créée une fois, puis chiffrée séparément pour chaque
// membre avec la clé secrète 1-à-1 qu'alice (créatrice) partage avec lui.
const groupKey = createGroupKey();
enregistrerCleGroupe(db, conversationId, idAlice, shareGroupKey(groupKey, CLES_DEMO.alice.privateKey, CLES_DEMO.alice.publicKey));
enregistrerCleGroupe(db, conversationId, idBob, shareGroupKey(groupKey, CLES_DEMO.alice.privateKey, CLES_DEMO.bob.publicKey));
enregistrerCleGroupe(db, conversationId, idCharlie, shareGroupKey(groupKey, CLES_DEMO.alice.privateKey, CLES_DEMO.charlie.publicKey));

console.log(`Groupe "${NOM_GROUPE}" créé (id ${conversationId}) avec alice, bob et charlie.`);
console.log('\nPour tester, dans 3 terminaux :');
console.log('  node scripts/client-demo-groupe.js alice');
console.log('  node scripts/client-demo-groupe.js bob');
console.log('  node scripts/client-demo-groupe.js charlie');
