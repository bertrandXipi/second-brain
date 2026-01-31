# 📘 Guide Complet : Automatiser The Rundown AI → Discord → NotebookLM

## 🎯 Ce que tu vas accomplir

Automatiser complètement la réception de la newsletter **The Rundown AI** :

1. ✉️ Newsletter arrive dans Gmail (2-3x/jour)
2. 🤖 Script Google extrait le lien "Read Online"
3. 💬 Lien posté automatiquement sur Discord
4. 🤖 Ton bot Discord le traite
5. 📚 NotebookLM analyse le contenu
6. 📝 Fiche markdown créée dans ton repo Git

**Temps d'installation : 10 minutes**  
**Coût : Gratuit** ✨

---

## 📋 Prérequis

- ✅ Tu reçois la newsletter The Rundown AI dans Gmail
- ✅ Tu as un serveur Discord avec ton bot de veille
- ✅ Ton bot Discord fonctionne déjà (sur Google Cloud Run)

---

## 🚀 Installation

### PARTIE 1 : Créer le Webhook Discord (2 minutes)

#### Étape 1.1 : Ouvrir Discord

Aller sur ton serveur Discord où se trouve ton bot.

#### Étape 1.2 : Choisir le canal

Choisir le canal où tu veux recevoir les liens (probablement le même où tu postes actuellement).

#### Étape 1.3 : Créer le Webhook

```
Clic droit sur le canal
  → Modifier le canal
  → Intégrations (menu gauche)
  → Section "Webhooks"
  → Bouton "Créer un webhook"
```

#### Étape 1.4 : Configurer

- **Nom** : `Rundown AI Newsletter`
- **Canal** : Vérifier que c'est le bon

#### Étape 1.5 : Copier l'URL

Cliquer sur **"Copier l'URL du Webhook"**

Tu obtiens quelque chose comme :
```
https://discord.com/api/webhooks/1234567890123456789/abcdefgh...
```

⚠️ **Garde cette URL secrète !**

#### Étape 1.6 : Sauvegarder

Cliquer sur **"Enregistrer les modifications"** en bas.

✅ **Webhook créé !**

---

### PARTIE 2 : Créer le Script Google Apps Script (5 minutes)

#### Étape 2.1 : Ouvrir Google Apps Script

Aller sur : **https://script.google.com**

#### Étape 2.2 : Créer un nouveau projet

Cliquer sur **"Nouveau projet"** (bouton bleu en haut à gauche)

#### Étape 2.3 : Renommer le projet

Cliquer sur "Projet sans titre" en haut et renommer :
```
Gmail to Discord - Rundown AI
```

#### Étape 2.4 : Copier le code

1. Ouvrir le fichier `scripts/gmail-to-discord-automation.js` dans ton éditeur
2. **Tout sélectionner** (Cmd+A ou Ctrl+A)
3. **Copier** (Cmd+C ou Ctrl+C)
4. Retourner dans Google Apps Script
5. **Sélectionner tout le code existant** (il y a un exemple de fonction)
6. **Coller** le nouveau code (Cmd+V ou Ctrl+V)

#### Étape 2.5 : Configurer le Webhook

Trouver la ligne 15 :
```javascript
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN';
```

Remplacer par ton URL de webhook :
```javascript
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1234567890123456789/abcdefgh...';
```

#### Étape 2.6 : Sauvegarder

Cliquer sur l'icône **💾 Enregistrer** ou **Cmd+S** / **Ctrl+S**

✅ **Script configuré !**

---

### PARTIE 3 : Autoriser le Script (2 minutes)

#### Étape 3.1 : Sélectionner la fonction de test

Dans le menu déroulant en haut (où il y a écrit "Sélectionner une fonction"), choisir :
```
testExtraction
```

#### Étape 3.2 : Exécuter

Cliquer sur le bouton **▶️ Exécuter**

#### Étape 3.3 : Autoriser l'accès

Une popup apparaît : **"Autorisation requise"**

1. Cliquer sur **"Examiner les autorisations"**
2. Choisir ton compte Google
3. Une page s'ouvre : **"Google n'a pas validé cette application"**
4. Cliquer sur **"Paramètres avancés"** (en bas)
5. Cliquer sur **"Accéder à Gmail to Discord - Rundown AI (non sécurisé)"**
6. Cliquer sur **"Autoriser"**

⚠️ C'est normal ! C'est ton propre script, donc c'est sûr.

#### Étape 3.4 : Vérifier les logs

1. Cliquer sur **"Affichage"** (menu du haut)
2. Cliquer sur **"Journaux"** (ou **Ctrl+Enter**)

Tu devrais voir :
```
Lien extrait: https://therundown.ai/p/...
```

Si tu vois "Aucun email trouvé", c'est normal si tu n'as pas reçu de newsletter récemment.

