/*
 * ============================================================
 *  TESTS UNITAIRES - HESSTAGRAM
 * ============================================================
 * Tous les tests unitaires du projet sont regroupés ici.
 * Chaque section est isolée dans son propre describe() pour
 * une meilleure lisibilité.
 * ============================================================
 */
import { describe, it, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// -- Repositories & services --
import * as utilisateurRepository from './src/repositories/utilisateur.repository.js';
import { inscrire, connecter, ErreurAuth } from './src/services/auth.service.js';
import { ouvrirBase } from './src/bdd/connexion.js';
import * as publicationRepository from './src/repositories/publication.repository.js';
import { publierVideo, recupererVideos, ErreurPublication } from './src/services/publication.service.js';
import {
  createKeys, getSharedKey, encrypt, decrypt,
  createGroupKey, shareGroupKey, receiveGroupKey,
} from './src/crypto/chiffrement.js';
import { verifierToken, estAdmin, estAdminOuModo } from './src/middlewares/auth.middleware.js';
import {
  enregistrerClePublique, obtenirClePublique,
  creerConversationPrivee, creerGroupe,
  obtenirConversationsUtilisateur, enregistrerMessage, obtenirHistorique,
  enregistrerCleGroupe, obtenirCleGroupe,
} from './src/repositories/messagerie.repository.js';
import { listerUtilisateursSignales, bannirUtilisateur, debannirUtilisateur } from './src/repositories/moderation.repository.js';
import { listerUtilisateurs, definirRole } from './src/repositories/utilisateur.repository.js';
import { creerRegistre } from './src/services/messagerie.service.js';

// -- Interfaces intégrées : fil, social, modération, administration, journal --
import { changerMotDePasse, fermerCompte } from './src/services/auth.service.js';
import { creerCompteActif } from './src/middlewares/auth.middleware.js';
import * as filRepository from './src/repositories/fil.repository.js';
import * as filService from './src/services/fil.service.js';
import * as socialService from './src/services/social.service.js';
import * as moderationService from './src/services/moderation.service.js';
import * as administrationService from './src/services/administration.service.js';
import * as administrationRepository from './src/repositories/administration.repository.js';
import { journaliser, notifications, ACTIONS } from './src/services/journal.service.js';
import { listerJournal } from './src/repositories/journal.repository.js';
import { ErreurMetier } from './src/services/erreurs.js';
import { installerDonneesInitiales, COMPTES_PRECONFIGURES } from './src/bdd/donnees-initiales.js';
import { MDP_MIN, MDP_MAX, MEDIAS_ACTIFS, ROLES } from './src/config.js';
import { urlMedia, cheminMedia } from './src/services/medias.service.js';
import { publierPhoto } from './src/services/publication.service.js';


// ============================================================
//  AUTH SERVICE - Logique métier de l'authentification
// ============================================================
describe('auth.service.js - logique métier', () => {
  let db;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
  });

  it('inscrire() refuse si nom ou mdp manquant', async () => {
    await assert.rejects(() => inscrire(db, { nom: '', mdp: '' }), ErreurAuth);
  });

  it('inscrire() refuse un mot de passe trop court', async () => {
    await assert.rejects(() => inscrire(db, { nom: 'valou', mdp: '123' }), ErreurAuth);
  });

  it('inscrire() refuse un nom déjà pris', async () => {
    await inscrire(db, { nom: 'valou', mdp: '123456789012' });
    await assert.rejects(() => inscrire(db, { nom: 'valou', mdp: '123456789012' }), ErreurAuth);
  });

  it('inscrire() crée un utilisateur avec un mot de passe hashé (jamais en clair)', async () => {
    const user = await inscrire(db, { nom: 'valou', mdp: '123456789012' });

    const userInDb = utilisateurRepository.trouverParNom(db, 'valou');
    assert.notEqual(userInDb.mdp, '123456789012');
    assert.ok(userInDb.mdp.startsWith('$2')); // bcrypt format

    assert.equal(user.nom, 'valou');
    assert.equal(user.role, 'user');
  });

  it('connecter() refuse un utilisateur inconnu', async () => {
    await assert.rejects(() => connecter(db, { nom: 'inconnu', mdp: '123456789012' }), ErreurAuth);
  });

  it('connecter() refuse un mauvais mot de passe', async () => {
    await inscrire(db, { nom: 'valou', mdp: 'bonmotdepasse123' });
    await assert.rejects(() => connecter(db, { nom: 'valou', mdp: 'mauvaismotdepasse123' }), ErreurAuth);
  });

  it('connecter() renvoie un token JWT si le mdp est correct', async () => {
    await inscrire(db, { nom: 'valou', mdp: 'bonmotdepasse123' });
    const { token, user } = await connecter(db, { nom: 'valou', mdp: 'bonmotdepasse123' });

    assert.ok(token);
    assert.equal(user.nom, 'valou');
    assert.equal(user.role, 'user');
  });
});


// ============================================================
//  UTILISATEUR REPOSITORY - Accès aux données
// ============================================================
describe('utilisateur.repository.js - accès aux données', () => {
  let db;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
  });

  it("trouverParNom() renvoie undefined si le nom n'existe pas", () => {
    assert.equal(utilisateurRepository.trouverParNom(db, 'personne'), undefined);
  });

  it('creerUtilisateur() puis trouverParNom() retrouve le même utilisateur', () => {
    utilisateurRepository.creerUtilisateur(db, {
      nom: 'valou', mdpHash: 'hash_bidon', date: new Date().toISOString(), role: 'user',
    });
    const user = utilisateurRepository.trouverParNom(db, 'valou');
    assert.equal(user.nom, 'valou');
    assert.equal(user.mdp, 'hash_bidon');
    assert.equal(user.role, 'user');
  });

  it("creerUtilisateur() stocke tel quel ce qu'on lui donne", () => {
    utilisateurRepository.creerUtilisateur(db, {
      nom: 'test', mdpHash: '$2a$10$fauxHashPourLeTest', date: new Date().toISOString(), role: 'user',
    });
    const user = utilisateurRepository.trouverParNom(db, 'test');
    assert.equal(user.mdp, '$2a$10$fauxHashPourLeTest');
  });

  it('deux utilisateurs différents ont des ids différents', () => {
    const r1 = utilisateurRepository.creerUtilisateur(db, {
      nom: 'a', mdpHash: 'h1', date: new Date().toISOString(), role: 'user',
    });
    const r2 = utilisateurRepository.creerUtilisateur(db, {
      nom: 'b', mdpHash: 'h2', date: new Date().toISOString(), role: 'user',
    });
    assert.notEqual(r1.lastInsertRowid, r2.lastInsertRowid);
  });
});


