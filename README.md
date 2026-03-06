# posthog-flags-to-notion

Sync your PostHog feature flags to a Notion database so your whole team can see who has access to what.

## The problem

- **Customer Success** can't remember which customer got the latest beta, and just promised it to someone who doesn't have it
- **Support** is trying to diagnose a bug and has no idea the customer is on a 50% rollout that hasn't reached them
- **Product** drops a Slack message asking "who has collaboration enabled?" and waits 20 minutes for an engineer to check
- **Marketing** wants to announce a feature but doesn't know if the top accounts can actually see it yet

Everyone needs the same answer: _which flags are on, and for whom?_ But the only people who can check are the engineers who set them up.

## The solution

Two ways to use this — pick whichever fits your workflow:

### Option A: MCP Server (recommended)

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.sh), or any MCP-compatible tool, add this as an MCP server and just talk to your flags:

> "Update the feature flags page"
>
> "What flags does Acme Corp have?"
>
> "Who has the collaboration flag enabled?"

No Notion integration token needed if your MCP client already has Notion access. You get four tools:

| Tool | What it does |
|---|---|
| `list_flags` | List all flags with resolved group names (read-only) |
| `sync_flags_to_notion` | Sync flags to your Notion database |
| `lookup_group` | Look up a group by ID or name |
| `flags_for_group` | Find all flags targeting a specific group |

---

### Option B: CLI (fallback)

A single command that reads your PostHog feature flags and writes them to a Notion database:

```
npx posthog-flags-to-notion
```

No AI required. Works in CI, cron jobs, or just your terminal.

### What you get

A Notion database like this:

| Flag Key | Description | Status | Targeting | Groups Enabled |
|---|---|---|---|---|
| `collaboration` | Collaborative editing | Active | Specific groups | Acme Corp, Globex, Initech |
| `new_editor` | New block editor | Active | 50% rollout | *(50% of all users)* |
| `hide_ai` | Hide AI features | Active | 0% rollout (effectively off) | |

Optionally, a **directory table** mapping group names to IDs and tiers — so anyone can look up the raw ID if they need it.

## How it works

1. **Fetches all feature flags** from the PostHog API
2. **Parses targeting rules** — flags targeting specific groups get their IDs extracted; percentage rollouts get a plain-English summary
3. **Resolves group IDs to names** using PostHog's Groups API (PostHog already stores group names if your app calls `posthog.group()`)
4. **Writes to Notion** via the Notion API — creates rows for new flags, updates existing ones

No database access needed. No backend. Just two APIs.

## Setup: MCP Server

### 1. PostHog personal API key

Go to [PostHog → Settings → Personal API Keys](https://us.posthog.com/settings/user-api-keys) and create one.

### 2. Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and create an integration
2. Give it read/write access to your workspace
3. Create a Notion database (or use an existing one) — it just needs a title column
4. Share the database with your integration (click `...` → `Connections` → add your integration)

### 3. Add to your MCP client

**Claude Code** (`~/.claude/settings.json`):

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

**Cursor** (`.cursor/mcp.json`):

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

Then just ask: _"sync feature flags to Notion"_ or _"what flags does Acme have?"_

## Setup: CLI

### 1. Configure

Create a `.env` file (see [`.env.example`](.env.example)):

```env
POSTHOG_API_KEY=phx_your_key
POSTHOG_PROJECT_ID=12345
NOTION_API_KEY=secret_your_key
NOTION_DATABASE_ID=your_database_id
```

### 2. Run

```bash
npx posthog-flags-to-notion
```

Or install locally:

```bash
npm install
npm start
```

Preview without writing to Notion:

```bash
npx posthog-flags-to-notion --dry-run
```
---

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTHOG_API_KEY` | Yes | — | PostHog personal API key |
| `POSTHOG_PROJECT_ID` | Yes | — | Your PostHog project ID |
| `NOTION_API_KEY` | Yes (CLI) | — | Notion integration token |
| `NOTION_DATABASE_ID` | Yes (CLI) | — | Notion database to write flags to |
| `POSTHOG_HOST` | No | `https://us.posthog.com` | PostHog instance URL (use `https://eu.posthog.com` for EU) |
| `POSTHOG_GROUP_TYPE_INDEX` | No | `0` | Which PostHog group type to resolve (0 = first) |
| `POSTHOG_GROUP_PROPERTY_KEY` | No | `project_id` | The property key in flag filters to match on |
| `NOTION_DIRECTORY_DATABASE_ID` | No | — | Optional second database for a group name ↔ ID lookup |
| `SKIP_SURVEY_FLAGS` | No | `true` | Skip PostHog survey targeting flags |

### About group types

PostHog lets you define [group types](https://posthog.com/docs/product-analytics/group-analytics) like "Company", "Project", or "Organization". Each has an index (0, 1, 2...). If your flags target `company_id`, set:

```env
POSTHOG_GROUP_TYPE_INDEX=0          # whatever index your group type is
POSTHOG_GROUP_PROPERTY_KEY=company_id
```

The tool uses PostHog's Groups API to look up the `name` property for each group key. This works automatically if your app calls `posthog.group('Company', id, { name: 'Acme Corp' })`.

## Optional: Group directory

If you set `NOTION_DIRECTORY_DATABASE_ID`, the tool creates a second table:

| Group Name | Group ID | Tier |
|---|---|---|
| Acme Corp | `cmp_abc123` | Enterprise |
| Globex | `cmp_def456` | Business |

Useful when someone asks "what's the ID for Acme?" — one place to look.

## License

MIT
