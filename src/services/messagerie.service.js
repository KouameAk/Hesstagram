// Garde en mémoire qui est connecté et qui est dans quel groupe, puis envoie les messages aux bonnes personnes. Ne déchiffre jamais rien.
export function creerRegistre() {
  const utilisateursConnectes = new Map();
  const membresGroupes = new Map();

  function connecter(userId, envoyer) {
    utilisateursConnectes.set(userId, envoyer);
  }

  function deconnecter(userId) {
    utilisateursConnectes.delete(userId);
  }

  function rejoindreGroupe(groupId, userId) {
    if (!membresGroupes.has(groupId)) {
      membresGroupes.set(groupId, new Set());
    }
    membresGroupes.get(groupId).add(userId);
  }

  // true si le destinataire était connecté et a reçu le message.
  function envoyerMessagePrive(deId, versId, contenu) {
    const envoyer = utilisateursConnectes.get(versId);
    if (!envoyer) return false;
    envoyer(JSON.stringify({ type: 'message', de: deId, contenu }));
    return true;
  }

  // Nombre de membres qui ont reçu le message (l'expéditeur ne compte pas).
  function envoyerMessageGroupe(deId, groupId, contenu) {
    const membres = membresGroupes.get(groupId);
    if (!membres) return 0;

    let nombreLivres = 0;
    for (const membreId of membres) {
      if (membreId === deId) continue;
      const envoyer = utilisateursConnectes.get(membreId);
      if (envoyer) {
        envoyer(JSON.stringify({ type: 'message-groupe', de: deId, groupId, contenu }));
        nombreLivres++;
      }
    }
    return nombreLivres;
  }

  return { connecter, deconnecter, rejoindreGroupe, envoyerMessagePrive, envoyerMessageGroupe };
}
