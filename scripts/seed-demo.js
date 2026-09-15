// Script à lancer une fois pour créer 3 utilisateurs de test (alice, bob,
// charlie) dans la base, avec leurs clés publiques de démo. Sert uniquement
// à essayer la messagerie à la main, pas du vrai code applicatif.
// Mot de passe de tous les comptes de démo : mdp-de-demo (voir cles-demo.js).
// Usage : node scripts/seed-demo.js
import bcrypt from 'bcryptjs';
import { ouvrirBase } from '../src/bdd/connexion.js';
import { enregistrerClePublique } from '../src/repositories/messagerie.repository.js';
import { CLES_DEMO, MDP_DEMO } from './cles-demo.js';

const cheminBase = process.env.DB_PATH || 'data/hesstagram.sqlite';
const db = ouvrirBase(cheminBase);

async function creerOuTrouverUtilisateur(nom) {
  const existant = db.prepare('SELECT id FROM utilisateur WHERE nom = ?').get(nom);
  if (existant) return existant.id;

  const mdpHash = await bcrypt.hash(MDP_DEMO, 10);
  const resultat = db.prepare('INSERT INTO utilisateur (nom, mdp) VALUES (?, ?)').run(nom, mdpHash);
  return Number(resultat.lastInsertRowid);
}

const ids = {};
for (const nom of ['alice', 'bob', 'charlie']) {
  ids[nom] = await creerOuTrouverUtilisateur(nom);
  enregistrerClePublique(db, ids[nom], CLES_DEMO[nom].publicKey);
  console.log(`${nom} = id ${ids[nom]}`);
}

console.log(`\nMot de passe de tous les comptes : ${MDP_DEMO}`);
console.log('\nPour tester en 1-à-1 : node scripts/client-demo.js alice');
console.log('                  et : node scripts/client-demo.js bob');
console.log('\nPour tester en groupe : node scripts/seed-groupe-demo.js');
