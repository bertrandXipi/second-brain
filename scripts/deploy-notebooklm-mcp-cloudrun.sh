#!/bin/bash
# Deploy NotebookLM MCP Server to Google Cloud Run
# This script deploys the MCP server so the Discord bot can use it automatically

set -e

# Get current project ID
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_NAME="notebooklm-mcp"
REPO_NAME="mcp-servers"

echo "🚀 Deploying NotebookLM MCP to Cloud Run..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# 1. Create Artifact Registry repository if it doesn't exist
echo "📦 Creating Artifact Registry repository..."
gcloud artifacts repositories create $REPO_NAME \
  --repository-format=docker \
  --location=$REGION \
  --description="MCP Servers Repository" \
  --project=$PROJECT_ID \
  2>/dev/null || echo "Repository already exists"

# 2. Create Dockerfile for NotebookLM MCP
echo "🐳 Creating Dockerfile..."
mkdir -p /tmp/notebooklm-mcp-build
cat > /tmp/notebooklm-mcp-build/Dockerfile <<'EOF'
FROM python:3.13-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install notebooklm-mcp-server
RUN uv tool install notebooklm-mcp-server

# Create directory for auth tokens
RUN mkdir -p /root/.notebooklm-mcp

# Copy auth tokens into the image
COPY auth.json /root/.notebooklm-mcp/auth.json

# Allow statements and log messages to immediately appear
ENV PYTHONUNBUFFERED=1
ENV PATH="/root/.local/bin:$PATH"

EXPOSE 8080

# Run the MCP server in HTTP streamable mode
# Cloud Run provides PORT env var automatically
CMD ["sh", "-c", "notebooklm-mcp --transport streamable-http --host 0.0.0.0 --port ${PORT:-8080}"]
EOF

# Copy auth tokens to build context
echo "🔑 Copying auth tokens..."
cp ~/.notebooklm-mcp/auth.json /tmp/notebooklm-mcp-build/

# 3. Build and push the container image
echo "🔨 Building container image..."
gcloud builds submit \
  --region=$REGION \
  --tag $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME:latest \
  --project=$PROJECT_ID \
  /tmp/notebooklm-mcp-build

# 4. Deploy to Cloud Run
echo "☁️  Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME:latest \
  --region=$REGION \
  --platform=managed \
  --no-allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --project=$PROJECT_ID

# 5. Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format='value(status.url)')

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Service URL: $SERVICE_URL"
echo "MCP Endpoint: $SERVICE_URL/mcp"
echo ""
echo "⚠️  IMPORTANT: You need to copy NotebookLM auth tokens to the server!"
echo ""
echo "Run these commands:"
echo "  1. SSH to the server:"
echo "     gcloud compute ssh veille-bot --zone=us-central1-a --project=$PROJECT_ID"
echo ""
echo "  2. Copy auth tokens from your local machine:"
echo "     scp -r ~/.notebooklm-mcp/ veille-bot:~/"
echo ""
echo "  3. Update Discord bot .env:"
echo "     NOTEBOOKLM_MCP_URL=$SERVICE_URL/mcp"
echo ""
echo "  4. Test with proxy:"
echo "     gcloud run services proxy $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
echo ""
