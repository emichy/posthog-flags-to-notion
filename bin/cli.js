#!/usr/bin/env node

import "dotenv/config";

// Launch MCP server if --mcp flag is passed
if (process.argv.includes("--mcp")) {
  await import("./mcp.js");
} else {
  const { syncFlags } = await import("../src/index.js");

  const required = ["POSTHOG_API_KEY", "POSTHOG_PROJECT_ID", "NOTION_API_KEY", "NOTION_DATABASE_ID"];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error("See .env.example for details.");
    process.exit(1);
  }

  syncFlags({
    posthog: {
      apiKey: process.env.POSTHOG_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID,
      host: process.env.POSTHOG_HOST || "https://us.posthog.com",
      groupTypeIndex: parseInt(process.env.POSTHOG_GROUP_TYPE_INDEX || "0", 10),
      groupPropertyKey: process.env.POSTHOG_GROUP_PROPERTY_KEY || "project_id",
    },
    notion: {
      apiKey: process.env.NOTION_API_KEY,
      databaseId: process.env.NOTION_DATABASE_ID,
      directoryDatabaseId: process.env.NOTION_DIRECTORY_DATABASE_ID || null,
    },
    skipSurveyFlags: process.env.SKIP_SURVEY_FLAGS !== "false",
    dryRun: process.argv.includes("--dry-run"),
  });
}
