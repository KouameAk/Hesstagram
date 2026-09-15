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
