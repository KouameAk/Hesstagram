import { traiterHashtagsPublication } from '../services/hashtag.service.js';

// Une fois la réponse de la route de publication envoyée, on en extrait les
// hashtags. La description vient de la requête (fiable dans tous les cas),
// l'id de la publication de la réponse (son format varie selon la route).
// Ne modifie pas la route elle-même : posé devant, comme les autres
// middlewares "suivi" du projet.
export function extraireHashtagsPublication(db) {
  return function (req, res, next) {
    const envoyerJson = res.json.bind(res);
    res.json = (corps) => {
      const idPublication = corps?.publication?.id ?? corps?.publication?.lastInsertRowid;
      if (res.statusCode === 201 && idPublication) {
        traiterHashtagsPublication(db, idPublication, req.body?.description, req.body?.hashtags);
      }
      return envoyerJson(corps);
    };
    next();
  };
}
