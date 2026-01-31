#!/bin/bash
set -e

INSTANCE="veille-bot"
ZONE="us-central1-a"
BOT_DIR="/home/YOUR_USERNAME/second-brain/discord-ingest-bot"

echo "🚀 Deploying Discord bot to Google Cloud..."

# 1. Copy updated files to server
echo ""
echo "📦 Copying updated files..."
gcloud compute scp \
  discord-ingest-bot/src/processor.js \
  discord-ingest-bot/.env \
  ${INSTANCE}:${BOT_DIR}/src/processor.js \
  --zone=${ZONE}

gcloud compute scp \
  discord-ingest-bot/.env \
  ${INSTANCE}:${BOT_DIR}/.env \
  --zone=${ZONE}

gcloud compute scp \
  batch-processor/src/notebooklm-http.js \
  batch-processor/src/markdown-generator-v2.js \
  ${INSTANCE}:${BOT_DIR}/../batch-processor/src/ \
  --zone=${ZONE}

# 2. Restart the bot service
echo ""
echo "🔄 Restarting Discord bot service..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="sudo systemctl restart veille-bot"

# 3. Check status
echo ""
echo "✅ Checking service status..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="sudo systemctl status veille-bot --no-pager"

echo ""
echo "📋 Checking MCP server status..."
gcloud compute ssh ${INSTANCE} --zone=${ZONE} --command="sudo systemctl status notebooklm-mcp --no-pager"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 To view logs:"
echo "   gcloud compute ssh ${INSTANCE} --zone=${ZONE}"
echo "   sudo journalctl -u veille-bot -f"
echo ""
echo "🧪 Test by posting a URL in Discord!"
