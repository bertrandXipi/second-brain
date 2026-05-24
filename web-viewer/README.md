# Second Brain — Web Viewer

Interface web *lecture seule* du vault de veille (`fiches-veille/`).

## Quickstart

```bash
cd web-viewer
npm install
npm run build-index    # scanne /Users/bertrand/Sites/fiches-veille → public/index.json
npm run dev            # http://localhost:5173
```

Pour pointer un autre vault : `VAULT_PATH=/chemin/du/vault npm run build-index`.

Voir [SPEC.md](./SPEC.md) pour le contrat de données et le découpage.
