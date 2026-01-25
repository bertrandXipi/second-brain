# Architecture V2 - Traitement en temps réel avec NotebookLM

## Vue d'ensemble

La V2 transforme le système de veille d'un traitement par batch (3x/jour) vers un traitement en temps réel dès réception d'une URL dans Discord.

## Flux de traitement

```
Discord Message
    ↓
1. Parse URLs/tags/note
    ↓
2. Spool (anti-perte)
    ↓
3. Fetch content (fetch-content.js)
    ↓
4. Add to NotebookLM (notebooklm-sync.js)
    ↓
5. Get AI summary from NotebookLM (source_describe)
    ↓
6. Generate markdown fiche (markdown-generator-v2.js)
    ↓
7. Commit to Git (fiches/ + processed/)
    ↓
8. Reply to Discord with NotebookLM link
```

## Composants

### Discord Bot (`discord-ingest-bot/`)

**Fichiers modifiés:**
- `src/discord.js` - Appelle maintenant `processor.js` au lieu de juste écrire en pending
- `src/processor.js` - **NOUVEAU** - Orchestre le traitement complet

**Fichiers inchangés:**
- `src/parser.js` - Parse URLs, tags, notes
- `src/spool.js` - Anti-perte (retry automatique)
- `src/gitWriter.js` - Gestion Git (toujours utilisé pour init)

### Batch Processor (`batch-processor/`)

**Fichiers réutilisés:**
- `src/fetch-content.js` - Extraction de contenu (YouTube, Reddit, etc.)
- `src/youtube.js` - Transcriptions YouTube

**Fichiers nouveaux:**
- `src/notebooklm-sync.js` - Intégration MCP NotebookLM
  - `getOrCreateMonthlyNotebook()` - Crée "Veille Tech - Janvier 2026"
  - `addToNotebookLM()` - Ajoute une source
  - `getSourceDescription()` - Récupère le résumé AI
- `src/markdown-generator-v2.js` - Génère markdown avec résumé NotebookLM
- `src/mcp-tools.js` - Wrapper pour appels MCP (Kiro context)

**Fichiers obsolètes (V1):**
- `src/index.js` - Batch processor (remplacé par traitement temps réel)
- `src/llm-summarize.js` - Gemini CLI (remplacé par NotebookLM)

## NotebookLM MCP

### Outils utilisés

1. **notebook_list** - Liste les notebooks existants
2. **notebook_create** - Crée un nouveau notebook mensuel
3. **notebook_add_url** - Ajoute une URL comme source
4. **source_describe** - Génère résumé AI + mots-clés

### Organisation

- **1 notebook par mois**: "Veille Tech - Janvier 2026"
- **Auto-création**: Si le notebook du mois n'existe pas, il est créé
- **Sources**: Chaque URL devient une source dans le notebook

## Structure Git (inchangée)

```
fiches-veille/
├── fiches/
│   ├── 2026-01/
│   │   ├── 2026-01-25-titre-article.md
│   │   └── ...
│   └── ...
├── mobile-share/
│   ├── pending/      # Vide maintenant (traitement immédiat)
│   ├── processed/    # URLs traitées avec succès
│   └── failed/       # URLs en échec
└── digests/          # Digests hebdomadaires (inchangé)
```

## Format Markdown V2

```markdown
---
title: Titre de l'article
source_url: https://...
notebooklm_notebook_id: abc-123
notebooklm_source_id: xyz-789
notebooklm_url: https://notebooklm.google.com/notebook/abc-123
keywords: [keyword1, keyword2]
tags: [tag1, tag2]
---

## Résumé (NotebookLM)

[Résumé AI généré par NotebookLM - riche et contextualisé]

## Mots-clés

- **keyword1**
- **keyword2**

## 📚 NotebookLM

[Ouvrir dans NotebookLM](https://notebooklm.google.com/notebook/abc-123)

Utilisez NotebookLM pour:
- Poser des questions approfondies
- Générer des résumés personnalisés
- Créer des podcasts audio
- Explorer les concepts

## Note personnelle

[Note Discord si présente]

## Source

- [Article original](https://...)
```

## Avantages V2

### ✅ Traitement immédiat
- Plus besoin d'attendre les batch 3x/jour
- Feedback Discord instantané avec lien NotebookLM

### ✅ Meilleurs résumés
- NotebookLM génère des résumés plus riches et contextualisés
- Mots-clés extraits automatiquement
- Analyse sémantique avancée

### ✅ Pas de quotas
- NotebookLM gratuit et sans limite
- Fini les erreurs 429 de Gemini

### ✅ Fonctionnalités bonus
- Podcasts audio générables depuis NotebookLM
- Recherche sémantique dans toutes les sources
- Questions/réponses sur le contenu
- Comparaison entre sources

### ✅ Backup Git maintenu
- Toutes les fiches markdown sauvegardées
- Sync Obsidian fonctionnel
- Historique Git complet

## Migration

### Étape 1: Tester (fait ✅)
- [x] MCP NotebookLM installé et authentifié
- [x] Notebook "Veille Tech - Janvier 2026" créé
- [x] Code processor.js créé
- [x] Code notebooklm-sync.js créé
- [x] Code markdown-generator-v2.js créé

### Étape 2: Déployer
- [ ] Tester avec 1 URL depuis Discord
- [ ] Vérifier la fiche générée
- [ ] Vérifier le lien NotebookLM
- [ ] Redémarrer le bot Discord

### Étape 3: Cleanup
- [ ] Traiter les 37 URLs en pending (manuel ou script)
- [ ] Désactiver les launchd batch jobs (3x/jour)
- [ ] Archiver le code V1

## Configuration requise

### Discord Bot
```bash
cd discord-ingest-bot
npm install
# .env déjà configuré
node src/index.js
```

### MCP NotebookLM
```bash
# Déjà installé via uv
notebooklm-mcp-auth  # Déjà fait
```

### Kiro MCP Config
```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "/Users/bertrand/.local/bin/notebooklm-mcp",
      "args": [],
      "disabled": false
    }
  }
}
```

## Notes importantes

1. **MCP Context**: Le code NotebookLM doit tourner dans un contexte Kiro (pas standalone Node.js)
2. **Spool**: Le système de spool reste actif pour retry automatique en cas d'échec
3. **Git**: Toujours commit dans fiches/ + processed/ pour backup
4. **Notebooks mensuels**: Un nouveau notebook est créé automatiquement chaque mois
