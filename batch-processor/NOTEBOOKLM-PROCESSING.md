# Traitement des URLs avec NotebookLM

## Architecture

Le système fonctionne en 2 parties:

1. **Discord Bot (Google Cloud)** - V1 inchangé
   - Écoute les messages Discord
   - Parse les URLs
   - Écrit dans `mobile-share/pending/`
   - Commit dans Git

2. **Batch Processor (Local - Kiro)** - V2 avec NotebookLM
   - Lit les pending depuis Git
   - Fetch le contenu
   - Ajoute à NotebookLM
   - Récupère le résumé AI
   - Génère les fiches markdown
   - Commit dans Git

## Utilisation

### Traiter les pending manuellement

1. Ouvrir ce fichier dans Kiro: `batch-processor/process-pending-notebooklm.js`

2. Exécuter le fichier (Kiro va utiliser les outils MCP NotebookLM)

3. Le script va:
   - Pull le repo Git
   - Créer/trouver le notebook du mois ("Veille Tech - Janvier 2026")
   - Traiter chaque URL en pending
   - Générer les fiches avec résumés NotebookLM
   - Commit et push dans Git

### Automatiser avec launchd (optionnel)

Pour traiter automatiquement 3x/jour, créer un service launchd qui lance le script via Kiro CLI.

**Note**: Kiro doit être ouvert pour que les outils MCP fonctionnent.

## Workflow complet

```
1. Poster URL dans Discord
   ↓
2. Bot Discord (Cloud) écrit en pending + commit Git
   ↓
3. Lancer process-pending-notebooklm.js dans Kiro
   ↓
4. Script traite avec NotebookLM
   ↓
5. Fiche markdown créée avec résumé AI
   ↓
6. Commit dans Git
   ↓
7. Sync Obsidian (automatique via Git)
```

## Format des fiches

Les fiches générées contiennent:

- **Résumé NotebookLM**: Analyse AI riche et contextualisée
- **Mots-clés**: Extraits automatiquement par NotebookLM
- **Lien NotebookLM**: Pour poser des questions, générer des podcasts, etc.
- **Métadonnées**: URL source, tags, date, etc.

## Notebooks NotebookLM

- **Organisation**: 1 notebook par mois
- **Nom**: "Veille Tech - Janvier 2026"
- **Auto-création**: Si le notebook du mois n'existe pas, il est créé automatiquement
- **Accès**: https://notebooklm.google.com

## Avantages NotebookLM

✅ **Résumés de qualité**: Meilleurs que Gemini CLI
✅ **Pas de quotas**: Gratuit et illimité
✅ **Podcasts**: Génération audio automatique
✅ **Recherche sémantique**: Dans toutes les sources
✅ **Questions/réponses**: Sur le contenu
✅ **Comparaison**: Entre plusieurs sources

## Dépendances

- **Kiro**: Pour accès aux outils MCP
- **NotebookLM MCP**: Installé via `uv tool install notebooklm-mcp-server`
- **Auth NotebookLM**: `notebooklm-mcp-auth` (déjà fait)
- **Git**: Pour sync avec le repo

## Troubleshooting

### "This script must run in Kiro context"
→ Le script doit être exécuté depuis Kiro, pas en ligne de commande Node.js

### "MCP tools not available"
→ Vérifier que NotebookLM MCP est activé dans `~/.kiro/settings/mcp.json`

### "Failed to create notebook"
→ Vérifier l'authentification: `notebooklm-mcp-auth`

### Git conflicts
→ Le script fait un `git pull` au début pour éviter les conflits
