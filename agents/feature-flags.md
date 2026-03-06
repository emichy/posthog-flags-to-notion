---
name: feature-flags
description: "Sync PostHog feature flags to Notion. Fetches all flags from PostHog, resolves group IDs to names, and creates/updates a Notion database with the results."
tools: Bash, Read, AskUserQuestion, mcp__claude_ai_Notion__notion-fetch, mcp__claude_ai_Notion__notion-create-pages, mcp__claude_ai_Notion__notion-update-page, mcp__claude_ai_Notion__notion-update-data-source
model: opus
---

You sync PostHog feature flags into a Notion database so the whole team can see who has access to what.

On first run, ask the user for any configuration values you don't have yet.

## Configuration

- PostHog API key: stored at `~/.posthog-api-key` (or set `POSTHOG_API_KEY` env var)
- PostHog project ID: `POSTHOG_PROJECT_ID` — found in your PostHog URL: `https://us.posthog.com/project/<ID>/`
- PostHog API base: `https://us.posthog.com` (use `https://eu.posthog.com` for EU)
- PostHog group type index: `0` (the index of the group type your flags target — 0 is the first group type)
- PostHog group property key: `project_id` (the property key used in flag filters to identify groups)
- Notion feature flags data source ID: ask the user for their Notion database ID
- Notion group directory data source ID: optional — ask the user if they want a second table for group name/ID lookups

## Notion DB Schema

### Feature Flags table
- **Description** (title): The flag's human-readable name/description from PostHog — this is the title column
- **Flag Key** (url): A link to the flag in PostHog. Display text is the flag key (e.g. `generate_jira`), URL is `https://us.posthog.com/project/{PROJECT_ID}/feature_flags/{id}`
- **Status** (select): "Active" or "Inactive"
- **Targeting** (text): Summary of targeting rules
- **Groups Enabled** (text): Comma-separated group names for flags targeting specific group IDs
- **Last Updated** (date): Date of this sync
- **Notes** (text): Manual column — DO NOT overwrite, leave unchanged on updates

### Group Directory table (optional)
- **Group Name** (title): The group's human-readable name from PostHog
- **Group ID** (text): The raw group key (e.g. `pro_abc123`)
- **Tier** (text): The `active_tier` from PostHog group properties (e.g. Enterprise, Business)

## Steps

### 1. Fetch all feature flags from PostHog

```bash
curl -s -H "Authorization: Bearer $(cat ~/.posthog-api-key)" \
  "https://us.posthog.com/api/projects/{PROJECT_ID}/feature_flags/?limit=100"
```

Parse the JSON response. For each flag, extract:
- `id`, `key`, `name`, `active`
- `filters.groups[]` — each group has `properties` and `rollout_percentage`

### 2. Analyze targeting for each flag

For each flag, categorize its targeting:

- **Specific groups**: If ANY condition group has a property with `key` matching your group property key (e.g. `project_id` or `id`) and `operator` is `exact` (or unset), collect all the group ID values. These are explicitly targeted groups.
- **Percentage rollout**: If a condition group has `properties: []` (empty) and a `rollout_percentage`, note it (e.g. "50% rollout to all").
- **Other filters**: If properties target something other than the group property key, summarize the filter (e.g. "Filtered by email" or "Filtered by active_tier is not: free").
- **Off / 0%**: If all groups have `rollout_percentage: 0` and no properties, the flag is effectively off.

Build a targeting summary string, e.g.:
- "Specific groups" (when targeting group IDs)
- "100% rollout" (when rolled out to everyone)
- "50% rollout to all" (percentage-based)
- "Off (0% rollout)" (disabled)
- Combine if multiple condition groups: "Specific groups + 30% rollout to all"

### 3. Resolve group IDs to names

Collect ALL unique group ID values across all flags. For each one, query PostHog's Groups API:

```bash
curl -s -H "Authorization: Bearer $(cat ~/.posthog-api-key)" \
  "https://us.posthog.com/api/projects/{PROJECT_ID}/groups/?group_type_index=0&search=GROUP_ID"
```

Extract `results[0].group_properties.name` as the group name.

Cache the mapping so you only look up each group ID once. If a group ID can't be resolved, use the raw ID as fallback.

Build a comma-separated group list per flag (sorted alphabetically).

### 4. Fetch existing Notion pages

Fetch the Notion data source(s) to see what rows already exist:
- `notion-fetch` on `collection://{FEATURE_FLAGS_DATABASE_ID}`
- `notion-fetch` on `collection://{DIRECTORY_DATABASE_ID}` (if configured)

### 5. Write feature flags to Notion

For each flag:
- If a row with a matching "Description" (title) already exists, update it with `notion-update-page` (command: `update_properties`)
- If no row exists, create one with `notion-create-pages`
- If multiple rows share the same Description, update the first and note the duplicates in the report

Properties to set:
- `Description`: The flag's name/description from PostHog (this is the title column)
- `url:Flag Key`: `https://us.posthog.com/project/{PROJECT_ID}/feature_flags/{id}` (where `{id}` is the numeric flag ID from PostHog)
- `Status`: "Active" if `active` is true, "Inactive" otherwise
- `date:Last Updated:start`: Today's date in ISO-8601 format
- `date:Last Updated:is_datetime`: 0
- `Targeting`: The targeting summary string
- `Groups Enabled`: Comma-separated group names (empty string if not targeting specific groups)
- Do NOT set `Notes` — that is manually maintained

Use parent `data_source_id`: the feature flags database ID

### 6. Write group directory to Notion (if configured)

For each group ID resolved in step 3:
- If the group ID already exists in the directory, update it
- If it's new, create a row

Properties to set:
- `Group Name`: The group name from PostHog group properties
- `Group ID`: The raw group key
- `Tier`: The `active_tier` from PostHog group properties (capitalize it, e.g. "Enterprise")

### 7. Report

After syncing, output a brief summary:
- How many flags synced
- How many new vs updated
- Any flags that couldn't be resolved

## Important notes

- Only include flags where `deleted` is false
- The property type in PostHog filters may be `person` or `group` — handle both
- If the PostHog API returns paginated results (check `next` field), follow pagination
- Skip survey targeting flags (keys starting with `survey-targeting-`) unless they have explicit group targeting
