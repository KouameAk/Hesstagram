-- ═══════════════════════════════════════════════════════════════
--  Tables ajoutées pour les consoles de modération et d'administration.
--  Exécuté après BDD.sqlite (schéma du groupe, inchangé) par
--  src/bdd/donnees-initiales.js.
-- ═══════════════════════════════════════════════════════════════

-- Suspension d'un compte : raison, date de début, date de fin (NULL = illimitée).
-- La colonne `utilisateur.banni` reste synchronisée pour les écrans du groupe.
CREATE TABLE IF NOT EXISTS `suspension` (
    `id_utilisateur` INTEGER PRIMARY KEY,
    `raison` TEXT NOT NULL,
    `date` DATETIME NOT NULL,
    `fin` DATETIME,
    `id_admin` INTEGER,
    FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateur` (`id`)
);

-- Journal des actions (tableau de bord, décisions, journal du site).
-- Volontairement sans clé étrangère : le nom et le rôle sont recopiés, la trace
-- reste lisible même après la suppression du compte.
CREATE TABLE IF NOT EXISTS `journal` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `date` DATETIME NOT NULL,
    `id_utilisateur` INTEGER,
    `nom_utilisateur` TEXT,
    `role_utilisateur` TEXT,
    `categorie` TEXT NOT NULL,
    `action` TEXT NOT NULL,
    `cible_type` TEXT,
    `cible_id` INTEGER,
    `cible_nom` TEXT,
    `details` TEXT,
    `ip` TEXT
);

CREATE INDEX IF NOT EXISTS `journal_utilisateur` ON `journal` (`id_utilisateur`);
CREATE INDEX IF NOT EXISTS `journal_cible` ON `journal` (`cible_type`, `cible_id`);
