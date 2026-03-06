#!/usr/bin/env bash
set -euo pipefail

AGENTS_DIR="$HOME/.claude/agents"
AGENT_URL="https://raw.githubusercontent.com/emichy/posthog-flags-to-notion/main/agents/feature-flags.md"
DEST="$AGENTS_DIR/feature-flags.md"

mkdir -p "$AGENTS_DIR"

if [ -f "$DEST" ]; then
  echo "Agent file already exists at $DEST"
  read -r -p "Overwrite? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Skipped."
    exit 0
  fi
fi

curl -fsSL -o "$DEST" "$AGENT_URL"
echo "Installed to $DEST"
echo ""
echo "Next steps:"
echo "  1. Store your PostHog API key:  echo \"phx_your_key\" > ~/.posthog-api-key"
echo "  2. Open Claude Code and run /agents → feature-flags"
