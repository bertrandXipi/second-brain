# V2 - Intégration NotebookLM

## Objectif
Remplacer le résumé Gemini par l'ajout automatique des liens dans NotebookLM via MCP.

## Pourquoi NotebookLM ?
- ✅ Meilleurs résumés et analyses
- ✅ Génération de podcasts automatique
- ✅ Recherche sémantique native
- ✅ Organisation par notebooks/sources
- ✅ Pas de problème de quotas
- ✅ Interface web pour consultation

## Architecture V2

### Flux de traitement
1. **Discord** → Récupération des liens (inchangé)
2. **Fetch Content** → Extraction du contenu (inchangé)
3. **NotebookLM MCP** → Ajout de la source dans NotebookLM (nouveau)
4. **Markdown simplifié** → Métadonnées + lien NotebookLM (modifié)
5. **Git sync** → Commit et push (inchangé)

### Changements nécessaires

#### 1. Installation MCP NotebookLM
```bash
# Ajouter dans .kiro/settings/mcp.json
{
  "mcpServers": {
    "notebooklm": {
      "command": "uvx",
      "args": ["notebooklm-mcp-server"],
      "env": {},
      "disabled": false
    }
  }
}
```

#### 2. Nouveau fichier: `src/notebooklm-sync.js`
Remplace `llm-summarize.js`

**Fonctions** :
- `addSourceToNotebook(url, content, metadata)` - Ajoute une source
- `getNotebookId()` - Récupère ou crée le notebook de veille
- `generateSummary(sourceId)` - Demande un résumé à NotebookLM

#### 3. Modifier `src/markdown-generator.js`
**Nouveau format** :
```markdown
---
title: [Titre extrait]
source_url: [URL]
notebooklm_source_id: [ID de la source]
notebooklm_notebook_id: [ID du notebook]
date_captured: [Date]
category: [Catégorie]
tags: []
---

## Lien NotebookLM
[Voir dans NotebookLM](https://notebooklm.google.com/notebook/[ID])

## Métadonnées
- Source: [URL]
- Type: [youtube/reddit/linkedin/etc]
- Ajouté le: [Date]

## Note originale
[Note Discord si présente]
```

#### 4. Modifier `src/index.js`
Remplacer :
```javascript
const llmResult = await summarizeWithGemini(textContent, item.tags);
```

Par :
```javascript
const notebookResult = await addToNotebookLM(item.url, textContent, {
  title: fetchResult.title,
  tags: item.tags,
  source: item.source
});
```

## Configuration

### Variables d'environnement (.env)
```bash
# NotebookLM
NOTEBOOKLM_NOTEBOOK_ID=  # ID du notebook principal de veille
NOTEBOOKLM_AUTO_SUMMARY=true  # Générer automatiquement les résumés
```

## Avantages de la V2

1. **Pas de quotas** - NotebookLM est gratuit et sans limite
2. **Meilleure qualité** - Résumés plus pertinents
3. **Podcasts** - Génération automatique de podcasts
4. **Recherche** - Recherche sémantique dans toutes les sources
5. **Centralisation** - Tout dans un seul notebook
6. **Collaboration** - Partage facile du notebook

## Migration

### Étape 1 : Tester sur une branche
- ✅ Créer branche `feature/notebooklm-v2`
- ⏳ Installer MCP NotebookLM
- ⏳ Créer `notebooklm-sync.js`
- ⏳ Adapter `index.js` et `markdown-generator.js`
- ⏳ Tester avec 5-10 liens

### Étape 2 : Validation
- Vérifier que les sources sont bien ajoutées
- Vérifier la qualité des résumés
- Tester la recherche dans NotebookLM

### Étape 3 : Déploiement
- Merger dans main
- Mettre à jour les launchd services
- Migrer les anciens liens (optionnel)

## TODO
- [ ] Installer MCP NotebookLM
- [ ] Créer notebook de veille dans NotebookLM
- [ ] Implémenter `notebooklm-sync.js`
- [ ] Adapter `markdown-generator.js`
- [ ] Modifier `index.js`
- [ ] Tester avec quelques liens
- [ ] Documenter l'utilisation
