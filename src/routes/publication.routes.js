import { Router } from 'express';
import { publierVideo, publierPhoto, recupererVideos, ErreurPublication } from '../services/publication.service.js';
import { uploadVideo, uploadPhoto } from '../middlewares/upload.middleware.js';
import { convertirVideoEnMp4 } from '../services/video.service.js';
import { verifierToken } from '../middlewares/auth.middleware.js';

export function creerRoutesPublication(db) {
  const router = Router();

  // Route vidéo — protégée par JWT, idUtilisateur extrait du token
  router.post('/video', verifierToken, uploadVideo.single('video'), async (req, res) => {
    try {
      const idUtilisateur = req.user.id; // extrait du token JWT
      const { description } = req.body;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Aucun fichier vidéo fourni.' });
      }

      const nomFichierConverti = await convertirVideoEnMp4(req.file.path);

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


  // Route photo — protégée par JWT, idUtilisateur extrait du token
  router.post('/photo', verifierToken, uploadPhoto.single('photo'), async (req, res) => {
    try {
      const idUtilisateur = req.user.id; // extrait du token JWT
      const { description } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Aucun fichier image fourni.' });
      }

      // Enregistrer directement en base de données (pas de conversion nécessaire)
      const publication = await publierPhoto(db, {
        idUtilisateur,
        description,
        nomFichier: req.file.filename,
        typeFichier: req.file.mimetype
      });

      res.status(201).json({ success: true, publication });
    } catch (err) {
      if (err instanceof ErreurPublication) {
        res.status(400).json({ success: false, message: err.message });
      } else {
        console.error("Erreur inattendue:", err);
        res.status(500).json({ success: false, message: 'Erreur interne au serveur lors de la publication de la photo.' });
      }
    }
  });


  // ==========================================
  // ROUTE RÉCUPÉRATION VIDÉOS
  // ==========================================
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