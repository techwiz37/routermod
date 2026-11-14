import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REPO = "decolua/9router";
const BRANCH = "master";

function titleFromRepo(repo) {
  return repo.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const category = searchParams.get("category") || "all";
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/contents/skills?ref=${BRANCH}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RouterMod",
      },
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const entries = await response.json();
    const directories = entries.filter((entry) => entry.type === "dir" && entry.name);
    const localSkills = directories.map((entry) => ({
      id: entry.name,
      name: entry.name.replace(/(^|-)/g, (_, prefix) => prefix ? " " : "").replace(/\b\w/g, (char) => char.toUpperCase()),
      url: entry.html_url,
      rawUrl: `https://raw.githubusercontent.com/${REPO}/refs/heads/${BRANCH}/skills/${entry.name}/SKILL.md`,
      source: REPO,
      kind: "skill",
    }));

    // Repository search is public and does not require a GitHub token. It
    // discovers other public skill collections without mixing their files
    // into RouterMod's built-in skill list.
    const topics = {
      all: '"agent skills" OR "SKILL.md"',
      security: '(pentest OR cybersecurity OR infosec OR "security testing") AND (skill OR agent OR SKILL.md)',
      design: '("UI UX" OR "user experience" OR "design system") AND (skill OR agent OR SKILL.md)',
      development: '("developer tools" OR coding OR programming) AND (skill OR agent OR SKILL.md)',
      productivity: '(productivity OR research OR writing) AND (skill OR agent OR SKILL.md)',
    };
    const query = topics[category] || topics.all;
    const searchResponse = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=20&page=${page}`,
      { headers: { Accept: "application/vnd.github+json", "User-Agent": "RouterMod" }, next: { revalidate: 900 } },
    );
    const searchData = searchResponse.ok ? await searchResponse.json() : { items: [], total_count: 0 };
    const collections = (searchData.items || [])
      .filter((repo) => repo.full_name?.toLowerCase() !== REPO.toLowerCase())
      .map((repo) => ({
        id: repo.full_name,
        name: repo.name ? titleFromRepo(repo.name) : repo.full_name,
        description: repo.description || "Public GitHub skill collection",
        url: repo.html_url,
        stars: repo.stargazers_count || 0,
        source: repo.full_name,
        kind: "collection",
        category,
      }));

    return NextResponse.json({
      skills: localSkills,
      collections,
      page,
      total: Math.min(searchData.total_count || 0, 1000),
      hasNextPage: page * 20 < Math.min(searchData.total_count || 0, 1000),
      categories: Object.keys(topics),
      repo: `https://github.com/${REPO}/tree/${BRANCH}/skills`,
    }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch (error) {
    return NextResponse.json({ error: error.message, skills: [] }, { status: 502 });
  }
}
