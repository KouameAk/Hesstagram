// publications.js — cartes de publication, interactions, abonnements, signalements
// Utilisé par le fil (index), l'explorer et les profils. Dépend de app.js.

// ── Bouton Suivre / Abonné ──
function boutonSuivre(compte, { taille = 'btn-sm', onChange = null, court = false } = {}) {
  const b = document.createElement('button');
  const rendre = () => {
    b.className = `btn ${taille} btn-suivre ${compte.je_suis_abonne ? 'suivi' : ''}`;
    b.innerHTML = compte.je_suis_abonne ? `${icone('suivi', 'icone-sm')}Abonné` : `${icone('suivre', 'icone-sm')}${compte.me_suit && !court ? 'Suivre en retour' : 'Suivre'}`;
  };
  rendre();
  b.onclick = async e => {
    e.stopPropagation();
    const avant = compte.je_suis_abonne;
    compte.je_suis_abonne = !avant;                 // retour visuel immédiat
    rendre();
    try {
      const r = await api(`/api/abonnements/${compte.id}`, { method: 'POST' });
      compte.je_suis_abonne = r.abonne;
      rendre();
      onChange?.(r.abonne);
    } catch (err) {
      compte.je_suis_abonne = avant;
      rendre();
      toastErreur(err);
    }
  };
  return b;
}

// ── Ligne de compte cliquable (listes de j'aime, abonnés, suggestions) ──
function ligneCompte(c, { sous = '', suivre = true } = {}) {
  const el = document.createElement('div');
  el.className = 'ligne-compte';
  el.innerHTML = `
    <a href="/profil.html?id=${c.id}">${avatar(c.nom, 46)}</a>
    <a class="infos" href="/profil.html?id=${c.id}">
      <div class="nom"><span class="ellipsis"></span>${estStaff(c.role) ? icone('verifie', 'verifie') : ''}</div>
      <div class="sous ellipsis"></div>
    </a>`;
  el.querySelector('.nom .ellipsis').textContent = c.nom;
  el.querySelector('.sous').textContent = sous;
  if (suivre && c.id !== MOI.id) el.appendChild(boutonSuivre(c, { court: true }));
  return el;
}

