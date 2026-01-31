# Configuration Gmail → Discord pour The Rundown AI

## Étape 1 : Créer un Webhook Discord

1. Ouvrir Discord et aller sur ton serveur
2. Clic droit sur le canal où tu veux recevoir les liens
3. **Paramètres du canal** → **Intégrations** → **Webhooks**
4. Cliquer sur **Nouveau Webhook**
5. Nommer le webhook (ex: "Rundown AI Newsletter")
6. **Copier l'URL du Webhook** (format: `https://discord.com/api/webhooks/123456789/abcdefgh...`)

## Étape 2 : Créer le script Google Apps Script

1. Ouvrir https://script.google.com
2. Cliquer sur **Nouveau projet**
3. Renommer le projet : "Gmail to Discord - Rundown AI"
4. Coller le code du fichier `scripts/gmail-to-discord-automation.js`
5. **IMPORTANT** : Modifier les variables de configuration :

```javascript
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/TON_WEBHOOK_ICI';
const GMAIL_SEARCH_QUERY = 'from:news@daily.therundown.ai is:unread';
const LABEL_NAME = 'Processed/Rundown';
```

6. Sauvegarder (Ctrl+S ou Cmd+S)

## Étape 3 : Autoriser le script

1. Cliquer sur **Exécuter** (icône ▶️) avec la fonction `testExtraction` sélectionnée
2. Une popup apparaît : **Autorisation requise**
3. Cliquer sur **Examiner les autorisations**
4. Choisir ton compte Google
5. Cliquer sur **Paramètres avancés** → **Accéder à [nom du projet] (non sécurisé)**
6. Cliquer sur **Autoriser**

## Étape 4 : Tester manuellement

1. Dans le menu déroulant des fonctions, sélectionner `testExtraction`
2. Cliquer sur **Exécuter** (▶️)
3. Vérifier les logs : **Affichage** → **Journaux** (Ctrl+Enter)
4. Tu devrais voir : `Lien extrait: https://therundown.ai/...`

Si ça fonctionne, tester l'envoi complet :

1. Sélectionner la fonction `processRundownEmails`
2. Cliquer sur **Exécuter**
3. Vérifier Discord : le lien devrait apparaître !

## Étape 5 : Automatiser avec un déclencheur

1. Dans Apps Script, cliquer sur l'icône **Déclencheurs** (⏰) dans la barre latérale gauche
2. Cliquer sur **Ajouter un déclencheur** (en bas à droite)
3. Configurer :
   - **Fonction à exécuter** : `processRundownEmails`
   - **Source de l'événement** : `Selon un calendrier`
   - **Type de déclencheur temporel** : `Minuteur`
   - **Intervalle** : `Toutes les 30 minutes` (ou `Toutes les heures`)
4. Cliquer sur **Enregistrer**

## Étape 6 : Vérifier que ça fonctionne

Attendre la prochaine newsletter (2-3 fois par jour) et vérifier :

1. ✅ Le lien apparaît sur Discord
2. ✅ L'email Gmail est marqué comme lu
3. ✅ L'email a le label "Processed/Rundown"

## 🔧 Dépannage

### Le lien n'est pas extrait

Vérifier les logs :
1. **Affichage** → **Journaux d'exécution**
2. Chercher les erreurs

Si "Aucun lien Read Online trouvé", modifier la fonction `extractReadOnlineLink` :

```javascript
function extractReadOnlineLink(htmlBody) {
  // Afficher le HTML pour debug
  Logger.log('HTML Body (premiers 500 caractères):');
  Logger.log(htmlBody.substring(0, 500));
  
  // ... reste du code
}
```

### Le webhook Discord ne fonctionne pas

Tester le webhook manuellement :

```bash
curl -X POST "https://discord.com/api/webhooks/TON_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test depuis curl"}'
```

### Erreur "Service invoked too many times"

Google Apps Script a des quotas :
- **Gratuit** : 90 minutes d'exécution par jour
- **Google Workspace** : 6 heures par jour

Solution : Augmenter l'intervalle du déclencheur (toutes les heures au lieu de 30 min)

## 📊 Monitoring

Voir l'historique des exécutions :
1. Cliquer sur **Exécutions** (icône 📋) dans la barre latérale
2. Voir les succès/échecs des dernières exécutions

## 🎯 Prochaines étapes

Une fois que les liens arrivent sur Discord, ton bot existant les traitera automatiquement et les enverra sur NotebookLM !

Le workflow complet sera :
```
Gmail → Apps Script → Discord → Bot Discord → NotebookLM → Fiches Markdown
```
