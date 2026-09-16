import { Router } from 'express';
import { publierVideo, publierPhoto, recupererVideos, ErreurPublication } from '../services/publication.service.js';
import { uploadVideo, uploadPhoto } from '../middlewares/upload.middleware.js';
import { convertirVideoEnMp4 } from '../services/video.service.js';
import { verifierToken, creerCompteActif } from '../middlewares/auth.middleware.js';
import { journaliser, extrait } from '../services/journal.service.js';
import { MEDIAS_ACTIFS } from '../config.js';

export function creerRoutesPublication(db) {
  const router = Router();
  const connecte = [verifierToken, creerCompteActif(db)];

  // Publication de photos et de vidéos : en pause pour le moment.
  // Tout le code d'envoi, de conversion et d'enregistrement reste en place ;
  // il suffit de remettre MEDIAS_ACTIFS à true dans src/config.js pour le réactiver
  // (l'interface suit automatiquement, elle lit GET /api/config).
  const mediasAutorises = (req, res, next) => {
    if (!MEDIAS_ACTIFS) {
      return res.status(503).json({
        success: false,
        message: 'La publication de photos et de vidéos est désactivée pour le moment.'
      });
    }
    next();
  };

  // Route vidéo — protégée par JWT, idUtilisateur extrait du token
  router.post('/video', connecte, mediasAutorises, uploadVideo.single('video'), async (req, res) => {
    try {
      const idUtilisateur = req.user.id; // extrait du token JWT
      const { description } = req.body;

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

      journaliser(db, req, 'publication_creee', {
        cible: { type: 'publication', id: publication.id, nom: req.user.nom },
        details: `[vidéo] ${extrait(description ?? '')}`
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
  router.post('/photo', connecte, mediasAutorises, uploadPhoto.single('photo'), async (req, res) => {
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

      journaliser(db, req, 'publication_creee', {
        cible: { type: 'publication', id: publication.id, nom: req.user.nom },
        details: `[photo] ${extrait(description ?? '')}`
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
