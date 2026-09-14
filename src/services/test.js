const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');
const {
    setDb,
    sendFriendRequest,
    acceptFriendRequest,
    removeOrDeclineFriend,
    getAcceptedFriends,
    getPendingRequests,
    getSentRequests,
    getFullFriendList
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

    // Test 1 : Envoi de demande
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

    // Test 2 : Acceptation
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

    // Test 3 : Refus ou suppression
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

    // Test 4 : Récupérer les amis confirmés
    await setupDb();
    await new Promise((resolve) => {
        sendFriendRequest(1, 2, () => {
            acceptFriendRequest(2, 1, () => {
                getAcceptedFriends(1, (err, friends) => {
                    assert.strictEqual(err, null);
                    assert.strictEqual(friends.length, 1);
                    assert.strictEqual(friends[0].nom, 'Bob');
                    console.log("✔ Test 4 réussi : Récupération des amis confirmés");
                    resolve();
                });
            });
        });
    });
    await teardownDb();

    // Test 5 : Demandes reçues en attente
    await setupDb();
    await new Promise((resolve) => {
        sendFriendRequest(1, 2, () => {
            getPendingRequests(2, (err, requests) => {
                assert.strictEqual(err, null);
                assert.strictEqual(requests.length, 1);
                assert.strictEqual(requests[0].nom, 'Alice');
                console.log("✔ Test 5 réussi : Demandes reçues en attente");
                resolve();
            });
        });
    });
    await teardownDb();

    // Test 6 : Demandes envoyées en attente
    await setupDb();
    await new Promise((resolve) => {
        sendFriendRequest(1, 2, () => {
            getSentRequests(1, (err, requests) => {
                assert.strictEqual(err, null);
                assert.strictEqual(requests.length, 1);
                assert.strictEqual(requests[0].nom, 'Bob');
                console.log("✔ Test 6 réussi : Demandes envoyées en attente");
                resolve();
            });
        });
    });
    await teardownDb();

    // Test 7 : Liste complète avec différenciation des statuts
    await setupDb();
    await new Promise((resolve) => {
        // Alice envoie à Bob (en attente)
        sendFriendRequest(1, 2, () => {
            // Charlie envoie à Alice puis Alice accepte (ami)
            sendFriendRequest(3, 1, () => {
                acceptFriendRequest(1, 3, () => {
                    getFullFriendList(1, (err, list) => {
                        assert.strictEqual(err, null);
                        assert.strictEqual(list.length, 2);

                        const bob = list.find(u => u.id === 2);
                        const charlie = list.find(u => u.id === 3);

                        assert.strictEqual(bob.type_relation, 'demande_envoyee');
                        assert.strictEqual(charlie.type_relation, 'ami');

                        console.log("✔ Test 7 réussi : Liste globale avec tous les statuts");
                        resolve();
                    });
                });
            });
        });
    });
    await teardownDb();

    console.log("--- Tous les tests sont passés avec succès ! ---");
}

runAllTests().catch((err) => {
    console.error("✖ Échec d'un test :", err.message);
    process.exit(1);
});
