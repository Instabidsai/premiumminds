#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "→ Created .env — fill in your API keys and Supabase credentials."
  exit 1
fi

# Source env
set -a; source .env; set +a

echo "→ Starting graph infrastructure..."
docker compose up -d falkordb graphiti-mcp

echo "→ Waiting for Graphiti MCP to be ready..."
for i in {1..30}; do
  if curl -sf http://localhost:8000/mcp/ >/dev/null 2>&1; then
    echo "  Graphiti MCP is up!"
    break
  fi
  sleep 2
done

echo "→ Starting workers..."
docker compose up -d cartographer mcp-groupmind fetcher reader

echo ""
echo "✅ GroupMind infrastructure is up"
echo "   Graphiti MCP:  http://localhost:8000/mcp/"
echo "   GroupMind MCP: http://localhost:8001/mcp/"
echo "   FalkorDB UI:   http://localhost:3000"
echo ""
echo "→ To start the web app:"
echo "   cd web && pnpm install && pnpm dev"
