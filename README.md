# Second Brain — Veille Automatisée

## Architecture

```
Mobile → Discord #veille-inbox → Bot (VM) → GitHub fiches-veille
                                                    ↓
                                    Batch (Mac cron) → Gemini → Fiches Markdown
                                                    ↓
                                              Obsidian Vault
```

## Composants

### 1. Bot Discord (VM Google Cloud)
- **Localisation** : VM `veille-bot` sur GCP (us-central1-a)
- **Accès** : `gcloud compute ssh veille-bot --zone=us-central1-a`
- **Logs** : `sudo journalctl -u veille-bot -f`
- **Redémarrer** : `sudo systemctl restart veille-bot`
- **Status** : `sudo systemctl status veille-bot`

### 2. Batch Processor (Mac local)
- **Dossier** : `~/Sites/second-brain/batch-processor`
- **Lancement manuel** : `cd batch-processor && npm start`
- **Cron** : 3x/jour (8h, 14h, 20h) via launchd
- **Logs** : `batch-processor/batch.log`

### 3. Obsidian Vault
- **Dossier** : `~/Sites/fiches-veille`
- **Sync** : `cd ~/Sites/fiches-veille && git pull`

## Commandes utiles

```bash
# Se connecter à la VM
gcloud compute ssh veille-bot --zone=us-central1-a

# Voir les logs du bot en direct
sudo journalctl -u veille-bot -f

# Redémarrer le bot
sudo systemctl restart veille-bot

# Lancer le batch manuellement
cd ~/Sites/second-brain/batch-processor && npm start

# Mettre à jour Obsidian vault
cd ~/Sites/fiches-veille && git pull
```

## Repos GitHub
- **second-brain** : https://github.com/bertrandXipi/second-brain (code)
- **fiches-veille** : https://github.com/bertrandXipi/fiches-veille (données)

## Console GCP
https://console.cloud.google.com/compute/instances?project=gen-lang-client-0084987367
