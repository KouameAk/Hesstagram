import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { verifierToken, estAdmin, estAdminOuModo } from './auth.middleware.js';

function creerReponseBidon() {
  const reponse = { statutEnvoye: null, corpsEnvoye: null };
  reponse.status = (code) => {
    reponse.statutEnvoye = code;
    return reponse;
  };
  reponse.json = (corps) => {
    reponse.corpsEnvoye = corps;
    return reponse;
  };
  return reponse;
}

test('verifierToken refuse une requête sans en-tête Authorization', () => {
  const req = { headers: {} };
  const res = creerReponseBidon();
  let suivantAppele = false;

  verifierToken(req, res, () => { suivantAppele = true; });

  assert.equal(suivantAppele, false);
  assert.equal(res.statutEnvoye, 401);
});

test('verifierToken accepte un token et remplit req.user', () => {
  const token = jwt.sign({ id: 1, nom: 'alice', role: 'admin' }, process.env.JWT_SECRET || 'secret_temporaire_hesstagram');
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = creerReponseBidon();
  let suivantAppele = false;

  verifierToken(req, res, () => { suivantAppele = true; });

  assert.equal(suivantAppele, true);
  assert.equal(req.user.nom, 'alice');
  assert.equal(req.user.role, 'admin');
});

test('estAdmin bloque un utilisateur qui n\'est pas admin', () => {
  const req = { user: { role: 'user' } };
  const res = creerReponseBidon();
  let suivantAppele = false;

  estAdmin(req, res, () => { suivantAppele = true; });

  assert.equal(suivantAppele, false);
  assert.equal(res.statutEnvoye, 403);
});

test('estAdmin laisse passer un admin', () => {
  const req = { user: { role: 'admin' } };
  const res = creerReponseBidon();
  let suivantAppele = false;

  estAdmin(req, res, () => { suivantAppele = true; });

  assert.equal(suivantAppele, true);
});

test('estAdminOuModo bloque un simple utilisateur', () => {
  const req = { user: { role: 'user' } };
  const res = creerReponseBidon();
  let suivantAppele = false;

  estAdminOuModo(req, res, () => { suivantAppele = true; });

  assert.equal(suivantAppele, false);
  assert.equal(res.statutEnvoye, 403);
});

test('estAdminOuModo laisse passer un modo', () => {
  const req = { user: { role: 'modo' } };
  const res = creerReponseBidon();
  let suivantAppele = false;

  estAdminOuModo(req, res, () => { suivantAppele = true; });

  assert.equal(suivantAppele, true);
});
