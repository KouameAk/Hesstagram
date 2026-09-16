# routes/

Les endpoints Express de l'application (un fichier par domaine, ex. `messages.routes.js`).

Une route reçoit une requête HTTP et la transmet à un `service`, rien d'autre.
**Pas de logique métier ici, pas de SQL.**

```js
app.post('/api/messages', (req, res) => {
  const resultat = messagerieService.envoyerMessage(req.body);
  res.json(resultat);
});
```

## Les fichiers

| Fichier | Préfixe | Contenu |
|---|---|---|
| `auth.routes.js` | `/api/auth` | inscription, connexion, compte courant, mot de passe, fermeture |
| `fil.routes.js` | `/api/publications` | fil, publication, suppression, dislike, commentaires |
| `likes.routes.js` | `/api/publications` | j'aime (ajout / retrait, retire le « je n'aime pas ») |
| `dislikes.routes.js` | `/api/publications` | je n'aime pas (ajout / retrait, retire le « j'aime ») |
| `publication.routes.js` | `/api/publications` | photo et vidéo (désactivées tant que `MEDIAS_ACTIFS` est à false) |
| `social.routes.js` | `/api` | profils, abonnements, recherche, tendances, notifications, signalements |
| `moderation.routes.js` | `/api` | file de signalements, clôture des dossiers, bannissement |
| `utilisateurs.routes.js` | `/api` | liste des comptes et attribution des rôles |
| `administration.routes.js` | `/api/admin` | tableau de bord, comptes, suspensions, journal, audit |
| `messagerie.routes.js` | `/api` | clés publiques, contacts, historique d'une conversation |
