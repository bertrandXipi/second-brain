# Deploy Discord Bot (veille-bot)

## Infra

| Item | Value |
|------|-------|
| **GCP project** | `gen-lang-client-0084987367` |
| **Account** | `henrihenro33@gmail.com` |
| **Instance** | `veille-bot` |
| **Zone** | `us-central1-a` |
| **IP** | `34.42.192.31` (external) |
| **OS** | Debian 12 (e2-micro) |
| **SSH user** | `bertrand` |
| **App path** | `/home/bertrand/second-brain/` |

## Se connecter

```bash
gcloud compute ssh veille-bot --zone=us-central1-a
```

Aucune config SSH manuelle — gcloud gère la clé `google_compute_engine`.

## Services

Deux services systemd tournent sur le VPS :

```bash
# Discord bot
sudo systemctl restart veille-bot
sudo journalctl -u veille-bot -f

# Serveur HTTP NotebookLM (localhost:8000)
sudo systemctl restart notebooklm-mcp
sudo journalctl -u notebooklm-mcp -f
```

## Déployer

### Déployer un fichier rapidement

```bash
gcloud compute scp <fichier-local> veille-bot:/home/bertrand/second-brain/<chemin-cible> --zone=us-central1-a
gcloud compute ssh veille-bot --zone=us-central1-a --command "sudo systemctl restart veille-bot"
```

### Déployer depuis la branche feature

```bash
# Sur le serveur, pull la branche et restart
gcloud compute ssh veille-bot --zone=us-central1-a --command "
  cd /home/bertrand/second-brain &&
  git fetch origin &&
  git checkout <branche> &&
  git pull origin <branche> &&
  sudo systemctl restart veille-bot
"
```

### Script de deploy local

Le script `scripts/deploy-discord-bot.sh` copie les fichiers modifiés et restart.

## Fichiers sensibles

Le `.env` du bot est sur le serveur dans `/home/bertrand/second-brain/discord-ingest-bot/.env`. Il contient :
- `DISCORD_TOKEN`
- `GITHUB_PAT`
- `GITHUB_REPO_URL`
- `NOTEBOOKLM_MCP_URL=http://localhost:8000/mcp`
- Credentials LinkedIn

Pour le mettre à jour :
```bash
gcloud compute scp discord-ingest-bot/.env veille-bot:/home/bertrand/second-brain/discord-ingest-bot/.env --zone=us-central1-a
gcloud compute ssh veille-bot --zone=us-central1-a --command "sudo systemctl restart veille-bot"
```

## Auth NotebookLM

Les tokens sont dans `~/.notebooklm-mcp/` sur le serveur. Pour rafraîchir :
```bash
./scripts/auto-refresh-notebooklm.sh
```

Ce script réauthentifie localement puis copie `auth.json` sur le VPS et restart les services.

## Dépannage rapide

```bash
# Voir les logs du bot
gcloud compute ssh veille-bot --zone=us-central1-a --command "sudo journalctl -u veille-bot --no-pager -n 50"

# Vérifier que le MCP répond
gcloud compute ssh veille-bot --zone=us-central1-a --command "curl -s http://localhost:8000/mcp | head -5"

# Vérifier que le PAT GitHub fonctionne
gcloud compute ssh veille-bot --zone=us-central1-a --command "
  cd /home/bertrand/second-brain &&
  source discord-ingest-bot/.env 2>/dev/null
  curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: token \$GITHUB_PAT' https://api.github.com/user
"
```

## Erreurs connues

- **"could not read Password"** → Token GitHub expiré ou absent du remote. Le fix dans `gitWriter.js` met à jour le remote à chaque démarrage avec `git.remote(['set-url', 'origin', repoUrl])`.
- **Bot hors ligne** → `sudo systemctl status veille-bot` pour voir s'il crash. Souvent un token Discord ou NotebookLM expiré.
