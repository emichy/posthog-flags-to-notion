# posthog-flags-to-notion

[![npm](https://img.shields.io/npm/v/posthog-flags-to-notion)](https://www.npmjs.com/package/posthog-flags-to-notion)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

Sync your PostHog feature flags to a Notion database. Your whole team can see which flags are on and for whom — without PostHog access and without knowing that `org_kQ7mxiunoj70X` is actually Acme Corp.

**Pick your path:**
[Claude Code](#quick-start-claude-code) · [Cursor & other MCP clients](#cursor--other-mcp-clients) · [CLI](#cli) · [Automate it](#automate-it)

## What you get

A Notion database like this:

| Flag Key | Description | Status | Targeting | Groups Enabled | PostHog URL |
|---|---|---|---|---|---|
| `new_ui` | New IA sidebar | Active | Specific groups | Acme Corp, Globex, Initech | `us.posthog.com/project/.../feature_flags/1` |
| `new_editor` | New block editor | Active | 50% rollout | *(50% of all orgs)* | `us.posthog.com/project/.../feature_flags/2` |
| `hide_ai` | Hide AI features | Active | 0% rollout (effectively off) | | `us.posthog.com/project/.../feature_flags/3` |

Real customer names — not opaque IDs like `alphakQPmxiunoj70X`. Percentage rollouts get a plain-English summary. Every flag links directly to its PostHog page. Flags deleted from PostHog are automatically marked **Archived** so your table stays trustworthy.

### How targeting works

PostHog feature flags use condition groups — each flag can have one or more sets of rules. This tool reads those conditions and translates them:

- **Specific groups** — the flag explicitly lists group IDs. The tool resolves those IDs to real names.
- **Percentage rollout** — the flag is enabled for a percentage of all users/groups. The tool shows "50% rollout" as a summary.
- **Combined** — both: "these 5 customers + 20% of everyone else."
- **Property targeting** — if a flag targets by properties like `email` or `active_tier`, the tool shows the filter values (e.g. "Filtered by active_tier is not: free").

## Quick start (Claude Code)

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with the [Notion MCP server](https://github.com/makenotion/notion-mcp-server), this is the fastest path. The agent file uses `curl` for PostHog and your existing Notion MCP connection to write — no npm package needed.

**1. Install the agent file:**

```bash
curl -fsSL https://raw.githubusercontent.com/emichy/posthog-flags-to-notion/main/install.sh | bash
```

Or manually:

```bash
curl -o ~/.claude/agents/feature-flags.md \
  https://raw.githubusercontent.com/emichy/posthog-flags-to-notion/main/agents/feature-flags.md
```

**2. Store your PostHog API key:**

```bash
echo "phx_your_key" > ~/.posthog-api-key
```

Get one at [PostHog → Settings → Personal API Keys](https://us.posthog.com/settings/user-api-keys).

**3. Run it:**

Open Claude Code, run `/agents` → `feature-flags`. On first run it'll ask for your PostHog project ID and Notion database ID. After that, it reads PostHog, resolves group IDs to customer names, and writes everything to Notion.

That's it.

## Cursor & other MCP clients

If you use Cursor or another MCP-compatible client, add this as an MCP server. Unlike the Claude Code agent, this uses the Notion API directly — so you'll need a [Notion integration token](#notion-integration) instead of the Notion MCP server.

| Tool | What it does |
|---|---|
| `list_flags` | List all flags with resolved group names (read-only) |
| `sync_flags_to_notion` | Sync flags to your Notion database |
| `lookup_group` | Look up a group by ID or name |
| `flags_for_group` | Find all flags targeting a specific group |

**Cursor** — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "posthog-flags": {
      "command": "npx",
      "args": ["-y", "posthog-flags-to-notion", "--mcp"],
      "env": {
        "POSTHOG_API_KEY": "phx_your_key",
        "POSTHOG_PROJECT_ID": "12345",
        "NOTION_API_KEY": "secret_your_key",
        "NOTION_DATABASE_ID": "your_database_id"
      }
    }
  }
}
```

## CLI

No agent, no MCP — just run it. Same env vars as the MCP server.

```bash
npx posthog-flags-to-notion --dry-run   # preview first
npx posthog-flags-to-notion             # sync to Notion
```

Create a `.env` file (see [`.env.example`](.env.example)):

```env
POSTHOG_API_KEY=phx_your_key
POSTHOG_PROJECT_ID=12345
NOTION_API_KEY=secret_your_key
NOTION_DATABASE_ID=your_database_id
```

---

## Automate it

Once you've validated the output, automate it with GitHub Actions so your Notion database stays current without anyone thinking about it.

`.github/workflows/sync-flags.yml`:

```yaml
name: Sync PostHog flags to Notion
on:
  schedule:
    - cron: "0 * * * *" # every hour
  workflow_dispatch: # or trigger manually

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - run: npx -y posthog-flags-to-notion
        env:
          POSTHOG_API_KEY: ${{ secrets.POSTHOG_API_KEY }}
          POSTHOG_PROJECT_ID: ${{ secrets.POSTHOG_PROJECT_ID }}
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
```

Add your env vars as [repository secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions) and you're done.

## Setup details

### PostHog API key

Go to [PostHog → Settings → Personal API Keys](https://us.posthog.com/settings/user-api-keys) and create one.

### PostHog project ID

Your project ID is in the URL when you're in PostHog:

```
https://us.posthog.com/project/12345/feature_flags
                               ^^^^^
```

### Notion integration

Only needed for the MCP server, CLI, and GitHub Actions paths — the Claude Code agent uses the Notion MCP server instead.

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and create a new integration
2. Give it read/write access to your workspace
3. Copy the token (starts with `secret_`)

### Notion database

1. Create a new page in Notion and add an inline database (type `/database` → "Table - Inline")
2. Don't worry about columns — the tool auto-creates everything it needs on first run
3. Connect your integration: click `...` → `Connections` → add it (not needed for the Claude Code agent path)

Your database ID is in the URL:

```
https://www.notion.so/myworkspace/abc123def456...
                                  ^^^^^^^^^^^^^^
```

If the URL has a `?v=` parameter, the database ID is the part before the `?`.

## Configuration reference

These env vars apply to the CLI, GitHub Actions, and MCP server. The Claude Code agent handles configuration conversationally.

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTHOG_API_KEY` | Yes | — | PostHog personal API key |
| `POSTHOG_PROJECT_ID` | Yes | — | Your PostHog project ID |
| `NOTION_API_KEY` | Yes | — | Notion integration token |
| `NOTION_DATABASE_ID` | Yes | — | Notion database to write flags to |
| `POSTHOG_HOST` | No | `https://us.posthog.com` | PostHog instance URL (use `https://eu.posthog.com` for EU) |
| `POSTHOG_GROUP_TYPE_INDEX` | No | `0` | Which PostHog group type to resolve (0 = first) |
| `POSTHOG_GROUP_PROPERTY_KEY` | No | `project_id` | The property key in flag filters to match on |
| `NOTION_DIRECTORY_DATABASE_ID` | No | — | Optional second database for a group name/ID lookup |
| `SKIP_SURVEY_FLAGS` | No | `true` | Skip PostHog survey targeting flags |

### About group types

PostHog lets you define [group types](https://posthog.com/docs/product-analytics/group-analytics) like "Company", "Project", or "Organization". Each has an index (0, 1, 2...). If your flags target `company_id`, set:

```env
POSTHOG_GROUP_TYPE_INDEX=0
POSTHOG_GROUP_PROPERTY_KEY=company_id
```

The tool uses PostHog's Groups API to look up the `name` property for each group key. This works automatically if your app calls `posthog.group('Company', id, { name: 'Acme Corp' })`.

### Group directory (optional)

If you set `NOTION_DIRECTORY_DATABASE_ID`, the tool creates a second table:

| Group Name | Group ID | Tier |
|---|---|---|
| Acme Corp | `cmp_abc123` | Enterprise |
| Globex | `cmp_def456` | Business |

## Troubleshooting

**"Cannot access Notion database"**
Your Notion integration isn't connected to the database. Open the database page → `...` → `Connections` → add your integration.

**"Missing required environment variables"**
Check your `.env` file exists in the directory you're running from, and all four required variables are set.

**All group names show as raw IDs**
PostHog only knows group names if your app calls `posthog.group('Company', id, { name: 'Acme Corp' })`. If names were never sent, there's nothing to resolve. Check [PostHog → Groups](https://us.posthog.com/groups) to see what's stored.

**EU users getting 401 or empty results**
You're hitting the US endpoint. Add `POSTHOG_HOST=https://eu.posthog.com` to your `.env`.

## License

MIT
