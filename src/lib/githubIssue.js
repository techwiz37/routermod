import { getSettings } from "@/lib/localDb";

// HTTP status codes / error patterns that indicate a model is permanently dead
const DEAD_MODEL_STATUS_CODES = new Set([404]);
const DEAD_MODEL_PATTERNS = [
  /model.{0,30}(not found|does not exist|invalid|no such|unknown|deprecated|removed|discontinued)/i,
  /invalid.{0,20}model/i,
  /(does not|doesn.t).{0,20}(support|exist|have).{0,20}model/i,
  /model.{0,20}(not|un)(available|supported)/i,
  /no model.{0,30}found/i,
];

export function isDeadModelError(status, errorMsg) {
  if (DEAD_MODEL_STATUS_CODES.has(status)) return true;
  if (!errorMsg) return false;
  return DEAD_MODEL_PATTERNS.some((re) => re.test(errorMsg));
}

// Returns true if issue was created, false if already exists or skipped
export async function reportDeadModel(model, errorMsg) {
  const settings = await getSettings();
  const token = settings.githubToken?.trim();
  const repo = settings.githubRepo?.trim(); // format: "owner/repo"

  if (!token || !repo) return false;

  const title = `[auto] Dead model: ${model}`;
  const label = "dead-model";

  // Deduplicate: search open issues with same title
  const searchUrl = `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${repo} is:issue is:open "${title}"`)}&per_page=1`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "RouterMod",
  };

  try {
    const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(8000) });
    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.total_count > 0) return false; // already reported
    }
  } catch {
    // search failed — still try to create
  }

  const body = `**Model:** \`${model}\`\n\n**Error:**\n\`\`\`\n${errorMsg}\n\`\`\`\n\n*Auto-reported by RouterMod model test.*`;

  const createRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
    signal: AbortSignal.timeout(10000),
  });

  return createRes.ok;
}
