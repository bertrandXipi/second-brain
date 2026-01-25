# Déployer NotebookLM MCP en mode HTTP

## Pourquoi HTTP?

Le bot Discord tourne sur Google Cloud et ne peut pas utiliser les outils MCP Kiro directement. La solution: lancer le serveur MCP NotebookLM en mode HTTP.

## Architecture finale

```
Discord → Bot (Google Cloud) → MCP HTTP Server → NotebookLM
                                    ↓
                                  Git Repo
```

Tout est automatique, rien à faire manuellement!

## Option 1: MCP sur Google Cloud (recommandé)

### 1. Installer sur le serveur Google Cloud

```bash
# SSH sur le serveur
gcloud compute ssh your-instance

# Installer uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Installer NotebookLM MCP
uv tool install notebooklm-mcp-server

# Authentifier
notebooklm-mcp-auth
```

### 2. Créer un service systemd

```bash
sudo nano /etc/systemd/system/notebooklm-mcp.service
```

```ini
[Unit]
Description=NotebookLM MCP HTTP Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user
ExecStart=/home/your-user/.local/bin/notebooklm-mcp --transport http --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 3. Démarrer le service

```bash
sudo systemctl daemon-reload
sudo systemctl enable notebooklm-mcp
sudo systemctl start notebooklm-mcp
sudo systemctl status notebooklm-mcp
```

### 4. Configurer le firewall

```bash
# Ouvrir le port 8000 (seulement pour localhost ou VPC interne)
sudo ufw allow from 10.0.0.0/8 to any port 8000
```

### 5. Mettre à jour le bot Discord

Dans `.env` du bot:
```bash
NOTEBOOKLM_MCP_URL=http://localhost:8000/mcp
```

## Option 2: MCP sur ta machine locale (dev/test)

### 1. Lancer le serveur MCP

```bash
notebooklm-mcp --transport http --port 8000
```

### 2. Exposer avec ngrok ou cloudflare tunnel

```bash
# Avec ngrok
ngrok http 8000

# Avec cloudflare tunnel
cloudflared tunnel --url http://localhost:8000
```

### 3. Mettre à jour le bot Discord

```bash
NOTEBOOKLM_MCP_URL=https://your-ngrok-url.ngrok.io/mcp
```

## Option 3: MCP sur un VPS dédié

Même procédure que Option 1, mais sur un VPS séparé (DigitalOcean, Hetzner, etc.)

## Modifier le bot Discord

### 1. Mettre à jour discord-ingest-bot

Remplacer l'import dans `src/processor.js`:

```javascript
// Avant
import { addToNotebookLM } from '../../batch-processor/src/notebooklm-sync.js';

// Après
import { addToNotebookLM, getDetailedAnalysis } from '../../batch-processor/src/notebooklm-http.js';
```

### 2. Ajouter la variable d'environnement

Dans `discord-ingest-bot/.env`:
```bash
NOTEBOOKLM_MCP_URL=http://localhost:8000/mcp
```

### 3. Redéployer le bot

```bash
# Sur Google Cloud
gcloud compute ssh your-instance
cd discord-ingest-bot
git pull
pm2 restart discord-bot
```

## Tester

```bash
# Tester le serveur MCP
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "notebook_list",
      "arguments": {"max_results": 10}
    }
  }'
```

## Sécurité

⚠️ **Important**: Le serveur MCP contient tes tokens NotebookLM!

- Ne pas exposer sur internet public
- Utiliser un VPC interne ou localhost uniquement
- Ou ajouter une authentification (API key)

## Monitoring

```bash
# Logs du service
sudo journalctl -u notebooklm-mcp -f

# Status
sudo systemctl status notebooklm-mcp
```

## Workflow final

1. Tu postes URL dans Discord
2. Bot Discord (Cloud) reçoit le message
3. Bot appelle MCP HTTP pour ajouter à NotebookLM
4. MCP retourne le résumé détaillé en français
5. Bot génère la fiche markdown
6. Bot commit dans Git
7. Obsidian sync automatiquement

**TOUT AUTOMATIQUE!** 🚀
