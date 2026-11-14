"use client";

import { useEffect, useMemo, useState } from "react";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";
import {
  SKILLS,
  SKILLS_REPO_URL,
  getSkillRawUrl,
  getSkillBlobUrl,
} from "@/shared/constants/skills";

function CopyButton({ value, label = "Copy link" }) {
  const { copied, copy } = useCopyToClipboard(2000);
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 shrink-0"
      title={value}
    >
      <span className="material-symbols-outlined text-[14px]">
        {copied ? "check" : "content_copy"}
      </span>
      {copied ? translate("Copied") : label}
    </button>
  );
}

function SkillRow({ skill }) {
  const url = getSkillRawUrl(skill.id);
  return (
    <article className={`group rounded-2xl border bg-[var(--t-raised)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--t-accent)]/50 hover:shadow-[0_12px_30px_rgba(0,0,0,0.16)] ${skill.isEntry ? "border-[rgba(232,0,31,0.42)] bg-[linear-gradient(135deg,rgba(232,0,31,0.08),transparent_48%)]" : "border-[var(--t-line)]"}`}>
      <div className="an-conn-main">
        <span
          className={`an-conn-ico ${
            skill.isEntry
              ? "!bg-[var(--t-accent-soft)] !text-[var(--t-star-ink)] !border-[rgba(232,0,31,0.3)]"
              : ""
          }`}
          aria-hidden
        >
          <span className="material-symbols-outlined">{skill.icon}</span>
        </span>

        <div className="an-conn-id min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="an-conn-name">{skill.name}</h3>
            {skill.isEntry && <span className="an-chip accent">{translate("START HERE")}</span>}
            {skill.endpoint && (
              <span className="an-chip">
                <code className="text-[10px]">{skill.endpoint}</code>
              </span>
            )}
          </div>
          <p className="an-conn-sub mt-1 !whitespace-normal">{skill.description}</p>
          <p className="mt-3 text-xs leading-relaxed text-[var(--t-ink)]/75">{skill.usage}</p>
          <a
            href={getSkillBlobUrl(skill.id)}
            target="_blank"
            rel="noreferrer"
            className="an-conn-sub mt-1 flex items-start gap-1 min-w-0 hover:!text-[var(--t-ink)] break-all"
          >
            <span className="min-w-0 break-all">{url}</span>
            <span className="material-symbols-outlined text-[12px] shrink-0 mt-0.5">open_in_new</span>
          </a>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--t-line-soft)] pt-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-dim)]">{skill.category}</span>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={url} />
          <a href={getSkillBlobUrl(skill.id)} target="_blank" rel="noreferrer" className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5">
            <span className="material-symbols-outlined text-[14px]">menu_book</span>
            {translate("Docs")}
          </a>
        </div>
      </div>
    </article>
  );
}

