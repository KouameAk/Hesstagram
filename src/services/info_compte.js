const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function getDbConnection() {
    const db = await open({
        filename: 'ma_base_de_donnees.db',
        driver: sqlite3.Database
    });
    // Activer les clés étrangères
    await db.run('PRAGMA foreign_keys = ON');
    return db;
}

/**
 * 1. LIRE les informations d'un compte
 */
async function getCompteInfo(userId) {
    const db = await getDbConnection();

    const utilisateur = await db.get(
        'SELECT id, nom, date, role FROM utilisateur WHERE id = ?',
        [userId]
    );

    if (!utilisateur) {
        await db.close();
        return null;
    }

    const stats = await db.get(`
        SELECT 
            (SELECT COUNT(*) FROM publication WHERE id_utilisateur = ?) AS total_publications,
            (SELECT COUNT(*) FROM ami WHERE id_utilisateur1 = ? OR id_utilisateur2 = ?) AS total_amis
    `, [userId, userId, userId]);

    await db.close();
    return {
        ...utilisateur,
        statistiques: stats
    };
}

/**
 * 2. MODIFIER les informations d'un compte
 */
async function updateCompte(userId, updates) {
    const fields = [];
    const values = [];

    if (updates.nom !== undefined) {
        fields.push('nom = ?');
        values.push(updates.nom);
    }
    if (updates.mdp !== undefined) {
        fields.push('mdp = ?');
        values.push(updates.mdp);
    }

    if (fields.length === 0) return false;

    values.push(userId);
    const sql = `UPDATE utilisateur SET ${fields.join(', ')} WHERE id = ?`;

    const db = await getDbConnection();
    const result = await db.run(sql, values);
    await db.close();

    return result.changes > 0;
}

/**
 * 3. SUPPRIMER un compte et toutes ses données (Transaction)
 */
async function deleteCompte(userId) {
    const db = await getDbConnection();

    try {
        await db.run('BEGIN TRANSACTION');

        // Nettoyage des interactions
        await db.run('DELETE FROM commentaire WHERE id_utilisateur = ?', [userId]);
        await db.run('DELETE FROM `like` WHERE id_utilisateur = ?', [userId]);
        await db.run('DELETE FROM `dislike` WHERE id_util = ?', [userId]);
        await db.run('DELETE FROM message WHERE id_utilisateur = ? OR id_util = ?', [userId, userId]);
        await db.run('DELETE FROM notification WHERE id_utilisateur = ?', [userId]);
        await db.run('DELETE FROM ami WHERE id_utilisateur1 = ? OR id_utilisateur2 = ?', [userId, userId]);
        await db.run('DELETE FROM signalement WHERE id_signalé = ? OR id_signalant = ?', [userId, userId]);

        // Nettoyage des publications de l'utilisateur
        const userPubs = await db.all('SELECT id FROM publication WHERE id_utilisateur = ?', [userId]);
        for (const pub of userPubs) {
            await db.run('DELETE FROM hashtag WHERE id_pub = ?', [pub.id]);
            await db.run('DELETE FROM `like` WHERE id_pub = ?', [pub.id]);
            await db.run('DELETE FROM `dislike` WHERE id_pub = ?', [pub.id]);
            await db.run('DELETE FROM commentaire WHERE id_pub = ?', [pub.id]);
        }
        await db.run('DELETE FROM publication WHERE id_utilisateur = ?', [userId]);

        // Suppression de l'utilisateur
        const result = await db.run('DELETE FROM utilisateur WHERE id = ?', [userId]);

        await db.run('COMMIT');
        await db.close();
        return result.changes > 0;
    } catch (error) {
        await db.run('ROLLBACK');
        await db.close();
        throw error;
    }
}

// Exemple d'exécution
(async () => {
    // const info = await getCompteInfo(1);
    // console.log(info);
})();
