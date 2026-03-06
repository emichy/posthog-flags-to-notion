export function getConfig() {
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
    skipSurveyFlags: process.env.SKIP_SURVEY_FLAGS !== "false",
  };
}

export function validateConfig(config, { requireNotion = true } = {}) {
  const missing = [];
  if (!config.posthog.apiKey) missing.push("POSTHOG_API_KEY");
  if (!config.posthog.projectId) missing.push("POSTHOG_PROJECT_ID");
  if (requireNotion) {
    if (!config.notion.apiKey) missing.push("NOTION_API_KEY");
    if (!config.notion.databaseId) missing.push("NOTION_DATABASE_ID");
  }
  return missing;
}
