# Second Brain - Veille IA Automatisée

Système de veille automatisé qui transforme Discord en interface de capture, utilise NotebookLM comme moteur d'analyse IA, et synchronise tout dans Obsidian via Git.

## ✨ Fonctionnalités

### 🔗 Capture Automatique
- **Poster une URL dans Discord** → Traitement automatique en arrière-plan
- Support multi-sources : articles web, YouTube, Twitter/X, Reddit, LinkedIn
- Réactions Discord pour suivre le statut (⏳ en cours, ✅ terminé, ❌ erreur)
- Fallback intelligent pour les sites protégés (Twitter, LinkedIn)

### 🤖 Analyse IA via NotebookLM
- **Résumés détaillés** générés automatiquement en français
- **Extraction de mots-clés** et concepts principaux
- **Notebooks mensuels** auto-créés ("Veille Tech - Janvier 2026")
- Analyse approfondie avec contexte et implications

### 📝 Fiches Markdown Structurées
- Format standardisé avec frontmatter YAML
- Métadonnées : titre, URL, date, tags, source NotebookLM
- Organisation par mois : `fiches/2026-01/2026-01-25-titre.md`
- Push automatique sur GitHub après chaque traitement

### 📊 Digests Hebdomadaires
- Génération automatique chaque dimanche
- Synthèse de toutes les sources de la semaine
- Sauvegardé dans `digests/YYYY-WXX.md`
- Commit automatique sur Git

### 💬 Commandes Discord

#### `/last`
Affiche le résumé de la dernière URL traitée avec le contenu complet.

#### `/stats`
Statistiques de la veille : nombre total de fiches, répartition par mois.

#### `/insights [focus]`
Génère une analyse philosophique de toutes les sources du mois en cours.
- Identifie les thèmes émergents et connexions non-évidentes
- Explore les tensions et paradoxes
- Sauvegarde automatique dans `insights/YYYY-WXX.md`
- Option `focus` : angle d'analyse spécifique (ex: "IA et éthique")

**Exemple :**
```
/insights focus:tendances business
```

## 🔧 Configuration et Maintenance

### Changer de compte NotebookLM

Pour connecter le système à un nouveau compte NotebookLM :

```bash
# Méthode automatique (recommandée)
./scripts/switch-notebooklm-account.sh

# Ou manuellement
gcloud compute ssh veille-bot --zone=us-central1-a
notebooklm-mcp-auth  # Connectez-vous avec le nouveau compte
sudo systemctl restart notebooklm-mcp
sudo systemctl restart veille-bot
```

📖 **Guide complet** : [docs/CHANGE-NOTEBOOKLM-ACCOUNT.md](docs/CHANGE-NOTEBOOKLM-ACCOUNT.md)

### Tester la connexion NotebookLM

```bash
# En local
node scripts/test-notebooklm-connection.js

# Sur le serveur
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="cd second-brain && node scripts/test-notebooklm-connection.js"
```

#### `/podcast [format] [duree] [focus]`
Génère un podcast audio à partir des sources de veille via NotebookLM.

**Options :**
- `format` : 
  - 🎙️ Deep Dive (analyse approfondie)
  - ⚡ Brief (résumé rapide)
  - 🔍 Critique (analyse critique)
  - 💬 Débat (deux points de vue)
- `duree` : Court (~5 min), Normal (~10 min), Long (~15 min)
- `focus` : Sujet spécifique (ex: "outils no-code")

**Exemple :**
```
/podcast format:deep_dive duree:long focus:tendances IA
```

Le bot génère le podcast, attend la fin de la génération (~3-5 min), et envoie le fichier audio directement dans Discord.

## 🏗️ Architecture

```
┌─────────────┐
│   Discord   │  Poster URL
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Bot Discord (Google Cloud - veille-bot)                │
│  • Détecte URLs dans messages                           │
│  • Gère commandes slash (/last, /stats, /insights...)  │
│  • Réactions de statut (⏳ ✅ ❌)                        │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  NotebookLM MCP Server (HTTP)                           │
│  • Ajoute sources au notebook mensuel                   │
│  • Génère résumés détaillés en français                 │
│  • Extrait mots-clés et concepts                        │
│  • Crée podcasts audio                                  │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Markdown Generator                                      │
│  • Crée fiche structurée avec frontmatter               │
│  • Organise par mois (fiches/2026-01/...)              │
│  • Génère digests hebdomadaires                         │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Git Push (GitHub)                                       │
│  • Commit automatique avec message descriptif           │
│  • Retry avec exponential backoff                       │
│  • Gestion des conflits de merge                        │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Obsidian (macOS)                                        │
│  • Git pull automatique toutes les 6h                   │
│  • Vault : ~/Sites/fiches-veille                        │
│  • LaunchAgent : com.veille.obsidian-sync.plist         │
└─────────────────────────────────────────────────────────┘
```

