import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from '../bdd/connexion.js';
import { listerUtilisateurs, definirRole } from './utilisateur.repository.js';

function creerBaseDeTest() {
  const db = ouvrirBase(':memory:');
  const ajouter = db.prepare('INSERT INTO utilisateur (nom, mdp, role) VALUES (?, ?, ?)');
  const alice = Number(ajouter.run('alice', 'mdp-de-test', 'user').lastInsertRowid);
  const bob = Number(ajouter.run('bob', 'mdp-de-test', 'user').lastInsertRowid);
  return { db, alice, bob };
}

test('listerUtilisateurs retourne tout le monde avec son rôle', () => {
  const { db } = creerBaseDeTest();

  const utilisateurs = listerUtilisateurs(db);

  assert.equal(utilisateurs.length, 2);
  assert.equal(utilisateurs[0].role, 'user');
});

test('definirRole change bien le rôle de la bonne personne', () => {
  const { db, alice, bob } = creerBaseDeTest();

  definirRole(db, alice, 'modo');

  const utilisateurs = listerUtilisateurs(db);
  const aliceMaj = utilisateurs.find((u) => u.id === alice);
  const bobMaj = utilisateurs.find((u) => u.id === bob);

  assert.equal(aliceMaj.role, 'modo');
  assert.equal(bobMaj.role, 'user');
});

test('definirRole peut retirer le rôle modo (repasser à user)', () => {
  const { db, alice } = creerBaseDeTest();

  definirRole(db, alice, 'modo');
  definirRole(db, alice, 'user');

  const alice2 = listerUtilisateurs(db).find((u) => u.id === alice);
  assert.equal(alice2.role, 'user');
});
