<div align="center">

<!-- Logo et nom du projet — remplacez par le vrai logo une fois créé -->
<img src="docs/static/img/logo.svg" alt="Hesstagram" width="120" height="120" />

# Hesstagram

**Plateforme de partage de contenus multimédia**

Projet pédagogique — SAÉ 5.02 · BUT R&T 3ᵉ année · IUT Colmar — Université de Haute-Alsace

---

[![CI](https://github.com/<org>/hesstagram/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/<org>/hesstagram/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-≥60%25-brightgreen)](https://github.com/<org>/hesstagram/actions)
[![Security](https://img.shields.io/badge/security-OWASP%20Top%2010%3A2025-red)](./SECURITY.md)
[![RGPD](https://img.shields.io/badge/conformit%C3%A9-RGPD-blue)](./docs/docs/donnees-personnelles.md)
[![Node](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-3-003b57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)](./Dockerfile)
[![License](https://img.shields.io/badge/licence-MIT-lightgrey)](./LICENSE)

[Documentation](https://<org>.github.io/hesstagram) · [Démarrage rapide](#-démarrage-rapide) · [Contribuer](#-contribuer) · [Signaler un bug](https://github.com/<org>/hesstagram/issues/new?template=bug.yml)

</div>

---

## Vue d'ensemble

Hesstagram est une application web de partage de contenus multimédia développée en binôme avec la méthode **SCRUM** dans le cadre de la SAÉ 5.02 « Piloter un projet informatique » du BUT Réseaux & Télécommunications.

Le projet réplique les mécanismes fondamentaux d'une plateforme sociale moderne : publication de photos et vidéos avec filtres et retouche, gestion de la visibilité, interactions sociales, hashtags, messagerie instantanée et modération — le tout construit en **Node.js / TypeScript** avec **SQLite** comme base embarquée et livré sous forme d'**image Docker**.

> **Note de contexte.** Ce projet est un exercice pédagogique. L'application n'est pas destinée à une exposition publique sur Internet. Les données de démonstration sont entièrement fictives. Voir [Sécurité](#-sécurité) et [Conformité RGPD](#-conformité-rgpd) pour les détails.

---

## Table des matières

- [Fonctionnalités](#-fonctionnalités)
- [Pile technique](#-pile-technique)
- [Architecture](#-architecture)
- [Démarrage rapide](#-démarrage-rapide)
- [Installation détaillée](#-installation-détaillée)
- [Configuration](#-configuration)
- [Scripts disponibles](#-scripts-disponibles)
- [Tests](#-tests)
- [Documentation](#-documentation)
- [Sécurité](#-sécurité)
- [Conformité RGPD](#-conformité-rgpd)
- [Contribuer](#-contribuer)
- [Équipe](#-équipe)
- [Licence](#-licence)

---

## ✨ Fonctionnalités

### Socle (Must Have)

| Domaine | Fonctionnalités |
|---|---|
| **Identité** | Inscription, connexion sécurisée, profil public / privé, avatar, suppression de compte |
| **Contenu** | Publication de photos (JPEG, PNG, WebP) et vidéos (MP4, WebM) jusqu'à 10 médias par post |
| **Visibilité** | Contrôle public / amis, vérifié côté serveur sur chaque requête et chaque média servi |
| **Retouche** | Recadrage (libre, 1:1, 4:5, 16:9), rotation, luminosité, contraste, saturation |
| **Filtres** | 6 filtres appliqués côté serveur : N&B, sépia, contraste, saturation, vintage, froid |
| **Interactions** | Commentaires imbriqués (1 niveau), likes / dislikes sur publications et commentaires, repartage |
| **Découverte** | Hashtags normalisés, tendances calculées sur 24 h, liste noire administrable |
| **Social** | Amitié symétrique par demande/acceptation, blocage unilatéral étanche |
| **Messagerie** | Conversations directes et de groupe (3–50 membres) en temps réel via WebSocket |
| **Notifications** | Centre de notifications temps réel avec regroupement et préférences par catégorie |
| **Modération** | Signalement de contenus, file de traitement, journal d'audit immuable, droits admin |
| **Docker** | Image multi-étapes, non-root, volumes persistants, healthcheck, `docker compose up` |

### Bonus implémentés

- **Stories éphémères** — expiration automatique à 24 h
- **Recherche** — utilisateurs et hashtags via SQLite FTS5
- **Page Explore** — grille de découverte des publications publiques
- **Mode sombre** — via variables CSS, préférence persistée
- **Mentions @utilisateur** — avec notification associée
- **Favoris / collections** — enregistrement de publications
- **Indicateur de frappe** — dans la messagerie temps réel
- **Double authentification TOTP** — sans SMS, conformément aux recommandations ANSSI
- **Export RGPD** — données personnelles en JSON (droit à la portabilité, art. 20 RGPD)

---

## 🛠 Pile technique

| Couche | Technologie | Version |
|---|---|---|
| Runtime | Node.js | 22 LTS |
| Langage | TypeScript | 5.x |
| Framework HTTP | Express | 4.x |
| Base de données | SQLite via `better-sqlite3` | 3.x |
| Traitement d'image | sharp | 0.33+ |
| Traitement vidéo | ffprobe (ffmpeg) | — |
| Hachage | Argon2id (`argon2`) | — |
| Validation | Zod | 3.x |
| WebSocket | ws | 8.x |
| Temps réel front | API WebSocket native | — |
| Tests | Node.js Test Runner natif | — |
| Documentation | Docusaurus + TypeDoc | 3.x |
| Conteneurisation | Docker + Compose | 27+ |
| IDE | Visual Studio Code | — |
| Gestion de tâches | npm | 10+ |
| Qualité | ESLint (Google TS Style Guide) + Prettier | — |
| Sécurité CI | gitleaks + Trivy + `npm audit` | — |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Client navigateur (responsive, 360 px → 1920 px)       │
│  WebSocket client  ←────────────────────────────────┐   │
└────────────────────────────┬────────────────────────┼───┘
                             │ HTTPS                  │
┌────────────────────────────▼────────────────────────┼───┐
│  Application Node.js / Express                      │   │
│                                                     │   │
│  Middlewares transverses                            │   │
│  auth · RBAC · rate-limit · helmet · validate       │   │
│  ┌─────────────────────────┐  ┌────────────────────┐│   │
│  │      Routes / API       │  │  Serveur WebSocket ││   │
│  └───────────┬─────────────┘  └─────────┬──────────┘│   │
│  ┌───────────▼─────────────────────────▼────────────┤   │
│  │             Services (logique métier)             │   │
│  │  auth · posts · media · social · chat · moderate  │   │
│  └───────────────────────┬───────────────────────────┘   │
│  ┌────────────────────── ▼ ──────────────────────────┐   │
│  │          Repositories (accès aux données)          │   │
│  │        Requêtes préparées uniquement               │   │
│  └───────────────────────┬───────────────────────────┘   │
└──────────────────────────┼─────────────────────────────┘
           ┌───────────────┴────────────────┐
    ┌──────▼──────┐                 ┌───────▼──────┐
    │ SQLite WAL  │                 │  Médias       │
    │ (volume)    │                 │  (volume)     │
    └─────────────┘                 └──────────────┘
```

L'architecture est **monolithique en couches** : routes → services → repositories → base. Aucune logique métier dans les routes, aucune requête SQL hors des repositories. Ce choix est documenté dans [ADR-001](./docs/docs/decisions/adr-001-architecture.md).

---

## 🚀 Démarrage rapide

### Prérequis

- [Docker](https://docs.docker.com/get-docker/) ≥ 27 et Docker Compose ≥ 2.20
- Ou [Node.js](https://nodejs.org) 22 LTS + npm 10

### Avec Docker (recommandé)

```bash
# 1. Cloner le dépôt
git clone https://github.com/<org>/hesstagram.git
cd hesstagram

# 2. Copier et compléter la configuration
cp .env.example .env

# 3. Lancer l'application
docker compose up

# 4. Ouvrir dans le navigateur
open http://localhost:3000
```

L'application démarre, applique les migrations et charge le jeu de démonstration automatiquement.

Pour reconstruire l'image après une modification du code :

```bash
docker compose up --build
```

Pour arrêter sans perdre les données :

```bash
docker compose down          # conserve les volumes
docker compose down -v       # supprime aussi les volumes (reset complet)
```

### Sans Docker

```bash
git clone https://github.com/<org>/hesstagram.git
cd hesstagram
cp .env.example .env
npm install
npm run migrate
npm run seed        # optionnel — données de démonstration
npm run dev         # serveur avec rechargement automatique
```

---

## ⚙️ Configuration

Toutes les variables sont dans `.env.example`. Copiez ce fichier en `.env` et remplissez les valeurs marquées `REQUIRED`.

| Variable | Requis | Défaut | Description |
|---|---|---|---|
| `PORT` | — | `3000` | Port d'écoute du serveur |
| `NODE_ENV` | — | `development` | Environnement (`development`, `production`, `test`) |
| `SESSION_SECRET` | **REQUIRED** | — | Secret de signature des sessions — minimum 32 caractères aléatoires |
| `DATABASE_PATH` | — | `./data/hesstagram.sqlite` | Chemin du fichier SQLite |
| `STORAGE_PATH` | — | `./storage` | Répertoire des médias (hors racine web) |
| `MAX_UPLOAD_SIZE_MB` | — | `10` | Taille maximale d'une image en Mo |
| `MAX_VIDEO_SIZE_MB` | — | `50` | Taille maximale d'une vidéo en Mo |
| `MAX_VIDEO_DURATION_S` | — | `60` | Durée maximale d'une vidéo en secondes |
| `STORAGE_QUOTA_MB` | — | `500` | Quota de stockage par utilisateur en Mo |
| `BCRYPT_COST` | — | `12` | Coût bcrypt de secours (Argon2id utilisé par défaut) |
| `RATE_LIMIT_WINDOW_MS` | — | `60000` | Fenêtre de rate limiting en ms |
| `LOG_LEVEL` | — | `info` | Niveau de log (`silent`, `info`, `warn`, `error`) |
| `TOTP_ISSUER` | — | `Hesstagram` | Nom affiché dans les applications TOTP |

> **Sécurité.** Le fichier `.env` est ignoré par Git. Ne l'envoyez jamais par e-mail, ne le commitez jamais. Générez `SESSION_SECRET` avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

---

## 📦 Scripts disponibles

```bash
# Développement
npm run dev          # Serveur avec rechargement automatique (tsx watch)
npm run build        # Compilation TypeScript → dist/

# Qualité
npm run lint         # ESLint (Google TypeScript Style Guide)
npm run lint:fix     # ESLint avec correction automatique
npm run format       # Prettier — formatage
npm run format:check # Prettier — vérification (utilisé en CI)
npm run typecheck    # Vérification des types TypeScript sans émission

# Tests
npm test             # Suite complète avec couverture
npm run test:watch   # Mode interactif
npm run test:security # Tests d'autorisation (suite de sécurité)

# Base de données
npm run migrate      # Applique les migrations (idempotent)
npm run seed         # Charge le jeu de données de démonstration

# Documentation
npm run docs:api     # Génère la référence d'API avec TypeDoc
npm run docs:dev     # Serveur Docusaurus en local
npm run docs:build   # Build statique de la documentation

# Production
npm start            # Lance dist/server.js
```

---

## 🧪 Tests

La suite de tests est organisée en trois niveaux.

### Tests unitaires

```bash
npm test
```

Cible : **≥ 60 % de couverture sur la logique métier**. Les modules prioritaires sont la policy de visibilité, l'authentification, la logique de réaction, les hashtags/tendances et la validation des fichiers.

```bash
# Rapport de couverture interactif
npm test -- --coverage
open coverage/index.html
```

### Tests de sécurité

```bash
npm run test:security
```

Suite dédiée aux tests d'autorisation négatifs : accès à des ressources d'autrui, injection SQL, upload de fichiers malveillants, accès WebSocket non autorisé. Chaque test doit renvoyer un refus.

### Recette manuelle

La fiche de recette complète (dérivée des critères d'acceptation du cahier des charges) se trouve dans [`docs/docs/recette.md`](./docs/docs/recette.md). Elle liste les 22 scénarios d'attaque à jouer avant toute livraison.

---

## 📖 Documentation

La documentation est publiée sur **GitHub Pages** et générée avec [Docusaurus](https://docusaurus.io) + [TypeDoc](https://typedoc.org).

| Section | URL |
|---|---|
| Documentation utilisateur | `https://<org>.github.io/hesstagram/guide` |
| Installation et exploitation | `https://<org>.github.io/hesstagram/install` |
| Référence de l'API | `https://<org>.github.io/hesstagram/api` |
| Décisions d'architecture (ADR) | `https://<org>.github.io/hesstagram/decisions` |
| CHANGELOG | [`CHANGELOG.md`](./CHANGELOG.md) |

Pour lancer la documentation en local :

```bash
cd docs
npm install
npm start
# → http://localhost:4000
```

---

## 🔒 Sécurité

Hesstagram est développé selon les principes du **DevSecOps** et de la **sécurité dès la conception** (*Secure by Design*).

### Référentiels appliqués

| Référentiel | Version | Rôle |
|---|---|---|
| [OWASP Top 10](https://owasp.org/Top10/2025/) | 2025 | Couverture des 10 risques critiques |
| [OWASP ASVS](https://github.com/OWASP/ASVS) | 5.0.0 (mai 2025) | Exigences vérifiables — niveau L1 visé |
| [NIST SP 800-63B](https://csrc.nist.gov/pubs/sp/800/63/b/4/final) | Rév. 4 (juillet 2025) | Politique d'authentification et de mots de passe |
| [ANSSI / CNIL](https://cyber.gouv.fr/) | Guide MFA v2, oct. 2021 | Authentification multifacteur et mots de passe |
| RGPD | Règlement UE 2016/679 | Protection des données personnelles |

### Mesures implémentées

```
✅ Mots de passe : Argon2id, 15 caractères min., vérification contre liste de compromis
✅ Sessions serveur, cookie HttpOnly + Secure + SameSite, expiration 24h/7j
✅ RBAC avec refus par défaut, vérification de propriété sur chaque ressource
✅ Policy de visibilité centralisée, appliquée côté serveur et sur les médias
✅ Requêtes préparées à 100 % — aucune concaténation SQL
✅ Validation de schéma (Zod) sur toutes les entrées, y compris WebSocket
✅ Échappement contextuel, CSP restrictive (helmet)
✅ Upload : type réel par magic bytes, ré-encodage, suppression EXIF
✅ Stockage des médias hors racine web, servis par route applicative protégée
✅ Rate limiting différencié par endpoint
✅ Détection de secrets (gitleaks) en CI et en pré-commit
✅ Scan de vulnérabilités des dépendances (npm audit) et de l'image (Trivy)
✅ Conteneur non-root, image multi-étapes minimale
✅ Journal d'audit de modération en écriture seule
```

### Périmètre non couvert

Par honnêteté intellectuelle, ce projet étudiant **ne couvre pas** :
- le chiffrement de bout en bout des messages ;
- la résistance à un DDoS distribué ;
- le chiffrement de la base au repos ;
- un test d'intrusion indépendant.

**Cette application ne doit pas être exposée sur Internet en l'état.**

### Signaler une vulnérabilité

Créez une issue avec le template [Vulnérabilité](https://github.com/<org>/hesstagram/issues/new?template=securite.yml) ou contactez directement **Guillaume Jacquot** et **Luca Fitzentz** (voir [Équipe](#-équipe)) si la faille est active.

---

## 🛡 Conformité RGPD

Hesstagram applique les principes du RGPD **par conception**, conformément à l'article 25.

| Article | Mesure |
|---|---|
| Art. 5 — Minimisation | Seuls e-mail, *handle* et empreinte sont collectés |
| Art. 5 — Limitation de durée | Purge automatique des sessions, notifications et médias orphelins |
| Art. 17 — Effacement | Suppression de compte effective, médias supprimés du disque |
| Art. 20 — Portabilité | Export JSON des données personnelles disponible (bonus) |
| Art. 25 — Privacy by default | Visibilité `friends` et profil privé par défaut |
| Art. 32 — Sécurité | Mesures techniques listées ci-dessus |

Le registre des traitements et la politique de confidentialité sont disponibles dans la [documentation](https://<org>.github.io/hesstagram/donnees-personnelles).

> Les données de démonstration livrées avec l'application sont entièrement fictives. Aucune donnée personnelle réelle n'a été utilisée pendant le développement ou les tests.

---

## 🤝 Contribuer

Ce projet est développé dans un cadre pédagogique par une équipe fixe. Les contributions externes ne sont pas acceptées. La documentation de la méthode de contribution interne se trouve dans [`CONTRIBUTING.md`](./CONTRIBUTING.md).

### Pour les membres de l'équipe

```bash
# Avant de commencer : lire les conventions dans CONTRIBUTING.md
# et la carte Trello [INFO] Conventions Git

# Démarrer une nouvelle tâche :
git checkout develop && git pull
git checkout -b feature/<id-issue>-<description-courte>

# Avant de pousser :
npm run lint && npm run typecheck && npm test

# Ouvrir la PR vers develop :
gh pr create --fill
```

Consultez le [guide GitHub complet](./docs/docs/contribution/github-workflow.md) pour la stratégie de branches, les conventions de commit et le processus de revue.

---

## 👥 Équipe

Promotion BUT RT 3ᵉ année, groupe RT31 — parcours Cyber FA et ROM FA  
IUT Colmar, Université de Haute-Alsace — Automne 2026  
Encadrant : Jonathan Weber ([jonathan.weber@uha.fr](mailto:jonathan.weber@uha.fr))

| Membre | Rôle | Domaine principal |
|---|---|---|
| **Luca Fitzentz** | Product Owner · Co-responsable sécurité | Policy de visibilité, autorisation, rapport |
| **Akaza Kouame** | Scrum Master · Co-responsable BDD | CI/CD, amitié, notifications, ceremonies |
| **Noa Spiegel** | Responsable BDD | Schéma, migrations, repositories, performance |
| **Cameron Florence** | Backend | Architecture, médias, WebSocket, Docker |
| **Joachim Gutter** | Frontend | Design system, fil, profil, écrans d'interaction |
| **Valentin Launay** | Frontend interactif | Éditeur d'image, messagerie, recherche, stories |
| **Guillaume Jacquot** | Responsable sécurité | Auth, upload, tests de sécurité, audit |
| **Lucas Herchuel** | Responsable documentation | Docusaurus, tests unitaires, back-office admin |

---

## 📄 Licence

Distribué sous licence [MIT](./LICENSE).

Ce projet est réalisé à des fins exclusivement pédagogiques dans le cadre du BUT Réseaux & Télécommunications de l'IUT Colmar. Il n'est pas affilié à Instagram, Meta, ni à aucune entité commerciale. Les noms, logos et marques mentionnés restent la propriété de leurs titulaires respectifs.

---

<div align="center">

**Hesstagram** · SAÉ 5.02 · BUT RT 3 · IUT Colmar · Automne 2026

Fait avec Node.js, SQLite, TypeScript et beaucoup de café

</div>
