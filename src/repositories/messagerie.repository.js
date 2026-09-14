export function enregistrerClePublique(db, userId, clePublique) {
  db.prepare('UPDATE utilisateur SET cle_publique = ? WHERE id = ?').run(clePublique, userId);
}

export function obtenirClePublique(db, userId) {
  const ligne = db.prepare('SELECT cle_publique FROM utilisateur WHERE id = ?').get(userId);
  return ligne?.cle_publique;
}

// Id de la conversation privée entre ces deux personnes.
// La crée si besoin, sinon réutilise celle qui existe déjà.
export function creerConversationPrivee(db, userId1, userId2) {
  const existante = db
    .prepare(
      `SELECT c.id FROM conversation c
       JOIN conversation_membre m1 ON m1.id_conversation = c.id AND m1.id_utilisateur = ?
       JOIN conversation_membre m2 ON m2.id_conversation = c.id AND m2.id_utilisateur = ?
       WHERE c.type = 'privee'`,
    )
    .get(userId1, userId2);

  if (existante) return existante.id;

  const resultat = db
    .prepare(`INSERT INTO conversation (type, id_createur, date) VALUES ('privee', ?, CURRENT_TIMESTAMP)`)
    .run(userId1);
  const conversationId = Number(resultat.lastInsertRowid);

  ajouterMembre(db, conversationId, userId1);
  ajouterMembre(db, conversationId, userId2);

  return conversationId;
}

export function creerGroupe(db, nom, createurId, membresIds) {
  const resultat = db
    .prepare(`INSERT INTO conversation (type, nom, id_createur, date) VALUES ('groupe', ?, ?, CURRENT_TIMESTAMP)`)
    .run(nom, createurId);
  const conversationId = Number(resultat.lastInsertRowid);

  for (const membreId of membresIds) {
    ajouterMembre(db, conversationId, membreId);
  }

  return conversationId;
}

function ajouterMembre(db, conversationId, userId) {
  db.prepare(
    'INSERT INTO conversation_membre (id_conversation, id_utilisateur, date_ajout) VALUES (?, ?, CURRENT_TIMESTAMP)',
  ).run(conversationId, userId);
}

export function obtenirConversationsUtilisateur(db, userId) {
  const lignes = db.prepare('SELECT id_conversation FROM conversation_membre WHERE id_utilisateur = ?').all(userId);
  return lignes.map((ligne) => ligne.id_conversation);
}

export function enregistrerMessage(db, conversationId, expediteurId, contenu) {
  db.prepare(
    `INSERT INTO message (id_conversation, id_utilisateur, iv, ciphertext, auth_tag, date, vue)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)`,
  ).run(conversationId, expediteurId, contenu.iv, contenu.ciphertext, contenu.authTag);
}

// Derniers messages d'une conversation, du plus ancien au plus récent.
export function obtenirHistorique(db, conversationId, limite = 50) {
  return db
    .prepare(
      `SELECT id_utilisateur AS expediteurId, iv, ciphertext, auth_tag AS authTag, date
       FROM message WHERE id_conversation = ? ORDER BY date ASC LIMIT ?`,
    )
    .all(conversationId, limite);
}

export function enregistrerCleGroupe(db, conversationId, userId, contenu) {
  db.prepare(
    `INSERT INTO cle_groupe_partagee (id_conversation, id_utilisateur, iv, ciphertext, auth_tag)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(conversationId, userId, contenu.iv, contenu.ciphertext, contenu.authTag);
}

export function obtenirCleGroupe(db, conversationId, userId) {
  return db
    .prepare(
      'SELECT iv, ciphertext, auth_tag AS authTag FROM cle_groupe_partagee WHERE id_conversation = ? AND id_utilisateur = ?',
    )
    .get(conversationId, userId);
}
