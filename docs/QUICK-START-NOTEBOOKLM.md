# Guide Rapide : Changer de Compte NotebookLM

## 🎯 Objectif

Connecter votre système de veille à un nouveau compte Google/NotebookLM.

## ⚡ Méthode Rapide (5 minutes)

### Option 1 : Script Automatique (Recommandé)

```bash
./scripts/switch-notebooklm-account.sh
```

Le script va :
1. ✅ Vous demander de vous connecter avec le nouveau compte
2. ✅ Redémarrer tous les services
3. ✅ Tester la connexion
4. ✅ Afficher les notebooks du nouveau compte

### Option 2 : Commandes Manuelles

```bash
# 1. Réauthentifier
gcloud compute ssh veille-bot --zone=us-central1-a
notebooklm-mcp-auth  # ⚠️ Connectez-vous avec le NOUVEAU compte

# 2. Redémarrer les services
sudo systemctl restart notebooklm-mcp
sudo systemctl restart veille-bot

# 3. Vérifier
sudo systemctl status notebooklm-mcp --no-pager
sudo systemctl status veille-bot --no-pager
```

## 🧪 Tester

### 1. Vérifier les notebooks

```bash
node scripts/test-notebooklm-connection.js
```

Vous devriez voir les notebooks du **nouveau compte**.

### 2. Tester sur Discord

1. Postez un lien dans votre canal Discord
2. Le bot devrait réagir avec 👀 puis ✅
3. Vérifiez dans NotebookLM (nouveau compte) que la source a été ajoutée

### 3. Consulter les logs

```bash
# Logs du bot
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo journalctl -u veille-bot -n 50"

# Logs du serveur MCP
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo journalctl -u notebooklm-mcp -n 50"
```

## 🔍 Vérification Visuelle

### Avant le changement

```
NotebookLM (ancien compte)
├── Veille Tech - Janvier 2026 (50 sources)
└── Veille Tech - Décembre 2025 (120 sources)
```

### Après le changement

```
NotebookLM (nouveau compte)
├── Veille Tech - Février 2026 (0 sources) ← Créé automatiquement
└── (vide)
```

La première source ajoutée créera automatiquement le notebook du mois en cours.

## ❓ FAQ

### Les anciennes sources sont-elles perdues ?

Non ! Elles restent dans l'ancien compte NotebookLM. Vous pouvez :
- Les consulter en vous reconnectant à l'ancien compte
- Les exporter manuellement si besoin
- Les fiches markdown restent dans votre repo Git

### Puis-je revenir à l'ancien compte ?

Oui ! Relancez simplement `notebooklm-mcp-auth` et reconnectez-vous avec l'ancien compte.

### Le bot ne répond plus après le changement

Vérifiez que les services sont bien redémarrés :

```bash
gcloud compute ssh veille-bot --zone=us-central1-a \
  --command="sudo systemctl status veille-bot notebooklm-mcp --no-pager"
```

### Comment savoir quel compte est actuellement utilisé ?

Listez les notebooks :

```bash
node scripts/test-notebooklm-connection.js
```

Les notebooks affichés correspondent au compte actuellement authentifié.

## 📚 Documentation Complète

Pour plus de détails : [CHANGE-NOTEBOOKLM-ACCOUNT.md](./CHANGE-NOTEBOOKLM-ACCOUNT.md)

## 🆘 Besoin d'Aide ?

1. Vérifiez les logs : `sudo journalctl -u notebooklm-mcp -n 100`
2. Testez la connexion : `node scripts/test-notebooklm-connection.js`
3. Réauthentifiez : `notebooklm-mcp-auth`
4. Consultez la doc complète ci-dessus
