/**
 * config.js
 * ------------------------------------------------------------
 * Réglages de l'interface intégrée, partagés par le serveur et
 * exposés au navigateur via GET /api/config pour que les deux
 * côtés appliquent exactement les mêmes règles.
 * ------------------------------------------------------------
 */

// Même secret que auth.service.js et websocket/connexion.js (code du groupe) :
// les tokens émis par POST /api/auth/login sont vérifiés avec cette clé.
export const JWT_SECRET = process.env.JWT_SECRET || 'secret_temporaire_hesstagram';

// Règles de compte (appliquées côté serveur ET affichées côté navigateur)
export const NOM_MIN = 3;
export const NOM_MAX = 20;
export const MDP_MIN = 12;   // exigence du projet (déjà vérifiée par auth.service.js)
export const MDP_MAX = 64;   // limite haute : au-delà, bcrypt ignorerait la fin du mot de passe
export const MOTIF_NOM = /^[\p{L}\p{N}._-]+$/u;

export const ROLES = ['user', 'modo', 'admin'];

export const config = {
  nomMin: NOM_MIN,
  nomMax: NOM_MAX,
  mdpMin: MDP_MIN,
  mdpMax: MDP_MAX
};
