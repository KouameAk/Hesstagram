import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as publicationRepository from './src/repositories/publication.repository.js';
import * as utilisateurRepository from './src/repositories/utilisateur.repository.js';
import { publierVideo, recupererVideos, ErreurPublication } from './src/services/publication.service.js';
import { ouvrirBase } from './src/bdd/connexion.js';

describe('publication.service.js - logique métier pour les vidéos', () => {
  let db;

  beforeEach(() => {
    db = ouvrirBase(':memory:');
    // Créer un utilisateur pour les tests
    utilisateurRepository.creerUtilisateur(db, {
      nom: 'testuser',
      mdpHash: 'hash',
      date: new Date().toISOString(),
      role: 'user'
    });
  });

  it('publierVideo() refuse si idUtilisateur est manquant', async () => {
    await assert.rejects(
      () => publierVideo(db, { idUtilisateur: null, description: 'Test', nomFichier: 'video.mp4', typeFichier: 'video/mp4' }),
      ErreurPublication
    );
  });

  it('publierVideo() refuse si le fichier n\'est pas une vidéo', async () => {
    await assert.rejects(
      () => publierVideo(db, { idUtilisateur: 1, description: 'Test', nomFichier: 'image.jpg', typeFichier: 'image/jpeg' }),
      ErreurPublication
    );
  });

  it('publierVideo() refuse si l\'utilisateur n\'existe pas', async () => {
    await assert.rejects(
      () => publierVideo(db, { idUtilisateur: 999, description: 'Test', nomFichier: 'video.mp4', typeFichier: 'video/mp4' }),
      ErreurPublication
    );
  });

  it('publierVideo() crée une publication vidéo avec succès', async () => {
    const pub = await publierVideo(db, {
      idUtilisateur: 1,
      description: 'Superbe vidéo',
      nomFichier: 'mavid.mp4',
      typeFichier: 'video/mp4'
    });

    assert.ok(pub.id);
    assert.equal(pub.id_utilisateur, 1);
    assert.equal(pub.description, 'Superbe vidéo');
    assert.equal(pub.nom_fichier, 'mavid.mp4');
    assert.equal(pub.type_fichier, 'video/mp4');
  });

  it('recupererVideos() ne retourne que des vidéos, ordonnées par date', async () => {
    // Insérer des vidéos et autres publications directement via la db ou le repository
    publicationRepository.creerPublication(db, {
      idUtilisateur: 1, description: 'v1', nomFichier: '1.mp4', typeFichier: 'video/mp4'
    });
    
    // Attendre un peu pour s'assurer que la date change (ou tricher sur le mock, mais SQLite gère les millisecondes)
    await new Promise(resolve => setTimeout(resolve, 50));
    
    publicationRepository.creerPublication(db, {
      idUtilisateur: 1, description: 'i1', nomFichier: '1.jpg', typeFichier: 'image/jpeg'
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    publicationRepository.creerPublication(db, {
      idUtilisateur: 1, description: 'v2', nomFichier: '2.mp4', typeFichier: 'video/mp4'
    });

    const videos = await recupererVideos(db);

    assert.equal(videos.length, 2);
    // Vérifie l'ordre descendant
    assert.equal(videos[0].description, 'v2');
    assert.equal(videos[1].description, 'v1');
    
    // Vérifie que ce sont bien des vidéos
    assert.ok(videos[0].type_fichier.startsWith('video/'));
    assert.ok(videos[1].type_fichier.startsWith('video/'));
  });
});
