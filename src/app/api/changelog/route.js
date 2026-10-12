import { NextResponse } from "next/server";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

// In-memory cache — survives hot reload in dev, resets on process restart
let _cache = null;
let _cacheAt = 0;
const TTL = 5 * 60 * 1000; // 5 min

async function fetchFromGitHub() {
  const res = await fetch(
    "https://api.github.com/repos/techwiz37/routermod/commits?per_page=7",
    {
      headers: { "User-Agent": "RouterMod", Accept: "application/vnd.github.v3+json" },
      // bypass Next.js fetch cache — we handle caching ourselves
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error("empty");
  return data.map((item) => {
    const rawMsg = item.commit?.message || "";
    const [title, ...rest] = rawMsg.split("\n");
    return {
      sha: item.sha?.slice(0, 7) || "",
      title: title || "",
      body: rest.join("\n").trim(),
      author: item.commit?.author?.name || item.author?.login || "Techwiz",
      avatar: item.author?.avatar_url || null,
      date: item.commit?.author?.date || "",
      url: item.html_url || `https://github.com/techwiz37/routermod/commit/${item.sha}`,
    };
  });
}

function fetchFromGit() {
  const out = execSync(
    'git log -n 7 --pretty=format:"%h%x09%an%x09%ad%x09%s" --date=short',
    { encoding: "utf-8" }
  );
  return out.split("\n").filter(Boolean).map((line) => {
    const [sha, author, date, ...rest] = line.split("\t");
    return { sha, title: rest.join("\t"), body: "", author, avatar: null, date, url: `https://github.com/techwiz37/routermod/commit/${sha}` };
  });
}

export async function GET() {
  try {
    const now = Date.now();
    if (_cache && now - _cacheAt < TTL) {
      return NextResponse.json({ commits: _cache, cached: true });
    }

    let commits;
    try {
      commits = await fetchFromGitHub();
    } catch {
      commits = fetchFromGit();
    }

    _cache = commits;
    _cacheAt = Date.now();
    return NextResponse.json({ commits });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
