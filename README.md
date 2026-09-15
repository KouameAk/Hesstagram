# Hesstagram

Mini réseau social (projet) — Node.js/Express + SQLite (module natif `node:sqlite`), frontend HTML/CSS/JS sans framework.
Interface inspirée des maquettes d'app sociale fournies : police Kanit, formes très arrondies, boutons pilule,
icônes au trait, bouton « + » central sur mobile, **accent orange**.

## Lancer

```bash
npm install
npm start
```

Puis ouvrir http://localhost:3000 — la base `data/hesstagram.db` est créée au premier lancement depuis `schema.sql` (la BDD fournie) avec des données de départ.

## Comptes de test

| Compte | Mot de passe | Rôle |
|---|---|---|
| admin | admin123 | administrateur |
| marc.r | modo123 | modérateur |
| luca.c | luca123 | utilisateur |
| lea.wagner | lea123 | utilisateur |

Les pages sont servies depuis le dossier `main/`.

## Authentification

- Nom d'utilisateur : 3 à 12 caractères. Mot de passe : 6 à 12 caractères.
- La limite de 12 est appliquée aux deux bouts : `maxlength` + compteur `n/12` dans le
  formulaire, et validation dans `server.js` (constante `MAX_LEN`).

## Statuts et accès différenciés

Chaque compte a un statut (colonne `role` de la table `utilisateur`) qui détermine la page
ouverte après la connexion et les espaces accessibles :

| Statut | Page d'accueil | Accès |
|---|---|---|
| utilisateur | `/` | application (fil, explorer, profils, messages, notifications, paramètres) |
| moderateur | `/moderation.html` | application + file de signalements, retrait de publications |
| administrateur | `/admin.html` | tout, dont la console d'administration |

Le cloisonnement est posé à trois niveaux : la navigation masque les entrées non autorisées,
`exigerRole()` renvoie une page ouverte à la main vers l'espace du statut, et l'API refuse la
requête (401/403) — c'est cette dernière qui fait foi.

## Interface

Design system dans `main/style.css` (variables `--o-50` à `--o-800` pour l'orange, neutres
chauds, rayons 12 → 32 px). Tout le socle JavaScript partagé est dans `main/app.js` :

- **Coquille responsive** — barre latérale sur ordinateur ; sous 960 px, en-tête collant et
  barre du bas avec le bouton « + » central (comme sur les maquettes).
- **Icônes** au trait arrondi dessinées en SVG (`icone('coeur')`), avatars à dégradé orange
  stable par nom (`avatar(nom, taille)`).
- **Retours d'UX** — toasts (avec « Annuler » quand c'est possible), confirmations dont le bouton
  décrit l'action, fenêtres qui deviennent des feuilles depuis le bas sur mobile, menus
  contextuels, squelettes de chargement, états vides avec action proposée, pastilles de non-lus.
- `main/publications.js` — carte de publication partagée (fil, explorer, profil) : j'aime
  optimistes, feuille « J'aime / Commentaires », signalement à motifs rapides, bouton Suivre.

## Pages

| Page | Contenu |
|---|---|
| `login.html` | Connexion / inscription, règles vérifiées en direct, comptes de démonstration en un clic |
| `/` (index.html) | Fil « Pour vous / Abonnements », membres en rangée façon stories, composeur (texte + photo), suggestions et tendances |
| `explorer.html` | Recherche de membres et de #hashtags pendant la frappe, recherches récentes, tendances, page d'un hashtag (`?tag=`) |
| `notifications.html` | J'aime, commentaires, nouveaux abonnés, messages, décisions de l'équipe — groupés par jour, filtrables |
| `profil.html?id=` | Bandeau, statistiques (abonnés / abonnements cliquables), grille ou fil des publications, Suivre, Message, Signaler |
| `messages.html` | Messagerie chiffrée de bout en bout (voir plus bas), vérification des empreintes |
| `parametres.html` | Changer son mot de passe, état de sa clé de chiffrement, déconnexion, fermer son compte |
| `moderation.html` | Console : signalements regroupés par compte, consultation et retrait de publications, clôture avec décision |
| `admin.html` | Console administrateur (voir plus bas) |

