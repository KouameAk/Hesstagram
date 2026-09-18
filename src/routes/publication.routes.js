import { Router } from 'express';
import { publierVideo, publierPhoto, recupererVideos, ErreurPublication } from '../services/publication.service.js';
import { traiterUploadVideo, traiterUploadPhoto } from '../middlewares/upload.middleware.js';
import { convertirVideoEnMp4 } from '../services/video.service.js';
import { verifierToken } from '../middlewares/auth.middleware.js';

export function creerRoutesPublication(db) {
  const router = Router();

  // Route vidéo — protégée par JWT, idUtilisateur extrait du token
  router.post('/video', verifierToken, traiterUploadVideo, async (req, res) => {
    try {
      const idUtilisateur = req.user.id;
      const { description } = req.body;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Aucun fichier vidéo fourni.' });
      }

      console.log(`[Publication Vidéo] Début de la conversion pour le fichier : ${req.file.originalname} (${req.file.size} octets)`);
      const nomFichierConverti = await convertirVideoEnMp4(req.file.path);
      console.log(`[Publication Vidéo] Conversion réussie : ${nomFichierConverti}`);

      const publication = await publierVideo(db, {
        idUtilisateur,
        description: description || '',
        nomFichier: nomFichierConverti,
        typeFichier: 'video/mp4'
      });

      res.status(201).json({ success: true, publication });
    } catch (err) {
      console.error('[Publication Vidéo] Erreur:', err);
      if (err instanceof ErreurPublication) {
        res.status(400).json({ success: false, message: err.message });
      } else {
        res.status(500).json({ 
          success: false, 
          message: err.message || 'Erreur interne au serveur lors de la conversion ou publication.' 
        });
      }
    }
  });

  // Route photo — protégée par JWT, idUtilisateur extrait du token
  router.post('/photo', verifierToken, traiterUploadPhoto, async (req, res) => {
    try {
      const idUtilisateur = req.user.id;
      const { description } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Aucun fichier image fourni.' });
      }

      const publication = await publierPhoto(db, {
        idUtilisateur,
        description: description || '',
        nomFichier: req.file.filename,
        typeFichier: req.file.mimetype || 'image/jpeg'
      });

      res.status(201).json({ success: true, publication });
    } catch (err) {
      console.error('[Publication Photo] Erreur:', err);
      if (err instanceof ErreurPublication) {
        res.status(400).json({ success: false, message: err.message });
      } else {
        res.status(500).json({ 
          success: false, 
          message: err.message || 'Erreur interne au serveur lors de la publication de la photo.' 
        });
      }
    }
  });

  // Route récupération vidéos
  router.get('/videos', async (req, res) => {
    try {
      const videos = await recupererVideos(db);
      res.status(200).json({ success: true, videos });
    } catch (err) {
      console.error('Erreur récupération vidéos:', err);
      res.status(500).json({ success: false, message: 'Erreur interne au serveur' });
    }
  });

  return router;
}