// ============================================================
//  PUBLICATION SERVICE - Logique métier pour les vidéos
// ============================================================
describe('publication.service.js - logique métier pour les vidéos', () => {
  let db;

  beforeEach(() => {
    db = ouvrirBase(':memory:');
    utilisateurRepository.creerUtilisateur(db, {
      nom: 'testuser', mdpHash: 'hash', date: new Date().toISOString(), role: 'user',
    });
  });

  it('publierVideo() refuse si idUtilisateur est manquant', async () => {
    await assert.rejects(
      () => publierVideo(db, { idUtilisateur: null, description: 'Test', nomFichier: 'video.mp4', typeFichier: 'video/mp4' }),
      ErreurPublication
    );
  });

  it("publierVideo() refuse si le fichier n'est pas une vidéo", async () => {
    await assert.rejects(
      () => publierVideo(db, { idUtilisateur: 1, description: 'Test', nomFichier: 'image.jpg', typeFichier: 'image/jpeg' }),
      ErreurPublication
    );
  });

  it("publierVideo() refuse si l'utilisateur n'existe pas", async () => {
    await assert.rejects(
      () => publierVideo(db, { idUtilisateur: 999, description: 'Test', nomFichier: 'video.mp4', typeFichier: 'video/mp4' }),
      ErreurPublication
    );
  });

  it('publierVideo() crée une publication vidéo avec succès', async () => {
    const pub = await publierVideo(db, {
      idUtilisateur: 1, description: 'Superbe vidéo', nomFichier: 'mavid.mp4', typeFichier: 'video/mp4',
    });
    assert.ok(pub.id);
    assert.equal(pub.id_utilisateur, 1);
    assert.equal(pub.description, 'Superbe vidéo');
    assert.equal(pub.nom_fichier, 'mavid.mp4');
    assert.equal(pub.type_fichier, 'video/mp4');
  });

  it('recupererVideos() ne retourne que des vidéos, ordonnées par date', async () => {
    publicationRepository.creerPublication(db, {
      idUtilisateur: 1, description: 'v1', nomFichier: '1.mp4', typeFichier: 'video/mp4',
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    publicationRepository.creerPublication(db, {
      idUtilisateur: 1, description: 'i1', nomFichier: '1.jpg', typeFichier: 'image/jpeg',
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    publicationRepository.creerPublication(db, {
      idUtilisateur: 1, description: 'v2', nomFichier: '2.mp4', typeFichier: 'video/mp4',
    });

    const videos = await recupererVideos(db);

    assert.equal(videos.length, 2);
    assert.equal(videos[0].description, 'v2');
    assert.equal(videos[1].description, 'v1');
    assert.ok(videos[0].type_fichier.startsWith('video/'));
    assert.ok(videos[1].type_fichier.startsWith('video/'));
  });
});


// ============================================================
//  CHIFFREMENT - Cryptographie de bout en bout
// ============================================================
describe('chiffrement.js - cryptographie', () => {
  it('createKeys produit une paire de clés différente à chaque appel', () => {
    const pair1 = createKeys();
    const pair2 = createKeys();
    assert.notEqual(pair1.publicKey, pair2.publicKey);
    assert.notEqual(pair1.privateKey, pair2.privateKey);
  });

  it('Alice et Bob obtiennent la même clé partagée (échange Diffie-Hellman)', () => {
    const alice = createKeys();
    const bob = createKeys();
    const sharedKeyAlice = getSharedKey(alice.privateKey, bob.publicKey);
    const sharedKeyBob = getSharedKey(bob.privateKey, alice.publicKey);
    assert.deepEqual(sharedKeyAlice, sharedKeyBob);
  });

  it('un message chiffré puis déchiffré redonne le message original', () => {
    const alice = createKeys();
    const bob = createKeys();
    const sharedKey = getSharedKey(alice.privateKey, bob.publicKey);
    const message = 'Salut Bob, comment ça va ?';
    const encrypted = encrypt(message, sharedKey);
    assert.equal(decrypt(encrypted, sharedKey), message);
  });

  it('deux chiffrements du même message donnent un résultat différent (IV aléatoire)', () => {
    const alice = createKeys();
    const bob = createKeys();
    const sharedKey = getSharedKey(alice.privateKey, bob.publicKey);
    const encrypted1 = encrypt('Même message', sharedKey);
    const encrypted2 = encrypt('Même message', sharedKey);
    assert.notEqual(encrypted1.ciphertext, encrypted2.ciphertext);
  });

  it('le déchiffrement échoue si on utilise la mauvaise clé (personne extérieure)', () => {
    const alice = createKeys();
    const bob = createKeys();
    const eve = createKeys();
    const sharedKeyAliceBob = getSharedKey(alice.privateKey, bob.publicKey);
    const sharedKeyEve = getSharedKey(eve.privateKey, bob.publicKey);
    const encrypted = encrypt('Message secret', sharedKeyAliceBob);
    assert.throws(() => decrypt(encrypted, sharedKeyEve));
  });

  it('createGroupKey produit une clé différente à chaque appel', () => {
    const k1 = createGroupKey();
    const k2 = createGroupKey();
    assert.notEqual(k1.toString('base64'), k2.toString('base64'));
  });

  it("un membre retrouve exactement la même clé de groupe que celle créée par l'admin", () => {
    const admin = createKeys();
    const membre = createKeys();
    const groupKey = createGroupKey();
    const clePourMembre = shareGroupKey(groupKey, admin.privateKey, membre.publicKey);
    const groupKeyRecue = receiveGroupKey(clePourMembre, membre.privateKey, admin.publicKey);
    assert.deepEqual(groupKeyRecue, groupKey);
  });

  it('deux membres du groupe peuvent se lire entre eux avec la clé de groupe', () => {
    const admin = createKeys();
    const alice = createKeys();
    const bob = createKeys();
    const groupKey = createGroupKey();
    const cleAlice = receiveGroupKey(shareGroupKey(groupKey, admin.privateKey, alice.publicKey), alice.privateKey, admin.publicKey);
    const cleBob = receiveGroupKey(shareGroupKey(groupKey, admin.privateKey, bob.publicKey), bob.privateKey, admin.publicKey);
    const message = 'Salut le groupe !';
    assert.equal(decrypt(encrypt(message, cleAlice), cleBob), message);
  });

  it('une personne hors du groupe ne peut pas lire les messages du groupe', () => {
    const groupKey = createGroupKey();
    const intrus = createGroupKey();
    const encrypted = encrypt('Message du groupe', groupKey);
    assert.throws(() => decrypt(encrypted, intrus));
  });
});


// ============================================================
//  AUTH MIDDLEWARE - Vérification des tokens JWT
// ============================================================
describe('auth.middleware.js - vérification des tokens', () => {
  function creerReponseBidon() {
    const reponse = { statutEnvoye: null, corpsEnvoye: null };
    reponse.status = (code) => { reponse.statutEnvoye = code; return reponse; };
    reponse.json = (corps) => { reponse.corpsEnvoye = corps; return reponse; };
    return reponse;
  }

  it("verifierToken refuse une requête sans en-tête Authorization", () => {
    const req = { headers: {} };
    const res = creerReponseBidon();
    let suivantAppele = false;
    verifierToken(req, res, () => { suivantAppele = true; });
    assert.equal(suivantAppele, false);
    assert.equal(res.statutEnvoye, 401);
  });

  it('verifierToken accepte un token et remplit req.user', () => {
    const token = jwt.sign({ id: 1, nom: 'alice', role: 'admin' }, process.env.JWT_SECRET || 'secret_temporaire_hesstagram');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = creerReponseBidon();
    let suivantAppele = false;
    verifierToken(req, res, () => { suivantAppele = true; });
    assert.equal(suivantAppele, true);
    assert.equal(req.user.nom, 'alice');
    assert.equal(req.user.role, 'admin');
  });

  it("estAdmin bloque un utilisateur qui n'est pas admin", () => {
    const req = { user: { role: 'user' } };
    const res = creerReponseBidon();
    let suivantAppele = false;
    estAdmin(req, res, () => { suivantAppele = true; });
    assert.equal(suivantAppele, false);
    assert.equal(res.statutEnvoye, 403);
  });

  it('estAdmin laisse passer un admin', () => {
    const req = { user: { role: 'admin' } };
    const res = creerReponseBidon();
    let suivantAppele = false;
    estAdmin(req, res, () => { suivantAppele = true; });
    assert.equal(suivantAppele, true);
  });

  it('estAdminOuModo bloque un simple utilisateur', () => {
    const req = { user: { role: 'user' } };
    const res = creerReponseBidon();
    let suivantAppele = false;
    estAdminOuModo(req, res, () => { suivantAppele = true; });
    assert.equal(suivantAppele, false);
    assert.equal(res.statutEnvoye, 403);
  });

  it('estAdminOuModo laisse passer un modo', () => {
    const req = { user: { role: 'modo' } };
    const res = creerReponseBidon();
    let suivantAppele = false;
    estAdminOuModo(req, res, () => { suivantAppele = true; });
    assert.equal(suivantAppele, true);
  });
});


// ============================================================
//  MESSAGERIE REPOSITORY - Accès aux données de messagerie
// ============================================================
describe('messagerie.repository.js - accès aux données', () => {
  const messageBidon = { iv: 'iv', ciphertext: 'chiffre', authTag: 'tag' };

  function creerBaseDeTest() {
    const db = ouvrirBase(':memory:');
    const ajouter = db.prepare('INSERT INTO utilisateur (nom, mdp) VALUES (?, ?)');
    const alice = Number(ajouter.run('alice', 'mdp-de-test').lastInsertRowid);
    const bob = Number(ajouter.run('bob', 'mdp-de-test').lastInsertRowid);
    const charlie = Number(ajouter.run('charlie', 'mdp-de-test').lastInsertRowid);
    return { db, alice, bob, charlie };
  }

  it("la clé publique enregistrée est bien celle qu'on relit ensuite", () => {
    const { db, alice } = creerBaseDeTest();
    enregistrerClePublique(db, alice, 'cle-publique-de-test');
    assert.equal(obtenirClePublique(db, alice), 'cle-publique-de-test');
  });

  it("une conversation privée entre 2 personnes n'est créée qu'une seule fois", () => {
    const { db, alice, bob } = creerBaseDeTest();
    const id1 = creerConversationPrivee(db, alice, bob);
    const id2 = creerConversationPrivee(db, bob, alice);
    assert.equal(id1, id2);
  });

  it('créer un groupe ajoute bien tous les membres donnés', () => {
    const { db, alice, bob, charlie } = creerBaseDeTest();
    const conversationId = creerGroupe(db, 'Groupe projet', alice, [alice, bob, charlie]);
    assert.deepEqual(obtenirConversationsUtilisateur(db, bob), [conversationId]);
    assert.deepEqual(obtenirConversationsUtilisateur(db, charlie), [conversationId]);
  });

  it("un message enregistré apparaît dans l'historique de sa conversation", () => {
    const { db, alice, bob } = creerBaseDeTest();
    const conversationId = creerConversationPrivee(db, alice, bob);
    enregistrerMessage(db, conversationId, alice, messageBidon);
    const historique = obtenirHistorique(db, conversationId);
    assert.equal(historique.length, 1);
    assert.equal(historique[0].ciphertext, 'chiffre');
    assert.equal(historique[0].expediteurId, alice);
  });

  it("la clé de groupe enregistrée pour un membre est bien celle qu'on relit", () => {
    const { db, alice, bob } = creerBaseDeTest();
    const conversationId = creerGroupe(db, 'Groupe', alice, [alice, bob]);
    enregistrerCleGroupe(db, conversationId, bob, messageBidon);
    const cle = obtenirCleGroupe(db, conversationId, bob);
    assert.equal(cle?.ciphertext, 'chiffre');
  });

  it("pas de clé de groupe pour quelqu'un qui n'en a jamais reçu", () => {
    const { db, alice, bob } = creerBaseDeTest();
    const conversationId = creerGroupe(db, 'Groupe', alice, [alice, bob]);
    assert.equal(obtenirCleGroupe(db, conversationId, bob), undefined);
  });
});


// ============================================================
//  MODERATION REPOSITORY - Signalements et bannissements
// ============================================================
describe('moderation.repository.js - signalements et bans', () => {
  function creerBaseDeTest() {
    const db = ouvrirBase(':memory:');
    const ajouterUtilisateur = db.prepare('INSERT INTO utilisateur (nom, mdp) VALUES (?, ?)');
    const alice = Number(ajouterUtilisateur.run('alice', 'mdp-de-test').lastInsertRowid);
    const bob = Number(ajouterUtilisateur.run('bob', 'mdp-de-test').lastInsertRowid);
    const charlie = Number(ajouterUtilisateur.run('charlie', 'mdp-de-test').lastInsertRowid);
    const signaler = db.prepare('INSERT INTO signalement (id_signalé, id_signalant, raison, date) VALUES (?, ?, ?, CURRENT_TIMESTAMP)');
    return { db, alice, bob, charlie, signaler };
  }

  it("un utilisateur jamais signalé n'apparaît pas dans la liste", () => {
    const { db } = creerBaseDeTest();
    assert.deepEqual(listerUtilisateursSignales(db), []);
  });

  it('un utilisateur signalé apparaît avec le bon nombre de signalements', () => {
    const { db, alice, bob, charlie, signaler } = creerBaseDeTest();
    signaler.run(bob, alice, 'spam');
    signaler.run(bob, charlie, 'harcèlement');
    const resultat = listerUtilisateursSignales(db);
    assert.equal(resultat.length, 1);
    assert.equal(resultat[0].id, bob);
    assert.equal(resultat[0].nombre_signalements, 2);
  });

  it('les utilisateurs signalés sont triés du plus signalé au moins signalé', () => {
    const { db, alice, bob, charlie, signaler } = creerBaseDeTest();
    signaler.run(bob, alice, 'spam');
    signaler.run(charlie, alice, 'spam');
    signaler.run(charlie, bob, 'spam');
    const resultat = listerUtilisateursSignales(db);
    assert.equal(resultat[0].id, charlie);
    assert.equal(resultat[0].nombre_signalements, 2);
    assert.equal(resultat[1].id, bob);
    assert.equal(resultat[1].nombre_signalements, 1);
  });

  it('bannirUtilisateur puis debannirUtilisateur changent bien le statut', () => {
    const { db, bob } = creerBaseDeTest();
    bannirUtilisateur(db, bob);
    let ligne = db.prepare('SELECT banni FROM utilisateur WHERE id = ?').get(bob);
    assert.equal(ligne.banni, 1);
    debannirUtilisateur(db, bob);
    ligne = db.prepare('SELECT banni FROM utilisateur WHERE id = ?').get(bob);
    assert.equal(ligne.banni, 0);
  });
});


// ============================================================
//  UTILISATEUR REPOSITORY (admin) - Rôles et listing
// ============================================================
describe('utilisateur.repository.js - rôles et listing', () => {
  function creerBaseDeTest() {
    const db = ouvrirBase(':memory:');
    const ajouter = db.prepare('INSERT INTO utilisateur (nom, mdp, role) VALUES (?, ?, ?)');
    const alice = Number(ajouter.run('alice', 'mdp-de-test', 'user').lastInsertRowid);
    const bob = Number(ajouter.run('bob', 'mdp-de-test', 'user').lastInsertRowid);
    return { db, alice, bob };
  }

  it('listerUtilisateurs retourne tout le monde avec son rôle', () => {
    const { db } = creerBaseDeTest();
    const utilisateurs = listerUtilisateurs(db);
    assert.equal(utilisateurs.length, 2);
    assert.equal(utilisateurs[0].role, 'user');
  });

  it('definirRole change bien le rôle de la bonne personne', () => {
    const { db, alice, bob } = creerBaseDeTest();
    definirRole(db, alice, 'modo');
    const utilisateurs = listerUtilisateurs(db);
    assert.equal(utilisateurs.find(u => u.id === alice).role, 'modo');
    assert.equal(utilisateurs.find(u => u.id === bob).role, 'user');
  });

  it('definirRole peut retirer le rôle modo (repasser à user)', () => {
    const { db, alice } = creerBaseDeTest();
    definirRole(db, alice, 'modo');
    definirRole(db, alice, 'user');
    assert.equal(listerUtilisateurs(db).find(u => u.id === alice).role, 'user');
  });
});


// ============================================================
//  MESSAGERIE SERVICE - Livraison en temps réel
// ============================================================
describe('messagerie.service.js - livraison des messages', () => {
  const messageBidon = { iv: 'x', ciphertext: 'y', authTag: 'z' };

  function creerEspion() {
    const messagesRecus = [];
    return { envoyer: (message) => messagesRecus.push(message), messagesRecus };
  }

  it('un message privé est livré au destinataire connecté', () => {
    const registre = creerRegistre();
    const bob = creerEspion();
    registre.connecter('alice', () => {});
    registre.connecter('bob', bob.envoyer);
    const livre = registre.envoyerMessagePrive('alice', 'bob', messageBidon);
    assert.equal(livre, true);
    assert.equal(bob.messagesRecus.length, 1);
    assert.match(bob.messagesRecus[0], /\"de\":\"alice\"/);
  });

  it("un message privé vers quelqu'un de déconnecté n'est pas livré", () => {
    const registre = creerRegistre();
    const livre = registre.envoyerMessagePrive('alice', 'bob', messageBidon);
    assert.equal(livre, false);
  });

  it("un message de groupe est livré à tous les membres connectés sauf l'expéditeur", () => {
    const registre = creerRegistre();
    const alice = creerEspion();
    const bob = creerEspion();
    const charlie = creerEspion();
    registre.connecter('alice', alice.envoyer);
    registre.connecter('bob', bob.envoyer);
    registre.connecter('charlie', charlie.envoyer);
    registre.rejoindreGroupe('groupe1', 'alice');
    registre.rejoindreGroupe('groupe1', 'bob');
    registre.rejoindreGroupe('groupe1', 'charlie');
    const nombreLivres = registre.envoyerMessageGroupe('alice', 'groupe1', messageBidon);
    assert.equal(nombreLivres, 2);
    assert.equal(alice.messagesRecus.length, 0);
    assert.equal(bob.messagesRecus.length, 1);
    assert.equal(charlie.messagesRecus.length, 1);
  });

  it("un utilisateur déconnecté ne reçoit plus les messages de groupe", () => {
    const registre = creerRegistre();
    const bob = creerEspion();
    registre.connecter('alice', () => {});
    registre.connecter('bob', bob.envoyer);
    registre.rejoindreGroupe('groupe1', 'alice');
    registre.rejoindreGroupe('groupe1', 'bob');
    registre.deconnecter('bob');
    const nombreLivres = registre.envoyerMessageGroupe('alice', 'groupe1', messageBidon);
    assert.equal(nombreLivres, 0);
    assert.equal(bob.messagesRecus.length, 0);
  });
});


/*
 * ============================================================
 *  TESTS DES INTERFACES INTÉGRÉES
 * ============================================================
 * Fil d'actualité, profils et abonnements, modération,
 * administration, journal/notifications, comptes préconfigurés.
 *
 * Outils partagés par les sections qui suivent.
 * ============================================================
 */

// Crée un compte directement en base (pas de hash : les tests qui ont besoin
// d'un vrai mot de passe passent par inscrire()).
function creerCompteTest(db, nom, role = 'user') {
  const info = db
    .prepare('INSERT INTO utilisateur (nom, mdp, date, role, banni) VALUES (?, ?, ?, ?, 0)')
    .run(nom, 'hash-de-test', new Date().toISOString(), role);
  return { id: Number(info.lastInsertRowid), nom, role };
}

// Fausse requête Express : les services attendent { user, ip, body }.
function requeteDe(user, body = {}) {
  return { user, ip: '127.0.0.1', body };
}

function reponseBidon() {
  const reponse = { statutEnvoye: null, corpsEnvoye: null };
  reponse.status = (code) => { reponse.statutEnvoye = code; return reponse; };
  reponse.json = (corps) => { reponse.corpsEnvoye = corps; return reponse; };
  return reponse;
}


// ============================================================
//  CONFIG - Règles partagées serveur / interface
// ============================================================
describe('config.js - règles communes', () => {
  it('le mot de passe exige 12 caractères minimum et 64 maximum', () => {
    assert.equal(MDP_MIN, 12);
    assert.equal(MDP_MAX, 64);
  });

  it('la publication de médias tient à un seul réglage', () => {
    assert.equal(typeof MEDIAS_ACTIFS, 'boolean');
  });

  it('les trois rôles du projet sont user, modo et admin', () => {
    assert.deepEqual(ROLES, ['user', 'modo', 'admin']);
  });
});


// ============================================================
//  AUTH SERVICE - Règles ajoutées (nom, longueur, suspension)
// ============================================================
describe('auth.service.js - règles de compte', () => {
  let db;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
  });

  it('inscrire() refuse un nom de moins de 3 caractères', async () => {
    await assert.rejects(() => inscrire(db, { nom: 'ab', mdp: 'motdepasse1234' }), ErreurAuth);
  });

  it('inscrire() refuse un nom avec des caractères interdits', async () => {
    await assert.rejects(() => inscrire(db, { nom: 'jean dupont!', mdp: 'motdepasse1234' }), ErreurAuth);
  });

  it('inscrire() refuse un mot de passe de plus de 64 caractères', async () => {
    await assert.rejects(() => inscrire(db, { nom: 'valou', mdp: 'a'.repeat(65) }), ErreurAuth);
  });

  it('inscrire() accepte exactement 12 caractères (la limite basse)', async () => {
    const user = await inscrire(db, { nom: 'valou', mdp: '123456789012' });
    assert.equal(user.nom, 'valou');
  });

  it('inscrire() laisse une trace « inscription » dans le journal', async () => {
    await inscrire(db, { nom: 'valou', mdp: 'motdepasse1234' });
    const { lignes } = listerJournal(db, {});
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].action, 'inscription');
    assert.equal(lignes[0].nom_utilisateur, 'valou');
  });

  it('connecter() refuse un compte suspendu et explique pourquoi', async () => {
    const user = await inscrire(db, { nom: 'valou', mdp: 'motdepasse1234' });
    administrationRepository.suspendre(db, { idUtilisateur: user.id, raison: 'Spam', fin: null, idAdmin: null });

    await assert.rejects(
      () => connecter(db, { nom: 'valou', mdp: 'motdepasse1234' }),
      (err) => err instanceof ErreurAuth && err.statut === 403 && /suspendu/i.test(err.message),
    );
  });

  it('connecter() trace les échecs de connexion (sécurité)', async () => {
    await inscrire(db, { nom: 'valou', mdp: 'motdepasse1234' });
    await assert.rejects(() => connecter(db, { nom: 'valou', mdp: 'mauvaismotdepasse' }), ErreurAuth);

    const { lignes } = listerJournal(db, { action: 'connexion_echouee' });
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].categorie, 'securite');
  });

  it('changerMotDePasse() exige le bon mot de passe actuel', async () => {
    const user = await inscrire(db, { nom: 'valou', mdp: 'motdepasse1234' });
    await assert.rejects(
      () => changerMotDePasse(db, requeteDe(user), { ancien: 'faux', nouveau: 'nouveaumdp12345' }),
      ErreurAuth,
    );
  });

  it('changerMotDePasse() remplace bien le hash en base', async () => {
    const user = await inscrire(db, { nom: 'valou', mdp: 'motdepasse1234' });
    const avant = utilisateurRepository.trouverParId(db, user.id).mdp;

    await changerMotDePasse(db, requeteDe(user), { ancien: 'motdepasse1234', nouveau: 'nouveaumdp12345' });

    const apres = utilisateurRepository.trouverParId(db, user.id).mdp;
    assert.notEqual(avant, apres);
    const { token } = await connecter(db, { nom: 'valou', mdp: 'nouveaumdp12345' });
    assert.ok(token);
  });

  it('fermerCompte() refuse pour un administrateur', async () => {
    const user = await inscrire(db, { nom: 'chef', mdp: 'motdepasse1234' });
    definirRole(db, user.id, 'admin');

    await assert.rejects(
      () => fermerCompte(db, requeteDe({ ...user, role: 'admin' }), 'motdepasse1234'),
      (err) => err instanceof ErreurAuth && err.statut === 403,
    );
    assert.ok(utilisateurRepository.trouverParId(db, user.id));
  });

  it('fermerCompte() supprime le compte quand le mot de passe est bon', async () => {
    const user = await inscrire(db, { nom: 'valou', mdp: 'motdepasse1234' });
    await fermerCompte(db, requeteDe(user), 'motdepasse1234');
    assert.equal(utilisateurRepository.trouverParId(db, user.id), undefined);
  });
});


