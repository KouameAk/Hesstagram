import { Router } from 'express';
import { publierVideo, publierPhoto, recupererVideos, ErreurPublication } from '../services/publication.service.js';
import { uploadVideo, uploadPhoto } from '../middlewares/upload.middleware.js';
import { convertirVideoEnMp4 } from '../services/video.service.js';
import { verifierToken, creerCompteActif } from '../middlewares/auth.middleware.js';
import { journaliser, extrait } from '../services/journal.service.js';
import { enregistrerHashtags } from '../repositories/fil.repository.js';
import { MEDIAS_ACTIFS } from '../config.js';

export function creerRoutesPublication(db) {
  const router = Router();
  const connecte = [verifierToken, creerCompteActif(db)];

  // Interrupteur unique pour la publication de médias (src/config.js).
  // À false, l'API refuse l'envoi et l'interface grise les boutons : elle lit le
  // même réglage via GET /api/config.
  const mediasAutorises = (req, res, next) => {
    if (!MEDIAS_ACTIFS) {
      return res.status(503).json({
        success: false,
        message: 'La publication de photos et de vidéos est désactivée pour le moment.'
      });
    }
    next();
  };

  // Réception du fichier : les erreurs de multer (mauvais type, fichier trop lourd)
  // sont renvoyées en JSON, comme le reste de l'API — sinon Express répond une page
  // HTML que l'interface ne sait pas lire.
  const recevoirFichier = (champ, televerseur) => (req, res, suite) => {
    televerseur.single(champ)(req, res, (err) => {
      if (!err) return suite();
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Fichier trop lourd (10 Mo pour une photo, 50 Mo pour une vidéo).'
        : err.message;
      res.status(400).json({ success: false, message });
    });
  };

  // Route vidéo — protégée par JWT, idUtilisateur extrait du token
  router.post('/video', connecte, mediasAutorises, recevoirFichier('video', uploadVideo), async (req, res) => {
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

      // Les #hashtags de la légende alimentent la recherche et les tendances,
      // exactement comme pour une publication texte.
      enregistrerHashtags(db, publication.id, description ?? '');
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
  router.post('/photo', connecte, mediasAutorises, recevoirFichier('photo', uploadPhoto), async (req, res) => {
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

      // Les #hashtags de la légende alimentent la recherche et les tendances,
      // exactement comme pour une publication texte.
      enregistrerHashtags(db, publication.id, description ?? '');
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
