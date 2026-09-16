# public/

Tout ce que le navigateur télécharge et exécute côté client : CSS, JS
navigateur, pages HTML. Rien de ce qui est ici ne tourne sur le serveur.

## Les pages

| Fichier | Rôle |
|---|---|
| `index.html` | Connexion et inscription (mot de passe : 12 à 64 caractères), comptes préconfigurés en un clic |
| `accueil.html` | Fil d'actualité : publier, j'aime, commenter, suivre, signaler |
| `explorer.html` | Recherche de membres et de #hashtags, tendances, page d'un hashtag |
| `notifications.html` | J'aime, commentaires, abonnés, messages, décisions de l'équipe |
| `profil.html` | Profil d'un compte : statistiques, abonnés, publications |
| `messagerie.html` | Messagerie chiffrée de bout en bout (WebSocket + X25519) |
| `parametres.html` | Mot de passe, clé de chiffrement, fermeture du compte |
| `publier.html` | Création de publication — onglets Photo et Vidéo en place mais **désactivés** |
| `moderation.html` | Console de modération : file de signalements par compte |
| `admin.html` | Console d'administration : tableau de bord, comptes, décisions, journal |

## Le socle partagé

| Fichier | Rôle |
|---|---|
| `style.css` | Design system (couleurs orange, boutons pilule, cartes, responsive) |
| `app.js` | Appels API avec le token JWT, icônes, navigation, fenêtres, toasts, composeur |
| `publications.js` | Carte de publication réutilisée par le fil, l'explorer et les profils |
| `chiffrement-navigateur.js` | Chiffrement X25519 + AES-256-GCM (côté navigateur) |
| `messagerie-client.js` | Clés de la messagerie : création, publication, empreinte |
| `token.js` | Aide historique pour coller un token à la main (pages de test) |
| `logo_Hesstagram.png` | Logo affiché dans toutes les interfaces |
