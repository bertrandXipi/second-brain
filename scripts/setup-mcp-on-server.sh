#!/bin/bash
# Setup NotebookLM MCP Server on Google Compute Engine
# This script installs and configures the MCP server to run locally on the server

set -e

INSTANCE="veille-bot"
ZONE="us-central1-a"

echo "🚀 Setting up NotebookLM MCP on Google Compute Engine..."
echo ""

# 1. Copy auth tokens to server
echo "📦 Step 1/5: Copying auth tokens to server..."
gcloud compute scp --recurse \
  ~/.notebooklm-mcp/ \
  ${INSTANCE}:~/ \
  --zone=${ZONE}

# 2. Install uv and notebooklm-mcp-server on the server
echo ""
echo "📦 Step 2/5: Installing uv and notebooklm-mcp-server..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='
  # Install uv if not already installed
  if ! command -v uv &> /dev/null; then
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
  fi
  
  # Install notebooklm-mcp-server
  echo "Installing notebooklm-mcp-server..."
  uv tool install notebooklm-mcp-server
  
  echo "✅ Installation complete"
'

# 3. Create systemd service
echo ""
echo "📦 Step 3/5: Creating systemd service..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='
  sudo tee /etc/systemd/system/notebooklm-mcp.service > /dev/null <<EOF
[Unit]
Description=NotebookLM MCP HTTP Server
After=network.target

[Service]
Type=simple
User=bertrand
WorkingDirectory=/home/bertrand
Environment="PATH=/home/bertrand/.local/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/home/bertrand/.local/bin/notebooklm-mcp --transport streamable-http --host 127.0.0.1 --port 8080
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  echo "✅ Service file created"
'

# 4. Enable and start the service
echo ""
echo "📦 Step 4/5: Starting MCP service..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='
  sudo systemctl daemon-reload
  sudo systemctl enable notebooklm-mcp
  sudo systemctl restart notebooklm-mcp
  sleep 3
  sudo systemctl status notebooklm-mcp --no-pager
'

# 5. Update Discord bot .env
echo ""
echo "📦 Step 5/5: Updating Discord bot configuration..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='
  cd ~/second-brain/discord-ingest-bot
  
  # Add or update NOTEBOOKLM_MCP_URL in .env
  if grep -q "NOTEBOOKLM_MCP_URL" .env; then
    sed -i "s|NOTEBOOKLM_MCP_URL=.*|NOTEBOOKLM_MCP_URL=http://localhost:8080/mcp|" .env
  else
    echo "NOTEBOOKLM_MCP_URL=http://localhost:8080/mcp" >> .env
  fi
  
  echo "✅ Configuration updated"
  cat .env | grep NOTEBOOKLM_MCP_URL
'

# 6. Restart Discord bot
echo ""
echo "📦 Restarting Discord bot..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='
  cd ~/second-brain/discord-ingest-bot
  pm2 restart discord-bot
  sleep 2
  pm2 logs discord-bot --lines 20 --nostream
'

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Useful commands:"
echo "  Check MCP logs:    gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='sudo journalctl -u notebooklm-mcp -f'"
echo "  Check bot logs:    gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='pm2 logs discord-bot'"
echo "  Restart MCP:       gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='sudo systemctl restart notebooklm-mcp'"
echo "  Restart bot:       gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command='pm2 restart discord-bot'"
echo ""
echo "🧪 Test by posting a URL in Discord!"