// ============================================================
//  MIDDLEWARE - Compte actif (relecture en base à chaque requête)
// ============================================================
describe('auth.middleware.js - compte actif', () => {
  let db;
  let compteActif;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
    compteActif = creerCompteActif(db);
  });

  it('laisse passer un compte normal et rafraîchit son rôle', () => {
    const user = creerCompteTest(db, 'alice');
    definirRole(db, user.id, 'modo');                 // rôle changé après l'émission du token

    const req = { user: { id: user.id, nom: 'alice', role: 'user' } };
    const res = reponseBidon();
    let suivantAppele = false;
    compteActif(req, res, () => { suivantAppele = true; });

    assert.equal(suivantAppele, true);
    assert.equal(req.user.role, 'modo');              // c'est la base qui fait foi
  });

  it('renvoie 401 si le compte a été supprimé entre-temps', () => {
    const req = { user: { id: 999, nom: 'fantome', role: 'user' } };
    const res = reponseBidon();
    let suivantAppele = false;
    compteActif(req, res, () => { suivantAppele = true; });

    assert.equal(suivantAppele, false);
    assert.equal(res.statutEnvoye, 401);
  });

  it('renvoie 403 avec la raison si le compte est suspendu', () => {
    const user = creerCompteTest(db, 'alice');
    administrationRepository.suspendre(db, { idUtilisateur: user.id, raison: 'Harcèlement', fin: null, idAdmin: null });

    const req = { user: { id: user.id, nom: 'alice', role: 'user' } };
    const res = reponseBidon();
    let suivantAppele = false;
    compteActif(req, res, () => { suivantAppele = true; });

    assert.equal(suivantAppele, false);
    assert.equal(res.statutEnvoye, 403);
    assert.match(res.corpsEnvoye.error, /Harcèlement/);
  });
});


