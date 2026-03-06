export async function fetchFlags({ apiKey, projectId, host }) {
  const flags = [];
  let url = `${host}/api/projects/${projectId}/feature_flags/?limit=100`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`PostHog API error: ${res.status} ${res.statusText}`);
    const data = await res.json();
    flags.push(...data.results);
    url = data.next;
  }

  return flags.filter((f) => !f.deleted);
}

export async function resolveGroupName({ apiKey, projectId, host, groupTypeIndex, groupKey }) {
  const res = await fetch(
    `${host}/api/projects/${projectId}/groups/?group_type_index=${groupTypeIndex}&search=${encodeURIComponent(groupKey)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const group = data.results?.[0];
  if (!group) return null;
  return {
    name: group.group_properties?.name || groupKey,
    tier: group.group_properties?.active_tier || "",
  };
}

export function analyzeFlag(flag, groupPropertyKey) {
  const groups = flag.filters?.groups || [];
  const targetedIds = new Set();
  const parts = [];
  let hasSpecificTargeting = false;

  for (const group of groups) {
    const props = group.properties || [];
    const rollout = group.rollout_percentage;
    const idProps = props.filter(
      (p) => p.key === groupPropertyKey || p.key === "id"
    );

    if (idProps.length > 0) {
      hasSpecificTargeting = true;
      for (const p of idProps) {
        const vals = Array.isArray(p.value) ? p.value : [p.value];
        vals.forEach((v) => targetedIds.add(v));
      }
    } else if (props.length === 0 && rollout != null) {
      if (rollout === 0) parts.push("0% rollout (effectively off)");
      else if (rollout === 100) parts.push("100% rollout");
      else parts.push(`${rollout}% rollout`);
    } else if (props.length > 0 && idProps.length === 0) {
      parts.push("Filtered by properties");
    }
  }

  if (hasSpecificTargeting) parts.unshift("Specific groups");

  return {
    targeting: parts.join(" + ") || "No conditions",
    targetedIds: [...targetedIds],
  };
}
