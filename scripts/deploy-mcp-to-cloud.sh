#!/bin/bash
# Deploy NotebookLM MCP HTTP server to Google Cloud
# Run this script locally, it will SSH and configure the server

set -e

INSTANCE="veille-bot"
ZONE="us-central1-a"

echo "🚀 Deploying NotebookLM MCP to Google Cloud..."
echo "   Instance: $INSTANCE"
echo "   Zone: $ZONE"
echo ""

# 1. Install uv and notebooklm-mcp-server
echo "📦 Installing NotebookLM MCP..."
gcloud compute ssh $INSTANCE --zone=$ZONE --command="
  # Install uv if not already installed
  if ! command -v uv &> /dev/null; then
    echo 'Installing uv...'
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH=\"\$HOME/.local/bin:\$PATH\"
  fi
  
  # Install notebooklm-mcp-server
  echo 'Installing notebooklm-mcp-server...'
  ~/.local/bin/uv tool install notebooklm-mcp-server
  
  echo '✅ NotebookLM MCP installed'
"

# 2. Copy auth tokens from local machine
echo ""
echo "🔐 Copying NotebookLM auth tokens..."
gcloud compute scp ~/.notebooklm-mcp/auth.json $INSTANCE:~/.notebooklm-mcp/auth.json --zone=$ZONE

# 3. Create systemd service
echo ""
echo "⚙️  Creating systemd service..."
gcloud compute ssh $INSTANCE --zone=$ZONE --command="
  sudo tee /etc/systemd/system/notebooklm-mcp.service > /dev/null <<'EOF'
[Unit]
Description=NotebookLM MCP HTTP Server
After=network.target

[Service]
Type=simple
User=bertrand
WorkingDirectory=/home/bertrand
ExecStart=/home/bertrand/.local/bin/notebooklm-mcp --transport http --host 127.0.0.1 --port 8000
Restart=always
RestartSec=10
Environment=\"PATH=/home/bertrand/.local/bin:/usr/bin:/bin\"

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable notebooklm-mcp
  sudo systemctl start notebooklm-mcp
  
  echo '✅ Service created and started'
"

# 4. Check status
echo ""
echo "📊 Checking service status..."
gcloud compute ssh $INSTANCE --zone=$ZONE --command="
  sudo systemctl status notebooklm-mcp --no-pager
"

# 5. Test MCP server
echo ""
echo "🧪 Testing MCP server..."
gcloud compute ssh $INSTANCE --zone=$ZONE --command="
  sleep 2
  curl -s -X POST http://localhost:8000/mcp \
    -H 'Content-Type: application/json' \
    -d '{
      \"jsonrpc\": \"2.0\",
      \"id\": 1,
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"notebook_list\",
        \"arguments\": {\"max_results\": 5}
      }
    }' | python3 -m json.tool || echo 'MCP server not ready yet, wait a few seconds'
"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Update discord-ingest-bot to use notebooklm-http.js"
echo "2. Add NOTEBOOKLM_MCP_URL=http://localhost:8000/mcp to .env"
echo "3. Restart the bot: sudo systemctl restart veille-bot"
