/**
 * db.js
 * ------------------------------------------------------------
 * Connexion à la base de données SQLite.
 *
 * Utilise node:sqlite, le module SQLite intégré directement à
 * Node.js (disponible depuis Node 22, stable depuis Node 24).
 * Aucune installation ni compilation nécessaire, contrairement à
 * better-sqlite3 qui doit compiler du C++ (et plante sur Windows
 * sans Visual Studio installé).
 *
 * Le fichier BDD.sqlite fourni contient le script de création
 * des tables (CREATE TABLE...). Ce fichier l'exécute pour créer
 * les tables dans un vrai fichier de base de données
 * ("database.sqlite"), s'il n'existe pas déjà.
 * ------------------------------------------------------------
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

// Ouvre (ou crée) le vrai fichier de base de données SQLite
const db = new DatabaseSync('./database.sqlite');

// Active la vérification des clés étrangères (désactivée par défaut sur SQLite)
db.exec('PRAGMA foreign_keys = ON');

// Lit le script de BDD.sqlite et l'exécute pour créer les tables.
// IF NOT EXISTS est ajouté pour ne pas planter si les tables existent déjà.
const schemaPath = path.join(__dirname, 'BDD.sqlite');
let schema = fs.readFileSync(schemaPath, 'utf8');
schema = schema.replace(/CREATE TABLE (`?[a-zA-Zéà]+`?)/g, 'CREATE TABLE IF NOT EXISTS $1');
db.exec(schema);

module.exports = db;