// ============================================================
//  FIL D'ACTUALITÉ - Publications, hashtags, commentaires
// ============================================================
describe('fil.service.js - publications', () => {
  let db;
  let alice;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
    alice = creerCompteTest(db, 'alice');
  });

  it('publier() enregistre le texte et renvoie son id', () => {
    const { id } = filService.publier(db, requeteDe(alice), { description: 'Bonjour tout le monde' });
    const [publication] = filRepository.listerPublications(db, alice.id, { id });
    assert.equal(publication.description, 'Bonjour tout le monde');
    assert.equal(publication.auteur, 'alice');
  });

  it('publier() refuse un texte vide', () => {
    assert.throws(() => filService.publier(db, requeteDe(alice), { description: '   ' }), ErreurMetier);
  });

  it('publier() refuse un texte de plus de 2200 caractères', () => {
    assert.throws(() => filService.publier(db, requeteDe(alice), { description: 'a'.repeat(2201) }), ErreurMetier);
  });

  it('publier() refuse un média en JSON : photos et vidéos passent par l’envoi de fichier', () => {
    assert.throws(
      () => filService.publier(db, requeteDe(alice), { description: 'photo', media: 'data:image/png;base64,AAAA' }),
      (err) => err instanceof ErreurMetier && [400, 503].includes(err.statut),
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM publication').get().n, 0);
  });

  it('publier() enregistre les #hashtags, une seule fois chacun', () => {
    filService.publier(db, requeteDe(alice), { description: 'Sortie #rando au col #rando #vosges' });
    const tendances = filRepository.tendances(db);
    const noms = tendances.map((t) => t.nom).sort();
    assert.deepEqual(noms, ['#rando', '#vosges']);
    assert.equal(tendances.find((t) => t.nom === '#rando').total, 1);
  });

  it('rattraperHashtags() récupère les publications entrées sans passer par l’API', () => {
    db.prepare(
      `INSERT INTO publication (id_utilisateur, date, description, nom_fichier, type_fichier,
                                vue, "like", "dislike", partage, republie)
       VALUES (?, ?, ?, NULL, 'texte', 0, 0, 0, 0, 0)`,
    ).run(alice.id, new Date().toISOString(), 'Vieille publication #alsace');

    assert.equal(filRepository.tendances(db).length, 0);
    const rattrapees = filRepository.rattraperHashtags(db);
    assert.equal(rattrapees, 1);
    assert.equal(filRepository.tendances(db)[0].nom, '#alsace');
  });

  it('commenter() ajoute le commentaire à la publication', () => {
    const bob = creerCompteTest(db, 'bob');
    const { id } = filService.publier(db, requeteDe(alice), { description: 'Ma photo de vacances' });

    filService.commenter(db, requeteDe(bob), id, 'Très joli !');

    const [publication] = filRepository.listerPublications(db, alice.id, { id });
    assert.equal(publication.nb_commentaires, 1);
    assert.equal(publication.commentaires[0].auteur, 'bob');
    assert.equal(publication.commentaires[0].commentaire, 'Très joli !');
  });

  it('commenter() refuse un commentaire vide ou trop long', () => {
    const { id } = filService.publier(db, requeteDe(alice), { description: 'Coucou' });
    assert.throws(() => filService.commenter(db, requeteDe(alice), id, '  '), ErreurMetier);
    assert.throws(() => filService.commenter(db, requeteDe(alice), id, 'a'.repeat(501)), ErreurMetier);
  });

  it('supprimer() est refusé à un membre qui n’est pas l’auteur', () => {
    const bob = creerCompteTest(db, 'bob');
    const { id } = filService.publier(db, requeteDe(alice), { description: 'Mon texte' });

    assert.throws(
      () => filService.supprimer(db, requeteDe(bob), id),
      (err) => err instanceof ErreurMetier && err.statut === 403,
    );
  });

  it('supprimer() par l’auteur efface aussi ses commentaires et ses j’aime', () => {
    const bob = creerCompteTest(db, 'bob');
    const { id } = filService.publier(db, requeteDe(alice), { description: 'Mon texte #test' });
    filService.commenter(db, requeteDe(bob), id, 'Bien vu');
    filRepository.ajouterLike(db, id, bob.id);

    filService.supprimer(db, requeteDe(alice), id);

    assert.equal(filRepository.listerPublications(db, alice.id, { id }).length, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM commentaire').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM "like"').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hashtag').get().n, 0);
  });

  it('supprimer() par un modérateur est tracé comme une décision de modération', () => {
    const modo = creerCompteTest(db, 'marc', 'modo');
    const { id } = filService.publier(db, requeteDe(alice), { description: 'Contenu limite' });

    filService.supprimer(db, requeteDe(modo, { raison: 'Spam' }), id);

    const { lignes } = listerJournal(db, { action: 'publication_moderee' });
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].nom_utilisateur, 'marc');
    assert.equal(lignes[0].cible_nom, 'alice');       // l'auteur est la cible : il sera notifié
    assert.match(lignes[0].details, /Spam/);
  });
});


