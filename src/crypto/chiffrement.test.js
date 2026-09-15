import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKeys,
  getSharedKey,
  encrypt,
  decrypt,
  createGroupKey,
  shareGroupKey,
  receiveGroupKey,
} from './chiffrement.js';

test('createKeys produit une paire de clés différente à chaque appel', () => {
  const pair1 = createKeys();
  const pair2 = createKeys();

  assert.notEqual(pair1.publicKey, pair2.publicKey);
  assert.notEqual(pair1.privateKey, pair2.privateKey);
});

test('Alice et Bob obtiennent la même clé partagée (échange Diffie-Hellman)', () => {
  const alice = createKeys();
  const bob = createKeys();

  const sharedKeyAlice = getSharedKey(alice.privateKey, bob.publicKey);
  const sharedKeyBob = getSharedKey(bob.privateKey, alice.publicKey);

  assert.deepEqual(sharedKeyAlice, sharedKeyBob);
});

test('un message chiffré puis déchiffré redonne le message original', () => {
  const alice = createKeys();
  const bob = createKeys();
  const sharedKey = getSharedKey(alice.privateKey, bob.publicKey);

  const message = 'Salut Bob, comment ça va ?';
  const encrypted = encrypt(message, sharedKey);
  const decrypted = decrypt(encrypted, sharedKey);

  assert.equal(decrypted, message);
});

test('deux chiffrements du même message donnent un résultat différent (IV aléatoire)', () => {
  const alice = createKeys();
  const bob = createKeys();
  const sharedKey = getSharedKey(alice.privateKey, bob.publicKey);

  const message = 'Même message';
  const encrypted1 = encrypt(message, sharedKey);
  const encrypted2 = encrypt(message, sharedKey);

  assert.notEqual(encrypted1.ciphertext, encrypted2.ciphertext);
});

test('le déchiffrement échoue si on utilise la mauvaise clé (personne extérieure)', () => {
  const alice = createKeys();
  const bob = createKeys();
  const eve = createKeys();

  const sharedKeyAliceBob = getSharedKey(alice.privateKey, bob.publicKey);
  const sharedKeyEve = getSharedKey(eve.privateKey, bob.publicKey);

  const encrypted = encrypt('Message secret', sharedKeyAliceBob);

  assert.throws(() => decrypt(encrypted, sharedKeyEve));
});

test('createGroupKey produit une clé différente à chaque appel', () => {
  const groupKey1 = createGroupKey();
  const groupKey2 = createGroupKey();

  assert.notEqual(groupKey1.toString('base64'), groupKey2.toString('base64'));
});

test('un membre retrouve exactement la même clé de groupe que celle créée par l’admin', () => {
  const admin = createKeys();
  const membre = createKeys();
  const groupKey = createGroupKey();

  const clePourMembre = shareGroupKey(groupKey, admin.privateKey, membre.publicKey);
  const groupKeyRecue = receiveGroupKey(clePourMembre, membre.privateKey, admin.publicKey);

  assert.deepEqual(groupKeyRecue, groupKey);
});

test('deux membres du groupe peuvent se lire entre eux avec la clé de groupe', () => {
  const admin = createKeys();
  const alice = createKeys();
  const bob = createKeys();
  const groupKey = createGroupKey();

  const cleAlice = receiveGroupKey(
    shareGroupKey(groupKey, admin.privateKey, alice.publicKey),
    alice.privateKey,
    admin.publicKey,
  );
  const cleBob = receiveGroupKey(
    shareGroupKey(groupKey, admin.privateKey, bob.publicKey),
    bob.privateKey,
    admin.publicKey,
  );

  const message = 'Salut le groupe !';
  const encrypted = encrypt(message, cleAlice);
  const decrypted = decrypt(encrypted, cleBob);

  assert.equal(decrypted, message);
});

test('une personne hors du groupe ne peut pas lire les messages du groupe', () => {
  const groupKey = createGroupKey();
  const intrus = createGroupKey();

  const encrypted = encrypt('Message du groupe', groupKey);

  assert.throws(() => decrypt(encrypted, intrus));
});
