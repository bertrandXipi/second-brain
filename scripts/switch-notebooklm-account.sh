#!/bin/bash

# Script pour changer de compte NotebookLM
# Usage: ./scripts/switch-notebooklm-account.sh

set -e

ZONE="us-central1-a"
INSTANCE="veille-bot"
REMOTE_USER="bertrand"  # Username sur le serveur
REMOTE_PATH="/home/${REMOTE_USER}/second-brain"

echo "🔄 Changement de compte NotebookLM"
echo "=================================="
echo ""

# Étape 1: Réauthentification
echo "📝 Étape 1/5: Réauthentification avec le nouveau compte"
echo "-------------------------------------------------------"
echo ""
echo "⚠️  IMPORTANT: Vous allez être redirigé vers Chrome."
echo "    Connectez-vous avec le NOUVEAU compte Google/NotebookLM"
echo ""
read -p "Appuyez sur Entrée pour continuer..."

echo ""
echo "🔐 Lancement de l'authentification sur le serveur..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="cd ${REMOTE_PATH} && notebooklm-mcp-auth"

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors de l'authentification"
    echo "Essayez manuellement:"
    echo "  gcloud compute ssh ${INSTANCE} --zone=${ZONE}"
    echo "  notebooklm-mcp-auth"
    exit 1
fi

echo "✅ Authentification réussie"
echo ""

# Étape 2: Vérifier les credentials
echo "📝 Étape 2/5: Vérification des credentials"
echo "------------------------------------------"
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="ls -la ~/.notebooklm-mcp/"

if [ $? -ne 0 ]; then
    echo "⚠️  Credentials non trouvés, mais l'authentification peut avoir réussi"
fi

echo ""

# Étape 3: Redémarrer le serveur MCP
echo "📝 Étape 3/5: Redémarrage du serveur MCP NotebookLM"
echo "---------------------------------------------------"
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="sudo systemctl restart notebooklm-mcp"

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors du redémarrage du serveur MCP"
    exit 1
fi

echo "✅ Serveur MCP redémarré"
echo ""

# Attendre que le serveur soit prêt
echo "⏳ Attente du démarrage du serveur (5 secondes)..."
sleep 5

# Vérifier le statut
echo "🔍 Vérification du statut du serveur MCP..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="sudo systemctl status notebooklm-mcp --no-pager | head -20"
echo ""

# Étape 4: Redémarrer le bot Discord
echo "📝 Étape 4/5: Redémarrage du bot Discord"
echo "----------------------------------------"
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="sudo systemctl restart veille-bot"

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors du redémarrage du bot"
    exit 1
fi

echo "✅ Bot Discord redémarré"
echo ""

# Attendre que le bot soit prêt
echo "⏳ Attente du démarrage du bot (5 secondes)..."
sleep 5

# Vérifier le statut
echo "🔍 Vérification du statut du bot..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="sudo systemctl status veille-bot --no-pager | head -20"
echo ""

# Étape 5: Test de connexion
echo "📝 Étape 5/5: Test de connexion"
echo "--------------------------------"
echo "🧪 Test de la connexion au serveur MCP..."

# Créer un script de test temporaire
cat > /tmp/test-mcp.sh << 'EOF'
#!/bin/bash
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "notebook_list",
      "arguments": {"max_results": 5}
    }
  }' | python3 -m json.tool 2>/dev/null || echo "Erreur de parsing JSON"
EOF

chmod +x /tmp/test-mcp.sh

# Copier et exécuter sur le serveur
gcloud compute scp /tmp/test-mcp.sh ${INSTANCE}:/tmp/ --zone=${ZONE} --quiet
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="bash /tmp/test-mcp.sh"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Test réussi! Les notebooks ci-dessus appartiennent au nouveau compte."
else
    echo ""
    echo "⚠️  Le test a échoué, mais le serveur peut être en cours de démarrage."
    echo "    Attendez 30 secondes et réessayez avec:"
    echo "    gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='bash /tmp/test-mcp.sh'"
fi

# Nettoyage
rm /tmp/test-mcp.sh

echo ""
echo "=================================="
echo "✅ Migration terminée!"
echo "=================================="
echo ""
echo "📋 Prochaines étapes:"
echo ""
echo "1. Testez en postant un lien dans Discord"
echo "2. Vérifiez que la source apparaît dans le nouveau compte NotebookLM"
echo "3. Consultez les logs si nécessaire:"
echo ""
echo "   # Logs du bot Discord"
echo "   gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='sudo journalctl -u veille-bot -f'"
echo ""
echo "   # Logs du serveur MCP"
echo "   gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='sudo journalctl -u notebooklm-mcp -f'"
echo ""
echo "4. Connectez-vous à NotebookLM avec le nouveau compte:"
echo "   https://notebooklm.google.com"
echo ""
