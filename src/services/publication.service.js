import * as publicationRepository from '../repositories/publication.repository.js';
import * as utilisateurRepository from '../repositories/utilisateur.repository.js';

export class ErreurPublication extends Error {
  constructor(message) {
    super(message);
    this.name = 'ErreurPublication';
  }
}

export async function publierVideo(db, { idUtilisateur, description, nomFichier, typeFichier }) {
  if (!idUtilisateur) {
    throw new ErreurPublication("L'identifiant de l'utilisateur est requis.");
  }
  
  if (!typeFichier || !typeFichier.startsWith('video/')) {
    throw new ErreurPublication("Le type de fichier doit être une vidéo.");
  }

  // Vérifier si l'utilisateur existe
  const utilisateur = db.prepare('SELECT * FROM utilisateur WHERE id = ?').get(idUtilisateur);
  if (!utilisateur) {
    throw new ErreurPublication("L'utilisateur n'existe pas.");
  }

  const result = publicationRepository.creerPublication(db, {
    idUtilisateur,
    description: description || "",
    nomFichier,
    typeFichier
  });

  return publicationRepository.trouverPublicationParId(db, result.lastInsertRowid);
}

export async function recupererVideos(db) {
  return publicationRepository.trouverPublicationsVideos(db);
}
