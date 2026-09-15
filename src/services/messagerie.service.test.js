import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerRegistre } from './messagerie.service.js';

const messageBidon = { iv: 'x', ciphertext: 'y', authTag: 'z' };

// Simule une personne connectée : enregistre tout ce qu'elle reçoit.
function creerEspion() {
  const messagesRecus = [];
  return { envoyer: (message) => messagesRecus.push(message), messagesRecus };
}

test('un message privé est livré au destinataire connecté', () => {
  const registre = creerRegistre();
  const bob = creerEspion();

  registre.connecter('alice', () => {});
  registre.connecter('bob', bob.envoyer);

  const livre = registre.envoyerMessagePrive('alice', 'bob', messageBidon);

  assert.equal(livre, true);
  assert.equal(bob.messagesRecus.length, 1);
  assert.match(bob.messagesRecus[0], /"de":"alice"/);
});

test('un message privé vers quelqu\'un de déconnecté n\'est pas livré', () => {
  const registre = creerRegistre();

  const livre = registre.envoyerMessagePrive('alice', 'bob', messageBidon);

  assert.equal(livre, false);
});

test('un message de groupe est livré à tous les membres connectés sauf l\'expéditeur', () => {
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

test('un utilisateur déconnecté ne reçoit plus les messages de groupe', () => {
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
