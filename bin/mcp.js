#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fetchFlags, analyzeFlag, resolveGroupName } from "../src/posthog.js";
import { syncFlags } from "../src/index.js";
import { getConfig, validateConfig } from "../src/config.js";

const server = new McpServer({
  name: "posthog-flags-to-notion",
  version: "1.2.0",
});

function errorResult(msg) {
  return { content: [{ type: "text", text: `Error: ${msg}` }] };
}

// Tool 1: List flags with resolved names (read-only, no Notion)
server.tool(
  "list_flags",
  "List all PostHog feature flags with their targeting rules and resolved group names. Does not write to Notion.",
  {},
  async () => {
    const config = getConfig();
    const missing = validateConfig(config, { requireNotion: false });
    if (missing.length) return errorResult(`Missing env vars: ${missing.join(", ")}`);

    try {
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
        const resolved = await resolveGroupName({ ...config.posthog, groupKey: id });
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
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

// Tool 2: Sync flags to Notion
server.tool(
  "sync_flags_to_notion",
  "Sync all PostHog feature flags to the configured Notion database, resolving group IDs to names. Creates or updates rows.",
  {},
  async () => {
    const config = getConfig();
    const missing = validateConfig(config);
    if (missing.length) return errorResult(`Missing env vars: ${missing.join(", ")}`);

    try {
      // Redirect console.log to capture output safely (no secrets)
      const logs = [];
      const origLog = console.log;
      console.log = (...args) => {
        const line = args.join(" ");
        // Never leak env vars or API keys in output
        if (line.includes(config.posthog.apiKey) || line.includes(config.notion.apiKey)) return;
        logs.push(line);
      };

      try {
        await syncFlags({ ...config, dryRun: false });
      } finally {
        console.log = origLog;
      }

      return { content: [{ type: "text", text: logs.join("\n") }] };
    } catch (e) {
      return errorResult(e.message);
    }
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
    const missing = validateConfig(config, { requireNotion: false });
    if (missing.length) return errorResult(`Missing env vars: ${missing.join(", ")}`);

    try {
      const res = await fetch(
        `${config.posthog.host}/api/projects/${config.posthog.projectId}/groups/?group_type_index=${config.posthog.groupTypeIndex}&search=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${config.posthog.apiKey}` } }
      );
      if (!res.ok) return errorResult(`PostHog API returned ${res.status}: ${res.statusText}`);

      const data = await res.json();
      if (!data.results?.length) {
        return { content: [{ type: "text", text: `No groups found matching "${query}"` }] };
      }

      const lines = data.results.map((g) => {
        const props = g.group_properties || {};
        return `${props.name || g.group_key} (${g.group_key})\n  Tier: ${props.active_tier || "unknown"}\n  Properties: ${JSON.stringify(props, null, 2)}`;
      });

      return { content: [{ type: "text", text: lines.join("\n\n") }] };
    } catch (e) {
      return errorResult(e.message);
    }
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
    const missing = validateConfig(config, { requireNotion: false });
    if (missing.length) return errorResult(`Missing env vars: ${missing.join(", ")}`);

    try {
      // If query doesn't look like a raw ID, resolve name to ID first
      let searchId = query;
      if (!/^[a-z]{2,5}_/.test(query)) {
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
    } catch (e) {
      return errorResult(e.message);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
