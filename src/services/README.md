# services/

La logique métier : les décisions ("qui a le droit de faire quoi", "que se
passe-t-il ensuite"). Aucune requête SQL ici (ça, c'est `repositories/`),
aucune route Express ici (ça, c'est `routes/`).

Exemple : `messagerie.service.js` décide qui doit recevoir un message,
sans jamais toucher à la base de données ni au réseau directement.

## Les fichiers

| Fichier | Décide… |
|---|---|
| `auth.service.js` | règles d'inscription (nom, mot de passe de 12 à 64 caractères), connexion, comptes suspendus |
| `fil.service.js` | qui peut publier, supprimer, commenter ; médias en pause |
| `social.service.js` | abonnements, profils, recherche |
| `moderation.service.js` | dépôt et clôture des signalements |
| `administration.service.js` | rôles, suspensions, suppression, tableau de bord, audit (protège les admins) |
| `journal.service.js` | ce qui est tracé, et les notifications qui en découlent |
| `messagerie.service.js` | qui reçoit quel message en temps réel |
| `publication.service.js` | publication vidéo |
| `erreurs.js` | erreur métier commune (message + statut HTTP) |
