# Déployer NotebookLM MCP sur Cloud Run - Guide Complet

## Vue d'ensemble

Ce guide explique comment déployer le serveur MCP NotebookLM sur Google Cloud Run pour permettre au bot Discord de traiter automatiquement les URLs sans intervention manuelle.

## Architecture Finale

```
Discord → Bot (Google Cloud) → MCP Server (Cloud Run) → NotebookLM API
                                         ↓
                                    Git Repo → Obsidian
```

**Workflow automatique:**
1. Tu postes une URL dans Discord
2. Le bot appelle le serveur MCP sur Cloud Run
3. Le serveur MCP ajoute l'URL à NotebookLM
4. NotebookLM fetch l'URL et génère le résumé en français
5. Le bot crée la fiche markdown
6. Le bot commit dans Git
7. Obsidian sync automatiquement

## Prérequis

- Projet Google Cloud: `veille-bot-447016`
- gcloud CLI installé et configuré
- Tokens NotebookLM authentifiés localement (`~/.notebooklm-mcp/auth.json`)

## Étape 1: Copier les tokens NotebookLM sur le serveur

Les tokens NotebookLM doivent être copiés sur le serveur Google Cloud où tourne le bot Discord.

```bash
# 1. SSH sur le serveur
gcloud compute ssh veille-bot --zone=us-central1-a --project=veille-bot-447016

# 2. Créer le dossier pour les tokens
mkdir -p ~/.notebooklm-mcp

# 3. Quitter le SSH
exit

# 4. Copier les tokens depuis ta machine locale
scp -r ~/.notebooklm-mcp/ veille-bot:~/
```

## Étape 2: Déployer le serveur MCP sur Cloud Run

```bash
# Lancer le script de déploiement
./deploy-notebooklm-mcp-cloudrun.sh
```

Ce script va:
1. Créer un repository Artifact Registry
2. Builder l'image Docker du serveur MCP
3. Déployer sur Cloud Run
4. Afficher l'URL du service

**Note:** Le déploiement prend environ 5-10 minutes.

## Étape 3: Configurer le bot Discord

### 3.1 Mettre à jour le .env du bot

SSH sur le serveur et édite le fichier `.env`:

```bash
gcloud compute ssh veille-bot --zone=us-central1-a --project=veille-bot-447016
cd ~/second-brain/discord-ingest-bot
nano .env
```

Ajoute cette ligne (remplace l'URL par celle affichée après le déploiement):

```bash
NOTEBOOKLM_MCP_URL=https://notebooklm-mcp-XXXXXXXX-uc.a.run.app/mcp
```

### 3.2 Redémarrer le bot Discord

```bash
pm2 restart discord-bot
pm2 logs discord-bot
```

## Étape 4: Tester

### 4.1 Test local avec proxy

Depuis ta machine locale, crée un tunnel authentifié vers le serveur MCP:

```bash
gcloud run services proxy notebooklm-mcp --region=us-central1 --project=veille-bot-447016
```

Dans un autre terminal, teste le serveur:

```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "notebook_list",
      "arguments": {"max_results": 5}
    }
  }'
```

Tu devrais voir la liste de tes notebooks NotebookLM.

### 4.2 Test end-to-end

1. Poste une URL dans Discord
2. Le bot devrait répondre "✅ Capturé: 1 URL(s)"
3. Attends 30-60 secondes
4. Vérifie les logs du bot: `pm2 logs discord-bot`
5. La fiche devrait apparaître dans Git et Obsidian

## Troubleshooting

### Le serveur MCP ne démarre pas

Vérifie les logs Cloud Run:

```bash
gcloud run services logs read notebooklm-mcp \
  --region=us-central1 \
  --project=veille-bot-447016 \
  --limit=50
```

### Erreur "NotebookLM not available"

Le bot ne peut pas se connecter au serveur MCP. Vérifie:

1. L'URL dans `.env` est correcte
2. Le serveur MCP est déployé et running
3. Les tokens NotebookLM sont présents sur le serveur

```bash
# Sur le serveur
ls -la ~/.notebooklm-mcp/
cat ~/.notebooklm-mcp/auth.json
```

### Erreur "Authentication failed"

Les tokens NotebookLM ont expiré. Ré-authentifie:

```bash
# Sur ta machine locale
notebooklm-mcp-auth

# Recopie les tokens sur le serveur
scp -r ~/.notebooklm-mcp/ veille-bot:~/

# Redémarre le serveur MCP
gcloud run services update notebooklm-mcp \
  --region=us-central1 \
  --project=veille-bot-447016
```

### Le bot écrit toujours en pending

Le serveur MCP fonctionne mais il y a une erreur lors du traitement. Vérifie:

```bash
# Logs du bot Discord
pm2 logs discord-bot --lines 100

# Logs du serveur MCP
gcloud run services logs read notebooklm-mcp \
  --region=us-central1 \
  --project=veille-bot-447016 \
  --limit=50
```

## Monitoring

### Voir les logs en temps réel

```bash
# Bot Discord
pm2 logs discord-bot

# Serveur MCP
gcloud run services logs tail notebooklm-mcp \
  --region=us-central1 \
  --project=veille-bot-447016
```

### Vérifier le statut

```bash
# Serveur MCP
gcloud run services describe notebooklm-mcp \
  --region=us-central1 \
  --project=veille-bot-447016

# Bot Discord
pm2 status
```

## Coûts

Cloud Run facture uniquement quand le service reçoit des requêtes:

- **Gratuit:** 2 millions de requêtes/mois
- **Après:** ~$0.40 par million de requêtes
- **Estimation:** ~$1-2/mois pour ton usage

## Sécurité

⚠️ **Important:**

1. Le serveur MCP est déployé avec `--no-allow-unauthenticated`
2. Seuls les services avec le rôle `roles/run.invoker` peuvent l'appeler
3. Les tokens NotebookLM sont stockés dans le container (pas exposés)
4. Utilise le proxy Cloud Run pour tester localement

## Mise à jour

Pour mettre à jour le serveur MCP:

```bash
# Relancer le déploiement
./deploy-notebooklm-mcp-cloudrun.sh
```

## Désinstallation

Pour supprimer toutes les ressources:

```bash
# Supprimer le service Cloud Run
gcloud run services delete notebooklm-mcp \
  --region=us-central1 \
  --project=veille-bot-447016

# Supprimer le repository Artifact Registry
gcloud artifacts repositories delete mcp-servers \
  --location=us-central1 \
  --project=veille-bot-447016
```

## Prochaines étapes

Une fois que tout fonctionne:

1. ✅ Poste des URLs dans Discord
2. ✅ Vérifie que les fiches sont créées automatiquement
3. ✅ Profite de ton système de veille automatisé!

**Plus besoin de lancer manuellement depuis Kiro!** 🚀
