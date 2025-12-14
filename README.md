# Second Brain — Veille Automatisée

Système de veille technologique : capture d'URLs via Discord, résumé automatique avec Gemini, fiches Markdown consultables dans Obsidian.

## Architecture

```
Mobile → Discord #veille-inbox → Bot (VM GCP) → GitHub fiches-veille
                                                       ↓
                                       Batch (Mac cron 3x/jour) → Gemini
                                                       ↓
                                              Fiches Markdown + Obsidian
```

## Fonctionnalités

- **Capture Discord** : partage une URL dans `#veille-inbox`, le bot crée un fichier JSON dans `pending/`
- **Support YouTube** : récupère automatiquement la transcription des vidéos
- **Résumé IA** : Gemini génère titre, résumé, points clés, tags, concepts
- **Fiches Markdown** : format Obsidian avec frontmatter YAML et wikilinks
- **Digest hebdo** : synthèse des tendances de la semaine (dimanche 20h)
- **Notifications Discord** : résumé du batch via webhook

## Structure du projet

```
second-brain/
├── discord-ingest-bot/     # Bot Discord (Node.js)
│   ├── src/
│   └── .env
├── batch-processor/        # Traitement des URLs (Node.js)
│   ├── src/
│   ├── scripts/            # Script Python pour transcriptions YouTube
│   ├── prompts/            # Prompts Gemini (v1.txt, v1-youtube.txt)
│   └── .env
└── README.md
```

## Prérequis

- Node.js 20+
- Python 3.11+ avec `youtube-transcript-api`
- Gemini CLI configuré (`gemini auth`)
- yt-dlp (pour métadonnées YouTube)
- gcloud CLI (pour la VM)

## Installation

### 1. Bot Discord (VM Google Cloud)

Le bot tourne sur une VM `e2-micro` (free tier) en `us-central1-a`.

```bash
# Se connecter à la VM
gcloud compute ssh veille-bot --zone=us-central1-a

# Voir les logs
sudo journalctl -u veille-bot -f

# Redémarrer le bot
sudo systemctl restart veille-bot

# Status
sudo systemctl status veille-bot
```

### 2. Batch Processor (Mac local)

```bash
cd batch-processor
npm install
cp .env.example .env  # Configurer les variables
```

**Variables d'environnement (.env) :**
```
GITHUB_REPO_URL=https://github.com/xxx/fiches-veille.git
GITHUB_PAT=xxx
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx
OBSIDIAN_VAULT_PATH=/Users/xxx/Sites/fiches-veille
```

### 3. Cron automatique (launchd)

```bash
# Batch 3x/jour (8h, 14h, 20h)
cp batch-processor/com.veille.batch.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.veille.batch.plist

# Digest hebdo (dimanche 20h)
cp batch-processor/com.veille.digest.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.veille.digest.plist
```

## Commandes utiles

```bash
# Lancer le batch manuellement
cd ~/Sites/second-brain/batch-processor && npm start

# Générer le digest manuellement
cd ~/Sites/second-brain/batch-processor && npm run digest

# Mettre à jour le vault Obsidian
cd ~/Sites/fiches-veille && git pull

# Tester une transcription YouTube
python3 batch-processor/scripts/get-transcript.py VIDEO_ID
```

## Prompts Gemini

Les prompts sont dans `batch-processor/prompts/` :
- `v1.txt` : articles web classiques
- `v1-youtube.txt` : vidéos YouTube (résumé plus détaillé)

Tu peux les modifier sans toucher au code.

## Repos GitHub

- **second-brain** : https://github.com/bertrandXipi/second-brain (code)
- **fiches-veille** : https://github.com/bertrandXipi/fiches-veille (données)

## Console GCP

https://console.cloud.google.com/compute/instances?project=gen-lang-client-0084987367

## Branches en cours

- `feature/auto-glossary` : génération automatique d'un glossaire de concepts
