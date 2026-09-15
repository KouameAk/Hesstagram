import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirBase } from '../bdd/connexion.js';
import { listerUtilisateursSignales, bannirUtilisateur, debannirUtilisateur } from './moderation.repository.js';

function creerBaseDeTest() {
  const db = ouvrirBase(':memory:');
  const ajouterUtilisateur = db.prepare('INSERT INTO utilisateur (nom, mdp) VALUES (?, ?)');
  const alice = Number(ajouterUtilisateur.run('alice', 'mdp-de-test').lastInsertRowid);
  const bob = Number(ajouterUtilisateur.run('bob', 'mdp-de-test').lastInsertRowid);
  const charlie = Number(ajouterUtilisateur.run('charlie', 'mdp-de-test').lastInsertRowid);

  const signaler = db.prepare(
    'INSERT INTO signalement (id_signalé, id_signalant, raison, date) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
  );
  return { db, alice, bob, charlie, signaler };
}

test('un utilisateur jamais signalé n\'apparaît pas dans la liste', () => {
  const { db } = creerBaseDeTest();

  assert.deepEqual(listerUtilisateursSignales(db), []);
});

test('un utilisateur signalé apparaît avec le bon nombre de signalements', () => {
  const { db, alice, bob, charlie, signaler } = creerBaseDeTest();

  signaler.run(bob, alice, 'spam');
  signaler.run(bob, charlie, 'harcèlement');

  const resultat = listerUtilisateursSignales(db);

  assert.equal(resultat.length, 1);
  assert.equal(resultat[0].id, bob);
  assert.equal(resultat[0].nombre_signalements, 2);
});

test('les utilisateurs signalés sont triés du plus signalé au moins signalé', () => {
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

test('bannirUtilisateur puis debannirUtilisateur changent bien le statut', () => {
  const { db, bob } = creerBaseDeTest();

  bannirUtilisateur(db, bob);
  let ligne = db.prepare('SELECT banni FROM utilisateur WHERE id = ?').get(bob);
  assert.equal(ligne.banni, 1);

  debannirUtilisateur(db, bob);
  ligne = db.prepare('SELECT banni FROM utilisateur WHERE id = ?').get(bob);
  assert.equal(ligne.banni, 0);
});
