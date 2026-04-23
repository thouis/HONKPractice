#!/bin/bash
# Deploy to Cloudflare Pages, including score files not in the git repo.
# Usage: bash scripts/deploy.sh [--scores-dir /path/to/scores]
#
# Requires: wrangler (npm i -g wrangler), authenticated via `wrangler login`
# Project name is read from CLOUDFLARE_PROJECT env var, defaulting to "HONKPractice".
set -e

PROJECT="${CLOUDFLARE_PROJECT:-honkpractice}"
SCORES_DIR="${SCORES_DIR:-public/scores}"

# Parse --scores-dir argument
while [[ $# -gt 0 ]]; do
  case $1 in
    --scores-dir) SCORES_DIR="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

echo "Building..."
npm run build

if [ -d "$SCORES_DIR" ]; then
  echo "Copying scores from $SCORES_DIR → dist/scores/"
  cp -r "$SCORES_DIR" dist/scores
else
  echo "No scores directory found at $SCORES_DIR — deploying without scores"
fi

echo "Deploying to Cloudflare Pages project: $PROJECT"
npx wrangler pages deploy dist --project-name="$PROJECT"

echo "Done."
