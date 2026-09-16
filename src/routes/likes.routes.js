import { Router } from 'express';
import { trouverPublicationAvecAuteur } from '../repositories/fil.repository.js';
import { journaliser, ciblePublication } from '../services/journal.service.js';
import { verifierToken, creerCompteActif } from '../middlewares/auth.middleware.js';

/**
 * Backend de la fonctionnalité like / unlike.
 *
 * POST   /api/publications/:id/like
 * DELETE /api/publications/:id/like
 *
 * Comportement important :
 * - si l'utilisateur dislike déjà la publication et clique sur Like,
 *   le dislike est retiré automatiquement avant d'ajouter le like ;
 * - l'ensemble est exécuté dans une transaction SQLite.
 *
 * L'id de l'utilisateur vient du token de connexion (req.user.id), posé par
 * le middleware d'authentification. Le body { "id_utilisateur": 1 } reste
 * accepté en secours pour les essais en ligne de commande.
 */
export function creerRoutesLikes(db) {
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

  const supprimerDislike = db.prepare(`
    DELETE FROM dislike
    WHERE id_pub = ? AND id_util = ?
  `);

  const synchroniserCompteurLikes = db.prepare(`
    UPDATE publication
    SET "like" = (
      SELECT COUNT(*) FROM "like" WHERE id_pub = ?
    )
    WHERE id = ?
  `);

  const synchroniserCompteurDislikes = db.prepare(`
    UPDATE publication
    SET "dislike" = (
      SELECT COUNT(*) FROM dislike WHERE id_pub = ?
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

  const ajouterLike = creerTransaction((idPublication, idUtilisateur) => {
    if (!chercherPublication.get(idPublication)) {
      return { erreur: 'PUBLICATION_INTROUVABLE' };
    }

    if (!chercherUtilisateur.get(idUtilisateur)) {
      return { erreur: 'UTILISATEUR_INTROUVABLE' };
    }

    const avaitDejaLike = Boolean(
      chercherLike.get(idPublication, idUtilisateur)
    );

    const avaitDislike = Boolean(
      chercherDislike.get(idPublication, idUtilisateur)
    );

    // Si l'utilisateur avait un dislike, on le retire d'abord.
    // Cela permet de passer directement de Dislike -> Like en un clic.
    if (avaitDislike) {
      supprimerDislike.run(idPublication, idUtilisateur);
    }

    if (!avaitDejaLike) {
      insererLike.run(idPublication, idUtilisateur);
    }

    // On recalcule les deux compteurs dans la même transaction.
    synchroniserCompteurLikes.run(idPublication, idPublication);
    synchroniserCompteurDislikes.run(idPublication, idPublication);

    const compteurs = lireCompteurs.get(idPublication);

    return {
      modifie: !avaitDejaLike || avaitDislike,
      basculeDepuisDislike: avaitDislike,
      liked: true,
      disliked: false,
      likes: compteurs.likes,
      dislikes: compteurs.dislikes
    };
  });

  const enleverLike = creerTransaction((idPublication, idUtilisateur) => {
    if (!chercherPublication.get(idPublication)) {
      return { erreur: 'PUBLICATION_INTROUVABLE' };
    }

    if (!chercherUtilisateur.get(idUtilisateur)) {
      return { erreur: 'UTILISATEUR_INTROUVABLE' };
    }

    const resultat = supprimerLike.run(idPublication, idUtilisateur);
    synchroniserCompteurLikes.run(idPublication, idPublication);

    const compteurs = lireCompteurs.get(idPublication);

    return {
      modifie: resultat.changes > 0,
      liked: false,
      disliked: Boolean(chercherDislike.get(idPublication, idUtilisateur)),
      likes: compteurs.likes,
      dislikes: compteurs.dislikes
    };
  });

  router.post('/:id/like', connecte, (req, res) => {
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

      let message = 'Publication déjà likée';
      if (resultat.basculeDepuisDislike) {
        message = 'Dislike retiré et like ajouté';
      } else if (resultat.modifie) {
        message = 'Like ajouté';
      }

      if (resultat.modifie) tracer(req, idPublication, 'like_ajoute');

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
      console.error('Erreur ajout like :', erreur);
      return res.status(500).json({ erreur: 'Erreur interne du serveur' });
    }
  });

  router.delete('/:id/like', connecte, (req, res) => {
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

      if (resultat.modifie) tracer(req, idPublication, 'like_retire');

      return res.status(200).json({
        message: resultat.modifie ? 'Like retiré' : 'La publication n’était pas likée',
        publicationId: idPublication,
        utilisateurId: idUtilisateur,
        liked: resultat.liked,
        disliked: resultat.disliked,
        likes: resultat.likes,
        dislikes: resultat.dislikes
      });
    } catch (erreur) {
      console.error('Erreur suppression like :', erreur);
      return res.status(500).json({ erreur: 'Erreur interne du serveur' });
    }
  });

  return router;
}
