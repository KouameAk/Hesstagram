import { Router } from 'express';
import { publierVideo, recupererVideos, ErreurPublication } from '../services/publication.service.js';
import { uploadVideo } from '../middlewares/upload.middleware.js';
import { convertirVideoEnMp4 } from '../services/video.service.js';

export function creerRoutesPublication(db) {
  const router = Router();

  // Route pour publier une vidéo (avec upload de fichier physique)
  router.post('/video', uploadVideo.single('video'), async (req, res) => {
    try {
      const { idUtilisateur, description } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Aucun fichier vidéo fourni.' });
      }

      // Convertir la vidéo en MP4 et récupérer le nom du fichier final
      const nomFichierConverti = await convertirVideoEnMp4(req.file.path);

      // Enregistrer en base de données avec le type vidéo standard
      const publication = await publierVideo(db, {
        idUtilisateur,
        description,
        nomFichier: nomFichierConverti,
        typeFichier: 'video/mp4'
      });

      res.status(201).json({ success: true, publication });
    } catch (err) {
      if (err instanceof ErreurPublication) {
        res.status(400).json({ success: false, message: err.message });
      } else {
        console.error("Erreur inattendue:", err);
        res.status(500).json({ success: false, message: 'Erreur interne au serveur lors de la conversion ou publication.' });
      }
    }
  });

  // Route pour récupérer toutes les vidéos
  router.get('/videos', async (req, res) => {
    try {
      const videos = await recupererVideos(db);
      res.status(200).json({ success: true, videos });
    } catch (err) {
      console.error("Erreur inattendue:", err);
      res.status(500).json({ success: false, message: 'Erreur interne au serveur' });
    }
  });

  return router;
}
