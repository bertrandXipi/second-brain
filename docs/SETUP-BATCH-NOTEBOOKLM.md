# Setup Batch NotebookLM Processing

## Architecture Finale

```
Discord → Bot (Google Cloud) → Git (pending/)
                                    ↓
                            Kiro (local, 3x/jour)
                                    ↓
                            NotebookLM + Git (fiches/)
```

## Workflow

1. **Tu postes une URL dans Discord**
   - Le bot écrit dans `mobile-share/pending/`
   - Commit et push dans Git
   - Affiche "✅ Capturé: 1 URL(s)"

2. **3 fois par jour (9h, 14h, 19h)**
   - Ton Mac lance automatiquement le script
   - Le script traite tous les pending avec NotebookLM
   - Génère les fiches markdown
   - Commit et push dans Git

3. **Obsidian sync automatiquement**

## Installation du Cron Job (launchd)

### 1. Copier le fichier plist

```bash
cp batch-processor/com.veille.notebooklm-batch.plist ~/Library/LaunchAgents/
```

### 2. Charger le service

```bash
launchctl load ~/Library/LaunchAgents/com.veille.notebooklm-batch.plist
```

### 3. Vérifier que c'est chargé

```bash
launchctl list | grep veille
```

Tu devrais voir: `com.veille.notebooklm-batch`

### 4. Tester manuellement

```bash
launchctl start com.veille.notebooklm-batch
```

Puis vérifie les logs:
```bash
tail -f batch-processor/batch-notebooklm.log
```

## Horaires

Le script tourne automatiquement à:
- **9h00** - Matin
- **14h00** - Après-midi  
- **19h00** - Soir

## Logs

- **Succès**: `batch-processor/batch-notebooklm.log`
- **Erreurs**: `batch-processor/batch-notebooklm-error.log`

## Désactiver

```bash
launchctl unload ~/Library/LaunchAgents/com.veille.notebooklm-batch.plist
```

## Modifier les horaires

Édite `~/Library/LaunchAgents/com.veille.notebooklm-batch.plist` et change les heures:

```xml
<key>Hour</key>
<integer>9</integer>  <!-- Change ici -->
<key>Minute</key>
<integer>0</integer>
```

Puis recharge:
```bash
launchctl unload ~/Library/LaunchAgents/com.veille.notebooklm-batch.plist
launchctl load ~/Library/LaunchAgents/com.veille.notebooklm-batch.plist
```

## Traitement Manuel

Si tu veux traiter les pending immédiatement:

```bash
cd ~/second-brain
node batch-processor/process-pending-notebooklm.js
```

**Important**: Ce script doit tourner dans Kiro pour avoir accès aux outils MCP NotebookLM!

## Vérifier le Statut

```bash
# Voir combien de pending
ls batch-processor/workdir/repo/mobile-share/pending/ | wc -l

# Voir les derniers logs
tail -20 batch-processor/batch-notebooklm.log

# Forcer un run maintenant
launchctl start com.veille.notebooklm-batch
```

## Troubleshooting

### Le script ne tourne pas

1. Vérifie que le service est chargé:
   ```bash
   launchctl list | grep veille
   ```

2. Vérifie les logs d'erreur:
   ```bash
   cat batch-processor/batch-notebooklm-error.log
   ```

3. Teste manuellement:
   ```bash
   cd ~/second-brain
   node batch-processor/process-pending-notebooklm.js
   ```

### "This script must run in Kiro context"

Le script a besoin des outils MCP NotebookLM. Assure-toi que:
- Kiro est installé
- NotebookLM MCP est configuré dans Kiro
- Tu as authentifié NotebookLM (`notebooklm-mcp-auth`)

### Les pending ne sont pas traités

1. Vérifie qu'il y a des pending:
   ```bash
   ls batch-processor/workdir/repo/mobile-share/pending/
   ```

2. Lance manuellement pour voir l'erreur:
   ```bash
   launchctl start com.veille.notebooklm-batch
   tail -f batch-processor/batch-notebooklm.log
   ```

## Avantages de cette approche

✅ **Pas de quotas** - NotebookLM n'a pas de limites  
✅ **Résumés détaillés** - NotebookLM génère des analyses complètes en français  
✅ **Pas de blocage IP** - Ton Mac local peut accéder à Reddit  
✅ **Automatique** - 3x/jour sans intervention  
✅ **Fiable** - Si un batch échoue, le suivant réessaiera  

## Workflow Complet

1. **Matin (9h)**: Tu postes 5 URLs dans Discord pendant ton café
2. **Après-midi (14h)**: Le script traite les 5 URLs, génère les fiches
3. **Soir (19h)**: Tu postes 3 URLs de plus
4. **Lendemain matin (9h)**: Les 3 URLs sont traitées

Tout est automatique! 🚀
