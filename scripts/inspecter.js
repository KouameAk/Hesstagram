// Affiche le contenu de toutes les tables d'une base SQLite.
// Utile pour vérifier à l'œil ce qu'il y a vraiment dedans.
// Usage : node scripts/inspecter.js data/hesstagram.sqlite
import { DatabaseSync } from 'node:sqlite';

const cheminBase = process.argv[2];
if (!cheminBase) {
  console.error('Usage : node scripts/inspecter.js chemin/vers/base.sqlite');
  process.exit(1);
}

const db = new DatabaseSync(cheminBase);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  .all();

for (const { name } of tables) {
  const lignes = db.prepare(`SELECT * FROM \`${name}\``).all();
  console.log(`\n=== ${name} (${lignes.length} ligne${lignes.length > 1 ? 's' : ''}) ===`);
  console.log(lignes);
}
