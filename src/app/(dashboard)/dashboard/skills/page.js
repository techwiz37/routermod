"use client";

import { useEffect, useMemo, useState } from "react";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";
import AntaresStat from "@/shared/components/AntaresStat";
import AntaresSegmented from "@/shared/components/AntaresSegmented";
import StarField from "@/shared/components/StarField";
import {
  SKILLS,
  SKILLS_REPO_URL,
  getSkillRawUrl,
  getSkillBlobUrl,
} from "@/shared/constants/skills";

function CopyButton({ value, label = "Copy link", className = "" }) {
  const { copied, copy } = useCopyToClipboard(2000);
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className={`an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 shrink-0 ${className}`}
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
    <article className={`an-conn skills-row ${skill.isEntry ? "is-entry" : ""}`}>
      <div className="an-conn-main">
        <span className={`an-conn-ico ${skill.isEntry ? "is-entry" : ""}`} aria-hidden>
          <span className="material-symbols-outlined">{skill.icon}</span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="an-conn-chips !mt-0">
            <h3 className="an-conn-name">{skill.name}</h3>
            {skill.isEntry && <span className="an-chip accent">{translate("START HERE")}</span>}
            {skill.endpoint && (
              <span className="an-chip skills-endpoint">
                <code>{skill.endpoint}</code>
              </span>
            )}
          </div>
          <p className="an-conn-sub skills-desc">{skill.description}</p>
          <p className="skills-usage">{skill.usage}</p>
          <a
            href={getSkillBlobUrl(skill.id)}
            target="_blank"
            rel="noreferrer"
            className="skills-url"
          >
            <span className="min-w-0 break-all">{url}</span>
            <span className="material-symbols-outlined text-[12px] shrink-0">open_in_new</span>
          </a>
        </div>
      </div>

      <div className="an-conn-actions skills-actions">
        <span className="skills-category">{skill.category}</span>
        <CopyButton value={url} />
        <a
          href={getSkillBlobUrl(skill.id)}
          target="_blank"
          rel="noreferrer"
          className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5"
        >
          <span className="material-symbols-outlined text-[14px]">menu_book</span>
          {translate("Docs")}
        </a>
      </div>
    </article>
  );
}

