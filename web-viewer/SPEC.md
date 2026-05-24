# Web Viewer — SPEC

> Source de vérité figée. Les agents 2-6 implémentent contre ce document.

## 1. Vue d'ensemble

**Objectif.** Interface web *lecture seule* qui donne une vue exhaustive (overview + exploration) du contenu de veille du projet second-brain : fiches NotebookLM, digests hebdo, insights philosophiques.

**Périmètre.** Visualisation uniquement : liste/filtre, lecture détaillée, synthèse temporelle, graph de connexions.

**Non-objectifs.** Pas de capture/ingestion, pas d'édition de fiches, pas d'auth, pas de DB, pas d'API runtime, pas d'analytics.

**Modèle de déploiement.** App React statique. Un index JSON est régénéré à la demande (`npm run build-index`) en scannant le vault Obsidian `fiches-veille/`, puis l'app le charge une fois au boot.

## 2. Layout global

- **Header** persistant : titre `Second Brain — Veille`, nav vers les 4 routes (`Liste`, `Détail` masqué/contextuel, `Synthèse`, `Graph`).
- **Main** : `<Outlet />` react-router.
- **Footer** facultatif : compteurs (`379 fiches · 5 digests · 5 insights · build YYYY-MM-DD`).

### Routes

| Path             | Vue            | Owner    |
|------------------|----------------|----------|
| `/`              | ListView       | Agent 3  |
| `/fiche/:slug`   | DetailView     | Agent 4  |
| `/synthese`      | SyntheseView   | Agent 5  |
| `/graph`         | GraphView      | Agent 6  |
| `*`              | redirect → `/` | Agent 1  |

## 3. Contrat de données (FIGÉ)

`web-viewer/src/types.ts` exporte exactement :

```typescript
export type SourceType = 'article' | 'youtube' | 'video' | 'tweet' | 'pdf' | 'other';
export type Status = 'published' | 'draft' | 'pending' | 'failed';

export interface Fiche {
  slug: string;            // basename .md sans extension, ex: "2026-02-06-opus-4-6-is"
  month: string;           // "YYYY-MM" = dossier parent
  title: string;
  source_url: string;
  source_type: SourceType;
  date_captured: string;   // ISO 8601
  date_processed?: string;
  status: Status;
  language?: string;
  tags: string[];
  keywords: string[];
  notebooklm_url?: string;
  notebooklm_notebook_id?: string;
  ingest_source?: string;
  discord_message_url?: string;
  body_markdown: string;
  body_excerpt: string;    // ~300 chars sans markdown pour preview
  word_count: number;
}

export interface Digest {
  slug: string;            // "YYYY-WXX"
  year: number;
  week: number;
  fiches_count: number;
  generated_at: string;
  body_markdown: string;
  linked_fiche_slugs: string[]; // extraits des [[...]] du corps
}

export interface Insight {
  slug: string;            // "YYYY-WXX"
  year: number;
  week: number;
  generated_at: string;
  focus?: string;
  body_markdown: string;
}

export interface FacetCount {
  name: string;
  count: number;
}

export interface IndexFile {
  generated_at: string;
  vault_path: string;
  counts: { fiches: number; digests: number; insights: number };
  fiches: Fiche[];
  digests: Digest[];
  insights: Insight[];
  facets: {
    months: string[];               // triés desc
    source_types: string[];
    tags: FacetCount[];             // triés par count desc
    keywords: FacetCount[];         // triés par count desc
    statuses: string[];
  };
}
```

**Aucun agent ne modifie ce fichier.** Si un besoin émerge, l'agent ouvre une note dans son commit et l'orchestrateur arbitre.

## 4. Conventions

