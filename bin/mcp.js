#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fetchFlags, analyzeFlag, resolveGroupName } from "../src/posthog.js";
import { syncFlags } from "../src/index.js";

function getConfig() {
  return {
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
  };
}

const server = new McpServer({
  name: "posthog-flags-to-notion",
  version: "1.0.0",
});

// Tool 1: List flags with resolved names (read-only, no Notion)
server.tool(
  "list_flags",
  "List all PostHog feature flags with their targeting rules and resolved group names. Does not write to Notion.",
  {},
  async () => {
    const config = getConfig();
    if (!config.posthog.apiKey || !config.posthog.projectId) {
      return { content: [{ type: "text", text: "Error: POSTHOG_API_KEY and POSTHOG_PROJECT_ID are required." }] };
    }

    const flags = await fetchFlags(config.posthog);
    const allGroupIds = new Set();
    const analyzed = flags
      .filter((f) => !f.key.startsWith("survey-targeting-"))
      .map((f) => {
        const { targeting, targetedIds } = analyzeFlag(f, config.posthog.groupPropertyKey);
        targetedIds.forEach((id) => allGroupIds.add(id));
        return { key: f.key, name: f.name, active: f.active, targeting, targetedIds };
      });

    const groupMap = new Map();
    for (const id of allGroupIds) {
      const resolved = await resolveGroupName({
        ...config.posthog,
        groupKey: id,
      });
      groupMap.set(id, resolved || { name: id, tier: "" });
    }

    const lines = analyzed.map((f) => {
      const names = f.targetedIds
        .map((id) => groupMap.get(id)?.name || id)
        .sort((a, b) => a.localeCompare(b));
      const status = f.active ? "Active" : "Inactive";
      const groups = names.length ? `\n  Groups: ${names.join(", ")}` : "";
      return `${f.key} (${status})\n  ${f.name}\n  Targeting: ${f.targeting}${groups}`;
    });

    return { content: [{ type: "text", text: lines.join("\n\n") }] };
  }
);

// Tool 2: Sync flags to Notion
server.tool(
  "sync_flags_to_notion",
  "Sync all PostHog feature flags to the configured Notion database, resolving group IDs to names. Creates or updates rows.",
  {},
  async () => {
    const config = getConfig();
    const missing = [];
    if (!config.posthog.apiKey) missing.push("POSTHOG_API_KEY");
    if (!config.posthog.projectId) missing.push("POSTHOG_PROJECT_ID");
    if (!config.notion.apiKey) missing.push("NOTION_API_KEY");
    if (!config.notion.databaseId) missing.push("NOTION_DATABASE_ID");

    if (missing.length) {
      return { content: [{ type: "text", text: `Error: Missing env vars: ${missing.join(", ")}` }] };
    }

    // Capture console output
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));

    try {
      await syncFlags({
        ...config,
        skipSurveyFlags: true,
        dryRun: false,
      });
    } finally {
      console.log = origLog;
    }

    return { content: [{ type: "text", text: logs.join("\n") }] };
  }
);

// Tool 3: Look up a specific group
server.tool(
  "lookup_group",
  "Look up a PostHog group by ID or name to see its properties (name, tier, etc).",
  {
    query: { type: "string", description: "The group ID (e.g. pro_abc123) or name to search for" },
  },
  async ({ query }) => {
    const config = getConfig();
    if (!config.posthog.apiKey || !config.posthog.projectId) {
      return { content: [{ type: "text", text: "Error: POSTHOG_API_KEY and POSTHOG_PROJECT_ID are required." }] };
    }

    const res = await fetch(
      `${config.posthog.host}/api/projects/${config.posthog.projectId}/groups/?group_type_index=${config.posthog.groupTypeIndex}&search=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${config.posthog.apiKey}` } }
    );
    if (!res.ok) {
      return { content: [{ type: "text", text: `PostHog API error: ${res.status}` }] };
    }

    const data = await res.json();
    if (!data.results?.length) {
      return { content: [{ type: "text", text: `No groups found matching "${query}"` }] };
    }

    const lines = data.results.map((g) => {
      const props = g.group_properties || {};
      return `${props.name || g.group_key} (${g.group_key})\n  Tier: ${props.active_tier || "unknown"}\n  Properties: ${JSON.stringify(props, null, 2)}`;
    });

    return { content: [{ type: "text", text: lines.join("\n\n") }] };
  }
);

// Tool 4: Find which flags target a specific group
server.tool(
  "flags_for_group",
  "Find all feature flags that target a specific group (by ID or name).",
  {
    query: { type: "string", description: "The group ID (e.g. pro_abc123) or name to search for" },
  },
  async ({ query }) => {
    const config = getConfig();
    if (!config.posthog.apiKey || !config.posthog.projectId) {
      return { content: [{ type: "text", text: "Error: POSTHOG_API_KEY and POSTHOG_PROJECT_ID are required." }] };
    }

    // If query looks like a name, resolve to ID first
    let searchId = query;
    if (!query.startsWith("pro_") && !query.startsWith("cmp_") && !query.startsWith("org_")) {
      const res = await fetch(
        `${config.posthog.host}/api/projects/${config.posthog.projectId}/groups/?group_type_index=${config.posthog.groupTypeIndex}&search=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${config.posthog.apiKey}` } }
      );
      const data = await res.json();
      if (data.results?.length) {
        searchId = data.results[0].group_key;
      }
    }

    const flags = await fetchFlags(config.posthog);
    const matching = flags.filter((f) => {
      const groups = f.filters?.groups || [];
      return groups.some((g) =>
        (g.properties || []).some(
          (p) =>
            (p.key === config.posthog.groupPropertyKey || p.key === "id") &&
            (Array.isArray(p.value) ? p.value.includes(searchId) : p.value === searchId)
        )
      );
    });

    if (!matching.length) {
      return { content: [{ type: "text", text: `No flags target "${query}" (${searchId})` }] };
    }

    const lines = matching.map((f) => {
      const status = f.active ? "Active" : "Inactive";
      return `${f.key} (${status}) — ${f.name}`;
    });

    return {
      content: [{ type: "text", text: `Flags targeting "${query}" (${searchId}):\n\n${lines.join("\n")}` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