✅ **Script autorisé !**

---

### PARTIE 4 : Tester l'Envoi Complet (1 minute)

#### Étape 4.1 : Sélectionner la fonction principale

Dans le menu déroulant, choisir :
```
processRundownEmails
```

#### Étape 4.2 : Exécuter

Cliquer sur **▶️ Exécuter**

#### Étape 4.3 : Vérifier Discord

Aller sur Discord et vérifier ton canal.

Tu devrais voir :
```
📰 The Rundown AI
[Titre de la newsletter]
https://therundown.ai/p/...
```

✅ **Ça marche !** 🎉

---

### PARTIE 5 : Automatiser (1 minute)

#### Étape 5.1 : Ouvrir les Déclencheurs

Dans la barre latérale gauche de Google Apps Script, cliquer sur l'icône **⏰ Déclencheurs**

#### Étape 5.2 : Ajouter un déclencheur

Cliquer sur **"+ Ajouter un déclencheur"** (bouton bleu en bas à droite)

#### Étape 5.3 : Configurer

Une popup s'ouvre. Configurer :

- **Fonction à exécuter** : `processRundownEmails`
- **Source de l'événement** : `Selon un calendrier`
- **Type de déclencheur temporel** : `Minuteur`
- **Intervalle** : `Toutes les 30 minutes`

#### Étape 5.4 : Enregistrer

Cliquer sur **"Enregistrer"** (bouton bleu en bas à droite)

✅ **Automatisation activée !** 🚀

---

## 🎊 C'est terminé !

Ton système est maintenant complètement automatisé :

```
┌─────────────────────────────────────────────────┐
│  Newsletter arrive dans Gmail                   │
│  ↓ (toutes les 30 min, le script vérifie)      │
│  Script Google extrait le lien                  │
│  ↓                                              │
│  Lien posté sur Discord                         │
│  ↓                                              │
│  Bot Discord traite le lien                     │
│  ↓                                              │
│  NotebookLM analyse                             │
│  ↓                                              │
│  Fiche markdown créée dans Git                  │
└─────────────────────────────────────────────────┘
```

---

## 🔍 Vérification

Attendre la prochaine newsletter (2-3 fois par jour) et vérifier :

1. ✅ Le lien apparaît sur Discord automatiquement
2. ✅ Ton bot Discord réagit avec 👀
3. ✅ L'email Gmail est marqué comme lu
4. ✅ L'email a le label "Processed/Rundown"
5. ✅ Une fiche markdown est créée dans `batch-processor/workdir/repo/fiches/`

---

## 📊 Monitoring

### Voir l'historique des exécutions

Dans Google Apps Script :
1. Cliquer sur **📋 Exécutions** (barre latérale gauche)
2. Voir les 10 dernières exécutions
3. Vérifier qu'il n'y a pas d'erreurs (icône ✅ ou ❌)

### Voir les logs d'une exécution

1. Dans **Exécutions**, cliquer sur une ligne
2. Voir les détails et les logs

---

## 🔧 Dépannage

### Problème : "Aucun email trouvé"

**Cause** : Pas de nouvel email de The Rundown AI

**Solution** : Attendre la prochaine newsletter ou vérifier que tu es bien abonné

### Problème : "Aucun lien Read Online trouvé"

**Cause** : Le format de l'email a changé

**Solution** :
1. Exécuter la fonction `showAllLinks` pour voir tous les liens
2. Adapter la regex dans `extractReadOnlineLink()`

### Problème : "Erreur webhook Discord"

**Cause** : URL du webhook incorrecte

**Solution** :
1. Vérifier qu'il n'y a pas d'espace dans l'URL
2. Copier à nouveau l'URL depuis Discord
3. Tester avec `testDiscordWebhook()`

### Problème : "Service invoked too many times"

**Cause** : Quota Google dépassé (90 min/jour en gratuit)

**Solution** : Augmenter l'intervalle du déclencheur à 1 heure au lieu de 30 minutes

---

## 🎨 Personnalisation

### Changer la fréquence de vérification

Dans les **Déclencheurs** :
1. Cliquer sur les 3 points à droite du déclencheur
2. Modifier
3. Changer l'intervalle (15 min, 1h, etc.)

### Ajouter d'autres newsletters

Dupliquer le script et changer :
```javascript
const GMAIL_SEARCH_QUERY = 'from:autre-newsletter@example.com is:unread';
const LABEL_NAME = 'Processed/AutreNewsletter';
```

### Changer le format du message Discord

Dans la fonction `sendToDiscord()`, modifier le `payload` :
```javascript
const payload = {
  content: `🔥 Nouvelle newsletter : ${url}`,
  embeds: [{
    title: '📰 The Rundown AI',
    description: subject,
    color: 15158332, // Rouge
    footer: { text: 'Auto-envoyé depuis Gmail' }
  }]
};
```