## Fonctionnalités membres

- **Publications** texte et/ou photo (PNG, JPEG, GIF, WebP ; réduite à 1 600 px dans le
  navigateur, type vérifié sur les octets côté serveur, fichiers dans `data/uploads/`,
  nom enregistré dans `publication.nom_fichier`). L'auteur peut supprimer sa publication.
- **J'aime / je n'aime pas / commentaires**, liste de qui a aimé.
- **Abonnements** via la table `ami` du schéma (`id_utilisateur1` suit `id_utilisateur2`).
- **Notifications** calculées depuis le journal (aucune table en plus) ; l'état « lu » est gardé
  dans le navigateur.
- **Recherche** de comptes et de hashtags, **tendances** (table `hashtag`).
- **Compte** : changement de mot de passe (ancien exigé), fermeture du compte (mot de passe exigé).

## API

| Méthode | Route | Accès |
|---|---|---|
| POST | /api/inscription, /api/connexion, /api/deconnexion | public |
| GET | /api/moi | connecté |
| PUT | /api/moi/mdp | connecté (ancien + nouveau mot de passe) |
| DELETE | /api/moi | connecté (fermer son compte, sauf administrateur) |
| GET | /api/publications?filtre=abonnements&tag=&auteur=&id= | connecté |
| POST | /api/publications | connecté (texte et/ou image en data URL) |
| DELETE | /api/publications/:id | auteur, ou modérateur+ (retrait tracé et notifié) |
| POST | /api/publications/:id/like, /dislike, /commentaires | connecté |
| GET | /api/publications/:id/likes | connecté |
| GET | /api/comptes, /api/suggestions, /api/tendances, /api/recherche?q= | connecté |
| GET | /api/profils/:id, /api/profils/:id/relations?type=abonnes\|abonnements | connecté |
| POST | /api/abonnements/:id | connecté (suivre / ne plus suivre) |
| GET | /api/notifications | connecté |
| POST | /api/signalements | connecté |
| PUT | /api/cles/moi | connecté (publie sa clé publique) |
| GET | /api/cles/:id | connecté (clé publique d'un compte) |
| GET | /api/messages/contacts | connecté |
| GET | /api/messages/:id?apres= | connecté (sa propre conversation uniquement) |
| POST | /api/messages | connecté (paquet chiffré uniquement) |
| GET | /api/signalements | modérateur+ |
| DELETE | /api/signalements/:id | modérateur+ (avec la décision) |
| GET | /api/utilisateurs | administrateur (avec état de suspension, dernière activité) |
| PUT | /api/utilisateurs/:id/role | administrateur |
| POST / DELETE | /api/utilisateurs/:id/suspension | administrateur (suspendre / lever) |
| DELETE | /api/utilisateurs/:id | administrateur (suppression définitive) |
| GET | /api/admin/stats | administrateur (tableau de bord) |
| GET | /api/admin/journal?recherche=&categorie=&action=&utilisateur=&du=&au=&avant= | administrateur |
| GET | /api/admin/audit/:id | administrateur |

## Console d'administration (`admin.html`)

Navigation par l'URL : `#tableau`, `#comptes`, `#comptes-12` (ouvre la fiche du compte 12),
`#historique`, `#journal`.

| Vue | Rôle |
|---|---|
| Vue d'ensemble | Chiffres clés cliquables (comptes, actifs sur 7 jours, modérateurs, suspendus, signalements, échecs de connexion), activité des 14 derniers jours, comptes à surveiller, événements sensibles |
| Comptes & rôles | Tableau triable et filtrable (membres, modérateurs, suspendus, signalés), export CSV. Un clic ouvre la **fiche latérale** du compte, sans quitter la liste |
| Fiche · Aperçu | Informations, dernière connexion, échecs de connexion, chiffres, actions par catégorie, actions le concernant |
| Fiche · Activité | Chronologie horodatée de tout ce que le compte a fait ou subi, filtrable par catégorie |
| Fiche · Gérer | Rôle Membre / Modérateur (bascule), suspendre (1, 3, 7, 30 jours ou illimitée, motifs rapides, date de fin affichée), lever, supprimer (raison + saisie du nom) |
| Suivi des décisions | Signalements déposés, dossiers clôturés, publications retirées : qui, quand, sur qui, pourquoi ; export CSV |
| Journal du site | Toutes les actions à la seconde avec compte, statut au moment de l'action et IP ; filtres texte, catégorie, période ; export CSV |

Choix d'UX : chaque action sensible explique ses conséquences avant confirmation, la
suppression propose d'abord une suspension (réversible), un changement de rôle peut être
annulé depuis le toast, et les comptes protégés l'indiquent au lieu d'afficher des boutons inertes.

Règles côté serveur (ce sont elles qui font foi) :

- Un administrateur ne peut agir ni sur son propre compte ni sur un autre administrateur.
- **Suspension** : table `suspension`. Le compte est déconnecté sur-le-champ, toute requête
  suivante renvoie 401 et la connexion est refusée avec la date de fin et la raison.
  Elle expire seule à la date prévue.
- **Suppression** : transaction qui efface le compte et tout ce qui s'y rattache (publications
  et leurs j'aime/commentaires/hashtags, messages, signalements, amis, clé publique).
  Si une étape échoue, rien n'est modifié.
- **Journal** : table `journal`, sans clé étrangère. Le nom et le statut de l'auteur sont
  recopiés, ce qui garde la trace lisible même après suppression du compte. Sont
  journalisés : inscriptions, connexions (réussies, échouées, refusées), déconnexions, accès
  refusés (403), publications, commentaires, j'aime, signalements (dépôt et classement),
  messages chiffrés (métadonnées uniquement, jamais le contenu), rôles, suspensions,
  suppressions, abonnements, changements de mot de passe, retraits de publications.
- Classer un signalement le retire de la table `signalement`, mais son contenu complet reste
  dans le journal.

## Messagerie chiffrée de bout en bout

Tout le chiffrement se fait dans le navigateur (`main/crypto.js`, Web Crypto API, aucune
dépendance). Le serveur ne voit jamais un message en clair ni une clé privée.

1. **Clés** — à la première connexion, le navigateur génère une paire **RSA-OAEP 2048 bits**.
   La clé publique (SPKI, base64) est envoyée dans la table `cle_publique` ; la clé privée est
   gardée dans IndexedDB, marquée *non exportable*.
2. **Envoi** — une clé **AES-GCM 256 bits** aléatoire chiffre le texte (et la date).
   Cette clé AES est chiffrée avec la clé publique du destinataire (`cle_dest`) **et** avec
   celle de l'expéditeur (`cle_exp`, pour relire ses propres messages).
3. **Stockage** — la colonne `message.message` contient seulement
   `{"v":1,"iv":…,"contenu":…,"cle_dest":…,"cle_exp":…}`. Le serveur refuse tout message
   qui n'a pas cette forme.
4. **Lecture** — le navigateur déchiffre la clé AES avec sa clé privée, puis le texte.

Le bouclier de l'en-tête de conversation (et la page Paramètres) affiche les **empreintes**
(SHA-256) des clés publiques : les comparer de vive voix prouve que le serveur n'a pas substitué
une autre clé.

Limites assumées (projet) : la clé privée est liée au navigateur. Sur un autre appareil ou
après effacement des données du site, les anciens messages sont illisibles ; la page propose
alors de générer de nouvelles clés. Web Crypto impose https ou `localhost`.

## Notes techniques

- Mots de passe hachés avec `scrypt` (sel aléatoire), jamais stockés en clair.
- Sessions par cookie `HttpOnly` (stockées en mémoire : elles se vident au redémarrage du serveur).
- Les `#hashtags` des publications sont enregistrés dans la table `hashtag` ; au démarrage, les
  publications qui n'en ont pas encore (données de départ) sont rattrapées.
- `texteAvecHashtags()` échappe le texte et transforme les hashtags en un seul passage :
  enchaîner les deux casserait les entités (`l'année` → `l&#39;année`, où la regex des
  hashtags attraperait `#39`).
- Pour repartir de zéro : supprimer `data/hesstagram.db` (et `data/uploads/`) puis relancer.
