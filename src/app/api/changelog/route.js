import { NextResponse } from "next/server";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Try fetching live commits directly from GitHub API
    try {
      const ghRes = await fetch(
        "https://api.github.com/repos/techwiz37/routermod/commits?per_page=7",
        {
          headers: {
            "User-Agent": "RouterMod",
            Accept: "application/vnd.github.v3+json",
          },
          next: { revalidate: 60 },
        }
      );

      if (ghRes.ok) {
        const data = await ghRes.json();
        if (Array.isArray(data) && data.length > 0) {
          const commits = data.map((item) => {
            const rawMsg = item.commit?.message || "";
            const lines = rawMsg.split("\n");
            const title = lines[0] || "";
            const body = lines.slice(1).join("\n").trim();

            return {
              sha: item.sha?.slice(0, 7) || "",
              fullSha: item.sha,
              title,
              body,
              author: item.commit?.author?.name || item.author?.login || "Techwiz",
              date: item.commit?.author?.date || "",
              url: item.html_url || `https://github.com/techwiz37/routermod/commit/${item.sha}`,
            };
          });

          return NextResponse.json({ source: "github", commits });
        }
      }
    } catch (apiErr) {
      console.warn("GitHub API fetch failed, falling back to local git:", apiErr);
    }

    // 2. Fallback to local git log
    try {
      const gitOutput = execSync(
        'git log -n 7 --pretty=format:"%h%x09%an%x09%ad%x09%s" --date=short',
        { encoding: "utf-8" }
      );

      const commits = gitOutput
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [sha, author, date, ...rest] = line.split("\t");
          const title = rest.join("\t");
          return {
            sha,
            fullSha: sha,
            title,
            body: "",
            author,
            date,
            url: `https://github.com/techwiz37/routermod/commit/${sha}`,
          };
        });

      return NextResponse.json({ source: "git-local", commits });
    } catch (gitErr) {
      console.warn("Local git log failed:", gitErr);
    }

    return NextResponse.json({ commits: [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
