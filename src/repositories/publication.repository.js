export function creerPublication(db, { idUtilisateur, description, nomFichier, typeFichier }) {
  const requete = `
    INSERT INTO publication (
      id_utilisateur, date, description, nom_fichier, type_fichier,
      vue, "like", "dislike", partage, republie
    )
    VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, false)
  `;
  const info = db.prepare(requete).run(
    idUtilisateur,
    new Date().toISOString(),
    description,
    nomFichier,
    typeFichier
  );
  return info;
}

export function trouverPublicationsVideos(db) {
  const requete = `
    SELECT * FROM publication 
    WHERE type_fichier LIKE 'video/%'
    ORDER BY date DESC
  `;
  return db.prepare(requete).all();
}

export function trouverPublicationParId(db, id) {
  const requete = `SELECT * FROM publication WHERE id = ?`;
  return db.prepare(requete).get(id);
}
