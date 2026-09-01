#!/bin/bash
# Regenerates the changelog from git log, rebuilds Docker images only if the
# code has changed since the last build, and (re)starts the containers.
#
# Usage: ./scripts/update-and-redeploy.sh [--force-rebuild]

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BUILD_HASH_FILE="$REPO_ROOT/.last-build-hash"
FORCE_REBUILD=false
[ "${1:-}" = "--force-rebuild" ] && FORCE_REBUILD=true

echo -e "${BLUE}==> Updating changelog${NC}"
pnpm --filter web generate:changelog

CURRENT_HASH="$(git rev-parse HEAD)"
LAST_HASH="$(cat "$BUILD_HASH_FILE" 2>/dev/null || echo "")"

if [ "$FORCE_REBUILD" = true ] || [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
    echo -e "${YELLOW}==> Code changed since last build ($LAST_HASH -> $CURRENT_HASH), rebuilding images${NC}"
    docker compose build
    echo "$CURRENT_HASH" > "$BUILD_HASH_FILE"
else
    echo -e "${GREEN}==> No code changes since last build ($CURRENT_HASH), skipping rebuild${NC}"
fi

echo -e "${BLUE}==> Starting containers${NC}"
docker compose up -d

echo -e "${GREEN}✓ Done${NC}"
