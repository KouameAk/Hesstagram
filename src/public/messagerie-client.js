// messagerie-client.js — gestion des clés de la messagerie chiffrée côté navigateur.
//
// S'appuie sur chiffrement-navigateur.js (X25519 + AES-256-GCM, le chiffrement
// du projet) :
//   • chaque compte crée sa paire de clés une seule fois, dans SON navigateur ;
//   • seule la clé publique part sur le serveur (table utilisateur.cle_publique) ;
//   • la clé privée reste ici et ne quitte jamais l'appareil ;
//   • ma clé privée + la clé publique du contact = une clé secrète commune, qui
//     chiffre chaque message. Le serveur ne peut donc rien lire.

const cleStockage = (idUtilisateur) => `hess-cles-${idUtilisateur}`;

function lireClesLocales(idUtilisateur) {
  try {
    return JSON.parse(localStorage.getItem(cleStockage(idUtilisateur)) || 'null');
  } catch {
    return null;
  }
}

function ecrireClesLocales(idUtilisateur, cles) {
  localStorage.setItem(cleStockage(idUtilisateur), JSON.stringify(cles));
}

// Le navigateur sait-il faire du X25519 ? (sinon : message clair plutôt qu'une page cassée)
async function chiffrementDisponible() {
  if (!window.crypto?.subtle) return false;
  try {
    await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    return true;
  } catch {
    return false;
  }
}

// Crée une nouvelle paire de clés, la garde ici et publie la clé publique.
async function genererPaireDeCles(moi) {
  const cles = await creerCles();                     // chiffrement-navigateur.js
  ecrireClesLocales(moi.id, cles);
  await api('/api/messagerie/cle-publique', { method: 'POST', body: { publicKey: cles.publicKey } });
  return cles;
}

/**
 * Vérifie que ce navigateur possède bien la clé privée correspondant à la clé
 * publique enregistrée sur le serveur.
 * Retourne : 'ok' | 'creee' | 'absente' (clé sur le serveur mais pas ici) | 'differente'
 */
async function assurerCles(moi) {
  const locales = lireClesLocales(moi.id);
  const serveur = await api(`/api/messagerie/contacts/${moi.id}`);

  if (!serveur.publicKey) {
    await genererPaireDeCles(moi);
    return 'creee';
  }
  if (!locales) return 'absente';
  return locales.publicKey === serveur.publicKey ? 'ok' : 'differente';
}

// Clé secrète commune avec un contact, à partir de sa clé publique.
async function cleSecreteAvec(moi, clePubliqueContact) {
  const locales = lireClesLocales(moi.id);
  if (!locales) throw new Error('Aucune clé privée dans ce navigateur.');
  return obtenirCleSecrete(locales.privateKey, clePubliqueContact);   // chiffrement-navigateur.js
}

// Empreinte lisible d'une clé publique (SHA-256 tronqué), à comparer de vive voix.
async function empreinte(clePubliqueBase64) {
  const octets = Uint8Array.from(atob(clePubliqueBase64), (c) => c.charCodeAt(0));
  const somme = new Uint8Array(await crypto.subtle.digest('SHA-256', octets));
  return Array.from(somme.slice(0, 10), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .match(/.{4}/g)
    .join(' ');
}