// ============================================================
//  FIL - Compteurs de réactions (j'aime / je n'aime pas)
// ============================================================
describe('fil.repository.js - réactions', () => {
  let db;
  let alice;
  let bob;
  let idPublication;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
    alice = creerCompteTest(db, 'alice');
    bob = creerCompteTest(db, 'bob');
    idPublication = filService.publier(db, requeteDe(alice), { description: 'Une publication' }).id;
  });

  it('un j’aime met à jour le compteur de la publication', () => {
    filRepository.ajouterLike(db, idPublication, bob.id);
    const compteurs = db.prepare('SELECT "like" AS likes, "dislike" AS dislikes FROM publication WHERE id = ?').get(idPublication);
    assert.equal(compteurs.likes, 1);
    assert.equal(compteurs.dislikes, 0);
  });

  it('le fil indique si le compte courant a déjà réagi', () => {
    filRepository.ajouterLike(db, idPublication, bob.id);

    const [vuParBob] = filRepository.listerPublications(db, bob.id, { id: idPublication });
    const [vuParAlice] = filRepository.listerPublications(db, alice.id, { id: idPublication });

    assert.equal(vuParBob.mon_like, 1);
    assert.equal(vuParAlice.mon_like, 0);
    assert.equal(vuParAlice.nb_like, 1);
  });

  it('listerLikes() donne la liste des comptes qui ont aimé', () => {
    filRepository.ajouterLike(db, idPublication, bob.id);
    const likes = filRepository.listerLikes(db, idPublication, alice.id);
    assert.equal(likes.length, 1);
    assert.equal(likes[0].nom, 'bob');
  });

  it('le filtre « abonnements » ne montre que les comptes suivis (et les siens)', () => {
    const carole = creerCompteTest(db, 'carole');
    filService.publier(db, requeteDe(carole), { description: 'Publication de carole' });
    db.prepare('INSERT INTO ami (id_utilisateur1, id_utilisateur2) VALUES (?, ?)').run(bob.id, alice.id);

    const fil = filRepository.listerPublications(db, bob.id, { filtre: 'abonnements' });
    assert.deepEqual(fil.map((p) => p.auteur), ['alice']);
  });

  it('le filtre par hashtag retrouve la publication', () => {
    filService.publier(db, requeteDe(alice), { description: 'Balade #vosges' });
    const fil = filRepository.listerPublications(db, alice.id, { tag: 'vosges' });
    assert.equal(fil.length, 1);
    assert.match(fil[0].description, /#vosges/);
  });
});