## 📁 Structure du Projet

```
├── discord-ingest-bot/          # Bot Discord (Node.js)
│   ├── src/
│   │   ├── discord.js           # Client Discord, détection URLs
│   │   ├── commands.js          # Slash commands (/last, /stats, /insights, /podcast)
│   │   ├── processor.js         # Traitement URLs via NotebookLM
│   │   ├── gitWriter.js         # Push Git avec retry
│   │   └── config.js            # Configuration
│   └── workdir/repo/            # Clone du repo fiches-veille
│
├── batch-processor/             # Scripts de traitement batch
│   ├── src/
│   │   ├── notebooklm-http.js   # Client HTTP pour MCP NotebookLM
│   │   ├── fetch-content.js     # Extraction contenu web
│   │   ├── markdown-generator-v2.js  # Génération fiches markdown
│   │   ├── digest.js            # Génération digests hebdomadaires
│   │   └── index-v2.js          # Pipeline complet
│   ├── process-pending-notebooklm.js  # Traite les URLs en attente
│   └── workdir/repo/            # Clone local du repo
│
├── docs/                        # Documentation
│   ├── GUIDE-COMPLET-GMAIL-DISCORD.md
│   ├── SETUP-BATCH-NOTEBOOKLM.md
│   └── ROADMAP-VEILLE.md
│
└── scripts/                     # Scripts de déploiement
    ├── deploy-discord-bot.sh
    └── verify-setup.js
```

## 🚀 Déploiement

### Infrastructure

Le système tourne sur Google Cloud Platform :
- **Instance** : `veille-bot` (us-central1-a)
- **Services systemd** :
  - `veille-bot.service` : Bot Discord
  - `notebooklm-mcp.service` : Serveur MCP NotebookLM

### Commandes de Gestion

```bash
# SSH sur le serveur
gcloud compute ssh veille-bot --zone=us-central1-a

# Logs en temps réel
sudo journalctl -u veille-bot -f
sudo journalctl -u notebooklm-mcp -f

# Redémarrer les services
sudo systemctl restart veille-bot
sudo systemctl restart notebooklm-mcp

# Vérifier le statut
sudo systemctl status veille-bot --no-pager
sudo systemctl status notebooklm-mcp --no-pager
```

### Déployer une Modification

```bash
# 1. Copier les fichiers modifiés
gcloud compute scp discord-ingest-bot/src/commands.js \
  veille-bot:/home/YOUR_USERNAME/second-brain/discord-ingest-bot/src/ \
  --zone=us-central1-a

gcloud compute scp batch-processor/src/notebooklm-http.js \
  veille-bot:/home/YOUR_USERNAME/second-brain/batch-processor/src/ \
  --zone=us-central1-a

# 2. Redémarrer le service
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo systemctl restart veille-bot"

# 3. Vérifier que tout fonctionne
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo systemctl status veille-bot --no-pager"
```

Voir [.kiro/steering/deployment-workflow.md](.kiro/steering/deployment-workflow.md) pour le workflow complet.

## 🔄 Synchronisation Obsidian

LaunchAgent macOS qui synchronise automatiquement :
- **Fichier** : `~/Library/LaunchAgents/com.veille.obsidian-sync.plist`
- **Fréquence** : Toutes les 6 heures
- **Vault** : `~/Sites/fiches-veille`
- **Action** : `git pull --rebase`

## 📦 Dépendances Principales

- **discord.js** : Client Discord avec support slash commands
- **simple-git** : Gestion Git avec retry automatique
- **cheerio** : Extraction contenu web
- **@mozilla/readability** : Parsing articles
- **node-fetch** : Client HTTP pour MCP

## 🔧 Configuration

Variables d'environnement requises :

```bash
# Discord
DISCORD_TOKEN=xxx
DISCORD_CLIENT_ID=xxx
ALLOWED_GUILD_ID=xxx
ALLOWED_CHANNEL_ID=xxx

# GitHub
GITHUB_PAT=xxx
GITHUB_REPO_URL=https://github.com/user/repo
GITHUB_BRANCH=main

# NotebookLM
NOTEBOOKLM_MCP_URL=http://127.0.0.1:8000/mcp
NOTEBOOKLM_NOTEBOOK_ID=xxx  # Optionnel, auto-créé si absent
```

## 🎯 Roadmap

Voir [ROADMAP-VEILLE.md](ROADMAP-VEILLE.md) pour les évolutions futures :
- Notifications quotidiennes Discord
- Génération de flashcards automatiques
- Notebooks thématiques (IA, Business, Dev...)
- Intégration Perplexity pour recherche approfondie
- Export PDF des digests mensuels