function GitHubSkillRow({ skill }) {
  return (
    <a
      href={skill.url}
      target="_blank"
      rel="noreferrer"
      className="an-conn skills-github-row"
    >
      <div className="an-conn-main">
        <span className="an-conn-ico" aria-hidden>
          <span className="material-symbols-outlined">auto_awesome</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="an-conn-name">{skill.name}</p>
          <p className="an-conn-sub">{skill.id}</p>
        </div>
      </div>
      <span className="an-conn-btn" aria-hidden>
        <span className="material-symbols-outlined">open_in_new</span>
      </span>
    </a>
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
  const categories = useMemo(
    () => ["All", ...new Set(SKILLS.map((skill) => skill.category))],
    []
  );
  const visibleSkills = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SKILLS.filter((skill) => {
      const matchesCategory = category === "All" || skill.category === category;
      const matchesQuery =
        !needle ||
        [skill.name, skill.description, skill.endpoint, skill.usage]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  useEffect(() => onLocaleChange(() => setLocale(getCurrentLocale())), []);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGithubLoading(true);
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
    <div className="an-scope an-shell skills-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="skills-hero">
        <div className="min-w-0 flex-1">
          <p className="an-eyebrow">
            <span className="an-num">09</span>
            <span className="an-rule" />
            <span>{translate("RouterMod · AI Gateway")}</span>
          </p>
          <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">
            {translate("AI Skills, ready to use")}
          </h1>
          <p className="an-hint max-w-[70ch]">
            {translate("Give your AI clear instructions to use RouterMod for chat, images, audio, embeddings, and web access.")}
          </p>
        </div>
        <a
          href={`${SKILLS_REPO_URL}/tree/master/skills`}
          target="_blank"
          rel="noreferrer"
          className="an-btn an-ghost h-9 px-3 text-[11px] gap-1.5 shrink-0"
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          {translate("Open on GitHub")}
        </a>
      </header>

      {/* ---- Summary tiles ---- */}
      <div className="an-grid skills-stats gap-2.5 sm:gap-3">
        <AntaresStat
          label={translate("Skills")}
          icon="extension"
          tone="default"
          value={SKILLS.length}
          foot={translate("capabilities available")}
        />
        <AntaresStat
          label={translate("Endpoints")}
          icon="api"
          tone="default"
          value={withEndpoint}
          foot={translate("with dedicated routes")}
        />
        <AntaresStat
          label={translate("Entry")}
          icon="hub"
          tone="violet"
          value={1}
          foot={translate("starting skill")}
        />
        <AntaresStat
          label={translate("Format")}
          icon="code"
          tone="ok"
          value="MD"
          foot={translate("skill file format")}
        />
      </div>

      {/* ---- Prompt to paste ---- */}
      <section className="an-panel">
        <header className="an-panel-head skills-prompt-head">
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

      {/* ---- Skill library ---- */}
      <section className="an-panel">
        <header className="an-panel-head an-panel-head-stack">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">extension</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Skill library")}</h2>
            <p className="an-panel-sub">
              {visibleSkills.length} / {SKILLS.length} {translate("skills available")}
            </p>
          </div>
        </header>
        <div className="an-panel-pad">
          <div className="skills-toolbar">
            <div className="an-search skills-search">
              <span className="material-symbols-outlined" aria-hidden>search</span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={translate("Search skills, endpoints, or use cases...")}
                aria-label={translate("Search skills, endpoints, or use cases...")}
                className="an-input"
              />
            </div>
            <AntaresSegmented
              size="sm"
              value={category}
              onChange={setCategory}
              options={categories.map((item) => ({
                value: item,
                label: item === "All" ? translate("All") : item,
              }))}
            />
          </div>

          {visibleSkills.length === 0 ? (
            <div className="an-empty">
              <span className="material-symbols-outlined">search_off</span>
              <p>{translate("No matching skills found.")}</p>
            </div>
          ) : (
            <div className="an-conn-list skills-list">
              {visibleSkills.map((skill) => (
                <SkillRow key={skill.id} skill={skill} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---- GitHub ---- */}
      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">cloud_download</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Available on GitHub")}</h2>
            <p className="an-panel-sub">
              {translate("Auto-detected skill folders and public GitHub collections")}
            </p>
          </div>
          <span className="an-chip">{githubSkills.length}</span>
        </header>
        <div className="an-panel-pad">
          {githubLoading ? (
            <div className="an-empty">
              <span
                className="material-symbols-outlined"
                style={{ animation: "spin 1s linear infinite" }}
              >
                progress_activity
              </span>
              <p>{translate("Scanning GitHub...")}</p>
            </div>
          ) : githubError ? (
            <div className="an-empty">
              <span className="material-symbols-outlined">cloud_off</span>
              <p className="text-[var(--t-danger)]">{githubError}</p>
            </div>
          ) : (
            <>
              <div className="an-conn-list skills-github-list">
                {githubSkills.map((skill) => (
                  <GitHubSkillRow key={skill.id} skill={skill} />
                ))}
              </div>

              {githubCollections.length > 0 && (
                <div className="skills-collections">
                  <div className="skills-collections-head">
                    <p className="skills-section-label">{translate("Public skill collections")}</p>
                    <AntaresSegmented
                      size="sm"
                      value={githubCategory}
                      onChange={(value) => {
                        setGithubCategory(value);
                        setGithubPage(1);
                      }}
                      options={[
                        { value: "all", label: translate("All") },
                        { value: "security", label: translate("Security / Pentest") },
                        { value: "design", label: translate("UI / UX") },
                        { value: "development", label: translate("Development") },
                        { value: "productivity", label: translate("Productivity") },
                      ]}
                    />
                  </div>

                  <div className="skills-collection-grid">
                    {githubCollections.map((collection) => (
                      <a
                        key={collection.id}
                        href={collection.url}
                        target="_blank"
                        rel="noreferrer"
                        className="skills-collection"
                      >
                        <span className="skills-collection-top">
                          <span className="skills-collection-name">
                            <span className="material-symbols-outlined">public</span>
                            <span className="truncate">{collection.name}</span>
                          </span>
                          <span className="skills-collection-stars">★ {collection.stars}</span>
                        </span>
                        <span className="skills-collection-desc">{collection.description}</span>
                      </a>
                    ))}
                  </div>

                  <div className="skills-pager">
                    <button
                      type="button"
                      disabled={githubPage <= 1 || githubLoading}
                      onClick={() => setGithubPage((page) => Math.max(1, page - 1))}
                      className="an-btn an-ghost h-8 px-3 text-[11px] disabled:opacity-40"
                    >
                      {translate("Previous")}
                    </button>
                    <span className="skills-pager-info">
                      {translate("Page")} {githubPage}
                    </span>
                    <button
                      type="button"
                      disabled={!githubHasNext || githubLoading}
                      onClick={() => setGithubPage((page) => page + 1)}
                      className="an-btn an-ghost h-8 px-3 text-[11px] disabled:opacity-40"
                    >
                      {translate("Next")}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ---- More on GitHub ---- */}
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
