#!/usr/bin/env bash
set -euo pipefail

# Release preparation helper (stub)
# Usage: ./scripts/deploy_prepare.sh
# NOTE: This script is a helper for CI / local use. It does not run automatically.

echo "[deploy_prepare] Starting release preparation..."

echo "[deploy_prepare] Building Docker images (docker compose must be available)..."
# The actual build is commented out to avoid accidental long-running operations when executed in CI without intent.
# Uncomment to enable local usage:
# docker compose build --no-cache

echo "[deploy_prepare] (Dry-run) Docker build step prepared."

echo "[deploy_prepare] You can add additional steps here: run tests, migrate DB, push images, tag release."

echo "[deploy_prepare] Done."
