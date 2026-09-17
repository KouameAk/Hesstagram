/**
 * medias.service.js
 * ------------------------------------------------------------
 * Emplacement des fichiers envoyés, au même endroit que les
 * modules du groupe :
 *   - photos  → src/public/uploads/temp/     (upload.middleware.js)
 *   - vidéos  → src/public/uploads/videos/   (video.service.js, après conversion MP4)
 *
 * Sert à construire l'URL publique d'un média et à effacer le
 * fichier quand la publication ou le compte est supprimé.
 * ------------------------------------------------------------
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER_PHOTOS = path.join(__dirname, '../public/uploads/temp');
const DOSSIER_VIDEOS = path.join(__dirname, '../public/uploads/videos');

const estVideo = (typeFichier) => String(typeFichier ?? '').startsWith('video/');

// URL utilisée par l'interface (<img> ou <video>).
export function urlMedia(nomFichier, typeFichier) {
  if (!nomFichier) return null;
  return `${estVideo(typeFichier) ? '/uploads/videos' : '/uploads/temp'}/${nomFichier}`;
}

// Chemin du fichier sur le disque.
export function cheminMedia(nomFichier, typeFichier) {
  if (!nomFichier) return null;
  const dossier = estVideo(typeFichier) ? DOSSIER_VIDEOS : DOSSIER_PHOTOS;
  return path.join(dossier, path.basename(nomFichier));
}

// Efface le fichier s'il existe (aucune erreur s'il a déjà disparu).
export function supprimerMedia(nomFichier, typeFichier) {
  const chemin = cheminMedia(nomFichier, typeFichier);
  if (!chemin) return false;
  try {
    fs.unlinkSync(chemin);
    return true;
  } catch {
    return false;
  }
}
