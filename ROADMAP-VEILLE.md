# Roadmap Veille IA - Idées et Évolutions

## État actuel (25 janvier 2026)

Le système de veille est fonctionnel :
- Discord bot capture les URLs automatiquement
- NotebookLM MCP server sur Google Cloud traite les sources
- Fiches markdown générées avec résumés détaillés en français (500+ mots)
- Sync Git → Obsidian toutes les 6h
- Notebook mensuel "Veille Tech - [Mois] [Année]"

---

## Slash Commands Discord (Priorité haute)

Interroger la veille directement depuis Discord :

| Commande | Description |
|----------|-------------|
| `/ask [question]` | Interroge toutes les sources avec une question libre |
| `/insight` | Un insight actionnable du jour |
| `/idea` | Une idée business basée sur la veille |
| `/connexion` | Trouve une connexion inattendue entre 2 sources |
| `/thread [sujet]` | Génère un thread Twitter/LinkedIn prêt à poster |
| `/podcast` | Lance la génération d'un podcast audio (deep dive) |
| `/flashcards` | Génère des flashcards sur les dernières sources |
| `/stats` | Nombre de sources, notebooks, dernière activité |
| `/daily on/off` | Active/désactive le daily insight à 8h |
| `/notebook [nom]` | Change le notebook cible pour les queries |

---

## Notifications automatiques (Priorité haute)

Push Discord → notification téléphone

### Daily Insight (8h chaque matin)
- Query : "Donne-moi UN insight actionnable basé sur les sources ajoutées cette semaine"
- Court, percutant, actionnable

### Idée business du jour
- Query : "Propose une idée de micro-SaaS ou side-project basée sur les problèmes identifiés dans mes sources"

### Connexion inattendue (hebdo)
- Query : "Trouve une connexion surprenante entre 2 sources qui n'ont rien à voir a priori"
- Stimule la créativité et les associations d'idées

---

## Contenus générés automatiquement

### Podcast hebdo
- Utiliser `audio_overview_create` chaque dimanche
- Format : deep_dive ou debate pour avoir plusieurs angles
- Écoutable en déplacement

### Flashcards pour mémoriser
- `flashcards_create` sur les concepts clés
- Export possible vers Anki
- Révision dans Obsidian

### Thread social prêt à poster
- Query : "Rédige un thread de 5 tweets sur [sujet X] basé sur mes sources"
- Format adapté Twitter ou LinkedIn

### Infographies
- `infographic_create` pour visualiser les concepts
- Partageables sur les réseaux

---

## Organisation des notebooks

### Par thème (pas juste par mois)
Créer des notebooks thématiques pour des queries ultra-ciblées :
- "IA Agents"
- "Vibe Coding"
- "Business Models IA"
- "Prompt Engineering"
- "Outils No-Code"

### Notebook "Idées à creuser"
- Y mettre les sources les plus prometteuses
- Query hebdo : "Quelle idée mérite que j'y passe du temps cette semaine ?"

---

## Digest hebdo amélioré

Chaque dimanche, générer un digest qui :
- Résume les X sources de la semaine
- Identifie les patterns émergents
- Propose des connexions entre concepts
- Suggère des actions concrètes

---

## Tagging intelligent et graphe de concepts

- Extraire automatiquement les tags/concepts de chaque fiche
- Construire un graphe de concepts dans Obsidian (liens `[[concept]]`)
- Visualiser les clusters avec le graph view d'Obsidian
- Détecter les sujets "chauds" (plusieurs sources convergent)

---

## Alertes de convergence

Quand plusieurs sources parlent du même sujet :
- Notification Discord : "3 sources cette semaine parlent de X"
- Synthèse croisée automatique
- Signal fort = sujet à creuser

---

## Notes techniques

### NotebookLM comme RAG gratuit
- 300 sources par notebook
- Queries illimitées
- Génération de contenus variés (audio, flashcards, infographies, mind maps)
- API via MCP = automatisation totale

### Architecture actuelle
```
Discord → Bot (Google Compute) → MCP Server (localhost:8000) → NotebookLM API
                                      ↓
                              Git push → Obsidian sync
```

### Prochaines étapes techniques
1. Implémenter les slash commands Discord
2. Ajouter le cron pour daily insight
3. Créer les notebooks thématiques
4. Améliorer le tagging automatique dans les fiches

---

## Idées en vrac

- Mode "recherche" : ajouter 50 sources sur un sujet précis, générer un rapport complet
- Export PDF des meilleures fiches du mois
- Intégration Notion en plus d'Obsidian
- Bot Telegram en alternative à Discord
- Dashboard web pour visualiser la veille
- Scoring des sources (pertinence, qualité)
