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

## Stabilité — watchdog + safeHandler

Le bot tourne en mode "fail-fast + auto-restart" : si quelque chose part en zombie, il sort proprement et systemd le relance.

### Healthcheck HTTP

```bash
gcloud compute ssh veille-bot --zone=us-central1-a --command="curl -s http://127.0.0.1:8787/healthz"
```

Retourne JSON :
```json
{"healthy":true,"ws_status":0,"ws_ping_ms":60,"last_event_kind":"messageCreate",
 "last_event_age_ms":1234,"uptime_ms":120000,"rss_mb":80,"heap_mb":20}
```

- `healthy: true` → gateway READY (`ws_status: 0`) et dernier event < 10 min
- `healthy: false` → 503 retourné, watchdog déclenche `shutdown(1)`, systemd relance

### Comportement watchdog (`src/health.js`)

- Heartbeat toutes les **60s** (log `[health] heartbeat ws=0 ping=Xms age=Ys rss=ZMB`)
- Si `ws_status != 0` OU dernier event > **10 min** → onZombie → exit(1) → systemd restart
- Variables d'env : `HEALTH_PORT=8787`, `HEALTH_STALE_MS=600000`, `HEALTH_WATCHDOG_INTERVAL_MS=60000`

### safeHandler (`src/safeHandler.js`)

Toutes les interactions Discord (slash commands, select menus, boutons) sont wrappées via `safeWrap(name, handler, opts)` :
- Force `deferReply()` après **2.5s** si le handler oublie → plus de "L'application ne répond plus"
- Catch toute exception, log avec stack, répond `❌ Erreur dans <name>: <message>`
- Bump le watchdog (`markEvent`) pour signaler activité

Si tu vois encore "L'application ne répond plus" :
1. `journalctl -u veille-bot -n 100 | grep "\[safe\]"` → cherche les `threw:` ou `forced deferReply`
2. Si le wrap n'est PAS appliqué à un nouveau handler, ajouter dans `commands.js > COMMAND_HANDLERS` ou utiliser `safeWrap('name', handler, { ephemeral: true })` pour les composants

### Spool anti-perte (`src/spool.js`)

Chaque message Discord avec URLs est écrit dans `./spool/<batch_id>.json` AVANT traitement. Si le bot crash en plein traitement, au prochain boot le replay (toutes les 5min aussi) rejoue les batches non terminés.

```bash
# Voir les batches en attente sur le VPS
gcloud compute ssh veille-bot --zone=us-central1-a --command="ls /home/bertrand/second-brain/discord-ingest-bot/spool/"
```

### Debug "Application ne répond plus"

1. Vérifier `/healthz` (cf. ci-dessus) — si 503, le watchdog va restart sous 60s
2. `journalctl -u veille-bot -n 50 | grep -E "\[safe\]|\[health\]|threw"`
3. Si une commande slash crash en boucle après restart → c'est un bug dans le handler, pas dans la gateway

### Tests unit

```bash
cd discord-ingest-bot && npm test
```

Couvre : `safeHandler` (forced defer, error reply), `health` (watchdog, /healthz logic), `spool`, `parser`, `normalize`. À lancer avant tout deploy.