// ============================================================
//  SOCIAL - Profils, abonnements, recherche
// ============================================================
describe('social.service.js - profils et abonnements', () => {
  let db;
  let alice;
  let bob;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
    alice = creerCompteTest(db, 'alice');
    bob = creerCompteTest(db, 'bob');
  });

  it('basculerAbonnement() suit puis arrête de suivre', () => {
    assert.deepEqual(socialService.basculerAbonnement(db, requeteDe(alice), bob.id), { abonne: true });
    assert.equal(socialService.profil(db, alice.id, bob.id).nb_abonnes, 1);

    assert.deepEqual(socialService.basculerAbonnement(db, requeteDe(alice), bob.id), { abonne: false });
    assert.equal(socialService.profil(db, alice.id, bob.id).nb_abonnes, 0);
  });

  it('on ne peut pas s’abonner à soi-même', () => {
    assert.throws(() => socialService.basculerAbonnement(db, requeteDe(alice), alice.id), ErreurMetier);
  });

  it('le profil indique la relation dans les deux sens', () => {
    socialService.basculerAbonnement(db, requeteDe(bob), alice.id);   // bob suit alice

    const vuParAlice = socialService.profil(db, alice.id, bob.id);
    assert.equal(vuParAlice.je_suis_abonne, 0);
    assert.equal(vuParAlice.me_suit, 1);
  });

  it('profil() refuse un compte inexistant avec un 404', () => {
    assert.throws(
      () => socialService.profil(db, alice.id, 999),
      (err) => err instanceof ErreurMetier && err.statut === 404,
    );
  });

  it('les suggestions excluent soi-même et les comptes déjà suivis', () => {
    creerCompteTest(db, 'carole');
    socialService.basculerAbonnement(db, requeteDe(alice), bob.id);

    const noms = socialService.suggestions(db, alice.id).map((c) => c.nom);
    assert.deepEqual(noms, ['carole']);
  });

  it('la recherche trouve les comptes et les hashtags', () => {
    filService.publier(db, requeteDe(alice), { description: 'Balade #vosges' });

    const parNom = socialService.rechercher(db, alice.id, 'bo');
    assert.deepEqual(parNom.comptes.map((c) => c.nom), ['bob']);

    const parTag = socialService.rechercher(db, alice.id, '#vosg');
    assert.equal(parTag.hashtags[0].nom, '#vosges');
  });

  it('une recherche vide ne renvoie rien', () => {
    assert.deepEqual(socialService.rechercher(db, alice.id, '   '), { comptes: [], hashtags: [] });
  });
});


// ============================================================
//  MODÉRATION - Signalements et clôture des dossiers
// ============================================================
describe('moderation.service.js - file de signalements', () => {
  let db;
  let alice;
  let bob;
  let modo;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
    alice = creerCompteTest(db, 'alice');
    bob = creerCompteTest(db, 'bob');
    modo = creerCompteTest(db, 'marc', 'modo');
  });

  it('signaler() crée le signalement et le trace', () => {
    moderationService.signaler(db, requeteDe(alice), { idSignale: bob.id, raison: 'Spam' });

    const file = moderationService.file(db);
    assert.equal(file.length, 1);
    assert.equal(file[0].signale, 'bob');
    assert.equal(file[0].signalant, 'alice');
    assert.equal(listerJournal(db, { action: 'signalement_cree' }).lignes.length, 1);
  });

  it('on ne peut pas se signaler soi-même', () => {
    assert.throws(
      () => moderationService.signaler(db, requeteDe(alice), { idSignale: alice.id, raison: 'Test' }),
      ErreurMetier,
    );
  });

  it('signaler() refuse une raison vide', () => {
    assert.throws(
      () => moderationService.signaler(db, requeteDe(alice), { idSignale: bob.id, raison: '  ' }),
      ErreurMetier,
    );
  });

  it('la file compte tous les signalements visant le même compte', () => {
    moderationService.signaler(db, requeteDe(alice), { idSignale: bob.id, raison: 'Spam' });
    moderationService.signaler(db, requeteDe(modo), { idSignale: bob.id, raison: 'Harcèlement' });

    const file = moderationService.file(db);
    assert.equal(file.length, 2);
    assert.equal(file[0].total_contre, 2);
  });

  it('clore() retire le dossier de la file mais garde la décision au journal', () => {
    const { id } = moderationService.signaler(db, requeteDe(alice), { idSignale: bob.id, raison: 'Spam' });

    moderationService.clore(db, requeteDe(modo), id, 'traité : contenu retiré');

    assert.equal(moderationService.file(db).length, 0);
    const { lignes } = listerJournal(db, { action: 'signalement_classe' });
    assert.equal(lignes.length, 1);
    assert.match(lignes[0].details, /contenu retiré/);
    assert.equal(lignes[0].cible_nom, 'bob');
  });

  it('clore() refuse un signalement qui n’existe pas', () => {
    assert.throws(
      () => moderationService.clore(db, requeteDe(modo), 999, 'sans suite'),
      (err) => err instanceof ErreurMetier && err.statut === 404,
    );
  });
});


