import jwt from 'jsonwebtoken';

// Vérifie que l'utilisateur a bien envoyé un token pour se connecter.
export function verifierToken(req, res, next) {
  const entete = req.headers.authorization;

  if (!entete) {
    return res.status(401).json({ error: 'Connexion requise.' });
  }

  // L'en-tête ressemble à "Bearer eyJhbGciOi...", on ne garde que le token.
  const token = entete.split(' ')[1];
  const utilisateur = jwt.decode(token);

  if (!utilisateur) {
    return res.status(401).json({ error: 'Token invalide.' });
  }

  req.user = utilisateur;
  next();
}

// À utiliser après verifierToken : bloque si ce n'est pas un admin.
export function estAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Droits insuffisants.' });
  }
  next();
}

// À utiliser après verifierToken : bloque si ce n'est ni un admin ni un modo.
export function estAdminOuModo(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'modo') {
    return res.status(403).json({ error: 'Droits insuffisants.' });
  }
  next();
}
