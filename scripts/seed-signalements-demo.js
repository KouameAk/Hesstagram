// Crée quelques signalements de démo contre charlie, pour tester la page
// de modération. À lancer APRÈS seed-demo.js.
// Usage : node scripts/seed-signalements-demo.js
import { ouvrirBase } from '../src/bdd/connexion.js';

const db = ouvrirBase(process.env.DB_PATH || 'data/hesstagram.sqlite');

function idDe(nom) {
  const ligne = db.prepare('SELECT id FROM utilisateur WHERE nom = ?').get(nom);
  if (!ligne) {
    console.error(`"${nom}" n'existe pas encore. Lance d'abord : node scripts/seed-demo.js`);
    process.exit(1);
  }
  return ligne.id;
}

const idAlice = idDe('alice');
const idBob = idDe('bob');
const idCharlie = idDe('charlie');

const signaler = db.prepare(
  'INSERT INTO signalement (id_signalé, id_signalant, raison, date) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
);

signaler.run(idCharlie, idAlice, 'Spam répété en message privé');
signaler.run(idCharlie, idBob, 'Propos insultants');
signaler.run(idBob, idAlice, 'Contenu inapproprié dans une publication');

console.log('3 signalements créés : charlie (x2) et bob (x1).');
console.log('\nVoir : npm run admin, puis http://localhost:3001/moderation.html');
