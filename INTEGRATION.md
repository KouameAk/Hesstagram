# Intégration du frontend (V3 light)

Cette version contient **tout le code du dépôt du groupe** (branche `main`) plus
l'interface complète : fil, publication, messagerie chiffrée, Mon compte, et les
consoles de modération et d'administration.

Le code du groupe n'est pas réécrit : l'interface est **ajoutée à côté**, dans de
nouveaux fichiers. Deux fichiers du groupe seulement ont changé (voir plus bas).

## Lancer le projet

Node.js **22.5 ou plus** (pour `node:sqlite`).

```bash
npm install
npm start
```

Puis ouvrir <http://localhost:3000>. Au premier démarrage, la base
`data/hesstagram.sqlite` est créée avec les comptes ci-dessous et quelques
publications de démonstration.

```bash
npm test
```

lance les tests du groupe (`testunitaire.test.js`) et ceux de l'interface
(`interface.test.js`).

> Le `package-lock.json` du dépôt n'est pas un JSON valide (virgule manquante,
> clé `jsonwebtoken` en double). Si `npm install` refuse de le lire, supprimer le
> fichier puis relancer `npm install`.

## Comptes préconfigurés

| Compte        | Mot de passe      | Rôle           |
|---------------|-------------------|----------------|
| `admin`       | `AdminHess2026!`  | administrateur |
| `moderateur`  | `ModoHess2026!`   | modérateur     |
| `lea.wagner`  | `LeaHess2026!`    | membre         |
| `luca.c`      | `LucaHess2026!`   | membre         |
| `tom.mercier` | `TomHess2026!`    | membre         |
| `sarah.b`     | `SarahHess2026!`  | membre         |

Si la base ne contient plus aucun administrateur, le compte `admin` est rétabli
au démarrage.

## Ce que fait l'interface

| Écran | Page | Routes utilisées |
|---|---|---|
| Connexion / inscription | `index.html` | `POST /api/auth/login`, `POST /api/auth/register` (groupe). Mot de passe de 12 à 64 caractères |
| Fil | `accueil.html` | `GET /api/publications` ; j'aime / je n'aime pas : `POST`/`DELETE /api/publications/:id/like` et `/dislike` (groupe) ; `POST /api/signalements` ; `DELETE /api/publications/:id` |
| Publier | `publier.html` | `POST /api/publications/photo` et `/video` (groupe, conversion MP4) |
| Messagerie | `messagerie.html` | WebSocket du groupe, `POST /api/messagerie/cle-publique` (groupe), `GET /api/messagerie/contacts`, `/conversation/:id` |
| Mon compte | `compte.html` | `GET /api/compte`, `PUT /api/compte/mot-de-passe`, `DELETE /api/compte` |
| Console de modération | `moderation.html` | `GET /api/moderation/file`, `DELETE /api/moderation/signalements/:id` |
| Console d'administration | `admin.html` | `/api/admin/…` : tableau de bord, comptes et rôles, suspension, suppression, décisions, journal |

Les pages d'origine du groupe restent intactes dans `src/public/` et s'ouvrent
toujours sous **`/groupe/`** (ex. <http://localhost:3000/groupe/admin.html>).

### Messagerie chiffrée de bout en bout

- Chaque compte crée sa paire de clés X25519 **dans son navigateur** à la
  première connexion (`chiffrement-navigateur.js` du groupe). Seule la clé
  publique part sur le serveur.
- Chaque message est chiffré en AES-256-GCM **avant** de partir par le WebSocket
  du groupe. La base ne contient que `iv` / `ciphertext`.
- La clé privée est rangée au même endroit que la page du groupe
  (`mes_cles_messagerie_<id>`) : les deux interfaces partagent les mêmes clés.
- **Pour tester à deux comptes**, utiliser deux navigateurs (ou une fenêtre de
  navigation privée) : le token de connexion est stocké dans le navigateur, un
  même navigateur ne garde qu'une session à la fois.
- Sur un autre appareil, la clé privée n'existe pas : « Mon compte » permet d'en
  générer une nouvelle (les anciens messages deviennent illisibles).

## Organisation du code ajouté

```
src/interface/             pages, style.css, app.js, publications.js, messagerie-client.js
src/config.js              règles communes (12 à 64 caractères, rôles) → GET /api/config
src/bdd/schema-interface.sql   tables `suspension` et `journal` (BDD.sqlite inchangé)
src/bdd/donnees-initiales.js   comptes préconfigurés + démonstration
scripts/seed-demo.js       npm run seed
src/middlewares/session.middleware.js   vérification du token et du compte
src/middlewares/suivi.middleware.js     règles d'inscription, refus des comptes suspendus, journal
src/websocket/protection.js             garde-fou devant le WebSocket du groupe
src/routes|services|repositories/…      fil, signalements, compte, conversations, administration
interface.test.js          tests de la couche ajoutée
```

`server.js` reçoit uniquement des lignes en plus : les imports, la préparation de
la base, le dossier `src/interface/` servi avant `src/public/`, les contrôles posés
devant les routes du groupe et les nouvelles routes.

### Contrôles posés devant les routes du groupe (sans modifier leurs fichiers)

- **Signature du token vérifiée** : `verifierToken` du groupe utilise `jwt.decode`,
  qui accepte un token fabriqué à la main. `session.middleware.js` le vérifie avec
  `jwt.verify` avant chaque route `/api`, et relit le compte en base (supprimé →
  401, suspendu ou banni → 403 avec la raison, rôle modifié → reconnexion).
- **J'aime / je n'aime pas** : l'identifiant vient du token de session, jamais du
  corps de la requête (comme le prévoyait le commentaire des routes du groupe).
- **Fichiers envoyés** : servis avec une politique de sécurité qui empêche une
  image SVG piégée d'exécuter du script sur le site.

## Fichiers du groupe modifiés

1. **`server.js`** — lignes ajoutées uniquement (branchements ci-dessus). La
   dernière ligne garde le serveur WebSocket dans une variable pour lui ajouter
   le garde-fou : `const serveurMessagerie = demarrerMessagerie(serveurHttp, db);`.
2. **`src/services/video.service.js`** — correction d'une ligne. `.preset('veryfast')`
   de fluent-ffmpeg charge un *fichier* de préréglage (inexistant), pas l'option
   x264 : **toute publication de vidéo échouait en erreur 500**. L'option passe dans
   `outputOptions` (`'-preset veryfast'`), avec le même effet voulu.

## Correctif à remonter au groupe

Dans `websocket/connexion.js`, une exception dans `socket.on('message')` arrête
tout le serveur : message qui n'est pas du JSON, destinataire supprimé (clé
étrangère refusée), groupe inconnu. `src/websocket/protection.js` vérifie chaque
demande avant de la transmettre, ferme le socket d'un compte supprimé ou suspendu,
et renvoie `{ type: 'erreur', message }` au lieu de laisser le serveur s'arrêter.
