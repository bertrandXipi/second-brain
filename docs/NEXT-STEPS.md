# Prochaines Étapes - Automatisation Complète

## Situation Actuelle

✅ Bot Discord fonctionne (écrit en pending)
✅ Code NotebookLM HTTP client prêt
✅ Script de déploiement Cloud Run prêt
❌ Serveur MCP pas encore déployé sur Cloud Run

## Ce qu'il faut faire (dans l'ordre)

### 1. Copier les tokens NotebookLM sur le serveur (5 min)

```bash
# SSH sur le serveur
gcloud compute ssh veille-bot --zone=us-central1-a --project=veille-bot-447016

# Créer le dossier
mkdir -p ~/.notebooklm-mcp
exit

# Copier les tokens depuis ta machine
scp -r ~/.notebooklm-mcp/ veille-bot:~/
```

### 2. Déployer le serveur MCP sur Cloud Run (10 min)

```bash
# Depuis ta machine locale
cd ~/Sites/second-brain
./deploy-notebooklm-mcp-cloudrun.sh
```

Le script va afficher l'URL du service à la fin, note-la!

### 3. Configurer le bot Discord (2 min)

```bash
# SSH sur le serveur
gcloud compute ssh veille-bot --zone=us-central1-a --project=veille-bot-447016

# Éditer le .env
cd ~/second-brain/discord-ingest-bot
nano .env
```

Ajoute cette ligne (avec l'URL du step 2):
```
NOTEBOOKLM_MCP_URL=https://notebooklm-mcp-XXXXXXXX-uc.a.run.app/mcp
```

Sauvegarde (Ctrl+O, Enter, Ctrl+X)

```bash
# Redémarre le bot
pm2 restart discord-bot
pm2 logs discord-bot
```

### 4. Tester (2 min)

Poste une URL dans Discord et vérifie que:
1. Le bot répond "✅ Capturé: 1 URL(s)"
2. Après 30-60 secondes, la fiche apparaît dans Git
3. La fiche apparaît dans Obsidian

## Après ça, tout sera automatique!

- Tu postes une URL dans Discord
- Le bot traite automatiquement
- La fiche apparaît dans Obsidian
- **Plus besoin de lancer manuellement depuis Kiro!**

## Si ça ne marche pas

Consulte `DEPLOY-NOTEBOOKLM-CLOUDRUN.md` section "Troubleshooting"

Ou vérifie les logs:
```bash
# Logs du bot
pm2 logs discord-bot

# Logs du serveur MCP
gcloud run services logs tail notebooklm-mcp --region=us-central1 --project=veille-bot-447016
```

## Temps total estimé: 20 minutes

🚀 Let's go!
