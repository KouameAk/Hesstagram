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
