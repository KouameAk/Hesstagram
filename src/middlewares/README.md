# middlewares/

Les vérifications qui s'exécutent **avant** qu'une route ne traite la requête
(et qui peuvent la bloquer) : authentification, droits (RBAC), anti-spam
(rate limiting), validation des données envoyées.

```js
app.post('/api/messages', middlewareAuth, (req, res) => { ... });
//                         ↑ bloque ici si pas connecté
```
