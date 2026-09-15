/*
 * ------------------------------------------------------------
 *  TEST UNITAIRE DE L'AUTHENTIFICATION
 * ------------------------------------------------------------
 * Tous les tests unitaires de la partie authentification
 * (logique métier + repository), regroupés dans un seul
 * fichier. Chaque partie est isolée dans son propre describe()
 * pour que les beforeEach ne s'appliquent qu'à ce qui en a
 * besoin.
 * ------------------------------------------------------------
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import * as utilisateurRepository from './src/repositories/utilisateur.repository.js';
import { inscrire, connecter, ErreurAuth } from './src/services/auth.service.js';
import { ouvrirBase } from './src/bdd/connexion.js';

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
    await inscrire(db, { nom: 'valou', mdp: '123456' });
    await assert.rejects(() => inscrire(db, { nom: 'valou', mdp: '123456' }), ErreurAuth);
  });

  it('inscrire() crée un utilisateur avec un mot de passe hashé (jamais en clair)', async () => {
    const user = await inscrire(db, { nom: 'valou', mdp: '123456' });
    
    // Vérifier directement en base que le mdp n'est pas en clair
    const userInDb = utilisateurRepository.trouverParNom(db, 'valou');
    assert.notEqual(userInDb.mdp, '123456');
    assert.ok(userInDb.mdp.startsWith('$2')); // bcrypt format

    assert.equal(user.nom, 'valou');
    assert.equal(user.role, 'user');
  });

  it('connecter() refuse un utilisateur inconnu', async () => {
    await assert.rejects(() => connecter(db, { nom: 'inconnu', mdp: '123456' }), ErreurAuth);
  });

  it('connecter() refuse un mauvais mot de passe', async () => {
    await inscrire(db, { nom: 'valou', mdp: 'bonmdp' });
    await assert.rejects(() => connecter(db, { nom: 'valou', mdp: 'mauvais' }), ErreurAuth);
  });

  it('connecter() renvoie un token JWT si le mdp est correct', async () => {
    await inscrire(db, { nom: 'valou', mdp: 'bonmdp' });
    const { token, user } = await connecter(db, { nom: 'valou', mdp: 'bonmdp' });

    assert.ok(token);
    assert.equal(user.nom, 'valou');
    assert.equal(user.role, 'user');
  });
});

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
      nom: 'valou',
      mdpHash: 'hash_bidon',
      date: new Date().toISOString(),
      role: 'user',
    });

    const user = utilisateurRepository.trouverParNom(db, 'valou');

    assert.equal(user.nom, 'valou');
    assert.equal(user.mdp, 'hash_bidon');
    assert.equal(user.role, 'user');
  });

  it("creerUtilisateur() stocke tel quel ce qu'on lui donne", () => {
    // Rappel : ce fichier ne fait QUE la requête SQL, il ne hash
    // rien lui-même (c'est le rôle de auth.service.js).
    utilisateurRepository.creerUtilisateur(db, {
      nom: 'test',
      mdpHash: '$2a$10$fauxHashPourLeTest',
      date: new Date().toISOString(),
      role: 'user',
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
