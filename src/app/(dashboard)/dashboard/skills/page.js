"use client";

import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
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
      {copied ? "Tersalin" : label}
    </button>
  );
}

function SkillRow({ skill }) {
  const url = getSkillRawUrl(skill.id);
  return (
    <div className={`an-conn ${skill.isEntry ? "!border-[rgba(232,0,31,0.32)]" : ""}`}>
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

        <div className="an-conn-id">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="an-conn-name">{skill.name}</h3>
            {skill.isEntry && <span className="an-chip accent">MULAI DI SINI</span>}
            {skill.endpoint && (
              <span className="an-chip">
                <code className="text-[10px]">{skill.endpoint}</code>
              </span>
            )}
          </div>
          <p className="an-conn-sub mt-1 !whitespace-normal">{skill.description}</p>
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

      <div className="an-conn-actions">
        <CopyButton value={url} />
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const entryUrl = getSkillRawUrl("9router");
  const withEndpoint = SKILLS.filter((s) => s.endpoint).length;

  return (
    <div className="an-scope flex min-w-0 flex-col gap-5">
      {/* Hero */}
      <section className="an-panel an-hero">
        <div className="an-hero-main">
          <span className="an-hero-eyebrow">Skills</span>
          <h1 className="an-hero-title">Skill untuk AI Kamu</h1>
          <p className="an-hero-sub">
            Tempel satu tautan ke AI-mu, lalu dia otomatis pakai kemampuan
            RouterMod — chat, gambar, suara, embedding, dan lainnya.
          </p>
        </div>
        <div className="an-hero-stats">
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">extension</span>
              Skill
            </span>
            <span className="an-stat-value">{SKILLS.length}</span>
            <span className="an-stat-foot">kemampuan tersedia</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">api</span>
              Endpoint
            </span>
            <span className="an-stat-value">{withEndpoint}</span>
            <span className="an-stat-foot">punya endpoint khusus</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">hub</span>
              Entry
            </span>
            <span className="an-stat-value">1</span>
            <span className="an-stat-foot">skill awal</span>
          </div>
          <div className="an-stat">
            <span className="an-stat-label">
              <span className="material-symbols-outlined">code</span>
              Format
            </span>
            <span className="an-stat-value">MD</span>
            <span className="an-stat-foot">format skill file</span>
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
            <h2 className="an-panel-title">Tempel ke AI kamu</h2>
            <p className="an-panel-sub">Kirim kalimat ini ke AI-mu</p>
          </div>
          <div className="an-panel-actions">
            <CopyButton value={`Read this skill and use it: ${entryUrl}`} label="Salin prompt" />
          </div>
        </header>
        <div className="an-panel-pad">
          <div className="an-kv">
            <span className="shrink-0">Read this skill and use it:</span>
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
            <h2 className="an-panel-title">Daftar Skill</h2>
            <p className="an-panel-sub">
              <span>{SKILLS.length}</span>{" "}
              <span>skill yang bisa dipakai langsung</span>
            </p>
          </div>
        </header>
        <div className="an-panel-pad">
          <div className="an-conn-list">
            {SKILLS.map((skill) => (
              <SkillRow key={skill.id} skill={skill} />
            ))}
          </div>
        </div>
      </section>

      {/* GitHub */}
      <section className="an-panel">
        <div className="an-panel-pad flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="an-panel-title">Lainnya di GitHub</h2>
            <p className="an-panel-sub">
              Lihat sumber, README, dan contoh penggunaan.
            </p>
          </div>
          <a
            href={`${SKILLS_REPO_URL}/tree/master/skills`}
            target="_blank"
            rel="noreferrer"
            className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            Buka di GitHub
          </a>
        </div>
      </section>
    </div>
  );
}
