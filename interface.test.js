/*
 * ============================================================
 *  TESTS UNITAIRES - INTERFACE INTÉGRÉE (frontend V3)
 * ============================================================
 * Couche ajoutée autour du code du groupe : session, fil,
 * signalements, administration, Mon compte, conversations.
 * Les tests du groupe restent dans testunitaire.test.js.
 *
 *   npm test   (lance les deux fichiers)
 * ============================================================
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { ouvrirBase } from './src/bdd/connexion.js';
import { installerDonneesInitiales, COMPTES_PRECONFIGURES } from './src/bdd/donnees-initiales.js';
import { inscrire, connecter } from './src/services/auth.service.js';
import { JWT_SECRET, MDP_MIN, MDP_MAX } from './src/config.js';
import { controleSession, exigerRoles } from './src/middlewares/session.middleware.js';
import { validerInscription } from './src/middlewares/suivi.middleware.js';
import * as filService from './src/services/fil.service.js';
import * as filRepository from './src/repositories/fil.repository.js';
import * as moderationService from './src/services/moderation.service.js';
import * as administrationService from './src/services/administration.service.js';
import * as compteService from './src/services/compte.service.js';
import * as conversationsRepository from './src/repositories/conversations.repository.js';
import { creerConversationPrivee, enregistrerMessage } from './src/repositories/messagerie.repository.js';
import { listerJournal } from './src/repositories/journal.repository.js';
import { creerRoutesHashtags } from './src/routes/hashtag.routes.js';
import { ErreurMetier } from './src/services/erreurs.js';

// ── Outils ──────────────────────────────────────────────────

function baseVide() {
  const db = ouvrirBase(':memory:');
  installerDonneesInitiales(db, { avecDemonstration: false, silencieux: true });
  return db;
}

function creerCompte(db, nom, role = 'user') {
  const info = db
    .prepare('INSERT INTO utilisateur (nom, mdp, date, role, banni) VALUES (?, ?, ?, ?, 0)')
    .run(nom, 'hash-de-test', new Date().toISOString(), role);
  return { id: Number(info.lastInsertRowid), nom, role };
}

function creerPublication(db, idUtilisateur, typeFichier = 'image/png') {
  return Number(db
    .prepare(`INSERT INTO publication (id_utilisateur, date, description, nom_fichier, type_fichier, vue, "like", "dislike", partage, republie)
              VALUES (?, ?, 'Une photo', 'inexistant.png', ?, 0, 0, 0, 0, 0)`)
    .run(idUtilisateur, new Date().toISOString(), typeFichier).lastInsertRowid);
}

const requeteDe = (user, body = {}) => ({ user, ip: '127.0.0.1', body });

// Exécute un middleware Express et renvoie { statut, corps, suite }
function executer(middleware, req) {
  const resultat = { statut: null, corps: null, suite: false };
  const res = {
    locals: {},
    status(code) { resultat.statut = code; return res; },
    json(corps) { resultat.corps = corps; return res; },
    on() {}
  };
  middleware(req, res, () => { resultat.suite = true; });
  return resultat;
}

const tokenPour = (u) => jwt.sign({ id: u.id, nom: u.nom, role: u.role }, JWT_SECRET);


// ============================================================
//  DONNÉES INITIALES
// ============================================================
describe('donnees-initiales.js - comptes préconfigurés', () => {
  it('crée les comptes préconfigurés avec des mots de passe valides (12 à 64)', async () => {
    const db = baseVide();
    for (const compte of COMPTES_PRECONFIGURES) {
      assert.ok(compte.mdp.length >= MDP_MIN && compte.mdp.length <= MDP_MAX);
      const { user } = await connecter(db, { nom: compte.nom, mdp: compte.mdp });
      assert.equal(user.role, compte.role);
    }
  });

  it('rétablit un administrateur si la base n’en a plus', () => {
    const db = baseVide();
    db.prepare("UPDATE utilisateur SET role = 'user' WHERE role = 'admin'").run();
    installerDonneesInitiales(db, { silencieux: true });
    assert.ok(db.prepare("SELECT 1 FROM utilisateur WHERE role = 'admin'").get());
  });
});


// ============================================================
//  SESSION - contrôle devant les routes /api
// ============================================================
describe('session.middleware.js - contrôle de session', () => {
  let db;
  beforeEach(() => { db = baseVide(); });

  it('laisse passer une requête sans token (la route décide)', () => {
    const r = executer(controleSession(db), { path: '/publications', headers: {} });
    assert.equal(r.suite, true);
  });

  it('refuse un token à la signature fabriquée', () => {
    const faux = jwt.sign({ id: 1, nom: 'admin', role: 'admin' }, 'pas-le-bon-secret');
    const r = executer(controleSession(db), { path: '/utilisateurs', headers: { authorization: `Bearer ${faux}` } });
    assert.equal(r.statut, 401);
    assert.equal(r.suite, false);
  });

  it('refuse le token d’un compte supprimé', () => {
    const token = tokenPour({ id: 999, nom: 'fantome', role: 'user' });
    const r = executer(controleSession(db), { path: '/compte', headers: { authorization: `Bearer ${token}` } });
    assert.equal(r.statut, 401);
  });

  it('refuse un compte suspendu (403) ou banni par l’écran du groupe', () => {
    const u = creerCompte(db, 'suspendu');
    const req = () => ({ path: '/compte', headers: { authorization: `Bearer ${tokenPour(u)}` } });
    db.prepare('UPDATE utilisateur SET banni = 1 WHERE id = ?').run(u.id);
    assert.equal(executer(controleSession(db), req()).statut, 403);
  });

  it('demande de se reconnecter quand le rôle a changé depuis la connexion', () => {
    const u = creerCompte(db, 'promu');
    const token = tokenPour(u);
    db.prepare("UPDATE utilisateur SET role = 'modo' WHERE id = ?").run(u.id);
    const r = executer(controleSession(db), { path: '/compte', headers: { authorization: `Bearer ${token}` } });
    assert.equal(r.statut, 401);
  });

  it('pose req.user depuis la base pour un token valide', () => {
    const u = creerCompte(db, 'valide');
    const req = { path: '/compte', headers: { authorization: `Bearer ${tokenPour(u)}` } };
    const r = executer(controleSession(db), req);
    assert.equal(r.suite, true);
    assert.equal(req.user.id, u.id);
  });

  it('exigerRoles bloque un membre sur une route staff', () => {
    const r = executer(exigerRoles('modo', 'admin'), { user: { role: 'user' } });
    assert.equal(r.statut, 403);
  });

  it('validerInscription refuse plus de 64 caractères de mot de passe', () => {
    const r = executer(validerInscription(db), { body: { nom: 'valou', mdp: 'a'.repeat(65) } });
    assert.equal(r.statut, 400);
  });

  it('validerInscription refuse un nom avec des caractères interdits', () => {
    const r = executer(validerInscription(db), { body: { nom: 'jean dupont!', mdp: 'motdepasse1234' } });
    assert.equal(r.statut, 400);
  });
});


// ============================================================
//  FIL - lecture et retrait
// ============================================================
describe('fil.service.js - fil et retrait', () => {
  let db, auteur, autre, modo;
  beforeEach(() => {
    db = baseVide();
    auteur = creerCompte(db, 'auteur');
    autre = creerCompte(db, 'autre');
    modo = creerCompte(db, 'modo1', 'modo');
  });

  it('filtre les photos et les vidéos et construit l’URL du média', () => {
    creerPublication(db, auteur.id, 'image/png');
    creerPublication(db, auteur.id, 'video/mp4');
    const photos = filService.lireFil(db, autre.id, { type: 'photo' });
    const videos = filService.lireFil(db, autre.id, { type: 'video' });
    assert.equal(photos.length, 1);
    assert.equal(videos.length, 1);
    assert.equal(photos[0].media, '/uploads/temp/inexistant.png');
    assert.equal(videos[0].media, '/uploads/videos/inexistant.png');
  });

  it('l’auteur peut retirer sa publication', () => {
    const id = creerPublication(db, auteur.id);
    filService.supprimer(db, requeteDe(auteur), id);
    assert.equal(filRepository.trouverPublicationAvecAuteur(db, id), undefined);
  });

  it('un autre membre ne peut pas retirer la publication', () => {
    const id = creerPublication(db, auteur.id);
    assert.throws(() => filService.supprimer(db, requeteDe(autre), id), ErreurMetier);
  });

  it('un modérateur peut la retirer, avec le motif au journal', () => {
    const id = creerPublication(db, auteur.id);
    db.prepare('INSERT INTO "like" (id_pub, id_utilisateur) VALUES (?, ?)').run(id, autre.id);
    filService.supprimer(db, requeteDe(modo, { raison: 'Spam' }), id);
    const { lignes } = listerJournal(db, { action: 'publication_moderee' });
    assert.equal(lignes.length, 1);
    assert.match(lignes[0].details, /Spam/);
  });
});


// ============================================================
//  SIGNALEMENTS
// ============================================================
describe('moderation.service.js - signalements', () => {
  let db, auteur, membre, modo;
  beforeEach(() => {
    db = baseVide();
    auteur = creerCompte(db, 'auteur');
    membre = creerCompte(db, 'membre');
    modo = creerCompte(db, 'modo1', 'modo');
  });

  it('signaler une publication vise son auteur et rappelle la publication', () => {
    const idPub = creerPublication(db, auteur.id);
    moderationService.signaler(db, requeteDe(membre), { idPublication: idPub, raison: 'Spam' });
    const [s] = moderationService.file(db);
    assert.equal(s.id_signale, auteur.id);
    assert.match(s.raison, new RegExp(`publication n°${idPub}`));
  });

  it('on ne peut pas signaler sa propre publication', () => {
    const idPub = creerPublication(db, auteur.id);
    assert.throws(() => moderationService.signaler(db, requeteDe(auteur), { idPublication: idPub, raison: 'Spam' }), ErreurMetier);
  });

  it('clore un dossier le retire de la file et garde la décision au journal', () => {
    const { id } = moderationService.signaler(db, requeteDe(membre), { idSignale: auteur.id, raison: 'Spam' });
    moderationService.clore(db, requeteDe(modo), id, 'classé sans suite');
    assert.equal(moderationService.file(db).length, 0);
    assert.equal(listerJournal(db, { action: 'signalement_classe' }).lignes.length, 1);
  });
});


// ============================================================
//  ADMINISTRATION
// ============================================================
describe('administration.service.js - comptes, rôles, sanctions', () => {
  let db, admin, membre;
  beforeEach(() => {
    db = baseVide();
    admin = db.prepare("SELECT id, nom, role FROM utilisateur WHERE role = 'admin'").get();
    membre = creerCompte(db, 'membre');
  });

  it('nomme un modérateur', () => {
    administrationService.changerRole(db, requeteDe(admin), membre.id, 'modo');
    assert.equal(db.prepare('SELECT role FROM utilisateur WHERE id = ?').get(membre.id).role, 'modo');
  });

  it('protège son propre compte et les autres administrateurs', () => {
    const autreAdmin = creerCompte(db, 'admin2', 'admin');
    assert.throws(() => administrationService.changerRole(db, requeteDe(admin), admin.id, 'user'), ErreurMetier);
    assert.throws(() => administrationService.suspendre(db, requeteDe(admin), autreAdmin.id, { raison: 'x', jours: 1 }), ErreurMetier);
  });

  it('suspend puis lève la suspension (colonne banni synchronisée)', async () => {
    const compte = await inscrire(db, { nom: 'valou', mdp: 'motdepasse1234' });
    administrationService.suspendre(db, requeteDe(admin), compte.id, { raison: 'Spam', jours: 3 });
    assert.equal(db.prepare('SELECT banni FROM utilisateur WHERE id = ?').get(compte.id).banni, 1);
    administrationService.leverSuspension(db, requeteDe(admin), compte.id);
    assert.equal(db.prepare('SELECT banni FROM utilisateur WHERE id = ?').get(compte.id).banni, 0);
  });

  it('refuse une suspension sans raison ou de durée invalide', () => {
    assert.throws(() => administrationService.suspendre(db, requeteDe(admin), membre.id, { raison: '', jours: 3 }), ErreurMetier);
    assert.throws(() => administrationService.suspendre(db, requeteDe(admin), membre.id, { raison: 'x', jours: 0 }), ErreurMetier);
  });

  it('supprime un compte qui a des conversations, sans casser celles des autres tables', () => {
    const autre = creerCompte(db, 'autre');
    const idPub = creerPublication(db, autre.id);
    db.prepare('INSERT INTO "like" (id_pub, id_utilisateur) VALUES (?, ?)').run(idPub, membre.id);
    const conversation = creerConversationPrivee(db, membre.id, autre.id);
    enregistrerMessage(db, conversation, membre.id, { iv: 'a', ciphertext: 'b', authTag: '' });
    enregistrerMessage(db, conversation, autre.id, { iv: 'c', ciphertext: 'd', authTag: '' });

    administrationService.supprimerCompte(db, requeteDe(admin), membre.id, 'Test');

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM utilisateur WHERE id = ?').get(membre.id).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM conversation').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM message').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM "like"').get().n, 0);
    assert.ok(filRepository.trouverPublicationAvecAuteur(db, idPub), 'la publication de l’autre compte reste');
  });

  it('le tableau de bord renvoie 14 jours d’activité', () => {
    const { chiffres, activite } = administrationService.tableauDeBord(db);
    assert.equal(activite.length, 14);
    assert.ok(chiffres.comptes >= 2);
  });
});


// ============================================================
//  MON COMPTE
// ============================================================
describe('compte.service.js - mot de passe et fermeture', () => {
  let db;
  beforeEach(() => { db = baseVide(); });

  it('change le mot de passe si l’ancien est correct', async () => {
    const u = await inscrire(db, { nom: 'valou', mdp: 'motdepasse1234' });
    await compteService.changerMotDePasse(db, requeteDe({ ...u, id: Number(u.id) }), { ancien: 'motdepasse1234', nouveau: 'nouveaumotdepasse' });
    await connecter(db, { nom: 'valou', mdp: 'nouveaumotdepasse' });
  });

  it('refuse un ancien mot de passe faux ou un nouveau hors 12 à 64 caractères', async () => {
    const u = await inscrire(db, { nom: 'valou', mdp: 'motdepasse1234' });
    const req = requeteDe({ ...u, id: Number(u.id) });
    await assert.rejects(() => compteService.changerMotDePasse(db, req, { ancien: 'faux', nouveau: 'nouveaumotdepasse' }), ErreurMetier);
    await assert.rejects(() => compteService.changerMotDePasse(db, req, { ancien: 'motdepasse1234', nouveau: 'court' }), ErreurMetier);
    await assert.rejects(() => compteService.changerMotDePasse(db, req, { ancien: 'motdepasse1234', nouveau: 'a'.repeat(65) }), ErreurMetier);
  });

  it('ferme son compte avec le bon mot de passe ; un admin ne peut pas', async () => {
    const u = await inscrire(db, { nom: 'valou', mdp: 'motdepasse1234' });
    await compteService.fermerCompte(db, requeteDe({ ...u, id: Number(u.id) }), 'motdepasse1234');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM utilisateur WHERE nom = 'valou'").get().n, 0);

    const { user: admin } = await connecter(db, { nom: 'admin', mdp: 'AdminHess2026!' });
    await assert.rejects(() => compteService.fermerCompte(db, requeteDe(admin), 'AdminHess2026!'), ErreurMetier);
  });
});


// ============================================================
//  CONVERSATIONS (lecture des messages chiffrés)
// ============================================================
describe('conversations.repository.js - liste et historique', () => {
  it('compte les non lus, renvoie la suite de l’historique et marque comme vus', () => {
    const db = baseVide();
    const a = creerCompte(db, 'alice');
    const b = creerCompte(db, 'bob');
    const conversation = creerConversationPrivee(db, a.id, b.id);
    enregistrerMessage(db, conversation, a.id, { iv: 'i1', ciphertext: 'c1', authTag: '' });
    enregistrerMessage(db, conversation, a.id, { iv: 'i2', ciphertext: 'c2', authTag: '' });

    const contactAlice = conversationsRepository.listerContacts(db, b.id).find((c) => c.id === a.id);
    assert.equal(contactAlice.non_lus, 2);

    const tout = conversationsRepository.historiqueAvec(db, b.id, a.id);
    assert.equal(tout.length, 2);
    assert.match(tout[0].date, /T.*Z$/);
    assert.equal(conversationsRepository.historiqueAvec(db, b.id, a.id, tout[0].id).length, 1);

    conversationsRepository.marquerVus(db, conversation, b.id);
    assert.equal(conversationsRepository.listerContacts(db, b.id).find((c) => c.id === a.id).non_lus, 0);
  });
});

// ============================================================
//  HASHTAGS - Routes et vérification de la liste noire
// ============================================================
describe('hashtag.routes.js - API hashtags et liste noire', () => {
  let db;
  beforeEach(() => { db = baseVide(); });

  function simuler(router, method, path, { user, body = {} } = {}) {
    return new Promise((resolve) => {
      const req = {
        method: method.toUpperCase(),
        url: path,
        path: path.split('?')[0],
        params: {},
        query: {},
        user,
        body,
        headers: {},
      };
      const resultat = { status: 200, json: null, ended: false };
      const res = {
        statusCode: 200,
        status(code) { resultat.status = code; this.statusCode = code; return res; },
        json(data) { resultat.json = data; resultat.ended = true; resolve(resultat); },
        end() { resultat.ended = true; resolve(resultat); },
      };
      router.handle(req, res, () => resolve(resultat));
    });
  }

  it('permet à un admin d’interdire puis de réautoriser un hashtag', async () => {
    const admin = creerCompte(db, 'monadmin', 'admin');
    const membre = creerCompte(db, 'simplemembre', 'user');
    const router = creerRoutesHashtags(db);

    // Un membre simple ne peut pas interdire de hashtag (403)
    const resMembre = await simuler(router, 'POST', '/hashtags-interdits', { user: membre, body: { nom: 'interdit1' } });
    assert.equal(resMembre.status, 403);

    // L'admin peut interdire avec le symbole #
    const resAdmin = await simuler(router, 'POST', '/hashtags-interdits', { user: admin, body: { nom: '#interdit1' } });
    assert.equal(resAdmin.status, 201);
    assert.equal(resAdmin.json.nom, 'interdit1');

    // Vérifier l'état interdit
    const verif = await simuler(router, 'GET', '/hashtags/verifier/interdit1', { user: membre });
    assert.equal(verif.status, 200);
    assert.equal(verif.json.interdit, true);

    // Liste des hashtags interdits pour l'admin
    const liste = await simuler(router, 'GET', '/hashtags-interdits', { user: admin });
    assert.equal(liste.status, 200);
    assert.ok(liste.json.includes('interdit1'));

    // L'admin peut retirer de la liste noire
    const retrait = await simuler(router, 'DELETE', '/hashtags-interdits/interdit1', { user: admin });
    assert.equal(retrait.status, 204);

    // Vérifier qu'il n'est plus interdit
    const verifApres = await simuler(router, 'GET', '/hashtags/verifier/interdit1', { user: membre });
    assert.equal(verifApres.json.interdit, false);
  });

  it('renvoie les tendances des hashtags les plus utilisés avec leur rang', async () => {
    const membre = creerCompte(db, 'membre2', 'user');
    const router = creerRoutesHashtags(db);

    const p1 = creerPublication(db, membre.id);
    const p2 = creerPublication(db, membre.id);
    db.prepare('INSERT INTO hashtag (nom, nombre_utilisation, id_pub) VALUES (?, 1, ?)').run('buzz', p1);
    db.prepare('INSERT INTO hashtag (nom, nombre_utilisation, id_pub) VALUES (?, 2, ?)').run('buzz', p2);
    db.prepare('INSERT INTO hashtag (nom, nombre_utilisation, id_pub) VALUES (?, 1, ?)').run('normal', p1);

    const res = await simuler(router, 'GET', '/hashtags/tendances', { user: membre });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json));
    assert.ok(res.json.length >= 2);
    assert.equal(res.json[0].nom, 'buzz');
    assert.equal(res.json[0].rang, 1);
    assert.equal(res.json[0].total, 2);
    assert.equal(res.json[1].nom, 'normal');
    assert.equal(res.json[1].rang, 2);
  });
});


