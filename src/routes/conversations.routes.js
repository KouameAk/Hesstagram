/**
 * conversations.routes.js
 * ------------------------------------------------------------
 * Compléments de lecture pour l'écran Messagerie. Les routes du
 * groupe (clé publique, messagerie.routes.js) et l'envoi par
 * WebSocket (websocket/connexion.js) restent inchangés : ici on
 * ne manipule que des messages DÉJÀ chiffrés dans le navigateur.
 *
 *   GET  /api/messagerie/contacts               comptes, clé dispo, non lus
 *   GET  /api/messagerie/contacts/:id           fiche + clé publique
 *   GET  /api/messagerie/conversation/:id       messages (?apres=id)
 *   POST /api/messagerie/trace                  trace « message envoyé »
 * ------------------------------------------------------------
 */
import { Router } from 'express';
import * as conversationsRepository from '../repositories/conversations.repository.js';
import { trouverParId } from '../repositories/comptes.repository.js';
import { journaliser, cibleCompte } from '../services/journal.service.js';
import { exigerSession } from '../middlewares/session.middleware.js';

export function creerRoutesConversations(db) {
  const router = Router();
  router.use('/messagerie', exigerSession);

  router.get('/messagerie/contacts', (req, res) => {
    res.json(conversationsRepository.listerContacts(db, req.user.id));
  });

  router.get('/messagerie/contacts/:id', (req, res) => {
    const utilisateur = trouverParId(db, Number(req.params.id));
    if (!utilisateur) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json({
      id: utilisateur.id,
      nom: utilisateur.nom,
      role: utilisateur.role,
      publicKey: utilisateur.cle_publique ?? null
    });
  });

  // Les messages reçus sont marqués comme vus au passage.
  router.get('/messagerie/conversation/:id', (req, res) => {
    const autre = Number(req.params.id);
    const messages = conversationsRepository.historiqueAvec(db, req.user.id, autre, Number(req.query.apres) || 0);
    conversationsRepository.marquerVus(db, conversationsRepository.trouverConversationPrivee(db, req.user.id, autre), req.user.id);
    res.json(messages);
  });

  // Le contenu reste chiffré : seules les métadonnées vont au journal.
  router.post('/messagerie/trace', (req, res) => {
    const destinataire = trouverParId(db, Number(req.body?.versId));
    if (!destinataire) return res.status(404).json({ error: 'Destinataire introuvable.' });
    journaliser(db, req, 'message_envoye', {
      cible: cibleCompte(destinataire),
      details: 'Contenu chiffré de bout en bout'
    });
    res.json({ ok: true });
  });

  return router;
}
