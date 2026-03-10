import { Client } from "@notionhq/client";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RATE_LIMIT_DELAY = 350; // ~3 req/s with headroom
const MAX_RETRIES = 3;

async function notionRequest(fn) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) await sleep(RATE_LIMIT_DELAY);
      return await fn();
    } catch (e) {
      if (e?.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = (e?.headers?.["retry-after"] || 1) * 1000;
        console.log(`  Rate limited, retrying in ${retryAfter}ms...`);
        await sleep(retryAfter);
        continue;
      }
      throw e;
    }
  }
}

export function createClient(apiKey) {
  return new Client({ auth: apiKey });
}

export async function ensureSchema(notion, databaseId) {
  let db;
  try {
    db = await notionRequest(() => notion.databases.retrieve({ database_id: databaseId }));
  } catch (e) {
    throw new Error(
      `Cannot access Notion database ${databaseId}. ` +
      `Make sure the database exists and is shared with your integration. ` +
      `(${e.message})`
    );
  }

  const existing = Object.keys(db.properties);

  const needed = {
    "Flag Key": { rich_text: {} },
    Status: {
      select: {
        options: [
          { name: "Active", color: "green" },
          { name: "Inactive", color: "red" },
          { name: "Archived", color: "default" },
        ],
      },
    },
    Targeting: { rich_text: {} },
    "Groups Enabled": { rich_text: {} },
    "PostHog URL": { url: {} },
    "Last Synced": { date: {} },
  };

  const updates = {};
  for (const [name, config] of Object.entries(needed)) {
    if (!existing.includes(name)) updates[name] = config;
  }

  if (Object.keys(updates).length > 0) {
    await notionRequest(() => notion.databases.update({ database_id: databaseId, properties: updates }));
    console.log(`  Added columns: ${Object.keys(updates).join(", ")}`);
  }

  // Find the title property name once and return it
  const titlePropName = Object.entries(db.properties)
    .find(([, v]) => v.type === "title")?.[0] || "Name";

  return { db, titlePropName };
}

export async function ensureDirectorySchema(notion, databaseId) {
  let db;
  try {
    db = await notionRequest(() => notion.databases.retrieve({ database_id: databaseId }));
  } catch (e) {
    throw new Error(
      `Cannot access Notion directory database ${databaseId}. ` +
      `Make sure the database exists and is shared with your integration. ` +
      `(${e.message})`
    );
  }

  const existing = Object.keys(db.properties);

  const needed = {
    "Group ID": { rich_text: {} },
    Tier: { rich_text: {} },
  };

  const updates = {};
  for (const [name, config] of Object.entries(needed)) {
    if (!existing.includes(name)) updates[name] = config;
  }

  if (Object.keys(updates).length > 0) {
    await notionRequest(() => notion.databases.update({ database_id: databaseId, properties: updates }));
    console.log(`  Added directory columns: ${Object.keys(updates).join(", ")}`);
  }

  const titlePropName = Object.entries(db.properties)
    .find(([, v]) => v.type === "title")?.[0] || "Name";

  return { db, titlePropName };
}

export async function getExistingPages(notion, databaseId) {
  const pages = [];
  let cursor;
  do {
    const res = await notionRequest(() =>
      notion.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
      })
    );
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function richText(text) {
  if (!text) return [];
  return [{ text: { content: text.slice(0, 2000) } }];
}

function getRichText(page, propName) {
  return page.properties[propName]?.rich_text?.[0]?.plain_text || "";
}

export async function upsertFlag(notion, databaseId, existing, flag, titlePropName) {
  const match = existing.find((p) => getRichText(p, "Flag Key") === flag.key);

  const properties = {
    "Flag Key": { rich_text: richText(flag.key) },
    Status: { select: { name: flag.active ? "Active" : "Inactive" } },
    Targeting: { rich_text: richText(flag.targeting) },
    "Groups Enabled": { rich_text: richText(flag.groupsEnabled) },
    "PostHog URL": { url: flag.posthogUrl || null },
    "Last Synced": { date: { start: new Date().toISOString().split("T")[0] } },
  };

  try {
    if (match) {
      await notionRequest(() => notion.pages.update({ page_id: match.id, properties }));
      return "updated";
    } else {
      properties[titlePropName] = { title: richText(flag.name) };
      await notionRequest(() => notion.pages.create({ parent: { database_id: databaseId }, properties }));
      return "created";
    }
  } catch (e) {
    console.log(`  Warning: Failed to sync flag "${flag.key}": ${e.message}`);
    return "failed";
  }
}

export async function archiveStaleFlags(notion, databaseId, existing, currentFlagKeys) {
  const stale = existing.filter((p) => {
    const key = getRichText(p, "Flag Key");
    if (!key) return false;
    const status = p.properties.Status?.select?.name;
    if (status === "Archived") return false;
    return !currentFlagKeys.has(key);
  });

  let archived = 0;
  for (const page of stale) {
    try {
      await notionRequest(() =>
        notion.pages.update({
          page_id: page.id,
          properties: {
            Status: { select: { name: "Archived" } },
          },
        })
      );
      archived++;
    } catch (e) {
      const key = getRichText(page, "Flag Key");
      console.log(`  Warning: Failed to archive "${key}": ${e.message}`);
    }
  }
  return archived;
}

export async function upsertDirectoryEntry(notion, databaseId, existing, entry, titlePropName) {
  const match = existing.find((p) => getRichText(p, "Group ID") === entry.groupId);

  const properties = {
    "Group ID": { rich_text: richText(entry.groupId) },
    Tier: { rich_text: richText(entry.tier) },
  };

  try {
    if (match) {
      await notionRequest(() => notion.pages.update({ page_id: match.id, properties }));
      return "updated";
    } else {
      properties[titlePropName] = { title: richText(entry.name) };
      await notionRequest(() => notion.pages.create({ parent: { database_id: databaseId }, properties }));
      return "created";
    }
  } catch (e) {
    console.log(`  Warning: Failed to sync directory entry "${entry.name}": ${e.message}`);
    return "failed";
  }
}
