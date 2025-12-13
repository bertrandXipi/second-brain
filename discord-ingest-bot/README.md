# Discord Ingest Bot

Bot Discord qui écoute `#veille-inbox`, extrait URLs/tags/notes et les pousse sur Git.

## Setup

1. **Créer le bot Discord**
   - Aller sur [Discord Developer Portal](https://discord.com/developers/applications)
   - Créer une application → Bot
   - Activer l'intent **Message Content** (Privileged Gateway Intents)
   - Copier le token

2. **Configurer les variables d'environnement**
   ```bash
   cp .env.example .env
   # Éditer .env avec tes valeurs
   ```

3. **Installer et lancer**
   ```bash
   npm install
   npm start
   ```

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Token du bot Discord |
| `GITHUB_REPO_URL` | URL du repo (https://github.com/org/repo.git) |
| `GITHUB_PAT` | Personal Access Token GitHub (contents:write) |
| `ALLOWED_GUILD_ID` | ID du serveur Discord autorisé |
| `ALLOWED_CHANNEL_ID` | ID du channel #veille-inbox |
| `ALLOWED_AUTHOR_IDS` | IDs utilisateurs autorisés (CSV) |

## Fonctionnement

1. Message dans `#veille-inbox` avec URL(s)
2. Bot parse: URLs, tags (#ia, #llm...), note
3. Crée fichiers JSON dans `mobile-share/pending/`
4. Commit + push sur le repo
5. Réaction ✅ si OK, ❌ si erreur (retry auto)

## Anti-perte

Les messages sont d'abord sauvés dans `./spool/` avant le push Git.
Si le push échoue, le bot retry automatiquement toutes les 5 minutes.
