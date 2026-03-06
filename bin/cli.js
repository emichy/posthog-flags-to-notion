#!/usr/bin/env node

import "dotenv/config";
import { getConfig, validateConfig } from "../src/config.js";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
posthog-flags-to-notion — Sync PostHog feature flags to Notion

Usage:
  posthog-flags-to-notion            Sync flags to Notion
  posthog-flags-to-notion --dry-run  Preview without writing to Notion
  posthog-flags-to-notion --mcp      Launch as MCP server

Required env vars:
  POSTHOG_API_KEY        PostHog personal API key
  POSTHOG_PROJECT_ID     Your PostHog project ID
  NOTION_API_KEY         Notion integration token
  NOTION_DATABASE_ID     Notion database to write flags to

See .env.example for all options.
  `.trim());
  process.exit(0);
}

// Launch MCP server if --mcp flag is passed
if (process.argv.includes("--mcp")) {
  await import("./mcp.js");
} else {
  const { syncFlags } = await import("../src/index.js");
  const config = getConfig();
  const missing = validateConfig(config);

  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error("\nSee .env.example for details, or run with --help.");
    process.exit(1);
  }

  syncFlags({ ...config, dryRun: process.argv.includes("--dry-run") });
}
