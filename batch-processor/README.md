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

## Notifications d'erreur

Le système envoie automatiquement des notifications Discord en cas de problème :

- **Erreur fatale** : Échec complet du batch processor
- **Échec Git** : Problème de pull/push vers GitHub
- **Échec Obsidian** : Problème de synchronisation du vault
- **Accumulation de liens** : Plus de 10 liens en attente (signe d'un problème)
- **Échecs de traitement** : Liens qui n'ont pas pu être traités

### Health Check

Un script de surveillance vérifie quotidiennement :
- Nombre de liens en attente (seuil: 5)
- Nombre de liens échoués (seuil: 10)
- Dernière exécution du batch (seuil: 8h)

Pour lancer manuellement :
```bash
node src/health-check.js
```

Pour installer le health check automatique :
```bash
cp com.veille.healthcheck.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.veille.healthcheck.plist
```

## Structure des fiches

Chaque fiche contient :
- Frontmatter YAML (métadonnées)
- Résumé
- Points clés
- Concepts liés (wikilinks Obsidian)
- Note originale
- Lien source
