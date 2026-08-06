#!/usr/bin/env bash
# Install git hooks for this repo (auto-stamp on commit).
set -euo pipefail
cd "$(dirname "$0")/.."
HOOK=".git/hooks/pre-commit"
cp tools/pre-commit "$HOOK"
chmod +x "$HOOK" tools/stamp.sh
echo "Installed $HOOK — commits will run tools/stamp.sh automatically."
