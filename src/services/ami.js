let db;

function setDb(databaseInstance) {
    db = databaseInstance;
}

function sendFriendRequest(senderId, receiverId, callback) {
    if (senderId === receiverId) {
        return callback(new Error("Impossible de s'ajouter soi-même."));
    }

    const query = `INSERT INTO ami (id_utilisateur1, id_utilisateur2, statut) VALUES (?, ?, 'en_attente')`;

    db.run(query, [senderId, receiverId], function(err) {
        if (err) {
            return callback(new Error("Demande déjà envoyée ou relation existante."));
        }
        callback(null, { message: "Demande d'ami envoyée avec succès !" });
    });
}

function acceptFriendRequest(userId, requesterId, callback) {
    const query = `
        UPDATE ami 
        SET statut = 'accepte' 
        WHERE id_utilisateur1 = ? AND id_utilisateur2 = ? AND statut = 'en_attente'
    `;

    db.run(query, [requesterId, userId], function(err) {
        if (err) return callback(err);
        if (this.changes === 0) {
            return callback(new Error("Aucune demande en attente trouvée."));
        }
        callback(null, { message: "Demande acceptée, vous êtes désormais amis !" });
    });
}

function removeOrDeclineFriend(id1, id2, callback) {
    const query = `
        DELETE FROM ami 
        WHERE (id_utilisateur1 = ? AND id_utilisateur2 = ?) 
           OR (id_utilisateur1 = ? AND id_utilisateur2 = ?)
    `;

    db.run(query, [id1, id2, id2, id1], function(err) {
        if (err) return callback(err);
        callback(null, { message: "Demande supprimée ou ami retiré." });
    });
}

function getAcceptedFriends(userId, callback) {
    const query = `
        SELECT u.id, u.nom, u.role 
        FROM utilisateur u
        JOIN ami a ON (u.id = a.id_utilisateur2 OR u.id = a.id_utilisateur1)
        WHERE (a.id_utilisateur1 = ? OR a.id_utilisateur2 = ?) 
          AND u.id != ? 
          AND a.statut = 'accepte'
    `;

    db.all(query, [userId, userId, userId], (err, rows) => {
        if (err) return callback(err);
        callback(null, rows);
    });
}

function getPendingRequests(userId, callback) {
    const query = `
        SELECT u.id, u.nom, u.role 
        FROM utilisateur u
        JOIN ami a ON u.id = a.id_utilisateur1
        WHERE a.id_utilisateur2 = ? AND a.statut = 'en_attente'
    `;

    db.all(query, [userId], (err, rows) => {
        if (err) return callback(err);
        callback(null, rows);
    });
}

module.exports = {
    setDb,
    sendFriendRequest,
    acceptFriendRequest,
    removeOrDeclineFriend,
    getAcceptedFriends,
    getPendingRequests
};