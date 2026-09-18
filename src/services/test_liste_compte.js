const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// Instance de base de données globale pour les tests
let db;

// -----------------------------------------------------------------------------
// FONCTIONS DE GESTION DU SCHÉMA ET DES DONNÉES DE TEST
// -----------------------------------------------------------------------------

async function initDb() {
    db = await open({
        filename: ':memory:',
        driver: sqlite3.Database
    });

    await db.run('PRAGMA foreign_keys = ON;');

    // Création des tables minimales nécessaires aux tests
    await db.exec(`
        CREATE TABLE utilisateur (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom VARCHAR(255),
            mdp TEXT NOT NULL,
            date DATETIME,
            role VARCHAR(255)
        );

        CREATE TABLE ami (
            id_utilisateur1 INTEGER,
            id_utilisateur2 INTEGER,
            PRIMARY KEY (id_utilisateur1, id_utilisateur2),
            FOREIGN KEY (id_utilisateur1) REFERENCES utilisateur (id),
            FOREIGN KEY (id_utilisateur2) REFERENCES utilisateur (id)
        );

        CREATE TABLE publication (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_utilisateur INTEGER,
            date DATETIME,
            description TEXT,
            FOREIGN KEY (id_utilisateur) REFERENCES utilisateur(id)
        );
    `);
}

// -----------------------------------------------------------------------------
// FONCTIONS À TESTER (Adaptées pour prendre l'instance `db` en paramètre)
// -----------------------------------------------------------------------------

async function getCompteInfo(db, userId) {
    const utilisateur = await db.get(
        'SELECT id, nom, date, role FROM utilisateur WHERE id = ?',
        [userId]
    );

    if (!utilisateur) return null;

    const stats = await db.get(`
        SELECT 
            (SELECT COUNT(*) FROM publication WHERE id_utilisateur = ?) AS total_publications,
            (SELECT COUNT(*) FROM ami WHERE id_utilisateur1 = ? OR id_utilisateur2 = ?) AS total_amis
    `, [userId, userId, userId]);

    return { ...utilisateur, statistiques: stats };
}

async function updateCompte(db, userId, updates) {
    const fields = [];
    const values = [];

    if (updates.nom !== undefined) { fields.push('nom = ?'); values.push(updates.nom); }
    if (updates.mdp !== undefined) { fields.push('mdp = ?'); values.push(updates.mdp); }
    if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role); }

    if (fields.length === 0) return false;

    values.push(userId);
    const sql = `UPDATE utilisateur SET ${fields.join(', ')} WHERE id = ?`;
    const result = await db.run(sql, values);
    return result.changes > 0;
}

async function deleteCompte(db, userId) {
    try {
        await db.run('BEGIN TRANSACTION');

        await db.run('DELETE FROM ami WHERE id_utilisateur1 = ? OR id_utilisateur2 = ?', [userId, userId]);
        await db.run('DELETE FROM publication WHERE id_utilisateur = ?', [userId]);
        const result = await db.run('DELETE FROM utilisateur WHERE id = ?', [userId]);

        await db.run('COMMIT');
        return result.changes > 0;
    } catch (error) {
        await db.run('ROLLBACK');
        throw error;
    }
}

// -----------------------------------------------------------------------------
// SUITE DE TESTS UNITAIRES
// -----------------------------------------------------------------------------

describe('Gestion des comptes utilisateurs', () => {

    beforeEach(async () => {
        await initDb();
        // Insertion d'un utilisateur de test par défaut (ID 1)
        await db.run("INSERT INTO utilisateur (nom, mdp, role) VALUES ('Alice', 'hash123', 'user')");
    });

    afterEach(async () => {
        if (db) await db.close();
    });

    test('getCompteInfo - doit retourner les infos du compte sans le mot de passe', async () => {
        const result = await getCompteInfo(db, 1);

        assert.notStrictEqual(result, null);
        assert.strictEqual(result.nom, 'Alice');
        assert.strictEqual(result.role, 'user');
        assert.strictEqual(result.mdp, undefined); // Le mdp doit être exclu
        assert.strictEqual(result.statistiques.total_publications, 0);
    });

    test('getCompteInfo - doit retourner null si l utilisateur n existe pas', async () => {
        const result = await getCompteInfo(db, 999);
        assert.strictEqual(result, null);
    });

    test('updateCompte - doit modifier les champs spécifiés', async () => {
        const isUpdated = await updateCompte(db, 1, { nom: 'Alice Modifier', role: 'admin' });
        assert.strictEqual(isUpdated, true);

        const updatedUser = await db.get('SELECT nom, role FROM utilisateur WHERE id = 1');
        assert.strictEqual(updatedUser.nom, 'Alice Modifier');
        assert.strictEqual(updatedUser.role, 'admin');
    });

    test('deleteCompte - doit supprimer l utilisateur et ses données liées', async () => {
        // Préparer des données liées
        await db.run("INSERT INTO publication (id_utilisateur, description) VALUES (1, 'Ma super pub')");
        
        const isDeleted = await deleteCompte(db, 1);
        assert.strictEqual(isDeleted, true);

        // Vérifier l'absence de l'utilisateur et de ses publications
        const user = await db.get('SELECT * FROM utilisateur WHERE id = 1');
        const pubs = await db.all('SELECT * FROM publication WHERE id_utilisateur = 1');

        assert.strictEqual(user, undefined);
        assert.strictEqual(pubs.length, 0);
    });
});