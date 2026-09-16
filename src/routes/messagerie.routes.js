import { Router } from 'express';
import {
  enregistrerClePublique,
  obtenirClePublique,
  listerContacts,
  trouverConversationPrivee,
  historiqueAvec,
  marquerVus
} from '../repositories/messagerie.repository.js';
import { trouverParNom, trouverParId } from '../repositories/utilisateur.repository.js';
import { journaliser, cibleCompte } from '../services/journal.service.js';
import { verifierToken, creerCompteActif } from '../middlewares/auth.middleware.js';

// Sert à ce que 2 utilisateurs récupèrent la clé publique l'un de l'autre,
// pour calculer leur clé secrète commune (voir chiffrement-navigateur.js).
// L'envoi des messages, lui, passe par le WebSocket (websocket/connexion.js).
export function creerRoutesMessagerie(db) {
  const router = Router();
  const connecte = [verifierToken, creerCompteActif(db)];

  router.post('/messagerie/cle-publique', connecte, (req, res) => {
    enregistrerClePublique(db, req.user.id, req.body.publicKey);
    journaliser(db, req, 'cle_publiee');
    res.json({ ok: true });
  });

  router.get('/messagerie/cle-publique/:nom', connecte, (req, res) => {
    const utilisateur = trouverParNom(db, req.params.nom);
    if (!utilisateur) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const clePublique = obtenirClePublique(db, utilisateur.id);
    if (!clePublique) {
      return res.status(404).json({ error: "Cet utilisateur n'a pas encore de clé publique." });
    }

    res.json({ id: utilisateur.id, nom: utilisateur.nom, publicKey: clePublique });
  });

  // Liste des conversations : tous les comptes, clé disponible et messages non lus
  router.get('/messagerie/contacts', connecte, (req, res) => {
    res.json(listerContacts(db, req.user.id));
  });

  // Fiche d'un contact (nom, rôle, clé publique) avant d'ouvrir la conversation
  router.get('/messagerie/contacts/:id', connecte, (req, res) => {
    const utilisateur = trouverParId(db, Number(req.params.id));
    if (!utilisateur) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json({
      id: utilisateur.id,
      nom: utilisateur.nom,
      role: utilisateur.role,
      publicKey: utilisateur.cle_publique ?? null
    });
  });

  // Messages échangés avec un compte (?apres=id pour ne demander que la suite).
  // Les messages reçus sont marqués comme vus au passage.
  router.get('/messagerie/conversation/:id', connecte, (req, res) => {
    const autre = Number(req.params.id);
    const messages = historiqueAvec(db, req.user.id, autre, Number(req.query.apres) || 0);
    marquerVus(db, trouverConversationPrivee(db, req.user.id, autre), req.user.id);
    res.json(messages);
  });

  // Trace « message envoyé » : le contenu reste chiffré, seules les métadonnées
  // sont journalisées (c'est ce qui déclenche la notification du destinataire).
  router.post('/messagerie/trace', connecte, (req, res) => {
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
