# middlewares/

Les vérifications qui s'exécutent **avant** qu'une route ne traite la requête
(et qui peuvent la bloquer) : authentification, droits (RBAC), anti-spam
(rate limiting), validation des données envoyées.

```js
app.post('/api/messages', middlewareAuth, (req, res) => { ... });
//                         ↑ bloque ici si pas connecté
```

## Les fichiers

- `auth.middleware.js` — `verifierToken` (vérifie **la signature** du JWT),
  `estAdmin`, `estAdminOuModo`, et `creerCompteActif(db)` qui relit le compte en
  base à chaque requête : compte supprimé → 401, compte suspendu ou banni → 403.
- `upload.middleware.js` — réception des fichiers vidéo (multer), utilisée
  seulement quand la publication de médias est réactivée.
