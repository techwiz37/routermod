"use client";

import { CONTACTS } from "./contacts";

export default function ContactPage() {
  return (
    <div className="an-scope flex min-w-0 flex-col gap-5">
      {/* Hero */}
      <section className="an-panel an-hero">
        <div className="an-hero-main">
          <span className="an-hero-eyebrow">Kontak</span>
          <h1 className="an-hero-title">Hubungi Developer</h1>
          <p className="an-hero-sub">
            Punya bug, ide, atau mau request fitur baru? Langsung saja — biasanya
            dibalas cepat di Telegram.
          </p>
        </div>
        <div className="an-hero-stats">
          {CONTACTS.map((c) => (
            <a
              key={c.platform}
              href={c.url}
              target={c.url.startsWith("mailto") ? undefined : "_blank"}
              rel="noreferrer"
              className="an-stat !bg-[var(--t-raised)] hover:!border-[var(--t-hover-line)]"
            >
              <span className="an-stat-label">
                <span
                  className="material-symbols-outlined"
                  style={{ color: c.color }}
                  aria-hidden
                >
                  {c.icon}
                </span>
                {c.platform}
              </span>
              <span className="an-stat-value !text-[15px] truncate">{c.handle}</span>
              <span className="an-stat-foot">{c.desc}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Channels */}
      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">forum</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">Saluran Kontak</h2>
            <p className="an-panel-sub">
              <span>{CONTACTS.length}</span>{" "}
              <span>pilihan untuk menghubungi</span>
            </p>
          </div>
        </header>

        <div className="an-panel-pad">
          <div className="an-grid-providers !gap-2.5">
            {CONTACTS.map((c) => (
              <a
                key={c.platform}
                href={c.url}
                target={c.url.startsWith("mailto") ? undefined : "_blank"}
                rel="noreferrer"
                className="group block"
              >
                <article className="an-pcard h-full">
                  <div className="an-pcard-top">
                    <span
                      className="an-conn-ico !size-9 !w-9 !h-9 !rounded-[10px]"
                      style={{
                        background: `color-mix(in srgb, ${c.color} 14%, transparent)`,
                        color: c.color,
                        borderColor: `color-mix(in srgb, ${c.color} 30%, transparent)`,
                      }}
                      aria-hidden
                    >
                      <span className="material-symbols-outlined">{c.icon}</span>
                    </span>
                    <div className="an-pcard-head">
                      <p className="an-conn-sub !text-[10px] uppercase tracking-[0.14em]">
                        {c.platform}
                      </p>
                      <p className="an-conn-name">{c.handle}</p>
                    </div>
                    <span className="material-symbols-outlined text-[16px] text-[var(--t-dim)] group-hover:text-[var(--t-star-ink)] transition-colors shrink-0">
                      arrow_outward
                    </span>
                  </div>
                  <div className="an-pcard-chips">
                    <span className="an-chip">{c.desc}</span>
                  </div>
                </article>
              </a>
            ))}
          </div>
        </div>
      </section>

      <p className="text-center text-[11.5px] text-[var(--t-muted)]">
        RouterMod — dibuat dengan <span aria-hidden>❤</span> oleh{" "}
        <span className="font-mono text-[var(--t-ink)]">techwiz37</span>
      </p>
    </div>
  );
}
