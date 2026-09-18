# repositories/

Le seul endroit du projet où on a le droit d'écrire du SQL. Chaque fonction
reçoit la connexion `db` en paramètre (ouverte une seule fois au démarrage,
voir `bdd/connexion.js`) et fait une requête, rien d'autre.
