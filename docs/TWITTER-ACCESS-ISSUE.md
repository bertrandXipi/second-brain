# Problème d'accès aux contenus Twitter/X.com

## Diagnostic

Le système de veille fonctionne correctement, mais Twitter/X.com bloque l'accès au contenu réel des tweets. Quand le bot essaie de récupérer le contenu d'un tweet, il ne récupère que le message d'erreur :

```
Some privacy related extensions may cause issues on x.com. Please disable them and try again.
```

NotebookLM analyse donc ce message d'erreur au lieu du contenu réel du tweet.

## Preuves

Toutes les fiches Twitter récemment créées analysent le même message d'erreur :
- `2026-01-25-https-x-com-wesroth-status-2013693268190437410-s-12.md`
- `2026-01-25-https-x-com-aiedge-status-2013641070815650252-s-12.md`
- `2026-01-27-https-x-com-turnkeychicago-status-2015801470810013742-s-12.md`

## Solutions possibles

### 1. Utiliser l'API Twitter/X (Recommandé)
- S'inscrire à l'API Twitter/X
- Utiliser les endpoints officiels pour récupérer le contenu des tweets
- Avantages : Accès fiable, métadonnées complètes
- Inconvénients : Coût potentiel, limites de taux

### 2. Utiliser un service de scraping spécialisé
- Services comme ScrapFly, Bright Data, ou Apify
- Ils gèrent les anti-bot et les restrictions
- Avantages : Pas besoin d'API officielle
- Inconvénients : Coût, dépendance externe

### 3. Modifier les headers et user-agent
- Simuler un navigateur réel avec des headers appropriés
- Utiliser des proxies rotatifs
- Avantages : Solution technique simple
- Inconvénients : Peut être détecté et bloqué

### 4. Utiliser un navigateur headless avec stealth
- Puppeteer avec stealth plugin
- Playwright avec des options anti-détection
- Avantages : Simule un vrai navigateur
- Inconvénients : Plus lourd, plus lent

### 5. Filtrer les liens Twitter en amont
- Détecter les liens Twitter dans Discord
- Les traiter différemment ou les ignorer
- Avantages : Évite le problème
- Inconvénients : Perte de contenu potentiellement intéressant

## Recommandation

**Solution 1 (API Twitter)** est la plus robuste à long terme. En attendant, **Solution 5 (filtrage)** peut être implémentée rapidement pour éviter de créer des fiches inutiles.

## Code à modifier

### Filtrage immédiat (Solution 5)
Dans `discord-ingest-bot/src/processor.js`, ajouter une détection des liens Twitter :

```javascript
// Détecter les liens Twitter/X.com
if (url.includes('twitter.com') || url.includes('x.com')) {
  console.log('[processor] Twitter link detected - skipping for now');
  return null; // ou traiter différemment
}
```

### Amélioration du fetch (Solution 3)
Dans `batch-processor/src/fetch-content.js`, améliorer les headers :

```javascript
const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0'
};
```