export default function SkillsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [locale, setLocale] = useState(getCurrentLocale());
  const [githubSkills, setGithubSkills] = useState([]);
  const [githubCollections, setGithubCollections] = useState([]);
  const [githubLoading, setGithubLoading] = useState(true);
  const [githubError, setGithubError] = useState("");
  const [githubPage, setGithubPage] = useState(1);
  const [githubCategory, setGithubCategory] = useState("all");
  const [githubHasNext, setGithubHasNext] = useState(false);
  const entryUrl = getSkillRawUrl("9router");
  const withEndpoint = SKILLS.filter((s) => s.endpoint).length;
  const categories = ["All", ...new Set(SKILLS.map((skill) => skill.category))];
  const visibleSkills = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SKILLS.filter((skill) => {
      const matchesCategory = category === "All" || skill.category === category;
      const matchesQuery = !needle || [skill.name, skill.description, skill.endpoint, skill.usage].join(" ").toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  useEffect(() => onLocaleChange(() => setLocale(getCurrentLocale())), []);
  useEffect(() => {
    let cancelled = false;
    setGithubLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGithubError("");
    fetch(`/api/skills/github?page=${githubPage}&category=${githubCategory}`, { cache: "no-store" })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || translate("Unable to load GitHub skills"));
        if (!cancelled) setGithubSkills(data.skills || []);
        if (!cancelled) setGithubCollections(data.collections || []);
        if (!cancelled) setGithubHasNext(Boolean(data.hasNextPage));
      })
      .catch((error) => { if (!cancelled) setGithubError(error.message); })
      .finally(() => { if (!cancelled) setGithubLoading(false); });
    return () => { cancelled = true; };
  }, [githubCategory, githubPage, locale]);

  return (
    <div className="an-scope flex min-w-0 flex-col gap-5">
      {/* Hero */}
      <section className="an-panel an-hero">
        <div className="an-hero-main">
          <span className="an-hero-eyebrow">{translate("Skills")}</span>
          <h1 className="an-hero-title">{translate("AI Skills, ready to use")}</h1>
          <p className="an-hero-sub">
            {translate("Give your AI clear instructions to use RouterMod for chat, images, audio, embeddings, and web access.")}
          </p>
        </div>
        <div className="an-hero-stats">
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">extension</span>
              {translate("Skills")}
            </span>
            <span className="an-stat-value">{SKILLS.length}</span>
            <span className="an-stat-foot">{translate("capabilities available")}</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">api</span>
              {translate("Endpoints")}
            </span>
            <span className="an-stat-value">{withEndpoint}</span>
            <span className="an-stat-foot">{translate("with dedicated routes")}</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">hub</span>
              {translate("Entry")}
            </span>
            <span className="an-stat-value">1</span>
            <span className="an-stat-foot">{translate("starting skill")}</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">code</span>
              {translate("Format")}
            </span>
            <span className="an-stat-value">MD</span>
            <span className="an-stat-foot">{translate("skill file format")}</span>
          </div>
        </div>
      </section>

      {/* Prompt to paste */}
      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">content_paste</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Paste into your AI")}</h2>
            <p className="an-panel-sub">{translate("Send this instruction to your AI")}</p>
          </div>
          <div className="an-panel-actions">
            <CopyButton value={`Read this skill and use it: ${entryUrl}`} label={translate("Copy prompt")} />
          </div>
        </header>
        <div className="an-panel-pad">
          <div className="an-kv">
            <span className="shrink-0">{translate("Read this skill and use it:")}</span>
            <code className="flex-1">{entryUrl}</code>
          </div>
        </div>
      </section>

      {/* Skill list */}
      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">extension</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Skill library")}</h2>
            <p className="an-panel-sub">
              <span>{visibleSkills.length} / {SKILLS.length} {translate("skills available")}</span>
            </p>
          </div>
        </header>
        <div className="an-panel-pad">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-[var(--t-muted)]">search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={translate("Search skills, endpoints, or use cases...")} className="an-input !py-2.5 !pl-10 !pr-3 text-sm" />
            </label>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="an-input !w-full !py-2.5 !px-3 text-sm sm:w-auto sm:min-w-44">
              {categories.map((item) => <option key={item}>{item === "All" ? translate("All") : item}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {visibleSkills.map((skill) => (
              <SkillRow key={skill.id} skill={skill} />
            ))}
          </div>
          {!visibleSkills.length && <p className="py-10 text-center text-sm text-[var(--t-muted)]">{translate("No matching skills found.")}</p>}
        </div>
      </section>

      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden><span className="material-symbols-outlined">cloud_download</span></span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Available on GitHub")}</h2>
            <p className="an-panel-sub">{translate("Auto-detected skill folders and public GitHub collections")}</p>
          </div>
          <span className="an-chip">{githubSkills.length}</span>
        </header>
        <div className="an-panel-pad">
          {githubLoading ? <p className="text-sm text-[var(--t-muted)]">{translate("Scanning GitHub...")}</p> : githubError ? <p className="text-sm text-red-400">{githubError}</p> : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {githubSkills.map((skill) => <a key={skill.id} href={skill.url} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--t-line)] bg-[var(--t-raised)] p-3 transition hover:border-[var(--t-accent)]/60 hover:bg-[var(--t-surface)]"><span className="flex items-center gap-2 text-sm font-semibold"><span className="material-symbols-outlined text-[17px] text-[var(--t-accent)]">auto_awesome</span>{skill.name}</span><span className="mt-1 block truncate text-[11px] text-[var(--t-muted)]">{skill.id}</span></a>)}
            </div>
          )}
          {!githubLoading && !githubError && githubCollections.length > 0 && (
            <div className="mt-4 border-t border-[var(--t-line-soft)] pt-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-muted)]">{translate("Public skill collections")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {["all", "security", "design", "development", "productivity"].map((value) => (
                    <button key={value} type="button" onClick={() => { setGithubCategory(value); setGithubPage(1); }} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${githubCategory === value ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)] text-[var(--t-ink)]" : "border-[var(--t-line)] text-[var(--t-muted)] hover:text-[var(--t-ink)]"}`}>
                      {translate(value === "all" ? "All" : value === "security" ? "Security / Pentest" : value === "design" ? "UI / UX" : value === "development" ? "Development" : "Productivity")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {githubCollections.map((collection) => (
                  <a key={collection.id} href={collection.url} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--t-line)] bg-[var(--t-raised)] p-3 transition hover:border-[var(--t-accent)]/60 hover:bg-[var(--t-surface)]">
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold"><span className="flex min-w-0 items-center gap-2"><span className="material-symbols-outlined text-[17px] text-[var(--t-accent)]">public</span><span className="truncate">{collection.name}</span></span><span className="shrink-0 text-[10px] text-[var(--t-muted)]">★ {collection.stars}</span></span>
                    <span className="mt-1 line-clamp-2 text-[11px] text-[var(--t-muted)]">{collection.description}</span>
                  </a>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--t-line-soft)] pt-3">
                <button type="button" disabled={githubPage <= 1 || githubLoading} onClick={() => setGithubPage((page) => Math.max(1, page - 1))} className="an-btn an-ghost h-8 px-3 text-[11px] disabled:opacity-40">{translate("Previous")}</button>
                <span className="text-[11px] text-[var(--t-muted)]">{translate("Page")} {githubPage}</span>
                <button type="button" disabled={!githubHasNext || githubLoading} onClick={() => setGithubPage((page) => page + 1)} className="an-btn an-ghost h-8 px-3 text-[11px] disabled:opacity-40">{translate("Next")}</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* GitHub */}
      <section className="an-panel">
        <div className="an-panel-pad flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="an-panel-title">{translate("More on GitHub")}</h2>
            <p className="an-panel-sub">
              {translate("View source, README, and usage examples.")}
            </p>
          </div>
          <a
            href={`${SKILLS_REPO_URL}/tree/master/skills`}
            target="_blank"
            rel="noreferrer"
            className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            {translate("Open on GitHub")}
          </a>
        </div>
      </section>
    </div>
  );
}
