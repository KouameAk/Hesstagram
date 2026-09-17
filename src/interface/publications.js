// publications.js — cartes de publication du fil : média, j'aime / je n'aime pas,
// signalement, retrait. Dépend de app.js.

// ── Signaler une publication : motif rapide + précisions ──
function signalerPublication(p) {
  const RAISONS = ['Spam', 'Harcèlement', 'Discours haineux', 'Contenu inapproprié', 'Usurpation d’identité', 'Autre'];
  const m = ouvrirModal({
    titre: 'Signaler la publication',
    largeur: 480,
    corps: `
      <p>Le signalement vise la publication de <b data-auteur></b>. Il reste anonyme pour ce compte ; l’équipe de modération l’examinera.</p>
      <div class="field">
        <span class="label">Motif</span>
        <div class="raisons-rapides">${RAISONS.map(r => `<button type="button" data-raison="${r}">${r}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label for="sig-details">Précisions <span class="compteur" data-compteur>0 / 300</span></label>
        <textarea class="input" id="sig-details" rows="3" maxlength="300" placeholder="Qu’est-ce qui pose problème ?"></textarea>
      </div>`,
    pied: `<button class="btn" data-fermer>Annuler</button><button class="btn btn-primary" data-envoyer disabled>${icone('drapeau', 'icone-sm')}Envoyer le signalement</button>`
  });
  m.$('[data-auteur]').textContent = p.auteur;
  let motif = null;
  const details = m.$('#sig-details');
  const maj = () => {
    m.$('[data-compteur]').textContent = `${details.value.length} / 300`;
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
    m.$('[data-envoyer]').disabled = true;
    try {
      await api('/api/signalements', { method: 'POST', body: { id_publication: p.id, raison } });
      m.fermer();
      toast('Signalement envoyé. Merci de nous aider à garder Hesstagram sûr.');
    } catch (err) { toastErreur(err); maj(); }
  };
}

// ── Retrait par la modération : motif inscrit au journal ──
function retirerPublicationModeration(p, onSupprime) {
  const m = ouvrirModal({
    titre: 'Retirer la publication',
    largeur: 460,
    corps: `
      <div class="alerte alerte-info">${icone('bouclier')}<span>Action de modération : le retrait et son motif sont inscrits dans le journal.</span></div>
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

function menuPublication(p, { onSupprime }) {
  const items = [];
  if (p.auteur_id === MOI.id) {
    items.push({
      libelle: 'Retirer ma publication', icone: 'poubelle', danger: true,
      action: async () => {
        const ok = await confirmer({
          titre: 'Retirer la publication ?',
          message: 'Elle disparaîtra du fil avec ses j’aime et ses je n’aime pas. Cette action est définitive.',
          bouton: 'Retirer', danger: true
        });
        if (!ok) return;
        try {
          await api(`/api/publications/${p.id}`, { method: 'DELETE' });
          toast('Publication retirée');
          onSupprime();
        } catch (err) { toastErreur(err); }
      }
    });
    return items;
  }
  items.push({ libelle: `Écrire à ${p.auteur}`, icone: 'messages', action: () => { location.href = `/messagerie.html?avec=${p.auteur_id}`; } });
  items.push('-', { libelle: 'Signaler la publication', icone: 'drapeau', danger: true, action: () => signalerPublication(p) });
  if (estStaff(MOI.role)) {
    items.push({ libelle: 'Retirer (modération)', icone: 'bouclier', danger: true, action: () => retirerPublicationModeration(p, onSupprime) });
  }
  return items;
}

// Photo (<img>) ou vidéo MP4 convertie par le serveur (<video>)
function mediaHtml(p) {
  if (!p.media) return '';
  const estVideo = String(p.type_fichier || '').startsWith('video/');
  return `<div class="post-media">${estVideo
    ? `<video src="${p.media}" controls playsinline preload="metadata"></video>`
    : `<img src="${p.media}" alt="Photo publiée par ${escapeHtml(p.auteur)}" loading="lazy">`}</div>`;
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

// ── Carte de publication ──
function cartePublication(p, { onSupprime = null } = {}) {
  const art = document.createElement('article');
  art.className = 'post';
  art.id = `pub-${p.id}`;
  let enCours = false;

  const rendre = () => {
    art.innerHTML = `
      <header class="post-tete">
        ${avatar(p.auteur, 48)}
        <div class="auteur">
          <span class="nom"><span class="ellipsis"></span>${estStaff(p.auteur_role) ? icone('verifie', 'verifie') : ''}</span>
          <div class="meta">
            <time datetime="${p.date}" title="${horodatage(p.date)}">${ilYa(p.date)}</time>
            <span class="sep"></span>${icone(String(p.type_fichier).startsWith('video/') ? 'camera' : 'image', 'icone-sm')}
            ${estStaff(p.auteur_role) ? `<span class="sep"></span><span>${statutInfo(p.auteur_role).label}</span>` : ''}
          </div>
        </div>
        <button class="btn btn-icon btn-sm" data-menu aria-label="Options de la publication">${icone('plus_options')}</button>
      </header>
      ${p.description ? '<div class="post-texte"></div>' : ''}
      ${mediaHtml(p)}
      <div class="post-actions">
        <button class="action ${p.mon_like ? 'liked' : ''}" data-reaction="like" aria-pressed="${!!p.mon_like}">
          ${icone('coeur')}<span>${p.nb_like}</span><span class="libelle">J’aime</span>
        </button>
        <button class="action ${p.mon_dislike ? 'disliked' : ''}" data-reaction="dislike" aria-pressed="${!!p.mon_dislike}">
          ${icone('pouce_bas')}<span>${p.nb_dislike}</span><span class="libelle">Je n’aime pas</span>
        </button>
      </div>`;
    art.querySelector('.nom .ellipsis').textContent = p.auteur;
    const texte = art.querySelector('.post-texte');
    if (texte) texte.textContent = p.description;
    brancher();
  };

  function brancher() {
    art.querySelector('.post-media img')?.addEventListener('click', () => ouvrirVisionneuse(p.media));
    art.querySelector('[data-menu]').onclick = e => ouvrirMenu(e.currentTarget, menuPublication(p, {
      onSupprime: () => { art.remove(); onSupprime?.(p); }
    }));

    // Routes du groupe : POST pour ajouter, DELETE pour retirer. Côté serveur,
    // aimer retire automatiquement le « je n'aime pas » (et l'inverse).
    art.querySelectorAll('[data-reaction]').forEach(b => {
      b.onclick = async () => {
        if (enCours) return;
        enCours = true;
        const reaction = b.dataset.reaction;
        const actif = reaction === 'like' ? p.mon_like : p.mon_dislike;
        try {
          const r = await api(`/api/publications/${p.id}/${reaction}`, { method: actif ? 'DELETE' : 'POST' });
          Object.assign(p, { nb_like: r.likes, nb_dislike: r.dislikes, mon_like: r.liked ? 1 : 0, mon_dislike: r.disliked ? 1 : 0 });
          rendre();
          if (!actif && reaction === 'like') art.querySelector('[data-reaction="like"]').classList.add('pop');
        } catch (err) { toastErreur(err); }
        enCours = false;
      };
    });
  }

  rendre();
  return art;
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
      <div class="skeleton" style="height:260px;margin-top:16px;border-radius:22px"></div>
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
    return pubs;
  } catch (err) {
    conteneur.innerHTML = `<div class="card vide"><div class="illu">${icone('alerte')}</div><h3>Chargement impossible</h3><p></p></div>`;
    conteneur.querySelector('p').textContent = err.message;
    return [];
  }
}