// ============================================================
//  ADMINISTRATION - Rôles, suspensions, suppression, tableau de bord
// ============================================================
describe('administration.service.js - gestion des comptes', () => {
  let db;
  let admin;
  let membre;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
    admin = creerCompteTest(db, 'chef', 'admin');
    membre = creerCompteTest(db, 'alice');
  });

  it('changerRole() nomme un modérateur et le trace', () => {
    const resultat = administrationService.changerRole(db, requeteDe(admin), membre.id, 'modo');

    assert.deepEqual(resultat, { id: membre.id, role: 'modo' });
    assert.equal(utilisateurRepository.trouverParId(db, membre.id).role, 'modo');
    const { lignes } = listerJournal(db, { action: 'role_modifie' });
    assert.match(lignes[0].details, /user → modo/);
  });

  it('changerRole() refuse un rôle inconnu', () => {
    assert.throws(() => administrationService.changerRole(db, requeteDe(admin), membre.id, 'chef'), ErreurMetier);
  });

  it('un administrateur ne peut pas modifier son propre compte', () => {
    assert.throws(() => administrationService.changerRole(db, requeteDe(admin), admin.id, 'user'), ErreurMetier);
  });

  it('un administrateur est protégé contre les actions d’un autre administrateur', () => {
    const autreAdmin = creerCompteTest(db, 'patron', 'admin');
    assert.throws(
      () => administrationService.changerRole(db, requeteDe(admin), autreAdmin.id, 'user'),
      (err) => err instanceof ErreurMetier && err.statut === 403,
    );
    assert.throws(
      () => administrationService.suspendre(db, requeteDe(admin), autreAdmin.id, { raison: 'Test', jours: 1 }),
      (err) => err instanceof ErreurMetier && err.statut === 403,
    );
  });

  it('suspendre() exige une raison et une durée valide', () => {
    assert.throws(() => administrationService.suspendre(db, requeteDe(admin), membre.id, { raison: ' ', jours: 7 }), ErreurMetier);
    assert.throws(() => administrationService.suspendre(db, requeteDe(admin), membre.id, { raison: 'Spam', jours: 0 }), ErreurMetier);
    assert.throws(() => administrationService.suspendre(db, requeteDe(admin), membre.id, { raison: 'Spam', jours: 400 }), ErreurMetier);
  });

  it('suspendre() pose une date de fin et coche la colonne banni du schéma', () => {
    const { fin } = administrationService.suspendre(db, requeteDe(admin), membre.id, { raison: 'Spam', jours: 7 });

    assert.ok(new Date(fin) > new Date());
    assert.equal(utilisateurRepository.trouverParId(db, membre.id).banni, 1);
    assert.equal(administrationRepository.suspensionActive(db, membre.id).raison, 'Spam');
  });

  it('une suspension sans date de fin reste active, une suspension expirée ne l’est plus', () => {
    administrationService.suspendre(db, requeteDe(admin), membre.id, { raison: 'Illimitée', jours: null });
    assert.ok(administrationRepository.suspensionActive(db, membre.id));

    // On simule une suspension arrivée à échéance
    db.prepare('UPDATE suspension SET fin = ? WHERE id_utilisateur = ?')
      .run(new Date(Date.now() - 1000).toISOString(), membre.id);
    assert.equal(administrationRepository.suspensionActive(db, membre.id), undefined);
  });

  it('leverSuspension() débloque le compte et remet banni à 0', () => {
    administrationService.suspendre(db, requeteDe(admin), membre.id, { raison: 'Spam', jours: 7 });
    administrationService.leverSuspension(db, requeteDe(admin), membre.id);

    assert.equal(administrationRepository.suspensionActive(db, membre.id), undefined);
    assert.equal(utilisateurRepository.trouverParId(db, membre.id).banni, 0);
  });

  it('leverSuspension() refuse si le compte n’est pas suspendu', () => {
    assert.throws(
      () => administrationService.leverSuspension(db, requeteDe(admin), membre.id),
      (err) => err instanceof ErreurMetier && err.statut === 404,
    );
  });

  it('supprimerCompte() exige une raison', () => {
    assert.throws(() => administrationService.supprimerCompte(db, requeteDe(admin), membre.id, '  '), ErreurMetier);
    assert.ok(utilisateurRepository.trouverParId(db, membre.id));
  });

  it('supprimerCompte() efface le compte et tout ce qui s’y rattache', () => {
    const autre = creerCompteTest(db, 'bob');
    const idPublication = filService.publier(db, requeteDe(membre), { description: 'À effacer #test' }).id;
    filService.commenter(db, requeteDe(autre), idPublication, 'Un commentaire');
    filRepository.ajouterLike(db, idPublication, autre.id);
    socialService.basculerAbonnement(db, requeteDe(membre), autre.id);
    moderationService.signaler(db, requeteDe(autre), { idSignale: membre.id, raison: 'Spam' });

    administrationService.supprimerCompte(db, requeteDe(admin), membre.id, 'Compte fautif');

    assert.equal(utilisateurRepository.trouverParId(db, membre.id), undefined);
    for (const table of ['publication', 'commentaire', '"like"', 'ami', 'signalement']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, `table ${table} non vidée`);
    }
    // La trace, elle, survit à la suppression du compte
    const { lignes } = listerJournal(db, { action: 'compte_supprime' });
    assert.equal(lignes[0].cible_nom, 'alice');
    assert.match(lignes[0].details, /Compte fautif/);
  });

  it('tableauDeBord() compte les comptes, les modérateurs et les suspensions', () => {
    administrationService.changerRole(db, requeteDe(admin), membre.id, 'modo');
    const bob = creerCompteTest(db, 'bob');
    administrationService.suspendre(db, requeteDe(admin), bob.id, { raison: 'Spam', jours: 3 });

    const { chiffres, activite } = administrationService.tableauDeBord(db);
    assert.equal(chiffres.comptes, 3);
    assert.equal(chiffres.moderateurs, 1);
    assert.equal(chiffres.suspendus, 1);
    assert.equal(activite.length, 14);                // 14 jours affichés dans le graphique
  });

  it('audit() rassemble la fiche du compte et son activité', () => {
    filService.publier(db, requeteDe(membre), { description: 'Publication auditée' });
    administrationService.changerRole(db, requeteDe(admin), membre.id, 'modo');

    const audit = administrationService.audit(db, membre.id);
    assert.equal(audit.compte.nom, 'alice');
    assert.equal(audit.compte.nb_publications, 1);
    assert.equal(audit.parCategorie.find((c) => c.categorie === 'contenu').total, 1);
    assert.equal(audit.subies.find((a) => a.action === 'role_modifie').total, 1);
  });

  it('audit() refuse un compte inexistant', () => {
    assert.throws(
      () => administrationService.audit(db, 999),
      (err) => err instanceof ErreurMetier && err.statut === 404,
    );
  });

  it('listerComptes() donne l’état de suspension et les compteurs pour la console', () => {
    administrationService.suspendre(db, requeteDe(admin), membre.id, { raison: 'Spam', jours: 2 });
    const comptes = administrationService.listerComptes(db);
    const fiche = comptes.find((c) => c.nom === 'alice');

    assert.equal(fiche.suspension_raison, 'Spam');
    assert.equal(fiche.nb_publications, 0);
    assert.equal(fiche.nb_signalements, 0);
  });
});


// ============================================================
//  JOURNAL - Traces, filtres et notifications
// ============================================================
describe('journal.service.js - traces et notifications', () => {
  let db;
  let alice;
  let bob;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
    alice = creerCompteTest(db, 'alice');
    bob = creerCompteTest(db, 'bob');
  });

  it('chaque action connue a une catégorie', () => {
    for (const [action, categorie] of Object.entries(ACTIONS)) {
      assert.ok(categorie, `l'action ${action} n'a pas de catégorie`);
    }
    assert.equal(ACTIONS.compte_suspendu, 'administration');
    assert.equal(ACTIONS.connexion_echouee, 'securite');
  });

  it('journaliser() recopie le nom et le rôle de l’auteur', () => {
    journaliser(db, requeteDe({ ...bob, role: 'modo' }), 'connexion');
    const { lignes } = listerJournal(db, {});
    assert.equal(lignes[0].nom_utilisateur, 'bob');
    assert.equal(lignes[0].role_utilisateur, 'modo');
    assert.equal(lignes[0].ip, '127.0.0.1');
  });

  it('le journal se filtre par catégorie, par compte et par recherche', () => {
    journaliser(db, requeteDe(alice), 'connexion');
    journaliser(db, requeteDe(bob), 'publication_creee', { details: 'Sortie au Hohneck' });

    assert.equal(listerJournal(db, { categorie: 'authentification' }).lignes.length, 1);
    assert.equal(listerJournal(db, { utilisateur: bob.id }).lignes.length, 1);
    assert.equal(listerJournal(db, { recherche: 'Hohneck' }).lignes.length, 1);
    assert.equal(listerJournal(db, { recherche: 'introuvable' }).lignes.length, 0);
  });

  it('la pagination indique s’il reste des lignes à charger', () => {
    for (let i = 0; i < 5; i++) journaliser(db, requeteDe(alice), 'connexion');

    const premiere = listerJournal(db, { limite: 2 });
    assert.equal(premiere.lignes.length, 2);
    assert.equal(premiere.suite, true);

    const suivante = listerJournal(db, { limite: 2, avant: premiere.lignes[1].id });
    assert.equal(suivante.lignes[0].id, premiere.lignes[1].id - 1);
  });

  it('un j’aime sur ma publication me crée une notification', () => {
    const idPublication = filService.publier(db, requeteDe(alice), { description: 'Ma publication' }).id;
    journaliser(db, requeteDe(bob), 'like_ajoute', { cible: { type: 'publication', id: idPublication, nom: 'alice' } });

    const mesNotifs = notifications(db, alice.id);
    assert.equal(mesNotifs.length, 1);
    assert.equal(mesNotifs[0].acteur, 'bob');
    assert.equal(mesNotifs[0].action, 'like_ajoute');
  });

  it('mes propres actions ne me notifient pas', () => {
    const idPublication = filService.publier(db, requeteDe(alice), { description: 'Ma publication' }).id;
    journaliser(db, requeteDe(alice), 'like_ajoute', { cible: { type: 'publication', id: idPublication, nom: 'alice' } });

    assert.equal(notifications(db, alice.id).length, 0);
  });

  it('un j’aime retiré puis remis ne donne qu’une seule notification', () => {
    const idPublication = filService.publier(db, requeteDe(alice), { description: 'Ma publication' }).id;
    const cible = { type: 'publication', id: idPublication, nom: 'alice' };
    journaliser(db, requeteDe(bob), 'like_ajoute', { cible });
    journaliser(db, requeteDe(bob), 'like_retire', { cible });
    journaliser(db, requeteDe(bob), 'like_ajoute', { cible });

    assert.equal(notifications(db, alice.id).length, 1);
  });

  it('un nouvel abonné et une décision de l’équipe apparaissent dans mes notifications', () => {
    socialService.basculerAbonnement(db, requeteDe(bob), alice.id);
    journaliser(db, requeteDe({ id: 99, nom: 'chef', role: 'admin' }), 'role_modifie', {
      cible: { type: 'utilisateur', id: alice.id, nom: 'alice' },
      details: 'user → modo',
    });

    const actions = notifications(db, alice.id).map((n) => n.action).sort();
    assert.deepEqual(actions, ['abonnement_ajoute', 'role_modifie']);
  });
});


