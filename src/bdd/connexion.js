import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const cheminSchema = join(dirname(fileURLToPath(import.meta.url)), '../../BDD.sqlite');

// Ouvre la base et crée les tables si elles n'existent pas encore
// (BDD.sqlite contient tout le schéma du projet).
export function ouvrirBase(cheminFichier) {
  if (cheminFichier !== ':memory:') {
    mkdirSync(dirname(cheminFichier), { recursive: true });
  }
  const db = new DatabaseSync(cheminFichier);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(cheminSchema, 'utf-8'));
  return db;
}
