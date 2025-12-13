# Batch Processor

Traite les URLs en attente dans `mobile-share/pending/` et génère des fiches Markdown.

## Prérequis

- Node.js 20+
- Gemini CLI installé et configuré (`gemini` accessible dans le PATH)
- Repo `fiches-veille` cloné localement

## Installation

```bash
npm install
cp .env.example .env
# Éditer .env avec le chemin vers fiches-veille
```

## Utilisation

```bash
npm start
```

Le script va :
1. Lire les fichiers `pending/*.json`
2. Fetch le contenu de chaque URL
3. Extraire le texte principal (Readability)
4. Appeler Gemini pour résumer
5. Générer une fiche Markdown dans `fiches/YYYY-MM/`
6. Déplacer le JSON vers `processed/` ou `failed/`
7. Commit + push sur GitHub

## Structure des fiches

Chaque fiche contient :
- Frontmatter YAML (métadonnées)
- Résumé
- Points clés
- Concepts liés (wikilinks Obsidian)
- Note originale
- Lien source
