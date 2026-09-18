import {
  enregistrerHashtags,
  estInterdit,
  trouverPublicationsParHashtag,
  obtenirTendancesHashtags,
} from '../repositories/hashtag.repository.js';

// Trouve les #motclé dans un texte, les normalise (minuscules, sans le #)
// et enlève les doublons.
export function extraireHashtags(texte) {
  const trouves = String(texte ?? '').match(/#(\w+)/g) ?? [];
  const normalises = trouves.map((mot) => mot.slice(1).toLowerCase());
  return [...new Set(normalises)];
}

// Extrait les hashtags d'une publication et les enregistre, en ignorant
// ceux de la liste noire. Accepte également des hashtags additionnels
// (tableau ou chaîne séparée par des virgules/espaces/JSON).
export function traiterHashtagsPublication(db, idPublication, description, hashtagsExtra = []) {
  const depuisTexte = extraireHashtags(description);

  let extra = [];
  if (Array.isArray(hashtagsExtra)) {
    extra = hashtagsExtra;
  } else if (typeof hashtagsExtra === 'string' && hashtagsExtra.trim()) {
    try {
      const parsed = JSON.parse(hashtagsExtra);
      if (Array.isArray(parsed)) extra = parsed;
      else extra = hashtagsExtra.split(/[\s,]+/);
    } catch {
      extra = hashtagsExtra.split(/[\s,]+/);
    }
  }

  const extraNormalises = extra
    .map((mot) => String(mot ?? '').replace(/^#+/, '').trim().toLowerCase())
    .filter((mot) => /^\w+$/.test(mot));

  const tousHashtags = [...new Set([...depuisTexte, ...extraNormalises])].filter(
    (nom) => !estInterdit(db, nom),
  );

  if (tousHashtags.length > 0) {
    enregistrerHashtags(db, idPublication, tousHashtags);
  }
  return tousHashtags;
}

export function publicationsParHashtag(db, nom) {
  return trouverPublicationsParHashtag(db, nom.toLowerCase());
}

export function recupererTendances(db, options = {}) {
  const liste = obtenirTendancesHashtags(db, options);
  return liste.map((t, index) => ({
    rang: index + 1,
    nom: t.nom,
    total: t.total,
    label: `${t.total} publication${t.total > 1 ? 's' : ''}`
  }));
}
