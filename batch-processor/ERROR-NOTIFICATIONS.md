# Système de notifications d'erreur

## Vue d'ensemble

Le batch processor dispose maintenant d'un système robuste de notifications d'erreur qui alerte automatiquement via Discord en cas de problème.

## Types de notifications

### 1. Erreurs fatales
Envoyées quand le batch processor échoue complètement.
- **Déclencheur** : Exception non gérée dans le processus principal
- **Action** : Notification Discord + arrêt du processus

### 2. Échecs Git
Envoyées quand la synchronisation Git échoue.
- **Pull failed** : Impossible de récupérer les dernières modifications
- **Push failed** : Impossible d'envoyer les commits
- **Action** : Notification Discord + arrêt du processus

### 3. Échecs Obsidian
Envoyées quand la synchronisation du vault Obsidian échoue.
- **Déclencheur** : `git pull` échoue dans le vault local
- **Action** : Notification Discord (le batch continue)

### 4. Accumulation de liens
Envoyées quand trop de liens s'accumulent en attente.
- **Seuil** : Plus de 10 liens en attente
- **Cause possible** : Le batch ne s'exécute pas ou échoue systématiquement
- **Action** : Notification Discord (le batch continue)

### 5. Échecs de traitement
Envoyées quand des liens individuels échouent.
- **Déclencheur** : Un ou plusieurs liens n'ont pas pu être traités
- **Action** : Notification Discord après le batch

## Health Check

Un script de surveillance (`health-check.js`) vérifie l'état du système :

### Vérifications
- **Liens en attente** : Seuil de 5 liens
- **Liens échoués** : Seuil de 10 liens
- **Dernière exécution** : Maximum 8 heures

### Exécution
- **Automatique** : Tous les jours à 12h (via launchd)
- **Manuelle** : `node src/health-check.js`

### Installation
```bash
cp com.veille.healthcheck.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.veille.healthcheck.plist
```

## Configuration

Le webhook Discord est configuré dans `.env` :
```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
```

Si le webhook n'est pas configuré, les notifications sont simplement ignorées (pas d'erreur).

## Format des notifications

Les notifications Discord incluent :
- 🚨 Emoji d'alerte
- **Contexte** : Description du problème
- **Date** : Timestamp ISO
- **Erreur** : Message d'erreur
- ⚠️ Indication d'action requise

## Avantages

1. **Détection rapide** : Vous êtes alerté immédiatement en cas de problème
2. **Contexte clair** : Chaque notification indique le type de problème
3. **Pas de perte de données** : Vous ne restez plus 10 jours sans savoir qu'il y a un problème
4. **Surveillance proactive** : Le health check détecte les problèmes avant qu'ils ne s'aggravent

## Logs

Les logs détaillés restent disponibles dans :
- `batch.log` : Sortie standard du batch
- `batch-error.log` : Erreurs du batch
- `healthcheck.log` : Sortie du health check
- `healthcheck-error.log` : Erreurs du health check