---

## 📚 Ressources

- **Guide détaillé** : `docs/SETUP-GMAIL-TO-DISCORD.md`
- **Configuration webhook** : `docs/DISCORD-WEBHOOK-SETUP.md`
- **Scripts de test** : `scripts/test-gmail-extraction.js`
- **README** : `scripts/README-GMAIL-AUTOMATION.md`

---

## 🆘 Besoin d'aide ?

1. Vérifier les logs dans Google Apps Script
2. Tester avec les fonctions de debug (`testWithRealEmail`, `showAllLinks`)
3. Vérifier que le webhook Discord fonctionne avec `testDiscordWebhook()`
4. Consulter les guides dans `docs/`

---

## 🎉 Félicitations !

Tu as maintenant un système de veille complètement automatisé ! 🚀

Plus besoin de copier-coller manuellement les liens, tout se fait tout seul. 🎊
🎯 ÉTAPE 1 : Créer le Webhook Discord (2 minutes)
Ouvrir Discord sur ton ordinateur ou navigateur
Aller sur ton serveur où se trouve ton bot de veille
Choisir le canal où tu veux recevoir les liens (probablement le même où tu postes actuellement)
Clic droit sur le canal → Modifier le canal
Dans le menu de gauche : Intégrations
Section Webhooks → Bouton "Créer un webhook"
Nommer le webhook : Rundown AI Newsletter
Cliquer sur "Copier l'URL du Webhook"
Sauvegarder
Tu as maintenant une URL qui ressemble à :

https://discord.com/api/webhooks/1234567890/abcdefgh...
⚠️ Garde cette URL, tu en auras besoin à l'étape suivante !

🎯 ÉTAPE 2 : Créer le script Google Apps Script (5 minutes)
Ouvrir un nouvel onglet et aller sur : https://script.google.com

Cliquer sur "Nouveau projet" (bouton bleu en haut à gauche)

Renommer le projet (cliquer sur "Projet sans titre" en haut) :

Gmail to Discord - Rundown AI
Ouvrir le fichier 
gmail-to-discord-automation.js
 dans ton éditeur Kiro

Tout sélectionner (Cmd+A ou Ctrl+A) et copier (Cmd+C ou Ctrl+C)

Retourner dans Google Apps Script et sélectionner tout le code qui est déjà là

Coller le nouveau code (Cmd+V ou Ctrl+V)

IMPORTANT : Trouver la ligne 15 qui dit :

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN';
Remplacer par l'URL que tu as copiée à l'étape 1 :

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1234567890/abcdefgh...';
Sauvegarder : Cliquer sur l'icône disquette 💾 ou Cmd+S / Ctrl+S

🎯 ÉTAPE 3 : Autoriser et activer (3 minutes)
A. Autoriser l'accès Gmail
Dans le menu déroulant en haut (où il y a "Sélectionner une fonction"), choisir : testExtraction

Cliquer sur le bouton ▶️ Exécuter

Une popup apparaît : "Autorisation requise"

Cliquer sur "Examiner les autorisations"
Choisir ton compte Google
Cliquer sur "Paramètres avancés" (en bas)
Cliquer sur "Accéder à Gmail to Discord - Rundown AI (non sécurisé)"
Cliquer sur "Autoriser"
Attendre que l'exécution se termine

B. Vérifier que ça marche
Dans le menu déroulant, choisir : verifyCompleteSetup

Cliquer sur ▶️ Exécuter

Cliquer sur "Affichage" → "Journaux" (ou Ctrl+Enter)

Tu devrais voir :

✅ Configuration OK
✅ Accès Gmail OK
✅ Webhook Discord OK
Aller sur Discord : tu devrais voir un message de test ! 🎉

C. Activer l'automatisation
Dans la barre latérale gauche de Google Apps Script, cliquer sur l'icône ⏰ Déclencheurs

Cliquer sur "+ Ajouter un déclencheur" (bouton bleu en bas à droite)

Configurer :

Fonction à exécuter : processRundownEmails
Source de l'événement : Selon un calendrier
Type de déclencheur temporel : Minuteur
Intervalle : Toutes les 30 minutes
Cliquer sur "Enregistrer"

✅ C'EST FAIT !
Ton système est maintenant actif ! 🚀

Pour vérifier que tout fonctionne :

Attendre la prochaine newsletter The Rundown AI (2-3 fois par jour)
Le lien devrait apparaître automatiquement sur Discord
Ton bot Discord devrait le traiter automatiquement
Besoin d'aide ? Dis-moi où tu bloques et je t'aide !

Credits used: 0,44
Elapsed time: 22s


sauvegarde ta 






Claude Opus 4.5