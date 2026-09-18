/**
 * conversations.repository.js
 * ------------------------------------------------------------
 * Lecture des conversations privées pour l'écran Messagerie.
 * L'écriture des messages reste dans le WebSocket du groupe
 * (websocket/connexion.js + messagerie.repository.js) : ici on ne
 * fait que relire des messages déjà chiffrés.
 * ------------------------------------------------------------
 */

// Conversation privée déjà existante entre deux comptes (sans la créer).
export function trouverConversationPrivee(db, userId1, userId2) {
  const ligne = db
    .prepare(
      `SELECT c.id FROM conversation c
       JOIN conversation_membre m1 ON m1.id_conversation = c.id AND m1.id_utilisateur = ?
       JOIN conversation_membre m2 ON m2.id_conversation = c.id AND m2.id_utilisateur = ?
       WHERE c.type = 'privee'`,
    )
    .get(userId1, userId2);
  return ligne?.id;
}

// Tous les comptes sauf moi : clé publique disponible, messages non lus, dernier échange.
export function listerContacts(db, moi) {
  return db
    .prepare(
      `SELECT u.id, u.nom, u.role,
              u.cle_publique IS NOT NULL AS a_cle,
              (SELECT COUNT(*) FROM message m
                 JOIN conversation c ON c.id = m.id_conversation AND c.type = 'privee'
                 JOIN conversation_membre m1 ON m1.id_conversation = c.id AND m1.id_utilisateur = :moi
                 JOIN conversation_membre m2 ON m2.id_conversation = c.id AND m2.id_utilisateur = u.id
                WHERE m.id_utilisateur = u.id AND m.vue = 0) AS non_lus,
              (SELECT MAX(m.id) FROM message m
                 JOIN conversation c ON c.id = m.id_conversation AND c.type = 'privee'
                 JOIN conversation_membre m1 ON m1.id_conversation = c.id AND m1.id_utilisateur = :moi
                 JOIN conversation_membre m2 ON m2.id_conversation = c.id AND m2.id_utilisateur = u.id
              ) AS dernier
       FROM utilisateur u
       WHERE u.id != :moi
       ORDER BY dernier IS NULL, dernier DESC, u.nom`,
    )
    .all({ moi });
}

// Messages échangés avec un compte (apres = id du dernier message déjà reçu).
// CURRENT_TIMESTAMP de SQLite est en UTC sans fuseau : on le rend lisible en ISO.
export function historiqueAvec(db, moi, autre, apres = 0) {
  const conversationId = trouverConversationPrivee(db, moi, autre);
  if (!conversationId) return [];
  return db
    .prepare(
      `SELECT id, id_utilisateur AS expediteurId, iv, ciphertext, auth_tag AS authTag,
              CASE WHEN date LIKE '%T%' THEN date ELSE replace(date, ' ', 'T') || 'Z' END AS date
       FROM message WHERE id_conversation = ? AND id > ? ORDER BY id ASC`,
    )
    .all(conversationId, apres);
}

// Marque comme vus les messages reçus dans cette conversation.
export function marquerVus(db, conversationId, moi) {
  if (!conversationId) return;
  db.prepare('UPDATE message SET vue = 1 WHERE id_conversation = ? AND id_utilisateur != ? AND vue = 0')
    .run(conversationId, moi);
}
