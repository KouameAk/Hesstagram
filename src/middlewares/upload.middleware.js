import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../public/uploads/temp');

// Créer le dossier s'il n'existe pas
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.3gp', '.m4v', '.ts'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith('video/') || VIDEO_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Le fichier sélectionné doit être une vidéo (mp4, mov, avi, webm, mkv...).'));
  }
};

export const uploadVideo = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 } // 500 Mo max pour une vidéo
});

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

const imageFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith('image/') || IMAGE_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Le fichier sélectionné doit être une image (jpg, png, webp, gif...).'));
  }
};

export const uploadPhoto = multer({ 
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 20 * 1024 * 1024 } // 20 Mo max pour une photo
});

// Middleware d'enrobage pour intercepter proprement les erreurs Multer
export function traiterUploadVideo(req, res, next) {
  uploadVideo.single('video')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'La vidéo est trop volumineuse (maximum 500 Mo).' });
        }
        return res.status(400).json({ success: false, message: `Erreur d'upload : ${err.message}` });
      }
      return res.status(400).json({ success: false, message: err.message || 'Erreur lors de la réception de la vidéo.' });
    }
    next();
  });
}

export function traiterUploadPhoto(req, res, next) {
  uploadPhoto.single('photo')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: "L'image est trop volumineuse (maximum 20 Mo)." });
        }
        return res.status(400).json({ success: false, message: `Erreur d'upload : ${err.message}` });
      }
      return res.status(400).json({ success: false, message: err.message || "Erreur lors de la réception de l'image." });
    }
    next();
  });
}
