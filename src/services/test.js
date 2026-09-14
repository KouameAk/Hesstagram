const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');
const {
    setDb,
    sendFriendRequest,
    acceptFriendRequest,
    removeOrDeclineFriend,
    getAcceptedFriends,
    getPendingRequests
} = require('./ami.js');

const DB_FILE = 'test_database.db';
let db;

const setupDb = () => new Promise((resolve) => {
    db = new sqlite3.Database(DB_FILE);
    setDb(db);

    db.serialize(() => {
        db.run("PRAGMA foreign_keys = ON;");

        db.run("DROP TABLE IF EXISTS ami;");
        db.run("DROP TABLE IF EXISTS utilisateur;");

        db.run(`
            CREATE TABLE utilisateur (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom VARCHAR(255),
                mdp VARCHAR(255),
                date DATETIME,
                role VARCHAR(255)
            );
        `);

        db.run(`
            CREATE TABLE ami (
                id_utilisateur1 INTEGER,
                id_utilisateur2 INTEGER,
                statut VARCHAR(50) DEFAULT 'en_attente',
                PRIMARY KEY (id_utilisateur1, id_utilisateur2),
                FOREIGN KEY (id_utilisateur1) REFERENCES utilisateur (id),
                FOREIGN KEY (id_utilisateur2) REFERENCES utilisateur (id)
            );
        `, () => {
            db.run("INSERT INTO utilisateur (id, nom, role) VALUES (1, 'Alice', 'user')");
            db.run("INSERT INTO utilisateur (id, nom, role) VALUES (2, 'Bob', 'user')");
            db.run("INSERT INTO utilisateur (id, nom, role) VALUES (3, 'Charlie', 'user')", resolve);
        });
    });
});

const teardownDb = () => new Promise((resolve) => db.close(resolve));

async function runAllTests() {
    console.log("--- Exécution des tests unitaires en JS ---");

    // Test 1
    await setupDb();
    await new Promise((resolve) => {
        sendFriendRequest(1, 1, (err) => {
            assert.ok(err, "Devrait retourner une erreur si ajout de soi-même");
            assert.strictEqual(err.message, "Impossible de s'ajouter soi-même.");

            sendFriendRequest(1, 2, (err, result) => {
                assert.strictEqual(err, null);
                assert.strictEqual(result.message, "Demande d'ami envoyée avec succès !");
                console.log("✔ Test 1 réussi : Envoi de demande");
                resolve();
            });
        });
    });
    await teardownDb();

    // Test 2
    await setupDb();
    await new Promise((resolve) => {
        sendFriendRequest(1, 2, () => {
            acceptFriendRequest(2, 1, (err, result) => {
                assert.strictEqual(err, null);
                assert.strictEqual(result.message, "Demande acceptée, vous êtes désormais amis !");
                console.log("✔ Test 2 réussi : Acceptation de demande");
                resolve();
            });
        });
    });
    await teardownDb();

    // Test 3
    await setupDb();
    await new Promise((resolve) => {
        sendFriendRequest(1, 2, () => {
            removeOrDeclineFriend(1, 2, (err, result) => {
                assert.strictEqual(err, null);
                assert.strictEqual(result.message, "Demande supprimée ou ami retiré.");
                console.log("✔ Test 3 réussi : Refus/Suppression d'ami");
                resolve();
            });
        });
    });
    await teardownDb();

    // Test 4
    await setupDb();
    await new Promise((resolve) => {
        sendFriendRequest(1, 2, () => {
            acceptFriendRequest(2, 1, () => {
                getAcceptedFriends(1, (err, friends) => {
                    assert.strictEqual(err, null);
                    assert.strictEqual(friends.length, 1);
                    assert.strictEqual(friends[0].nom, 'Bob');
                    console.log("✔ Test 4 réussi : Récupération des amis");
                    resolve();
                });
            });
        });
    });
    await teardownDb();

    // Test 5
    await setupDb();
    await new Promise((resolve) => {
        sendFriendRequest(1, 2, () => {
            getPendingRequests(2, (err, requests) => {
                assert.strictEqual(err, null);
                assert.strictEqual(requests.length, 1);
                assert.strictEqual(requests[0].nom, 'Alice');
                console.log("✔ Test 5 réussi : Demandes en attente");
                resolve();
            });
        });
    });
    await teardownDb();

    console.log("--- Tous les tests sont passés avec succès ! ---");
    console.log(`Le fichier "${DB_FILE}" contient le dernier état de la base.`);
}

runAllTests().catch((err) => {
    console.error("✖ Échec d'un test :", err.message);
    process.exit(1);
});