// ============================================================
//  COMPTES PRÉCONFIGURÉS - Données initiales
// ============================================================
describe('donnees-initiales.js - comptes livrés avec le projet', () => {
  let db;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
  });

  it('crée les comptes préconfigurés avec leurs rôles', () => {
    const resultat = installerDonneesInitiales(db, { silencieux: true });

    assert.equal(resultat.cree, true);
    for (const compte of COMPTES_PRECONFIGURES) {
      const enBase = utilisateurRepository.trouverParNom(db, compte.nom);
      assert.ok(enBase, `le compte ${compte.nom} devrait exister`);
      assert.equal(enBase.role, compte.role);
    }
    assert.equal(utilisateurRepository.trouverParNom(db, 'admin').role, 'admin');
  });

  it('les mots de passe livrés respectent la règle des 12 caractères et sont hashés', () => {
    installerDonneesInitiales(db, { silencieux: true });

    for (const compte of COMPTES_PRECONFIGURES) {
      assert.ok(compte.mdp.length >= MDP_MIN, `${compte.nom} : mot de passe trop court`);
      const enBase = utilisateurRepository.trouverParNom(db, compte.nom);
      assert.notEqual(enBase.mdp, compte.mdp);
      assert.ok(enBase.mdp.startsWith('$2'));          // format bcrypt
      assert.ok(bcrypt.compareSync(compte.mdp, enBase.mdp));
    }
  });

  it('ne recrée rien si la base contient déjà des comptes', () => {
    installerDonneesInitiales(db, { silencieux: true });
    const avant = utilisateurRepository.listerUtilisateurs(db).length;

    const resultat = installerDonneesInitiales(db, { silencieux: true });

    assert.equal(resultat.cree, false);
    assert.equal(utilisateurRepository.listerUtilisateurs(db).length, avant);
  });

  it('rétablit l’administrateur s’il n’y en a plus aucun', () => {
    creerCompteTest(db, 'quelquun');                   // base non vide, mais sans admin
    installerDonneesInitiales(db, { silencieux: true });

    const admin = db.prepare("SELECT nom FROM utilisateur WHERE role = 'admin'").get();
    assert.equal(admin.nom, 'admin');
  });

  it('le jeu de démonstration remplit le fil et la file de modération', () => {
    installerDonneesInitiales(db, { silencieux: true });

    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM publication').get().n >= 3);
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM commentaire').get().n >= 2);
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM signalement').get().n >= 1);
    assert.ok(filRepository.tendances(db).length >= 1);
  });
});


// ============================================================
//  MÉDIAS - Photos et vidéos (modules du groupe)
// ============================================================
describe('medias.service.js - emplacement des fichiers', () => {
  it('une photo est servie depuis le dossier des envois', () => {
    assert.equal(urlMedia('123-photo.jpg', 'image/jpeg'), '/uploads/temp/123-photo.jpg');
  });

  it('une vidéo est servie depuis le dossier des vidéos converties', () => {
    assert.equal(urlMedia('123-converti.mp4', 'video/mp4'), '/uploads/videos/123-converti.mp4');
  });

  it('une publication sans fichier n’a pas d’URL', () => {
    assert.equal(urlMedia(null, 'texte'), null);
    assert.equal(cheminMedia(null, 'texte'), null);
  });

  it('le chemin sur le disque suit le type du fichier', () => {
    assert.match(cheminMedia('a.mp4', 'video/mp4'), /public\/uploads\/videos\/a\.mp4$/);
    assert.match(cheminMedia('a.jpg', 'image/jpeg'), /public\/uploads\/temp\/a\.jpg$/);
  });

  it('un nom de fichier piégé ne sort pas du dossier prévu', () => {
    assert.match(cheminMedia('../../server.js', 'image/jpeg'), /public\/uploads\/temp\/server\.js$/);
  });
});


describe('publication.service.js - photos', () => {
  let db;
  let alice;
  beforeEach(() => {
    db = ouvrirBase(':memory:');
    alice = creerCompteTest(db, 'alice');
  });

  it('publierPhoto() refuse sans fichier', async () => {
    await assert.rejects(
      () => publierPhoto(db, { idUtilisateur: alice.id, description: 'Sans image', typeFichier: 'image/jpeg' }),
      ErreurPublication,
    );
  });

  it('publierPhoto() refuse un type de fichier qui n’est pas une image', async () => {
    await assert.rejects(
      () => publierPhoto(db, { idUtilisateur: alice.id, nomFichier: 'a.mp4', typeFichier: 'video/mp4' }),
      ErreurPublication,
    );
  });

  it('publierPhoto() refuse un utilisateur inconnu', async () => {
    await assert.rejects(
      () => publierPhoto(db, { idUtilisateur: 999, nomFichier: 'a.jpg', typeFichier: 'image/jpeg' }),
      ErreurPublication,
    );
  });

  it('publierPhoto() enregistre la publication avec son fichier', async () => {
    const publication = await publierPhoto(db, {
      idUtilisateur: alice.id,
      description: 'Coucher de soleil #vosges',
      nomFichier: '123-photo.jpg',
      typeFichier: 'image/jpeg',
    });

    assert.equal(publication.nom_fichier, '123-photo.jpg');
    assert.equal(publication.type_fichier, 'image/jpeg');
  });

  it('le fil renvoie l’URL du média, prête à afficher', async () => {
    await publierPhoto(db, { idUtilisateur: alice.id, description: 'Photo', nomFichier: 'p.jpg', typeFichier: 'image/jpeg' });
    await publierVideo(db, { idUtilisateur: alice.id, description: 'Vidéo', nomFichier: 'v.mp4', typeFichier: 'video/mp4' });

    const fil = filRepository.listerPublications(db, alice.id, {});
    const photo = fil.find((p) => p.type_fichier === 'image/jpeg');
    const video = fil.find((p) => p.type_fichier === 'video/mp4');

    assert.equal(photo.media, '/uploads/temp/p.jpg');
    assert.equal(video.media, '/uploads/videos/v.mp4');
  });

  it('une publication texte n’a pas de média', () => {
    filService.publier(db, requeteDe(alice), { description: 'Juste du texte' });
    const [publication] = filRepository.listerPublications(db, alice.id, {});
    assert.equal(publication.media, null);
  });

  it('mediasDUnCompte() liste les fichiers à effacer avec le compte', async () => {
    await publierPhoto(db, { idUtilisateur: alice.id, description: '', nomFichier: 'p.jpg', typeFichier: 'image/jpeg' });
    filService.publier(db, requeteDe(alice), { description: 'Texte sans fichier' });

    const medias = filRepository.mediasDUnCompte(db, alice.id);
    assert.equal(medias.length, 1);
    assert.equal(medias[0].nom_fichier, 'p.jpg');
  });
});
