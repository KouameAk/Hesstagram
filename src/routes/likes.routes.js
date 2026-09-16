import { Router } from 'express';

/**
 * Backend de la fonctionnalité like / unlike.
 *
 * POST   /api/publications/:id/like
 * DELETE /api/publications/:id/like
 *
 * Pour cette démo, l'id de l'utilisateur est envoyé dans le JSON :
 * { "id_utilisateur": 1 }
 *
 */
export function creerRoutesLikes(db) {
  const router = Router();

  const chercherPublication = db.prepare(`
    SELECT id FROM publication WHERE id = ?
  `);

  const chercherUtilisateur = db.prepare(`
    SELECT id FROM utilisateur WHERE id = ?
  `);

  const chercherLike = db.prepare(`
    SELECT 1
    FROM "like"
    WHERE id_pub = ? AND id_utilisateur = ?
  `);

  const chercherDislike = db.prepare(`
    SELECT 1
    FROM dislike
    WHERE id_pub = ? AND id_util = ?
  `);

  const insererLike = db.prepare(`
    INSERT INTO "like" (id_pub, id_utilisateur)
    VALUES (?, ?)
  `);

  const supprimerLike = db.prepare(`
    DELETE FROM "like"
    WHERE id_pub = ? AND id_utilisateur = ?
  `);

  const synchroniserCompteur = db.prepare(`
    UPDATE publication
    SET "like" = (
      SELECT COUNT(*) FROM "like" WHERE id_pub = ?
    )
    WHERE id = ?
  `);

  const lireCompteur = db.prepare(`
    SELECT "like" AS likes
    FROM publication
    WHERE id = ?
  `);

  function convertirId(valeur) {
    const id = Number(valeur);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function obtenirIdUtilisateur(req) {
    // req.user?.id est déjà prévu pour l'intégration future de l'auth.
    return convertirId(req.user?.id ?? req.body?.id_utilisateur);
  }

  const ajouterLike = db.transaction((idPublication, idUtilisateur) => {
    if (!chercherPublication.get(idPublication)) {
      return { erreur: 'PUBLICATION_INTROUVABLE' };
    }

    if (!chercherUtilisateur.get(idUtilisateur)) {
      return { erreur: 'UTILISATEUR_INTROUVABLE' };
    }

    if (chercherLike.get(idPublication, idUtilisateur)) {
      synchroniserCompteur.run(idPublication, idPublication);
      return {
        modifie: false,
        liked: true,
        likes: lireCompteur.get(idPublication).likes
      };
    }

    if (chercherDislike.get(idPublication, idUtilisateur)) {
      return { erreur: 'PUBLICATION_DEJA_DISLIKEE' };
    }

    insererLike.run(idPublication, idUtilisateur);
    synchroniserCompteur.run(idPublication, idPublication);

    return {
      modifie: true,
      liked: true,
      likes: lireCompteur.get(idPublication).likes
    };
  });

  const enleverLike = db.transaction((idPublication, idUtilisateur) => {
    if (!chercherPublication.get(idPublication)) {
      return { erreur: 'PUBLICATION_INTROUVABLE' };
    }

    if (!chercherUtilisateur.get(idUtilisateur)) {
      return { erreur: 'UTILISATEUR_INTROUVABLE' };
    }

    const resultat = supprimerLike.run(idPublication, idUtilisateur);
    synchroniserCompteur.run(idPublication, idPublication);

    return {
      modifie: resultat.changes > 0,
      liked: false,
      likes: lireCompteur.get(idPublication).likes
    };
  });

  router.post('/:id/like', (req, res) => {
    const idPublication = convertirId(req.params.id);
    const idUtilisateur = obtenirIdUtilisateur(req);

    if (!idPublication) {
      return res.status(400).json({ erreur: 'ID de publication invalide' });
    }

    if (!idUtilisateur) {
      return res.status(400).json({ erreur: 'ID utilisateur invalide ou manquant' });
    }

    try {
      const resultat = ajouterLike(idPublication, idUtilisateur);

      if (resultat.erreur === 'PUBLICATION_INTROUVABLE') {
        return res.status(404).json({ erreur: 'Publication introuvable' });
      }

      if (resultat.erreur === 'UTILISATEUR_INTROUVABLE') {
        return res.status(404).json({ erreur: 'Utilisateur introuvable' });
      }

      if (resultat.erreur === 'PUBLICATION_DEJA_DISLIKEE') {
        return res.status(409).json({
          erreur: 'Cette publication est déjà dislikée par cet utilisateur'
        });
      }

      return res.status(resultat.modifie ? 201 : 200).json({
        message: resultat.modifie ? 'Like ajouté' : 'Publication déjà likée',
        publicationId: idPublication,
        utilisateurId: idUtilisateur,
        liked: true,
        likes: resultat.likes
      });
    } catch (erreur) {
      console.error('Erreur ajout like :', erreur);
      return res.status(500).json({ erreur: 'Erreur interne du serveur' });
    }
  });

  router.delete('/:id/like', (req, res) => {
    const idPublication = convertirId(req.params.id);
    const idUtilisateur = obtenirIdUtilisateur(req);

    if (!idPublication) {
      return res.status(400).json({ erreur: 'ID de publication invalide' });
    }

    if (!idUtilisateur) {
      return res.status(400).json({ erreur: 'ID utilisateur invalide ou manquant' });
    }

    try {
      const resultat = enleverLike(idPublication, idUtilisateur);

      if (resultat.erreur === 'PUBLICATION_INTROUVABLE') {
        return res.status(404).json({ erreur: 'Publication introuvable' });
      }

      if (resultat.erreur === 'UTILISATEUR_INTROUVABLE') {
        return res.status(404).json({ erreur: 'Utilisateur introuvable' });
      }

      return res.status(200).json({
        message: resultat.modifie ? 'Like retiré' : 'La publication n’était pas likée',
        publicationId: idPublication,
        utilisateurId: idUtilisateur,
        liked: false,
        likes: resultat.likes
      });
    } catch (erreur) {
      console.error('Erreur suppression like :', erreur);
      return res.status(500).json({ erreur: 'Erreur interne du serveur' });
    }
  });

  return router;
}
