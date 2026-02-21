#!/bin/bash
# Auto-refresh NotebookLM tokens and push to prod VM
# Runs locally on macOS where Chrome keyring is accessible
# Scheduled via LaunchAgent every 10 days

LOG="$HOME/Library/Logs/notebooklm-refresh.log"
ZONE="us-central1-a"
VM="veille-bot"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"
}

log "=== Starting NotebookLM token refresh ==="

# 1. Re-auth locally (Chrome profile already logged in, should be headless)
log "Running notebooklm-mcp-auth..."
if ! notebooklm-mcp-auth >> "$LOG" 2>&1; then
  log "ERROR: notebooklm-mcp-auth failed"
  exit 1
fi

# 2. Push fresh tokens to VM
log "Copying auth.json to VM..."
if ! gcloud compute scp "$HOME/.notebooklm-mcp/auth.json" "$VM:~/.notebooklm-mcp/auth.json" --zone="$ZONE" >> "$LOG" 2>&1; then
  log "ERROR: Failed to copy auth.json to VM"
  exit 1
fi

# 3. Restart MCP on VM
log "Restarting notebooklm-mcp on VM..."
if ! gcloud compute ssh "$VM" --zone="$ZONE" --command="sudo systemctl restart notebooklm-mcp" >> "$LOG" 2>&1; then
  log "ERROR: Failed to restart notebooklm-mcp"
  exit 1
fi

log "=== Token refresh complete ==="
