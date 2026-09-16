/**
 * config.js
 * ------------------------------------------------------------
 * Réglages partagés par le serveur et exposés au navigateur via
 * GET /api/config, pour que l'interface et l'API appliquent
 * exactement les mêmes règles.
 * ------------------------------------------------------------
 */

// Publication de photos et de vidéos (routes du groupe : publication.routes.js,
// upload.middleware.js et video.service.js). Passer ce réglage à false remet la
// fonctionnalité en pause : les boutons restent affichés mais grisés, et l'API
// refuse l'envoi.
export const MEDIAS_ACTIFS = true;

// Règles de compte (appliquées côté serveur ET affichées côté navigateur)
export const NOM_MIN = 3;
export const NOM_MAX = 20;
export const MDP_MIN = 12;   // exigence du projet
export const MDP_MAX = 64;   // limite haute, comme sur les sites professionnels
export const MOTIF_NOM = /^[\p{L}\p{N}._-]+$/u;

export const ROLES = ['user', 'modo', 'admin'];

export const config = {
  mediasActifs: MEDIAS_ACTIFS,
  nomMin: NOM_MIN,
  nomMax: NOM_MAX,
  mdpMin: MDP_MIN,
  mdpMax: MDP_MAX
};
