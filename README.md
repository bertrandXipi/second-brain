# Second Brain - Veille IA Automatisée

Système de veille automatisé utilisant NotebookLM comme RAG pour analyser et synthétiser des contenus.

## Architecture

```
Discord (URL) → Bot (Google Cloud) → NotebookLM MCP → Fiche Markdown → Git → Obsidian
```

## Fonctionnement

1. **Capture** : Poster une URL dans Discord
2. **Traitement** : NotebookLM analyse le contenu et génère un résumé détaillé en français
3. **Stockage** : Fiche markdown créée et pushée sur GitHub
4. **Sync** : Obsidian synchronise automatiquement toutes les 6h

## Structure

```
├── discord-ingest-bot/     # Bot Discord (tourne sur Google Cloud)
│   ├── src/
│   │   ├── discord.js      # Gestion messages Discord
│   │   ├── processor.js    # Traitement URLs via NotebookLM
│   │   └── ...
│   └── workdir/repo/       # Clone du repo fiches-veille
│
├── batch-processor/        # Scripts de traitement batch
│   ├── src/
│   │   ├── notebooklm-http.js  # Client HTTP pour MCP NotebookLM
│   │   ├── markdown-generator-v2.js
│   │   └── ...
│   └── workdir/repo/       # Clone local du repo
│
├── docs/                   # Documentation
├── scripts/                # Scripts de déploiement
└── ROADMAP-VEILLE.md       # Idées et évolutions futures
```

## Déploiement

Le bot Discord et le serveur MCP NotebookLM tournent sur une instance Google Compute `veille-bot`.

```bash
# SSH sur le serveur
gcloud compute ssh veille-bot --zone=us-central1-a

# Logs du bot
sudo journalctl -u veille-bot -f

# Logs du MCP server
sudo journalctl -u notebooklm-mcp -f

# Redémarrer
sudo systemctl restart veille-bot
sudo systemctl restart notebooklm-mcp
```

## Sync Obsidian

LaunchAgent macOS qui fait un `git pull` toutes les 6h :
- Fichier : `~/Library/LaunchAgents/com.veille.obsidian-sync.plist`
- Vault : `/Users/bertrand/Sites/fiches-veille`

## Roadmap

Voir [ROADMAP-VEILLE.md](ROADMAP-VEILLE.md) pour les évolutions prévues :
- Slash commands Discord (`/ask`, `/insight`, `/idea`...)
- Notifications quotidiennes
- Podcasts et flashcards automatiques
- Notebooks thématiques
