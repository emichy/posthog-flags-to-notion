import { fetchFlags, analyzeFlag, resolveGroupName } from "./posthog.js";
import {
  createClient,
  ensureSchema,
  ensureDirectorySchema,
  getExistingPages,
  upsertFlag,
  upsertDirectoryEntry,
  archiveStaleFlags,
} from "./notion.js";

export async function syncFlags({ posthog, notion, skipSurveyFlags, dryRun }) {
  console.log(dryRun ? "\n[DRY RUN] No changes will be written to Notion.\n" : "");
  console.log("Fetching feature flags from PostHog...");

  const flags = await fetchFlags(posthog);
  console.log(`  Found ${flags.length} flags`);

  if (flags.length === 0) {
    console.log(
      "\nPostHog returned zero flags. Refusing to sync — this is almost always a misconfigured API key or project ID, " +
      "and proceeding would archive every row in your Notion database. Verify POSTHOG_API_KEY and POSTHOG_PROJECT_ID."
    );
    return;
  }

  // Analyze every flag first so we can decide what to skip based on real
  // targeting, not on key prefix. A survey-targeting flag with explicit
  // project targeting is still meaningful and should sync.
  console.log("\nAnalyzing targeting rules...");
  const allGroupIds = new Set();
  const analyzedAll = flags.map((f) => {
    const { targeting, targetedIds } = analyzeFlag(f, posthog.groupPropertyKey);
    return { ...f, targeting, targetedIds };
  });

  const analyzed = analyzedAll.filter((f) => {
    if (skipSurveyFlags && f.key.startsWith("survey-targeting-") && f.targetedIds.length === 0) {
      return false;
    }
    return true;
  });
  const skipped = analyzedAll.length - analyzed.length;
  if (skipped) console.log(`  Skipping ${skipped} survey-targeting flag(s) without project targeting`);

  analyzed.forEach((f) => f.targetedIds.forEach((id) => allGroupIds.add(id)));

  // Resolve group IDs to names
  const groupMap = new Map();
  if (allGroupIds.size > 0) {
    console.log(`\nResolving ${allGroupIds.size} group IDs to names...`);
    let resolved = 0;
    for (const id of allGroupIds) {
      const result = await resolveGroupName({
        apiKey: posthog.apiKey,
        projectId: posthog.projectId,
        host: posthog.host,
        groupTypeIndex: posthog.groupTypeIndex,
        groupKey: id,
      });
      if (result) {
        groupMap.set(id, result);
        resolved++;
      } else {
        groupMap.set(id, { name: id, tier: "" });
        console.log(`  Warning: Could not resolve group "${id}"`);
      }
    }
    console.log(`  Resolved ${resolved}/${allGroupIds.size}`);
  }

  // Build flag data with resolved names + a reverse index (groupId → flagKeys)
  // so each directory row can list which flags target it.
  const groupToFlags = new Map();
  const flagData = analyzed.map((f) => {
    const names = f.targetedIds
      .map((id) => groupMap.get(id)?.name || id)
      .sort((a, b) => a.localeCompare(b));
    for (const id of f.targetedIds) {
      if (!groupToFlags.has(id)) groupToFlags.set(id, []);
      groupToFlags.get(id).push(f.key);
    }
    return {
      key: f.key,
      name: f.name || f.key,
      active: f.active,
      targeting: f.targeting,
      groupsEnabled: names.join(", "),
      posthogUrl: `${posthog.host}/project/${posthog.projectId}/feature_flags/${f.id}`,
    };
  });

  if (dryRun) {
    console.log("\n[DRY RUN] Would sync these flags:\n");
    for (const f of flagData) {
      console.log(`  ${f.active ? "+" : "-"} ${f.key}`);
      console.log(`    ${f.targeting}`);
      if (f.groupsEnabled) console.log(`    Groups: ${f.groupsEnabled}`);
      console.log(`    URL: ${f.posthogUrl}`);
    }
    if (notion.directoryDatabaseId && allGroupIds.size > 0) {
      console.log(`\n[DRY RUN] Would sync ${allGroupIds.size} directory entries`);
    }
    return;
  }

  // Write to Notion
  const client = createClient(notion.apiKey);

  console.log("\nSyncing flags to Notion...");
  const { titlePropName, properties: schemaProps } = await ensureSchema(client, notion.databaseId);
  const existingFlags = await getExistingPages(client, notion.databaseId);

  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const f of flagData) {
    const result = await upsertFlag(client, notion.databaseId, existingFlags, f, titlePropName, schemaProps);
    if (result === "created") created++;
    else if (result === "updated") updated++;
    else failed++;
  }
  console.log(`  ${created} created, ${updated} updated${failed ? `, ${failed} failed` : ""}`);

  // Archive flags that no longer exist in PostHog
  const currentFlagKeys = new Set(flagData.map((f) => f.key));
  const archived = await archiveStaleFlags(client, notion.databaseId, existingFlags, currentFlagKeys);
  if (archived > 0) console.log(`  ${archived} archived (no longer in PostHog)`);

  // Optional: Directory
  if (notion.directoryDatabaseId && allGroupIds.size > 0) {
    console.log("\nSyncing group directory...");
    const { titlePropName: dirTitlePropName, properties: dirSchemaProps } =
      await ensureDirectorySchema(client, notion.directoryDatabaseId);
    const existingDir = await getExistingPages(client, notion.directoryDatabaseId);

    let dirCreated = 0;
    let dirUpdated = 0;
    let dirFailed = 0;
    for (const [id, info] of groupMap) {
      const result = await upsertDirectoryEntry(
        client,
        notion.directoryDatabaseId,
        existingDir,
        {
          groupId: id,
          name: info.name,
          tier: info.tier,
          flagKeys: (groupToFlags.get(id) || []).slice().sort(),
        },
        dirTitlePropName,
        dirSchemaProps
      );
      if (result === "created") dirCreated++;
      else if (result === "updated") dirUpdated++;
      else dirFailed++;
    }
    console.log(`  ${dirCreated} created, ${dirUpdated} updated${dirFailed ? `, ${dirFailed} failed` : ""}`);
  }

  console.log("\nDone!");
}
