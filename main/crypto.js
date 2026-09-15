// crypto.js — chiffrement de bout en bout de la messagerie (Web Crypto API du navigateur)
//
// Principe (chiffrement hybride classique) :
//   • chaque compte possède une paire de clés RSA-OAEP 2048 bits ;
//     la clé PUBLIQUE est envoyée au serveur, la clé PRIVÉE reste dans ce navigateur
//     (IndexedDB, marquée non exportable : même le JavaScript de la page ne peut pas la lire) ;
//   • pour chaque message on tire une clé AES-GCM 256 bits aléatoire qui chiffre le texte ;
//   • cette clé AES est chiffrée deux fois : avec la clé publique du destinataire
//     et avec celle de l'expéditeur (pour qu'il puisse relire ses propres messages) ;
//   • le serveur ne stocke que { iv, contenu chiffré, cle_dest, cle_exp } : il ne peut rien lire.

const RSA = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

// ── base64 <-> octets ──
function versBase64(buffer) {
  let s = '';
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b);
  return btoa(s);
}
function depuisBase64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ── Stockage local de la clé privée (IndexedDB, une entrée par compte) ──
function ouvrirCoffre() {
  return new Promise((ok, ko) => {
    const req = indexedDB.open('hesstagram-e2ee', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('cles');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}
async function coffre(mode, action) {
  const bdd = await ouvrirCoffre();
  return new Promise((ok, ko) => {
    const req = action(bdd.transaction('cles', mode).objectStore('cles'));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}
const lireCleLocale = idUtil => coffre('readonly', s => s.get(`compte-${idUtil}`));
const ecrireCleLocale = (idUtil, valeur) => coffre('readwrite', s => s.put(valeur, `compte-${idUtil}`));

// Génère une nouvelle paire, garde la privée ici et publie la publique sur le serveur
async function genererPaireDeCles(moi) {
  // extractable = false → la clé privée ne pourra jamais être exportée
  const paire = await crypto.subtle.generateKey(RSA, false, ['wrapKey', 'unwrapKey']);
  const spki = versBase64(await crypto.subtle.exportKey('spki', paire.publicKey));
  await ecrireCleLocale(moi.id, { prive: paire.privateKey, publique: spki });
  await api('/api/cles/moi', { method: 'PUT', body: { cle: spki } });
  return spki;
}

// Vérifie que ce navigateur possède la clé privée correspondant à la clé publique du serveur.
// Retourne : 'ok' | 'creee' | 'absente' (clé sur le serveur mais pas ici) | 'differente'
async function assurerCles(moi) {
  const [locale, serveur] = await Promise.all([lireCleLocale(moi.id), api(`/api/cles/${moi.id}`)]);
  if (!serveur.cle) {
    await genererPaireDeCles(moi);
    return 'creee';
  }
  if (!locale) return 'absente';
  return locale.publique === serveur.cle ? 'ok' : 'differente';
}

// Empreinte lisible d'une clé publique (SHA-256 tronqué) pour la vérifier de vive voix
async function empreinte(spkiBase64) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', depuisBase64(spkiBase64)));
  return Array.from(h.slice(0, 10), b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    .match(/.{4}/g).join(' ');
}

function importerClePublique(spkiBase64) {
  return crypto.subtle.importKey('spki', depuisBase64(spkiBase64), RSA, false, ['wrapKey']);
}

// Chiffre un texte pour un destinataire. Retourne le paquet envoyé au serveur.
async function chiffrerMessage(texte, spkiDestinataire, spkiExpediteur) {
  const [pubDest, pubExp] = await Promise.all([
    importerClePublique(spkiDestinataire),
    importerClePublique(spkiExpediteur)
  ]);
  const cleAes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // La date est chiffrée avec le texte : le serveur ne la voit pas non plus
  const clair = new TextEncoder().encode(JSON.stringify({ texte, date: new Date().toISOString() }));

  const [contenu, cleDest, cleExp] = await Promise.all([
    crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cleAes, clair),
    crypto.subtle.wrapKey('raw', cleAes, pubDest, { name: 'RSA-OAEP' }),
    crypto.subtle.wrapKey('raw', cleAes, pubExp, { name: 'RSA-OAEP' })
  ]);
  return {
    iv: versBase64(iv),
    contenu: versBase64(contenu),
    cle_dest: versBase64(cleDest),
    cle_exp: versBase64(cleExp)
  };
}

// Déchiffre un message stocké. `moiId` sert à choisir la bonne copie de la clé AES.
// Retourne { texte, date } ou lève une erreur si la clé privée ne correspond pas.
async function dechiffrerMessage(ligne, moiId, clePrivee) {
  const p = JSON.parse(ligne.message);
  const cleChiffree = ligne.id_exp === moiId ? p.cle_exp : p.cle_dest;
  const cleAes = await crypto.subtle.unwrapKey(
    'raw', depuisBase64(cleChiffree), clePrivee, { name: 'RSA-OAEP' },
    { name: 'AES-GCM' }, false, ['decrypt']
  );
  const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: depuisBase64(p.iv) }, cleAes, depuisBase64(p.contenu));
  return JSON.parse(new TextDecoder().decode(clair));
}
