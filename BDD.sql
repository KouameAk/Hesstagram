CREATE TABLE `utilisateur` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `nom` varchar(255),
  `mdp` varchar(255),
  `date` datetime,
  `role` varchar(255)
);

CREATE TABLE `ami` (
  `id_utilisateur1` int,
  `id_utilisateur2` int,
  PRIMARY KEY (`id_utilisateur1`, `id_utilisateur2`)
);

CREATE TABLE `publication` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `id_utilisateur` int,
  `date` datetime,
  `description` text,
  `nom_fichier` varchar(255),
  `type_fichier` varchar(255),
  `vue` int,
  `partage` int,
  `republie` boolean
);

CREATE TABLE `mod` (
  `id` int PRIMARY KEY,
  `droit_supprimer_publication` boolean,
  `droit_supprimer_commentaire` boolean,
  `droit_gerer_signalement` boolean
);

CREATE TABLE `admin` (
  `id` int PRIMARY KEY,
  `droit_supprimer_publication` boolean,
  `droit_supprimer_commentaire` boolean,
  `droit_gerer_signalement` boolean,
  `droit_bannir_utilisateur` boolean,
  `droit_modifier_utilisateur` boolean,
  `droit_gerer_hashtag` boolean
);

CREATE TABLE `message` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `id_utilisateur` int,
  `id_util` int,
  `message` text,
  `vue` boolean
);

CREATE TABLE `notification` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `nombre` int,
  `id_utilisateur` int,
  `message` text
);

CREATE TABLE `hashtag` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `nom` varchar(255),
  `nombre_utilisation` int,
  `id_pub` int
);

CREATE TABLE `signalement` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `id_util1` int,
  `id_util2` int,
  `raison` text,
  `date` datetime
);

CREATE TABLE `like` (
  `id_pub` int,
  `id_utilisateur` int,
  PRIMARY KEY (`id_pub`, `id_utilisateur`)
);

CREATE TABLE `dislike` (
  `id_pub` int,
  `id_util` int,
  PRIMARY KEY (`id_pub`, `id_util`)
);

CREATE TABLE `commentaire` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `id_pub` int,
  `id_utilisateur` int,
  `commentaire` text
);

ALTER TABLE `ami` ADD FOREIGN KEY (`id_utilisateur1`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `ami` ADD FOREIGN KEY (`id_utilisateur2`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `publication` ADD FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `mod` ADD FOREIGN KEY (`id`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `admin` ADD FOREIGN KEY (`id`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `message` ADD FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `message` ADD FOREIGN KEY (`id_util`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `notification` ADD FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `hashtag` ADD FOREIGN KEY (`id_pub`) REFERENCES `publication` (`id`);

ALTER TABLE `signalement` ADD FOREIGN KEY (`id_util1`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `signalement` ADD FOREIGN KEY (`id_util2`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `like` ADD FOREIGN KEY (`id_pub`) REFERENCES `publication` (`id`);

ALTER TABLE `like` ADD FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `dislike` ADD FOREIGN KEY (`id_pub`) REFERENCES `publication` (`id`);

ALTER TABLE `dislike` ADD FOREIGN KEY (`id_util`) REFERENCES `utilisateur` (`id`);

ALTER TABLE `commentaire` ADD FOREIGN KEY (`id_pub`) REFERENCES `publication` (`id`);

ALTER TABLE `commentaire` ADD FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateur` (`id`);
