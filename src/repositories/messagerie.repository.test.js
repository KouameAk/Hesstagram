import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from '../bdd/connexion.js';
import {
  enregistrerClePublique,
  obtenirClePublique,
  creerConversationPrivee,
  creerGroupe,
  obtenirConversationsUtilisateur,
  enregistrerMessage,
  obtenirHistorique,
  enregistrerCleGroupe,
  obtenirCleGroupe,
} from './messagerie.repository.js';

const messageBidon = { iv: 'iv', ciphertext: 'chiffre', authTag: 'tag' };

// Base de test toute neuve, avec 3 utilisateurs déjà créés (alice/bob/charlie).
function creerBaseDeTest() {
  const db = ouvrirBase(':memory:');
  const ajouter = db.prepare('INSERT INTO utilisateur (nom, mdp) VALUES (?, ?)');
  const alice = Number(ajouter.run('alice', 'mdp-de-test').lastInsertRowid);
  const bob = Number(ajouter.run('bob', 'mdp-de-test').lastInsertRowid);
  const charlie = Number(ajouter.run('charlie', 'mdp-de-test').lastInsertRowid);
  return { db, alice, bob, charlie };
}

test('la clé publique enregistrée est bien celle qu\'on relit ensuite', () => {
  const { db, alice } = creerBaseDeTest();

  enregistrerClePublique(db, alice, 'cle-publique-de-test');

  assert.equal(obtenirClePublique(db, alice), 'cle-publique-de-test');
});

test('une conversation privée entre 2 personnes n\'est créée qu\'une seule fois', () => {
  const { db, alice, bob } = creerBaseDeTest();

  const id1 = creerConversationPrivee(db, alice, bob);
  const id2 = creerConversationPrivee(db, bob, alice);

  assert.equal(id1, id2);
});

test('créer un groupe ajoute bien tous les membres donnés', () => {
  const { db, alice, bob, charlie } = creerBaseDeTest();

  const conversationId = creerGroupe(db, 'Groupe projet', alice, [alice, bob, charlie]);

  assert.deepEqual(obtenirConversationsUtilisateur(db, bob), [conversationId]);
  assert.deepEqual(obtenirConversationsUtilisateur(db, charlie), [conversationId]);
});

test('un message enregistré apparaît dans l\'historique de sa conversation', () => {
  const { db, alice, bob } = creerBaseDeTest();
  const conversationId = creerConversationPrivee(db, alice, bob);

  enregistrerMessage(db, conversationId, alice, messageBidon);

  const historique = obtenirHistorique(db, conversationId);
  assert.equal(historique.length, 1);
  assert.equal(historique[0].ciphertext, 'chiffre');
  assert.equal(historique[0].expediteurId, alice);
});

test('la clé de groupe enregistrée pour un membre est bien celle qu\'on relit', () => {
  const { db, alice, bob } = creerBaseDeTest();
  const conversationId = creerGroupe(db, 'Groupe', alice, [alice, bob]);

  enregistrerCleGroupe(db, conversationId, bob, messageBidon);

  const cle = obtenirCleGroupe(db, conversationId, bob);
  assert.equal(cle?.ciphertext, 'chiffre');
});

test('pas de clé de groupe pour quelqu\'un qui n\'en a jamais reçu', () => {
  const { db, alice, bob } = creerBaseDeTest();
  const conversationId = creerGroupe(db, 'Groupe', alice, [alice, bob]);

  assert.equal(obtenirCleGroupe(db, conversationId, bob), undefined);
});
