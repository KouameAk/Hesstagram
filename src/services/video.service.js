import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Définir le chemin vers le binaire ffmpeg (fonctionne sur tous les OS)
ffmpeg.setFfmpegPath(ffmpegStatic);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const finalDir = path.join(__dirname, '../public/uploads/videos');

// S'assurer que le dossier final existe
if (!fs.existsSync(finalDir)) {
  fs.mkdirSync(finalDir, { recursive: true });
}

export function convertirVideoEnMp4(cheminSource) {
  return new Promise((resolve, reject) => {
    const nomFichierFinal = `${Date.now()}-converti.mp4`;
    const cheminFinal = path.join(finalDir, nomFichierFinal);

    ffmpeg(cheminSource)
      .output(cheminFinal)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset veryfast', // Accélère la conversion (.preset() de fluent-ffmpeg charge un fichier, pas l'option x264)
        '-pix_fmt yuv420p',
        '-movflags +faststart'
      ])
      .format('mp4')
      .on('end', () => {
        // Supprimer le fichier temporaire original
        fs.unlink(cheminSource, (err) => {
          if (err) console.error('Erreur lors de la suppression du fichier temporaire:', err);
        });
        resolve(nomFichierFinal);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('Erreur FFmpeg complète:', err.message);
        if (stderr) console.error('FFmpeg stderr:', stderr);
        // Supprimer le fichier temporaire
        fs.unlink(cheminSource, () => {});
        reject(new Error(`Échec de la conversion de la vidéo : ${err.message}`));
      })
      .run();
  });
}
