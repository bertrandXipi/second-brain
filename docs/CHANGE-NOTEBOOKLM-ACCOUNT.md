# Changer de compte NotebookLM

Ce guide explique comment connecter l'application à un nouveau compte NotebookLM.

## Architecture

L'application utilise un serveur MCP (Model Context Protocol) NotebookLM qui :
- Gère l'authentification avec Google/NotebookLM
- Stocke les credentials dans `~/.notebooklm-mcp/`
- Expose une API HTTP pour interagir avec NotebookLM

## Étapes de migration

### 1. Réauthentifier avec le nouveau compte

#### Option A : Sur votre machine locale

```bash
# Installer/mettre à jour notebooklm-mcp si nécessaire
pip install --upgrade notebooklm-mcp

# Lancer l'authentification interactive
notebooklm-mcp-auth
```

Cette commande va :
1. Ouvrir Chrome avec un profil dédié
2. Vous demander de vous connecter à Google avec le **nouveau compte**
3. Naviguer vers NotebookLM
4. Extraire et sauvegarder les tokens d'authentification

#### Option B : Sur Google Cloud (si le serveur MCP y tourne)

```bash
# Se connecter à l'instance
gcloud compute ssh veille-bot --zone=us-central1-a

# Lancer l'authentification
notebooklm-mcp-auth

# Ou si installé via uvx
uvx notebooklm-mcp-auth
```

### 2. Vérifier les credentials

Les credentials sont stockés dans :
```
~/.notebooklm-mcp/
├── cookies.json       # Cookies de session
└── tokens.json        # Tokens CSRF et session
```

Vérifiez que les fichiers ont été créés/mis à jour :
```bash
ls -la ~/.notebooklm-mcp/
cat ~/.notebooklm-mcp/tokens.json
```

### 3. Redémarrer le serveur MCP NotebookLM

#### Si le serveur tourne en local

```bash
# Arrêter le serveur actuel
pkill -f "notebooklm-mcp"

# Relancer (selon votre configuration)
# Exemple avec uvx :
uvx notebooklm-mcp --port 8000

# Ou avec npm/node si vous avez un wrapper
npm run notebooklm-server
```

#### Si le serveur tourne sur Google Cloud

```bash
# Redémarrer le service systemd
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo systemctl restart notebooklm-mcp"

# Vérifier le statut
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo systemctl status notebooklm-mcp --no-pager"

# Voir les logs
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo journalctl -u notebooklm-mcp -n 50"
```

### 4. Tester la connexion

```bash
# Test simple avec curl
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

Vous devriez voir les notebooks du **nouveau compte**.

### 5. Redémarrer les applications

#### Bot Discord (sur Google Cloud)

```bash
# Copier le .env mis à jour si nécessaire
gcloud compute scp discord-ingest-bot/.env \
  veille-bot:/home/YOUR_USERNAME/second-brain/discord-ingest-bot/ \
  --zone=us-central1-a

# Redémarrer le bot
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo systemctl restart veille-bot"

# Vérifier
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo systemctl status veille-bot --no-pager"
```

#### Batch processor (si tourne en service)

```bash
# Copier le .env mis à jour
gcloud compute scp batch-processor/.env \
  veille-bot:/home/YOUR_USERNAME/second-brain/batch-processor/ \
  --zone=us-central1-a

# Redémarrer si c'est un service
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo systemctl restart batch-processor"
```

## Configuration de l'URL du serveur MCP

Les applications se connectent au serveur MCP via la variable d'environnement :

```bash
# Dans batch-processor/.env et discord-ingest-bot/.env
NOTEBOOKLM_MCP_URL=http://127.0.0.1:8000/mcp
```

Ajustez selon votre configuration :
- Local : `http://127.0.0.1:8000/mcp` ou `http://localhost:8000/mcp`
- Distant : `http://IP_SERVER:8000/mcp`

## Vérification finale

### 1. Tester l'ajout d'une source

Postez un lien dans le canal Discord configuré. Le bot devrait :
1. ✅ Réagir avec 👀
2. ✅ Ajouter la source au notebook du **nouveau compte**
3. ✅ Réagir avec ✅

### 2. Vérifier dans NotebookLM

1. Connectez-vous à https://notebooklm.google.com avec le **nouveau compte**
2. Vérifiez que le notebook mensuel existe (ex: "Veille Tech - Janvier 2026")
3. Vérifiez que la source a été ajoutée

### 3. Consulter les logs

```bash
# Logs du bot Discord
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo journalctl -u veille-bot -f"

# Logs du serveur MCP
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo journalctl -u notebooklm-mcp -f"
```

## Troubleshooting

### Erreur "Authentication failed"

```bash
# Supprimer les anciens tokens
rm -rf ~/.notebooklm-mcp/

# Réauthentifier
notebooklm-mcp-auth
```

### Erreur "Connection refused"

Le serveur MCP n'est pas démarré :
```bash
# Vérifier le statut
sudo systemctl status notebooklm-mcp

# Démarrer
sudo systemctl start notebooklm-mcp
```

### Les sources vont dans l'ancien compte

Le serveur MCP utilise encore les anciens tokens :
1. Vérifiez que vous avez bien réauthentifié
2. Vérifiez que le serveur a été redémarré APRÈS la réauthentification
3. Vérifiez les logs pour voir quel compte est utilisé

### Erreur "Notebook not found"

Le notebook mensuel n'existe pas encore dans le nouveau compte :
- C'est normal ! Il sera créé automatiquement au premier ajout de source
- Le nom sera : "Veille Tech - [Mois] [Année]" (ex: "Veille Tech - Février 2026")

## Notes importantes

1. **Un seul compte à la fois** : Le serveur MCP ne peut être authentifié qu'avec un seul compte Google à la fois

2. **Notebooks mensuels** : L'application crée automatiquement un notebook par mois (ex: "Veille Tech - Janvier 2026")

3. **Migration des données** : Les anciennes sources restent dans l'ancien compte. Pour les migrer :
   - Exportez-les depuis l'ancien notebook
   - Importez-les dans le nouveau (manuellement ou via script)

4. **Tokens expirés** : Les tokens Google expirent après quelques semaines/mois. Si vous voyez des erreurs d'authentification, relancez `notebooklm-mcp-auth`

## Commandes utiles

```bash
# Lister les notebooks du compte actuel
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"notebook_list","arguments":{"max_results":100}}}'

# Vérifier quel compte est utilisé
# (regarder les notebooks retournés - ils correspondent au compte authentifié)

# Forcer une réauthentification
rm -rf ~/.notebooklm-mcp/ && notebooklm-mcp-auth
```
