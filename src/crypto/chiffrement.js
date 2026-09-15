import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

// Création de la paire de clés une seule fois.
export function createKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

function readKey(base64Key, kind) {
  const der = Buffer.from(base64Key, 'base64');
  return kind === 'public'
    ? createPublicKey({ key: der, format: 'der', type: 'spki' })
    : createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

// Diffie-Hellman
export function getSharedKey(myPrivateKey, theirPublicKey) {
  const privateKeyObj = readKey(myPrivateKey, 'private');
  const publicKeyObj = readKey(theirPublicKey, 'public');
  const secret = diffieHellman({ privateKey: privateKeyObj, publicKey: publicKeyObj });
  return createHash('sha256').update(secret).digest();
}

export function encrypt(message, sharedKey) {
  // Nombre aléatoire différent à chaque message, obligatoire pour la sécurité.
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sharedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decrypt(encrypted, sharedKey) {
  const iv = Buffer.from(encrypted.iv, 'base64');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', sharedKey, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

// --- Messagerie de groupe ---
// Une seule clé, aléatoire, partagée par tout le groupe.

// Création de la clé de groupe une seule fois par le créateur du groupe.
export function createGroupKey() {
  return randomBytes(32);
}

// Le créateur donne la clé de groupe à un membre, en la chiffrant avec la clé secrète.
export function shareGroupKey(groupKey, myPrivateKey, memberPublicKey) {
  const sharedKey = getSharedKey(myPrivateKey, memberPublicKey);
  return encrypt(groupKey.toString('base64'), sharedKey);
}

// Le membre récupère la clé de groupe en la déchiffrant avec sa clé secrète.
export function receiveGroupKey(encryptedGroupKey, myPrivateKey, creatorPublicKey) {
  const sharedKey = getSharedKey(myPrivateKey, creatorPublicKey);
  const base64Key = decrypt(encryptedGroupKey, sharedKey);
  return Buffer.from(base64Key, 'base64');
}
