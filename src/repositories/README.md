# repositories/

Le seul endroit du projet où on a le droit d'écrire du SQL. Chaque fonction
reçoit la connexion `db` en paramètre (ouverte une seule fois au démarrage,
voir `bdd/connexion.js`) et fait une requête, rien d'autre.

## Les fichiers

| Fichier | Tables |
|---|---|
| `utilisateur.repository.js` | `utilisateur` |
| `fil.repository.js` | `publication`, `like`, `dislike`, `commentaire`, `hashtag` |
| `social.repository.js` | `ami` (abonnements) et profils |
| `moderation.repository.js` | `signalement` |
| `administration.repository.js` | `suspension` + suppression complète d'un compte |
| `journal.repository.js` | `journal` (logs, audit, notifications) |
| `messagerie.repository.js` | `conversation`, `conversation_membre`, `message`, `cle_groupe_partagee` |
| `publication.repository.js` | `publication` (vidéos) |
