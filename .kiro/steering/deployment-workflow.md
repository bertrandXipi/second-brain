---
inclusion: always
---

# Workflow de Déploiement Discord Bot

## RÈGLE CRITIQUE : Toujours déployer avant de tester sur Discord

Le bot Discord tourne sur Google Cloud Run (instance `veille-bot`), PAS en local.

### Workflow obligatoire pour toute modification du bot :

1. **Modifier les fichiers localement**
   - `discord-ingest-bot/src/*`
   - `batch-processor/src/*` (si utilisé par le bot)

2. **Tester localement si possible**
   - Tests unitaires
   - Scripts de test isolés

3. **DÉPLOYER sur Google Cloud** 
   ```bash
   # Copier les fichiers modifiés
   gcloud compute scp discord-ingest-bot/src/processor.js veille-bot:/home/YOUR_USERNAME/second-brain/discord-ingest-bot/src/ --zone=us-central1-a
   gcloud compute scp batch-processor/src/notebooklm-http.js veille-bot:/home/YOUR_USERNAME/second-brain/batch-processor/src/ --zone=us-central1-a
   gcloud compute scp batch-processor/src/fetch-content.js veille-bot:/home/YOUR_USERNAME/second-brain/batch-processor/src/ --zone=us-central1-a
   
   # Redémarrer le service
   gcloud compute ssh veille-bot --zone=us-central1-a --command="sudo systemctl restart veille-bot"
   
   # Vérifier le statut
   gcloud compute ssh veille-bot --zone=us-central1-a --command="sudo systemctl status veille-bot --no-pager"
   ```

4. **PUIS tester sur Discord**
   - Poster un lien dans le canal Discord
   - Vérifier les réactions du bot
   - Consulter les logs si nécessaire

### Fichiers à déployer selon les modifications :

| Modification | Fichiers à copier |
|--------------|-------------------|
| Logique de traitement | `discord-ingest-bot/src/processor.js` |
| NotebookLM | `batch-processor/src/notebooklm-http.js` |
| Fetch de contenu | `batch-processor/src/fetch-content.js` |
| Génération markdown | `batch-processor/src/markdown-generator-v2.js` |
| Commandes Discord | `discord-ingest-bot/src/commands.js` |

### ⚠️ ERREUR FRÉQUENTE À ÉVITER

**NE JAMAIS** dire "tu peux tester sur Discord" avant d'avoir :
1. ✅ Copié les fichiers sur Google Cloud
2. ✅ Redémarré le service
3. ✅ Vérifié que le service est actif

### Logs en cas de problème

```bash
# Logs en temps réel
gcloud compute ssh veille-bot --zone=us-central1-a --command="sudo journalctl -u veille-bot -f"

# Dernières 50 lignes
gcloud compute ssh veille-bot --zone=us-central1-a --command="sudo journalctl -u veille-bot -n 50"
```