- **slug fiche** = basename du `.md` sans extension. Slug digest/insight = nom de fichier sans extension (`2025-W50`).
- **month** = nom du dossier parent (`fiches/2026-02/...` → `2026-02`).
- **tri par défaut** : `date_captured` desc pour fiches, `(year, week)` desc pour digests/insights.
- **Vault source** : `/Users/bertrand/Sites/fiches-veille` (paramétrable via env `VAULT_PATH`).
- **Dossiers ignorés** : `glossaire/`, `mobile-share/`, `.obsidian/`, `.git/`.
- **Fiches sans frontmatter complet** : skipper avec warning console (status='failed' n'est PAS produit synthétiquement).
- **Tags vides** : `tags: []` est valide ; le champ `keywords` est la source primaire pour le graph.
- **linked_fiche_slugs** dans digest : parser `[[2025-12/2025-12-13-...]]` ou `[[2025-12-13-...]]` et extraire le basename comme slug.

## 5. Structure de fichiers

```
web-viewer/
  SPEC.md                  ← ce document (Agent 1)
  README.md                ← quickstart (Agent 1)
  package.json             ← deps figées (Agent 1)
  vite.config.ts           ← (Agent 1)
  tsconfig.json            ← (Agent 1)
  index.html               ← (Agent 1)
  .gitignore               ← (Agent 1)
  public/
    index.json             ← généré par Agent 2 (gitignored)
  scripts/
    build-index.ts         ← (Agent 2)
  src/
    main.tsx               ← (Agent 1, FIGÉ)
    App.tsx                ← (Agent 1, FIGÉ — déjà câble les 4 routes)
    types.ts               ← (Agent 1, FIGÉ)
    data/
      useIndex.ts          ← (Agent 1, FIGÉ)
    components/
      Header.tsx           ← (Agent 1)
      Header.module.css    ← (Agent 1)
    styles/
      global.css           ← (Agent 1)
    routes/
      ListView.tsx         ← (Agent 3, overwrite stub)
      DetailView.tsx       ← (Agent 4, overwrite stub)
      SyntheseView.tsx     ← (Agent 5, overwrite stub)
      GraphView.tsx        ← (Agent 6, overwrite stub)
      list/                ← sous-composants Agent 3 libre
      detail/              ← sous-composants Agent 4 libre
      synthese/            ← sous-composants Agent 5 libre
      graph/               ← sous-composants Agent 6 libre
```

## 6. Conventions de nommage & style

- Composants React : `PascalCase.tsx`, **export par défaut** (les routes stubs en dépendent).
- Hooks : `camelCase.ts` préfixés `use`.
- Styles : CSS modules (`Foo.module.css`) ou `global.css` pour reset/vars.
- Variables CSS dans `:root` : `--bg`, `--fg`, `--muted`, `--accent`, `--border`, `--radius`, `--font-mono`.
- Pas d'emojis dans le code/UI. Pas de Tailwind/MUI/shadcn.
- TypeScript strict. Pas de `any` sauf si annoté `// eslint-disable` avec raison.

## 7. Performance

- `index.json` estimé ~5-10 MB. Chargé **une seule fois** par `useIndex()` (cache module-level + état React partagé).
- ListView : virtualisation obligatoire via `@tanstack/react-virtual` (379 fiches min, anticipe la croissance).
- Recherche : `fuse.js` indexé sur `title + keywords` au mount, mémorisé.
- GraphView : limiter d'office à ~150 nœuds visibles + filtre keyword ; pas tous les 379 d'un coup.
- DetailView : le corps Markdown peut être long → pas de re-render inutile.

## 8. Stack figée (NE PAS DÉVIER)

| Couche       | Lib                                              |
|--------------|--------------------------------------------------|
| Build        | vite, @vitejs/plugin-react                       |
| Lang         | typescript                                       |
| UI           | react 18, react-dom                              |
| Routing      | react-router-dom v6                              |
| Markdown     | react-markdown, remark-gfm                       |
| Recherche    | fuse.js                                          |
| Virtualisation | @tanstack/react-virtual                        |
| Graph        | react-force-graph-2d                             |
| Parsing YAML | gray-matter (Node)                               |
| Runner script| tsx                                              |

## 9. Découpage agents — règles de coexistence

Les agents 2-6 travaillent **en parallèle sur la même branche**. Pour éviter les conflits :

- **Personne ne touche** : `App.tsx`, `main.tsx`, `types.ts`, `useIndex.ts`, `Header.tsx`, `global.css`, `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`. Ces fichiers sont posés par Agent 1 et figés.
- **Chaque agent ne crée/modifie que** dans son périmètre :
  - Agent 2 → `scripts/build-index.ts` uniquement.
  - Agent 3 → `src/routes/ListView.tsx` + `src/routes/list/**`.
  - Agent 4 → `src/routes/DetailView.tsx` + `src/routes/detail/**`.
  - Agent 5 → `src/routes/SyntheseView.tsx` + `src/routes/synthese/**`.
  - Agent 6 → `src/routes/GraphView.tsx` + `src/routes/graph/**`.
- **Données** : tous lisent via `useIndex()` (typé `IndexFile`). Si la donnée nécessaire manque, créer un dérivé local — **pas modifier `types.ts`**.
- **Commits** : chaque agent fait son propre commit `feat(web-viewer/agent-N): <description>`. Pas de squash.

## 10. Quickstart

```bash
cd web-viewer
npm install
npm run build-index    # scanne /Users/bertrand/Sites/fiches-veille → public/index.json
npm run dev            # http://localhost:5173
```
