import { fetchFlags, analyzeFlag, resolveGroupName } from "./posthog.js";
import {
  createClient,
  ensureSchema,
  ensureDirectorySchema,
  getExistingPages,
  upsertFlag,
  upsertDirectoryEntry,
} from "./notion.js";

export async function syncFlags({ posthog, notion, skipSurveyFlags, dryRun }) {
  console.log(dryRun ? "\n[DRY RUN] No changes will be written to Notion.\n" : "");
  console.log("Fetching feature flags from PostHog...");

  const flags = await fetchFlags(posthog);
  console.log(`  Found ${flags.length} flags`);

  // Filter
  const filtered = flags.filter((f) => {
    if (skipSurveyFlags && f.key.startsWith("survey-targeting-")) return false;
    return true;
  });
  const skipped = flags.length - filtered.length;
  if (skipped) console.log(`  Skipping ${skipped} survey-targeting flags`);

  // Analyze and collect group IDs
  console.log("\nAnalyzing targeting rules...");
  const allGroupIds = new Set();
  const analyzed = filtered.map((f) => {
    const { targeting, targetedIds } = analyzeFlag(f, posthog.groupPropertyKey);
    targetedIds.forEach((id) => allGroupIds.add(id));
    return { ...f, targeting, targetedIds };
  });

  // Resolve group IDs to names
  const groupMap = new Map();
  if (allGroupIds.size > 0) {
    console.log(`\nResolving ${allGroupIds.size} group IDs to names...`);
    for (const id of allGroupIds) {
      const resolved = await resolveGroupName({
        apiKey: posthog.apiKey,
        projectId: posthog.projectId,
        host: posthog.host,
        groupTypeIndex: posthog.groupTypeIndex,
        groupKey: id,
      });
      groupMap.set(id, resolved || { name: id, tier: "" });
    }
    const resolvedCount = [...groupMap.values()].filter((v) => v.name !== v.groupId).length;
    console.log(`  Resolved ${resolvedCount}/${allGroupIds.size}`);
  }

  // Build flag data with resolved names
  const flagData = analyzed.map((f) => {
    const names = f.targetedIds
      .map((id) => groupMap.get(id)?.name || id)
      .sort((a, b) => a.localeCompare(b));
    return {
      key: f.key,
      name: f.name || f.key,
      active: f.active,
      targeting: f.targeting,
      groupsEnabled: names.join(", "),
    };
  });

  if (dryRun) {
    console.log("\n[DRY RUN] Would sync these flags:\n");
    for (const f of flagData) {
      console.log(`  ${f.active ? "+" : "-"} ${f.key}`);
      console.log(`    ${f.targeting}`);
      if (f.groupsEnabled) console.log(`    Groups: ${f.groupsEnabled}`);
    }
    if (notion.directoryDatabaseId && allGroupIds.size > 0) {
      console.log(`\n[DRY RUN] Would sync ${allGroupIds.size} directory entries`);
    }
    return;
  }

  // Write to Notion
  const client = createClient(notion.apiKey);

  console.log("\nSyncing flags to Notion...");
  await ensureSchema(client, notion.databaseId);
  const existingFlags = await getExistingPages(client, notion.databaseId);

  let created = 0;
  let updated = 0;
  for (const f of flagData) {
    const result = await upsertFlag(client, notion.databaseId, existingFlags, f);
    if (result === "created") created++;
    else updated++;
  }
  console.log(`  ${created} created, ${updated} updated`);

  // Optional: Directory
  if (notion.directoryDatabaseId && allGroupIds.size > 0) {
    console.log("\nSyncing group directory...");
    await ensureDirectorySchema(client, notion.directoryDatabaseId);
    const existingDir = await getExistingPages(client, notion.directoryDatabaseId);

    let dirCreated = 0;
    let dirUpdated = 0;
    for (const [id, info] of groupMap) {
      const result = await upsertDirectoryEntry(
        client,
        notion.directoryDatabaseId,
        existingDir,
        { groupId: id, name: info.name, tier: info.tier }
      );
      if (result === "created") dirCreated++;
      else dirUpdated++;
    }
    console.log(`  ${dirCreated} created, ${dirUpdated} updated`);
  }

  console.log("\nDone!");
}
