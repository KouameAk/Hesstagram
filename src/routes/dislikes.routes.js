import { Router } from 'express';
import { trouverPublicationAvecAuteur } from '../repositories/fil.repository.js';
import { journaliser, ciblePublication } from '../services/journal.service.js';
import { verifierToken, creerCompteActif } from '../middlewares/auth.middleware.js';

/**
 * Backend de la fonctionnalité dislike / undislike.
 *
 * POST   /api/publications/:id/dislike
 * DELETE /api/publications/:id/dislike
 *
 * Comportement important :
 * - si l'utilisateur like déjà la publication et clique sur Dislike,
 *   le like est retiré automatiquement avant d'ajouter le dislike ;
 * - l'ensemble est exécuté dans une transaction SQLite.
 *
 * L'id de l'utilisateur vient du token de connexion (req.user.id), posé par
 * le middleware d'authentification. Le body { "id_utilisateur": 1 } reste
 * accepté en secours pour les essais en ligne de commande.
 */
export function creerRoutesDislikes(db) {
  const router = Router();
  const connecte = [verifierToken, creerCompteActif(db)];

  // Trace au journal : c'est elle qui alimente les notifications de l'auteur
  // de la publication et le journal de la console d'administration.
  function tracer(req, idPublication, action) {
    const publication = trouverPublicationAvecAuteur(db, idPublication);
    if (publication) journaliser(db, req, action, { cible: ciblePublication(publication) });
  }

  const chercherPublication = db.prepare(`
    SELECT id FROM publication WHERE id = ?
  `);

  const chercherUtilisateur = db.prepare(`
    SELECT id FROM utilisateur WHERE id = ?
  `);

  const chercherDislike = db.prepare(`
    SELECT 1
    FROM dislike
    WHERE id_pub = ? AND id_util = ?
  `);

  const chercherLike = db.prepare(`
    SELECT 1
    FROM "like"
    WHERE id_pub = ? AND id_utilisateur = ?
  `);

  const insererDislike = db.prepare(`
    INSERT INTO dislike (id_pub, id_util)
    VALUES (?, ?)
  `);

  const supprimerDislike = db.prepare(`
    DELETE FROM dislike
    WHERE id_pub = ? AND id_util = ?
  `);

  const supprimerLike = db.prepare(`
    DELETE FROM "like"
    WHERE id_pub = ? AND id_utilisateur = ?
  `);

  const synchroniserCompteurDislikes = db.prepare(`
    UPDATE publication
    SET "dislike" = (
      SELECT COUNT(*) FROM dislike WHERE id_pub = ?
    )
    WHERE id = ?
  `);

  const synchroniserCompteurLikes = db.prepare(`
    UPDATE publication
    SET "like" = (
      SELECT COUNT(*) FROM "like" WHERE id_pub = ?
    )
    WHERE id = ?
  `);

  const lireCompteurs = db.prepare(`
    SELECT "like" AS likes, "dislike" AS dislikes
    FROM publication
    WHERE id = ?
  `);

  function convertirId(valeur) {
    const id = Number(valeur);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function obtenirIdUtilisateur(req) {
    return convertirId(req.user?.id ?? req.body?.id_utilisateur);
  }

  // node:sqlite n'a pas de db.transaction() (contrairement à better-sqlite3) :
  // on fait la même chose à la main, avec BEGIN/COMMIT/ROLLBACK.
  function creerTransaction(fonction) {
    return (...args) => {
      db.exec('BEGIN');
      try {
        const resultat = fonction(...args);
        db.exec('COMMIT');
        return resultat;
      } catch (erreur) {
        db.exec('ROLLBACK');
        throw erreur;
      }
    };
  }

  const ajouterDislike = creerTransaction((idPublication, idUtilisateur) => {
    if (!chercherPublication.get(idPublication)) {
      return { erreur: 'PUBLICATION_INTROUVABLE' };
    }

    if (!chercherUtilisateur.get(idUtilisateur)) {
      return { erreur: 'UTILISATEUR_INTROUVABLE' };
    }

    const avaitDejaDislike = Boolean(
      chercherDislike.get(idPublication, idUtilisateur)
    );

    const avaitLike = Boolean(
      chercherLike.get(idPublication, idUtilisateur)
    );

    // Si l'utilisateur avait un like, on le retire d'abord.
    // Cela permet de passer directement de Like -> Dislike en un clic.
    if (avaitLike) {
      supprimerLike.run(idPublication, idUtilisateur);
    }

    if (!avaitDejaDislike) {
      insererDislike.run(idPublication, idUtilisateur);
    }

    // On recalcule les deux compteurs dans la même transaction.
    synchroniserCompteurLikes.run(idPublication, idPublication);
    synchroniserCompteurDislikes.run(idPublication, idPublication);

    const compteurs = lireCompteurs.get(idPublication);

    return {
      modifie: !avaitDejaDislike || avaitLike,
      basculeDepuisLike: avaitLike,
      liked: false,
      disliked: true,
      likes: compteurs.likes,
      dislikes: compteurs.dislikes
    };
  });

  const enleverDislike = creerTransaction((idPublication, idUtilisateur) => {
    if (!chercherPublication.get(idPublication)) {
      return { erreur: 'PUBLICATION_INTROUVABLE' };
    }

    if (!chercherUtilisateur.get(idUtilisateur)) {
      return { erreur: 'UTILISATEUR_INTROUVABLE' };
    }

    const resultat = supprimerDislike.run(idPublication, idUtilisateur);
    synchroniserCompteurDislikes.run(idPublication, idPublication);

    const compteurs = lireCompteurs.get(idPublication);

    return {
      modifie: resultat.changes > 0,
      liked: Boolean(chercherLike.get(idPublication, idUtilisateur)),
      disliked: false,
      likes: compteurs.likes,
      dislikes: compteurs.dislikes
    };
  });

  router.post('/:id/dislike', connecte, (req, res) => {
    const idPublication = convertirId(req.params.id);
    const idUtilisateur = obtenirIdUtilisateur(req);

    if (!idPublication) {
      return res.status(400).json({ erreur: 'ID de publication invalide' });
    }

    if (!idUtilisateur) {
      return res.status(400).json({ erreur: 'ID utilisateur invalide ou manquant' });
    }

    try {
      const resultat = ajouterDislike(idPublication, idUtilisateur);

      if (resultat.erreur === 'PUBLICATION_INTROUVABLE') {
        return res.status(404).json({ erreur: 'Publication introuvable' });
      }

      if (resultat.erreur === 'UTILISATEUR_INTROUVABLE') {
        return res.status(404).json({ erreur: 'Utilisateur introuvable' });
      }

      let message = 'Publication déjà dislikée';
      if (resultat.basculeDepuisLike) {
        message = 'Like retiré et dislike ajouté';
      } else if (resultat.modifie) {
        message = 'Dislike ajouté';
      }

      if (resultat.modifie) tracer(req, idPublication, 'dislike_ajoute');

      return res.status(resultat.modifie ? 201 : 200).json({
        message,
        publicationId: idPublication,
        utilisateurId: idUtilisateur,
        liked: resultat.liked,
        disliked: resultat.disliked,
        likes: resultat.likes,
        dislikes: resultat.dislikes
      });
    } catch (erreur) {
      console.error('Erreur ajout dislike :', erreur);
      return res.status(500).json({ erreur: 'Erreur interne du serveur' });
    }
  });

  router.delete('/:id/dislike', connecte, (req, res) => {
    const idPublication = convertirId(req.params.id);
    const idUtilisateur = obtenirIdUtilisateur(req);

    if (!idPublication) {
      return res.status(400).json({ erreur: 'ID de publication invalide' });
    }

    if (!idUtilisateur) {
      return res.status(400).json({ erreur: 'ID utilisateur invalide ou manquant' });
    }

    try {
      const resultat = enleverDislike(idPublication, idUtilisateur);

      if (resultat.erreur === 'PUBLICATION_INTROUVABLE') {
        return res.status(404).json({ erreur: 'Publication introuvable' });
      }

      if (resultat.erreur === 'UTILISATEUR_INTROUVABLE') {
        return res.status(404).json({ erreur: 'Utilisateur introuvable' });
      }

      if (resultat.modifie) tracer(req, idPublication, 'dislike_retire');

      return res.status(200).json({
        message: resultat.modifie
          ? 'Dislike retiré'
          : 'La publication n’était pas dislikée',
        publicationId: idPublication,
        utilisateurId: idUtilisateur,
        liked: resultat.liked,
        disliked: resultat.disliked,
        likes: resultat.likes,
        dislikes: resultat.dislikes
      });
    } catch (erreur) {
      console.error('Erreur suppression dislike :', erreur);
      return res.status(500).json({ erreur: 'Erreur interne du serveur' });
    }
  });

  return router;
}
