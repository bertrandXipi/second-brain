# 🎣 Configuration du Webhook Discord

## Qu'est-ce qu'un Webhook ?

Un webhook est une URL spéciale qui permet d'envoyer des messages sur Discord depuis l'extérieur (comme depuis Google Apps Script).

## 📍 Étapes pour créer un Webhook

### 1. Ouvrir Discord

Aller sur ton serveur Discord où se trouve déjà ton bot de veille.

### 2. Choisir le canal

Choisir le canal où tu veux recevoir les liens de newsletter.

**Recommandation** : Utiliser le même canal que celui où tu postes actuellement tes liens manuellement.

### 3. Accéder aux paramètres du canal

```
Clic droit sur le canal → Modifier le canal
```

Ou cliquer sur l'icône ⚙️ à côté du nom du canal.

### 4. Aller dans Intégrations

```
Paramètres du canal → Intégrations (dans le menu de gauche)
```

### 5. Créer un Webhook

```
Section "Webhooks" → Bouton "Créer un webhook"
```

### 6. Configurer le Webhook

- **Nom** : `Rundown AI Newsletter` (ou ce que tu veux)
- **Avatar** : (optionnel) Tu peux mettre une image
- **Canal** : Vérifier que c'est le bon canal

### 7. Copier l'URL du Webhook

Cliquer sur **Copier l'URL du Webhook**

L'URL ressemble à :
```
https://discord.com/api/webhooks/1234567890123456789/abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
```

⚠️ **IMPORTANT** : Cette URL est **secrète** ! Ne la partage pas publiquement.

### 8. Sauvegarder

Cliquer sur **Enregistrer les modifications** en bas de la page.

## ✅ Vérification

Pour tester que le webhook fonctionne, tu peux utiliser curl dans ton terminal :

```bash
curl -X POST "https://discord.com/api/webhooks/TON_WEBHOOK_ICI" \
  -H "Content-Type: application/json" \
  -d '{"content": "🧪 Test du webhook - ça marche !"}'
```

Si tu vois le message apparaître sur Discord, c'est bon ! ✅

## 🔒 Sécurité

### Que faire si le webhook est compromis ?

1. Retourner dans **Paramètres du canal → Intégrations → Webhooks**
2. Cliquer sur le webhook
3. Cliquer sur **Supprimer le webhook**
4. En créer un nouveau

### Bonnes pratiques

- ✅ Ne jamais commit l'URL du webhook dans Git
- ✅ Ne pas la partager publiquement
- ✅ La stocker uniquement dans Google Apps Script (privé)
- ✅ Utiliser un webhook différent par service

## 📊 Limites Discord

- **Rate limit** : 30 messages par minute par webhook
- **Taille message** : 2000 caractères max
- **Embeds** : 10 embeds max par message

Pour The Rundown AI (2-3 emails/jour), aucun problème ! 🎉

## 🎨 Personnalisation avancée

### Changer l'avatar du webhook dynamiquement

Dans le script Apps Script, tu peux ajouter :

```javascript
const payload = {
  content: url,
  username: "The Rundown AI",
  avatar_url: "https://example.com/avatar.png",
  embeds: [...]
};
```

### Utiliser des mentions

```javascript
const payload = {
  content: `<@USER_ID> Nouvelle newsletter : ${url}`
};
```

### Ajouter des boutons (Discord Components)

Les webhooks ne supportent pas les boutons directement, mais ton bot Discord peut réagir avec des emojis !

## 🔗 Ressources

- [Documentation officielle Discord Webhooks](https://discord.com/developers/docs/resources/webhook)
- [Webhook Tester en ligne](https://discohook.org/)

## 🆘 Problèmes courants

### "Invalid Webhook Token"

- L'URL du webhook est incorrecte ou incomplète
- Vérifier qu'il n'y a pas d'espace avant/après l'URL
- Copier à nouveau l'URL depuis Discord

### "Unknown Webhook"

- Le webhook a été supprimé
- Créer un nouveau webhook

### "Cannot send an empty message"

- Le payload est vide
- Vérifier que `content` ou `embeds` est présent

### Pas de message sur Discord

- Vérifier que le webhook est dans le bon canal
- Vérifier les permissions du canal (le webhook peut-il poster ?)
- Tester avec curl pour isoler le problème
