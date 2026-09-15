// Même principe que src/crypto/chiffrement.js côté serveur (X25519 pour
// échanger une clé secrète, AES-256-GCM pour chiffrer), mais avec la Web
// Crypto API du navigateur puisque node:crypto n'existe pas côté client.

function bufferVersBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64VersBuffer(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Chaque utilisateur crée sa paire de clés une seule fois, dans son navigateur.
async function creerCles() {
  const paire = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const clePublique = await crypto.subtle.exportKey('raw', paire.publicKey);
  const clePrivee = await crypto.subtle.exportKey('pkcs8', paire.privateKey);
  return {
    publicKey: bufferVersBase64(clePublique),
    privateKey: bufferVersBase64(clePrivee),
  };
}

// Même astuce Diffie-Hellman que côté serveur : ma clé privée + sa clé
// publique donne la même clé secrète que sa clé privée + ma clé publique.
async function obtenirCleSecrete(maClePriveeBase64, saClePubliqueBase64) {
  const maClePrivee = await crypto.subtle.importKey(
    'pkcs8',
    base64VersBuffer(maClePriveeBase64),
    { name: 'X25519' },
    false,
    ['deriveBits'],
  );
  const saClePublique = await crypto.subtle.importKey(
    'raw',
    base64VersBuffer(saClePubliqueBase64),
    { name: 'X25519' },
    false,
    [],
  );
  const secret = await crypto.subtle.deriveBits({ name: 'X25519', public: saClePublique }, maClePrivee, 256);
  return crypto.subtle.importKey('raw', secret, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// Le tag d'authentification est ajouté par le navigateur à la fin du texte
// chiffré (contrairement à node:crypto qui le sépare) : on garde authTag
// vide pour rester compatible avec le même format {iv, ciphertext, authTag}.
async function chiffrerMessage(message, cleSecrete) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const donnees = new TextEncoder().encode(message);
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cleSecrete, donnees);
  return { iv: bufferVersBase64(iv), ciphertext: bufferVersBase64(chiffre), authTag: '' };
}

async function dechiffrerMessage(messageChiffre, cleSecrete) {
  const iv = base64VersBuffer(messageChiffre.iv);
  const chiffre = base64VersBuffer(messageChiffre.ciphertext);
  const donnees = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cleSecrete, chiffre);
  return new TextDecoder().decode(donnees);
}
