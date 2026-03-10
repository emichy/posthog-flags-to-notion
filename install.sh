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

# Check for Notion MCP server
NOTION_MCP=false
for f in "$HOME/.claude/settings.json" "$HOME/.claude/settings.local.json"; do
  if [ -f "$f" ] && grep -q "notion" "$f" 2>/dev/null; then
    NOTION_MCP=true
    break
  fi
done

if [ "$NOTION_MCP" = false ]; then
  echo "⚠  Notion MCP server not detected in your Claude Code settings."
  echo "   The agent needs it to write to Notion. Set it up first:"
  echo "   https://github.com/makenotion/notion-mcp-server"
  echo ""
fi

echo "Next steps:"
echo "  1. Store your PostHog API key:  echo \"phx_your_key\" > ~/.posthog-api-key"
echo "  2. Open Claude Code and run /agents → feature-flags"
