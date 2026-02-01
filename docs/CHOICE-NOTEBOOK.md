# Commande /choice_notebook

Permet de choisir quel notebook NotebookLM utiliser pour les sources ajoutées via Discord.

## 🎯 Comportement

### Par défaut (sans /choice_notebook)
- Février 2026 → utilise "L'Aube de l'Intelligence Artificielle et du Vibe Coding"
- Autres mois → crée/utilise un notebook mensuel ("Veille Tech - [Mois] [Année]")

### Après /choice_notebook
- Toutes les sources vont dans le notebook sélectionné
- Persiste jusqu'à un nouveau choix

## 📋 Utilisation

```
/choice_notebook
```

Le bot affiche un menu déroulant avec les 25 derniers notebooks.

**Étapes :**
1. Tape `/choice_notebook`
2. Clique sur un notebook dans le menu
3. Confirmation : "✅ Notebook sélectionné"
4. Toutes les futures sources iront dans ce notebook

## 💾 Stockage

La sélection est sauvegardée dans `discord-ingest-bot/notebook-config.json` :

```json
{
  "selectedNotebookId": "5ac37432-e593-4bb7-b761-a4301800efc4",
  "selectedNotebookTitle": "L'Aube de l'IA et du Vibe Coding",
  "selectedNotebookUrl": "https://notebooklm.google.com/notebook/5ac37432-e593-4bb7-b761-a4301800efc4",
  "lastUpdated": "2026-02-01T08:15:30Z",
  "updatedBy": "894581215720529961"
}
```

**Champs :**
- `selectedNotebookId` : UUID du notebook
- `selectedNotebookTitle` : Titre pour affichage
- `selectedNotebookUrl` : Lien direct
- `lastUpdated` : Quand le choix a été fait
- `updatedBy` : ID Discord de l'utilisateur

## 🔄 Priorité d'Utilisation

```
1. Notebook sélectionné via /choice_notebook ?
   ├─ OUI → Utiliser celui-ci
   └─ NON ↓
   
2. Février 2026 ?
   ├─ OUI → Utiliser "L'Aube de l'IA..."
   └─ NON ↓
   
3. Créer/utiliser notebook mensuel
   └─ "Veille Tech - [Mois] [Année]"
```

## 📁 Fichiers Modifiés

- `discord-ingest-bot/src/notebookSelector.js` (NOUVEAU)
- `discord-ingest-bot/src/commands.js` (ajout commande + handler)
- `discord-ingest-bot/src/discord.js` (gestion select menu)
- `batch-processor/src/notebooklm-http.js` (priorité notebook)
- `.gitignore` (ignore notebook-config.json)

## 🚀 Déploiement

```bash
# Copier les fichiers
gcloud compute scp discord-ingest-bot/src/notebookSelector.js veille-bot:/home/bertrand/second-brain/discord-ingest-bot/src/ --zone=us-central1-a
gcloud compute scp discord-ingest-bot/src/commands.js veille-bot:/home/bertrand/second-brain/discord-ingest-bot/src/ --zone=us-central1-a
gcloud compute scp discord-ingest-bot/src/discord.js veille-bot:/home/bertrand/second-brain/discord-ingest-bot/src/ --zone=us-central1-a
gcloud compute scp batch-processor/src/notebooklm-http.js veille-bot:/home/bertrand/second-brain/batch-processor/src/ --zone=us-central1-a

# Redémarrer
gcloud compute ssh veille-bot --zone=us-central1-a --command="sudo systemctl restart veille-bot"

# Vérifier
gcloud compute ssh veille-bot --zone=us-central1-a --command="sudo systemctl status veille-bot --no-pager"
```

## 🧪 Test

1. Tape `/choice_notebook` dans Discord
2. Sélectionne un notebook
3. Poste une URL
4. Vérifie que la source est ajoutée au bon notebook dans NotebookLM
