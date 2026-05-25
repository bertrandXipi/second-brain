# Déploiement — Morning email digest

## Setup local (test)

1. Récupérer un Gmail app password : https://myaccount.google.com/apppasswords (compte `henrihenro33@gmail.com`)
2. Récupérer une clé Exa : https://dashboard.exa.ai
3. Ajouter dans `batch-processor/.env` :
   ```
   GMAIL_USER=henrihenro33@gmail.com
   GMAIL_APP_PASSWORD=<le_password_16_chars>
   EMAIL_TO=henrihenro33@gmail.com
   EXA_API_KEY=<la_clé_exa>
   ```
4. Test sans envoi :
   ```bash
   cd batch-processor
   npm run morning-digest:dry
   ```
5. Test envoi réel (envoie un vrai mail) :
   ```bash
   npm run morning-digest
   ```

## Déploiement sur veille-bot (GCP)

```bash
# 1. Copier les nouveaux fichiers
gcloud compute scp --recurse batch-processor/src batch-processor/prompts batch-processor/deploy \
  veille-bot:~/second-brain/batch-processor/ \
  --zone=us-central1-a

gcloud compute scp batch-processor/package.json batch-processor/package-lock.json \
  veille-bot:~/second-brain/batch-processor/ \
  --zone=us-central1-a

# 2. Installer deps + ajouter env vars sur le serveur
gcloud compute ssh veille-bot --zone=us-central1-a --command="cd ~/second-brain/batch-processor && npm install"

# 3. Compléter le .env distant avec GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_TO, EXA_API_KEY
gcloud compute ssh veille-bot --zone=us-central1-a --command="nano ~/second-brain/batch-processor/.env"

# 4. Installer le service + timer systemd (remplacer USER par ton user GCP)
USER=$(gcloud compute ssh veille-bot --zone=us-central1-a --command="whoami" | tr -d '\n')

gcloud compute ssh veille-bot --zone=us-central1-a --command="
  sudo cp ~/second-brain/batch-processor/deploy/morning-digest.service /etc/systemd/system/morning-digest@.service
  sudo cp ~/second-brain/batch-processor/deploy/morning-digest.timer /etc/systemd/system/morning-digest@${USER}.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now morning-digest@${USER}.timer
"

# 5. Vérifier
gcloud compute ssh veille-bot --zone=us-central1-a --command="systemctl list-timers morning-digest@${USER}.timer"

# 6. Tester manuellement (envoi réel)
gcloud compute ssh veille-bot --zone=us-central1-a --command="sudo systemctl start morning-digest@${USER}.service && sleep 60 && tail -50 ~/second-brain/batch-processor/morning-digest.log"
```

## Logs

```bash
gcloud compute ssh veille-bot --zone=us-central1-a --command="tail -100 ~/second-brain/batch-processor/morning-digest.log"
gcloud compute ssh veille-bot --zone=us-central1-a --command="sudo journalctl -u morning-digest@${USER}.service -n 50"
```
