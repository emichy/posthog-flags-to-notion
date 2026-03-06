import { Client } from "@notionhq/client";

export function createClient(apiKey) {
  return new Client({ auth: apiKey });
}

export async function ensureSchema(notion, databaseId) {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  const existing = Object.keys(db.properties);

  const needed = {
    "Flag Key": { rich_text: {} },
    Status: {
      select: {
        options: [
          { name: "Active", color: "green" },
          { name: "Inactive", color: "red" },
        ],
      },
    },
    Targeting: { rich_text: {} },
    "Groups Enabled": { rich_text: {} },
    "Last Synced": { date: {} },
  };

  const updates = {};
  for (const [name, config] of Object.entries(needed)) {
    if (!existing.includes(name)) updates[name] = config;
  }

  if (Object.keys(updates).length > 0) {
    await notion.databases.update({
      database_id: databaseId,
      properties: updates,
    });
    console.log(`  Added columns: ${Object.keys(updates).join(", ")}`);
  }

  return db;
}

export async function ensureDirectorySchema(notion, databaseId) {
  const db = await notion.databases.retrieve({ database_id: databaseId });
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
    await notion.databases.update({
      database_id: databaseId,
      properties: updates,
    });
    console.log(`  Added directory columns: ${Object.keys(updates).join(", ")}`);
  }

  return db;
}

export async function getExistingPages(notion, databaseId) {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function richText(text) {
  if (!text) return [];
  return [{ text: { content: text.slice(0, 2000) } }];
}

function getTitleText(page) {
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  return titleProp?.title?.[0]?.plain_text || "";
}

function getRichText(page, propName) {
  return page.properties[propName]?.rich_text?.[0]?.plain_text || "";
}

export async function upsertFlag(notion, databaseId, existing, flag) {
  const match = existing.find((p) => getRichText(p, "Flag Key") === flag.key);

  const properties = {
    "Flag Key": { rich_text: richText(flag.key) },
    Status: { select: { name: flag.active ? "Active" : "Inactive" } },
    Targeting: { rich_text: richText(flag.targeting) },
    "Groups Enabled": { rich_text: richText(flag.groupsEnabled) },
    "Last Synced": { date: { start: new Date().toISOString().split("T")[0] } },
  };

  if (match) {
    await notion.pages.update({ page_id: match.id, properties });
    return "updated";
  } else {
    const titlePropName = Object.entries(
      (await notion.databases.retrieve({ database_id: databaseId })).properties
    ).find(([, v]) => v.type === "title")?.[0] || "Name";

    properties[titlePropName] = { title: richText(flag.name) };
    await notion.pages.create({ parent: { database_id: databaseId }, properties });
    return "created";
  }
}

export async function upsertDirectoryEntry(notion, databaseId, existing, entry) {
  const match = existing.find((p) => getRichText(p, "Group ID") === entry.groupId);

  const properties = {
    "Group ID": { rich_text: richText(entry.groupId) },
    Tier: { rich_text: richText(entry.tier) },
  };

  if (match) {
    await notion.pages.update({ page_id: match.id, properties });
    return "updated";
  } else {
    const titlePropName = Object.entries(
      (await notion.databases.retrieve({ database_id: databaseId })).properties
    ).find(([, v]) => v.type === "title")?.[0] || "Name";

    properties[titlePropName] = { title: richText(entry.name) };
    await notion.pages.create({ parent: { database_id: databaseId }, properties });
    return "created";
  }
}
