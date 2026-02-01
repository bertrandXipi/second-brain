#!/bin/bash

# Script pour réauthentifier NotebookLM avec un nouveau compte
# Usage: ./scripts/reauth-notebooklm.sh

set -e

ZONE="us-central1-a"
INSTANCE="veille-bot"

echo "🔄 Réauthentification NotebookLM"
echo "================================"
echo ""
echo "⚠️  IMPORTANT:"
echo "   1. Vous allez vous connecter au serveur Google Cloud"
echo "   2. Chrome va s'ouvrir sur le serveur (via X11 forwarding)"
echo "   3. Connectez-vous avec le NOUVEAU compte Google/NotebookLM"
echo ""
read -p "Appuyez sur Entrée pour continuer..."

echo ""
echo "🔐 Connexion au serveur et lancement de l'authentification..."
echo ""

# Se connecter avec X11 forwarding pour afficher Chrome
gcloud compute ssh ${INSTANCE} --zone=${ZONE} -- -X "cd second-brain && notebooklm-mcp-auth"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Erreur lors de l'authentification"
    echo ""
    echo "💡 Alternatives:"
    echo ""
    echo "1. Essayez avec X11 forwarding manuel:"
    echo "   gcloud compute ssh ${INSTANCE} --zone=${ZONE} -- -X"
    echo "   notebooklm-mcp-auth"
    echo ""
    echo "2. Ou utilisez la méthode manuelle (voir docs/CHANGE-NOTEBOOKLM-ACCOUNT.md)"
    exit 1
fi

echo ""
echo "✅ Authentification réussie!"
echo ""
echo "🔄 Redémarrage des services..."

# Redémarrer le serveur MCP
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="sudo systemctl restart notebooklm-mcp"
echo "✅ Serveur MCP redémarré"

# Attendre que le serveur soit prêt
echo "⏳ Attente du démarrage (5 secondes)..."
sleep 5

# Redémarrer le bot Discord
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="sudo systemctl restart veille-bot"
echo "✅ Bot Discord redémarré"

echo ""
echo "🧪 Test de connexion..."
echo ""

# Test simple
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='curl -s -X POST http://localhost:8000/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"notebook_list\",\"arguments\":{\"max_results\":5}}}" | python3 -c "import sys, json; data=json.load(sys.stdin); print(\"✅ Connexion OK - Notebooks trouvés:\"); [print(f\"  - {nb.get(\"title\", \"Sans titre\")}\") for result in data if \"result\" in result for nb in result.get(\"result\", {}).get(\"notebooks\", [])]" 2>/dev/null || echo "⚠️  Test échoué (le serveur peut être en cours de démarrage)"'

echo ""
echo "================================"
echo "✅ Migration terminée!"
echo "================================"
echo ""
echo "📋 Prochaines étapes:"
echo ""
echo "1. Testez en postant un lien dans Discord"
echo "2. Le notebook 'Veille Tech - Février 2026' sera créé automatiquement"
echo "3. Vérifiez dans NotebookLM avec le nouveau compte:"
echo "   https://notebooklm.google.com"
echo ""
echo "📊 Logs si besoin:"
echo "   gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='sudo journalctl -u veille-bot -f'"
echo ""
