# posthog-flags-to-notion

Sync your PostHog feature flags to a Notion database. Your whole team can see which flags are on and for whom — without PostHog access and without knowing that `org_kQ7mxiunoj70X` is actually Acme Corp.

## What you get

A Notion database like this:

| Flag Key | Description | Status | Targeting | Groups Enabled | PostHog URL |
|---|---|---|---|---|---|
| `new_ui` | New IA sidebar | Active | Specific groups | Acme Corp, Globex, Initech | `us.posthog.com/project/.../feature_flags/1` |
| `new_editor` | New block editor | Active | 50% rollout | *(50% of all orgs)* | `us.posthog.com/project/.../feature_flags/2` |
| `hide_ai` | Hide AI features | Active | 0% rollout (effectively off) | | `us.posthog.com/project/.../feature_flags/3` |

Real customer names — not opaque IDs like `alphakQPmxiunoj70X`. Percentage rollouts get a plain-English summary. Every flag links directly to its PostHog page.

### How targeting works

PostHog feature flags use condition groups — each flag can have one or more sets of rules. This tool reads those conditions and translates them:

- **Specific groups** — the flag explicitly lists group IDs. The tool resolves those IDs to real names.
- **Percentage rollout** — the flag is enabled for a percentage of all users/groups. The tool shows "50% rollout" as a summary.
- **Combined** — both: "these 5 customers + 20% of everyone else."
- **Property targeting** — if a flag targets by properties like `email` or `active_tier`, the tool shows the filter values (e.g. "Filtered by active_tier is not: free").

---

## Quick start: Claude Code agent

If you have [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and the [Notion MCP server](https://github.com/makenotion/notion-mcp-server), this is the fastest path. One person runs it, the whole team reads Notion.

**1. Copy the agent file:**

```bash
cp agents/feature-flags.md ~/.claude/agents/feature-flags.md
```

Or if you haven't cloned the repo:

```bash
curl -o ~/.claude/agents/feature-flags.md \
  https://raw.githubusercontent.com/emichy/posthog-flags-to-notion/main/agents/feature-flags.md
```

**2. Store your PostHog API key:**

```bash
echo "phx_your_key" > ~/.posthog-api-key
```

**3. Run it:**

Open Claude Code and select the `feature-flags` agent (or run `/agents` → feature-flags). On first run, it'll ask for your PostHog project ID and Notion database ID.

That's it. The agent reads PostHog, resolves group IDs to customer names, and writes everything to your Notion database.

> Need help getting API keys or setting up Notion? See [Setup](#setup).

---

## Automate it: CLI + GitHub Actions

Once you've validated the output, automate it so your Notion database stays current without anyone thinking about it. No Claude Code required — just `npx` and env vars.

### Run locally

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

### Run on a schedule

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

---

## Query it: MCP server

If you use Claude Code, Cursor, or any MCP-compatible tool, add this as an MCP server and talk to your flags conversationally:

> "What flags does Acme Corp have?"
>
> "Who has the collaboration flag enabled?"
>
> "Sync flags to Notion"

### Available tools

| Tool | What it does |
|---|---|
| `list_flags` | List all flags with resolved group names (read-only) |
| `sync_flags_to_notion` | Sync flags to your Notion database |
| `lookup_group` | Look up a group by ID or name |
| `flags_for_group` | Find all flags targeting a specific group |

### Add to Claude Code

`~/.claude/settings.json`:

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

### Add to Cursor

`.cursor/mcp.json`:

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

---

## Setup

### PostHog API key

Go to [PostHog → Settings → Personal API Keys](https://us.posthog.com/settings/user-api-keys) and create one.

### PostHog project ID

Your project ID is in the URL when you're in PostHog:

```
https://us.posthog.com/project/12345/feature_flags
                               ^^^^^
```

### Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and create a new integration
2. Give it read/write access to your workspace
3. Copy the token (starts with `secret_`)

### Notion database

1. Create a new page in Notion and add an inline database (type `/database` → "Table - Inline")
2. Don't worry about columns — the tool auto-creates everything it needs on first run
3. Connect your integration: click `...` → `Connections` → add it

Your database ID is in the URL:

```
https://www.notion.so/myworkspace/abc123def456...
                                  ^^^^^^^^^^^^^^
```

If the URL has a `?v=` parameter, the database ID is the part before the `?`.

---

## Configuration reference

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

---

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