// ── Signaler un compte : raisons rapides + précision ──
function signalerCompte(compte) {
  const RAISONS = ['Spam', 'Harcèlement', 'Discours haineux', 'Contenu inapproprié', 'Usurpation d’identité', 'Autre'];
  const m = ouvrirModal({
    titre: `Signaler ${compte.nom}`,
    largeur: 480,
    corps: `
      <p>Votre signalement est anonyme pour ce compte. L’équipe de modération l’examinera.</p>
      <div class="field">
        <span class="label">Motif</span>
        <div class="raisons-rapides">${RAISONS.map(r => `<button type="button" data-raison="${r}">${r}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label for="sig-details">Précisions <span class="compteur" data-compteur>0 / 400</span></label>
        <textarea class="input" id="sig-details" rows="3" maxlength="400" placeholder="Qu’est-ce qui pose problème ?"></textarea>
      </div>`,
    pied: `<button class="btn" data-fermer>Annuler</button><button class="btn btn-primary" data-envoyer disabled>${icone('drapeau', 'icone-sm')}Envoyer le signalement</button>`
  });
  let motif = null;
  const details = m.$('#sig-details');
  const maj = () => {
    m.$('[data-compteur]').textContent = `${details.value.length} / 400`;
    m.$('[data-envoyer]').disabled = !motif || (motif === 'Autre' && !details.value.trim());
  };
  m.dialog.querySelectorAll('[data-raison]').forEach(b => {
    b.onclick = () => {
      motif = b.dataset.raison;
      m.dialog.querySelectorAll('[data-raison]').forEach(x => x.classList.toggle('active', x === b));
      maj();
    };
  });
  details.oninput = maj;
  m.$('[data-envoyer]').onclick = async () => {
    const raison = details.value.trim() ? `${motif} — ${details.value.trim()}` : motif;
    try {
      await api('/api/signalements', { method: 'POST', body: { id_signale: compte.id, raison } });
      m.fermer();
      toast('Signalement envoyé. Merci de nous aider à garder Hesstagram sûr.');
    } catch (err) { toastErreur(err); }
  };
}

// ── Feuille « J'aime / Commentaires » (maquette « Jacob Post ») ──
async function ouvrirInteractions(p, onglet, onMaj) {
  const m = ouvrirModal({
    titre: `Publication de ${p.auteur}`,
    largeur: 520,
    corps: `
      <div class="segmented orange" style="width:100%">
        <button data-onglet="likes" style="flex:1;justify-content:center">${icone('coeur', 'icone-sm')}J’aime</button>
        <button data-onglet="commentaires" style="flex:1;justify-content:center">${icone('commentaire', 'icone-sm')}Commentaires</button>
      </div>
      <div data-titre style="font-weight:500"></div>
      <div data-liste style="min-height:120px"></div>`,
    pied: `
      <form class="barre-envoi" data-form style="width:100%">
        <input class="input" data-champ placeholder="Écrire un commentaire…" maxlength="500" autocomplete="off">
        <button class="btn-envoi" aria-label="Publier le commentaire" disabled>${icone('envoyer')}</button>
      </form>`
  });
  const liste = m.$('[data-liste]');
  const champ = m.$('[data-champ]');
  const envoyer = m.$('[data-form] button');

  async function afficher(nom) {
    onglet = nom;
    m.dialog.querySelectorAll('[data-onglet]').forEach(b => b.classList.toggle('active', b.dataset.onglet === nom));
    liste.innerHTML = '<div class="skeleton" style="height:46px;margin:8px 0"></div>'.repeat(3);
    try {
      if (nom === 'likes') {
        const likes = await api(`/api/publications/${p.id}/likes`);
        m.$('[data-titre]').textContent = pluriel(likes.length, 'J’aime', 'J’aime');
        liste.innerHTML = likes.length ? '' : `<div class="vide"><div class="illu">${icone('coeur')}</div><p>Personne n’a encore aimé cette publication.</p></div>`;
        for (const c of likes) liste.appendChild(ligneCompte(c, { sous: statutInfo(c.role).label }));
      } else {
        const [pub] = await api(`/api/publications?id=${p.id}`);
        const coms = pub?.commentaires || [];
        m.$('[data-titre]').textContent = pluriel(coms.length, 'commentaire');
        liste.innerHTML = coms.length ? '' : `<div class="vide"><div class="illu">${icone('commentaire')}</div><h3>Aucun commentaire</h3><p>Lancez la conversation.</p></div>`;
        for (const c of coms) {
          const el = document.createElement('div');
          el.className = 'ligne-compte';
          el.style.alignItems = 'flex-start';
          el.innerHTML = `
            <a href="/profil.html?id=${c.auteur_id}">${avatar(c.auteur, 38)}</a>
            <div class="infos">
              <div class="nom"><a href="/profil.html?id=${c.auteur_id}" style="color:inherit"></a>${badgeStatut(c.auteur_role, { discret: true })}</div>
              <div style="font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere"></div>
            </div>`;
          el.querySelector('.nom a').textContent = c.auteur;
          el.querySelector('.infos > div:last-child').innerHTML = texteAvecHashtags(c.commentaire);
          liste.appendChild(el);
        }
        champ.focus();
      }
    } catch (err) { liste.innerHTML = ''; toastErreur(err); }
  }

  m.dialog.querySelectorAll('[data-onglet]').forEach(b => { b.onclick = () => afficher(b.dataset.onglet); });
  champ.oninput = () => { envoyer.disabled = !champ.value.trim(); };
  m.$('[data-form]').onsubmit = async e => {
    e.preventDefault();
    const commentaire = champ.value.trim();
    if (!commentaire) return;
    envoyer.disabled = true;
    try {
      await api(`/api/publications/${p.id}/commentaires`, { method: 'POST', body: { commentaire } });
      champ.value = '';
      await afficher('commentaires');
      onMaj?.();
    } catch (err) { toastErreur(err); envoyer.disabled = false; }
  };
  afficher(onglet);
}

// ── Carte de publication ──
function cartePublication(p, { onSupprime = null } = {}) {
  const art = document.createElement('article');
  art.className = 'post';
  art.id = `pub-${p.id}`;

  const rendre = () => {
    const long = p.description.length > 280 || p.description.split('\n').length > 5;
    art.innerHTML = `
      <header class="post-tete">
        <a href="/profil.html?id=${p.auteur_id}">${avatar(p.auteur, 48)}</a>
        <div class="auteur">
          <a class="nom" href="/profil.html?id=${p.auteur_id}"><span class="ellipsis"></span>${estStaff(p.auteur_role) ? icone('verifie', 'verifie') : ''}</a>
          <div class="meta">
            <time datetime="${p.date}" title="${horodatage(p.date)}">${ilYa(p.date)}</time>
            <span class="sep"></span>${icone('globe', 'icone-sm')}
            ${estStaff(p.auteur_role) ? `<span class="sep"></span><span>${statutInfo(p.auteur_role).label}</span>` : ''}
          </div>
        </div>
        ${p.auteur_id !== MOI.id && !p.auteur_suivi ? '<span data-suivre></span>' : ''}
        <button class="btn btn-icon btn-sm" data-menu aria-label="Options de la publication">${icone('plus_options')}</button>
      </header>
      ${p.description ? `<div class="post-texte ${long ? 'replie' : ''}">${texteAvecHashtags(p.description)}</div>
        ${long ? '<button class="voir-plus" data-plus>… voir plus</button>' : ''}` : ''}
      ${p.image ? `<div class="post-media"><img src="${p.image}" alt="Photo publiée par ${escapeHtml(p.auteur)}" loading="lazy"></div>` : ''}
      <div class="post-actions">
        <button class="action ${p.mon_like ? 'liked' : ''}" data-like aria-pressed="${!!p.mon_like}">
          ${icone('coeur')}<span>${p.nb_like}</span><span class="libelle">J’aime</span>
        </button>
        <button class="action" data-voir-commentaires>
          ${icone('commentaire')}<span>${p.nb_commentaires}</span><span class="libelle">${p.nb_commentaires > 1 ? 'Commentaires' : 'Commentaire'}</span>
        </button>
        <div class="droite">
          <button class="action ${p.mon_dislike ? 'disliked' : ''}" data-dislike title="Je n’aime pas" aria-pressed="${!!p.mon_dislike}">
            ${icone('pouce_bas')}${p.nb_dislike ? `<span>${p.nb_dislike}</span>` : ''}
          </button>
          <button class="action" data-partager title="Copier le lien" aria-label="Partager">${icone('partager')}</button>
        </div>
      </div>
      ${p.commentaires.length ? `
        <div class="apercu-coms">
          ${p.commentaires.slice(-2).map(c => `<div class="ellipsis"><b>${escapeHtml(c.auteur)}</b> ${escapeHtml(c.commentaire)}</div>`).join('')}
          ${p.commentaires.length > 2 ? `<button class="tout-voir" data-voir-commentaires>Voir les ${p.commentaires.length} commentaires</button>` : ''}
        </div>` : ''}`;
    art.querySelector('.nom .ellipsis').textContent = p.auteur;
    brancher();
  };

  const recharger = async () => {
    const [frais] = await api(`/api/publications?id=${p.id}`);
    if (frais) { Object.assign(p, frais); rendre(); }
  };

  function brancher() {
    const $ = s => art.querySelector(s);
    const zoneSuivre = $('[data-suivre]');
    if (zoneSuivre) zoneSuivre.replaceWith(boutonSuivre({ id: p.auteur_id, je_suis_abonne: false }, {
      taille: 'btn-xs', onChange: abonne => { p.auteur_suivi = abonne; }
    }));
    $('[data-plus]')?.addEventListener('click', e => {
      $('.post-texte').classList.remove('replie');
      e.currentTarget.remove();
    });
    $('.post-media img')?.addEventListener('click', () => ouvrirVisionneuse(p.image));

    // J'aime / Je n'aime pas : mise à jour immédiate, puis confirmation serveur
    $('[data-like]').onclick = async () => {
      const avant = { ...p };
      p.nb_like += p.mon_like ? -1 : 1;
      if (!p.mon_like && p.mon_dislike) { p.nb_dislike--; p.mon_dislike = 0; }
      p.mon_like = p.mon_like ? 0 : 1;
      rendre();
      if (p.mon_like) art.querySelector('[data-like]').classList.add('pop');
      try { await api(`/api/publications/${p.id}/like`, { method: 'POST' }); }
      catch (err) { Object.assign(p, avant); rendre(); toastErreur(err); }
    };
    $('[data-dislike]').onclick = async () => {
      const avant = { ...p };
      p.nb_dislike += p.mon_dislike ? -1 : 1;
      if (!p.mon_dislike && p.mon_like) { p.nb_like--; p.mon_like = 0; }
      p.mon_dislike = p.mon_dislike ? 0 : 1;
      rendre();
      try { await api(`/api/publications/${p.id}/dislike`, { method: 'POST' }); }
      catch (err) { Object.assign(p, avant); rendre(); toastErreur(err); }
    };
    art.querySelectorAll('[data-voir-commentaires]').forEach(b => {
      b.onclick = () => ouvrirInteractions(p, 'commentaires', recharger);
    });
    $('.post-actions [data-like] span').onclick = e => {   // clic sur le nombre : qui a aimé
      e.stopPropagation();
      if (p.nb_like) ouvrirInteractions(p, 'likes', recharger);
    };
    $('[data-partager]').onclick = () => partagerPublication(p);
    $('[data-menu]').onclick = e => ouvrirMenu(e.currentTarget, menuPublication(p, { onSupprime: () => { art.remove(); onSupprime?.(p); } }));
  }

  rendre();
  return art;
}

function partagerPublication(p) {
  const url = `${location.origin}/profil.html?id=${p.auteur_id}#pub-${p.id}`;
  navigator.clipboard?.writeText(url)
    .then(() => toast('Lien copié dans le presse-papiers'))
    .catch(() => toast(url));
}

function menuPublication(p, { onSupprime }) {
  const items = [
    { libelle: `Voir le profil de ${p.auteur}`, icone: 'profil', action: () => { location.href = `/profil.html?id=${p.auteur_id}`; } },
    { libelle: 'Copier le lien', icone: 'lien', action: () => partagerPublication(p) }
  ];
  if (p.auteur_id !== MOI.id) {
    items.push({ libelle: `Écrire à ${p.auteur}`, icone: 'messages', action: () => { location.href = `/messages.html?avec=${p.auteur_id}`; } });
    items.push('-', { libelle: `Signaler ${p.auteur}`, icone: 'drapeau', danger: true, action: () => signalerCompte({ id: p.auteur_id, nom: p.auteur }) });
  }
  if (p.auteur_id === MOI.id) {
    items.push('-', {
      libelle: 'Supprimer la publication', icone: 'poubelle', danger: true,
      action: async () => {
        const ok = await confirmer({ titre: 'Supprimer la publication ?', message: 'Elle disparaîtra avec ses j’aime et ses commentaires. Cette action est définitive.', bouton: 'Supprimer', danger: true });
        if (!ok) return;
        try {
          await api(`/api/publications/${p.id}`, { method: 'DELETE' });
          toast('Publication supprimée');
          onSupprime();
        } catch (err) { toastErreur(err); }
      }
    });
  } else if (estStaff(MOI.role)) {
    items.push({ libelle: 'Retirer (modération)', icone: 'bouclier', danger: true, action: () => retirerPublication(p, onSupprime) });
  }
  return items;
}

// Modération : retrait d'une publication avec motif (tracé dans le journal, notifié à l'auteur)
function retirerPublication(p, onSupprime) {
  const m = ouvrirModal({
    titre: 'Retirer la publication',
    largeur: 460,
    corps: `
      <div class="alerte alerte-info">${icone('bouclier')}<span>Action de modération : l’auteur est notifié du retrait et du motif, qui est inscrit dans le journal.</span></div>
      <div class="field">
        <label for="motif-retrait">Motif du retrait</label>
        <input class="input" id="motif-retrait" maxlength="200" placeholder="Ex. : contenu haineux">
      </div>`,
    pied: `<button class="btn" data-fermer>Annuler</button><button class="btn btn-danger-solid" data-ok>Retirer</button>`
  });
  m.$('#motif-retrait').focus();
  m.$('[data-ok]').onclick = async () => {
    try {
      await api(`/api/publications/${p.id}`, { method: 'DELETE', body: { raison: m.$('#motif-retrait').value.trim() } });
      m.fermer();
      toast('Publication retirée');
      onSupprime();
    } catch (err) { toastErreur(err); }
  };
}

function ouvrirVisionneuse(src) {
  const v = document.createElement('div');
  v.className = 'visionneuse';
  v.innerHTML = `<img src="${src}" alt="">`;
  const fermer = () => { v.remove(); removeEventListener('keydown', echap); };
  const echap = e => { if (e.key === 'Escape') fermer(); };
  v.onclick = fermer;
  addEventListener('keydown', echap);
  document.body.appendChild(v);
}

// ── Chargement d'un fil avec squelettes et état vide ──
function squelettePosts(n = 2) {
  return Array.from({ length: n }, () => `
    <div class="post">
      <div style="display:flex;gap:12px;align-items:center">
        <div class="skeleton" style="width:48px;height:48px;border-radius:50%"></div>
        <div style="flex:1"><div class="skeleton" style="height:14px;width:40%"></div><div class="skeleton" style="height:12px;width:24%;margin-top:8px"></div></div>
      </div>
      <div class="skeleton" style="height:14px;margin-top:18px"></div>
      <div class="skeleton" style="height:14px;width:70%;margin-top:8px"></div>
      <div class="skeleton" style="height:220px;margin-top:16px;border-radius:22px"></div>
    </div>`).join('');
}

async function chargerFil(conteneur, url, { vide }) {
  conteneur.innerHTML = squelettePosts();
  try {
    const pubs = await api(url);
    conteneur.innerHTML = '';
    if (!pubs.length) {
      conteneur.innerHTML = `<div class="card vide">${vide}</div>`;
      return pubs;
    }
    for (const p of pubs) conteneur.appendChild(cartePublication(p, {
      onSupprime: () => { if (!conteneur.children.length) conteneur.innerHTML = `<div class="card vide">${vide}</div>`; }
    }));
    // Arrivée depuis un lien partagé (#pub-12) : on amène la publication à l'écran
    if (location.hash.startsWith('#pub-')) document.querySelector(location.hash)?.scrollIntoView({ block: 'center' });
    return pubs;
  } catch (err) {
    conteneur.innerHTML = `<div class="card vide"><div class="illu">${icone('alerte')}</div><h3>Chargement impossible</h3><p></p></div>`;
    conteneur.querySelector('p').textContent = err.message;
    return [];
  }
}
