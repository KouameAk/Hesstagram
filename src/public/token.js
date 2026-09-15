// Petite gestion du token de connexion, partagée par les pages admin.
// Le token s'obtient via POST /api/auth/login, à coller dans le champ.
function obtenirToken() {
  return localStorage.getItem('token') || '';
}

function enTeteAvecToken() {
  return { Authorization: `Bearer ${obtenirToken()}` };
}

function initialiserChampToken() {
  const champ = document.getElementById('champ-token');
  champ.value = obtenirToken();
  champ.addEventListener('change', () => {
    localStorage.setItem('token', champ.value);
    location.reload();
  });
}

// Affiche le contenu de la page (donné par son id) si connecté, sinon
// affiche le message "non connecté" à la place. Renvoie true si connecté.
function bloquerSiPasConnecte(idContenu) {
  const connecte = Boolean(obtenirToken());
  document.getElementById(idContenu).hidden = !connecte;
  document.getElementById('message-non-connecte').hidden = connecte;
  return connecte;
}

// Lit id/nom/rôle dans le token (pas besoin d'appeler le serveur pour ça,
// c'est déjà dedans). Renvoie null si pas de token.
function utilisateurConnecte() {
  const token = obtenirToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}
