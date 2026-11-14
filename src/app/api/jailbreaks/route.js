import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";

const GITHUB_TREE_URL =
  "https://api.github.com/repos/togg53192-cmd/jailbreaks/git/trees/main?recursive=1";
const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/togg53192-cmd/jailbreaks/main";

// Server-side in-memory cache (1 hour)
let _treeCache = null;
let _treeCacheAt = 0;
const TREE_TTL_MS = 60 * 60 * 1000;

let _contentCache = {};
let _contentCacheAt = {};
const CONTENT_TTL_MS = 60 * 60 * 1000;

async function fetchTree() {
  const now = Date.now();
  if (_treeCache && now - _treeCacheAt < TREE_TTL_MS) return _treeCache;
  const res = await fetch(GITHUB_TREE_URL, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "routermod" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status}`);
  const data = await res.json();
  const templates = (data.tree || [])
    .filter((item) => item.type === "blob" && item.path.endsWith(".md") && item.path !== "README.md")
    .map((item) => {
      const parts = item.path.split("/");
      const folder = parts.length > 1 ? parts[0] : "Other";
      const file = parts[parts.length - 1];
      const name = file.replace(/\.md$/i, "");
      return { path: item.path, folder, name, size: item.size || 0 };
    });
  _treeCache = templates;
  _treeCacheAt = now;
  return templates;
}

async function fetchContent(path) {
  const now = Date.now();
  if (_contentCache[path] && now - (_contentCacheAt[path] || 0) < CONTENT_TTL_MS) {
    return _contentCache[path];
  }
  const url = `${GITHUB_RAW_BASE}/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "routermod" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GitHub content fetch failed: ${res.status}`);
  const text = await res.text();
  _contentCache[path] = text;
  _contentCacheAt[path] = now;
  return text;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/jailbreaks              — returns template list + current assignments
// GET /api/jailbreaks?content=path — returns raw markdown of one template
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const contentPath = url.searchParams.get("content");
    if (contentPath) {
      const text = await fetchContent(contentPath);
      return NextResponse.json({ content: text });
    }

    const [templates, settings] = await Promise.all([
      fetchTree().catch(() => []),
      getSettings(),
    ]);

    return NextResponse.json({
      templates,
      assignments: settings.jailbreakModels || {},
    });
  } catch (error) {
    console.log("[jailbreaks] GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/jailbreaks — { assignments: { "provider/model": { text, enabled } | null } }
export async function PATCH(request) {
  try {
    const body = await request.json();
    const incoming = body.assignments || {};
    const settings = await getSettings();
    const current = { ...(settings.jailbreakModels || {}) };

    for (const [key, value] of Object.entries(incoming)) {
      if (value === null || value === undefined) {
        delete current[key];
      } else {
        current[key] = {
          text: typeof value.text === "string" ? value.text.trim() : "",
          enabled: value.enabled !== false,
        };
        if (!current[key].text) delete current[key];
      }
    }

    const updated = await updateSettings({ jailbreakModels: current });
    return NextResponse.json({ assignments: updated.jailbreakModels || {} });
  } catch (error) {
    console.log("[jailbreaks] PATCH error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
