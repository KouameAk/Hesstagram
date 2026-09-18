# services/

La logique métier : les décisions ("qui a le droit de faire quoi", "que se
passe-t-il ensuite"). Aucune requête SQL ici (ça, c'est `repositories/`),
aucune route Express ici (ça, c'est `routes/`).

Exemple : `messagerie.service.js` décide qui doit recevoir un message,
sans jamais toucher à la base de données ni au réseau directement.
