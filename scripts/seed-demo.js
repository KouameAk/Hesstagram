/**
 * scripts/seed-demo.js
 * ------------------------------------------------------------
 * Remplit une base vide avec les comptes préconfigurés et le
 * jeu de démonstration :   npm run seed
 *
 * Le serveur fait déjà cet appel au démarrage ; ce script sert
 * à préparer la base sans lancer le serveur.
 * ------------------------------------------------------------
 */
import 'dotenv/config';
import { ouvrirBase } from '../src/bdd/connexion.js';
import { installerDonneesInitiales, COMPTES_PRECONFIGURES } from '../src/bdd/donnees-initiales.js';

const chemin = process.env.DATABASE_PATH || './data/hesstagram.sqlite';
const db = ouvrirBase(chemin);
const resultat = installerDonneesInitiales(db);

if (resultat.cree) {
  console.log(`\nBase « ${chemin} » initialisée. Comptes disponibles :\n`);
  for (const compte of COMPTES_PRECONFIGURES) {
    console.log(`  ${compte.nom.padEnd(14)} ${compte.mdp.padEnd(16)} (${compte.role})`);
  }
  console.log('');
} else {
  console.log(`La base « ${chemin} » contient déjà des comptes : rien n'a été modifié.`);
}
