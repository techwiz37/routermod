"use client";

import AntaresStat from "@/shared/components/AntaresStat";
import StarField from "@/shared/components/StarField";
import { translate } from "@/i18n/runtime";
import { CONTACTS } from "./contacts";

function ChannelRow({ contact }) {
  const external = !contact.url.startsWith("mailto");
  return (
    <a
      href={contact.url}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="an-conn group"
    >
      <div className="an-conn-main">
        <span
          className="an-conn-ico"
          style={{
            background: `color-mix(in srgb, ${contact.color} 14%, transparent)`,
            color: contact.color,
            borderColor: `color-mix(in srgb, ${contact.color} 32%, transparent)`,
          }}
          aria-hidden
        >
          <span className="material-symbols-outlined">{contact.icon}</span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="an-conn-chips !mt-0">
            <p className="an-conn-name">{contact.platform}</p>
            <span className="an-chip">{contact.desc}</span>
          </div>
          <p className="an-conn-sub mt-1 break-all">{contact.handle}</p>
        </div>
      </div>

      <div className="an-conn-actions">
        <span className="an-conn-btn" aria-hidden>
          <span className="material-symbols-outlined">
            {external ? "open_in_new" : "mail"}
          </span>
        </span>
      </div>
    </a>
  );
}

export default function ContactPage() {
  return (
    <div className="an-scope an-shell contact-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="min-w-0">
        <p className="an-eyebrow">
          <span className="an-num">11</span>
          <span className="an-rule" />
          <span>{translate("RouterMod · AI Gateway")}</span>
        </p>
        <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">
          {translate("Contact Developer")}
        </h1>
        <p className="an-hint max-w-[70ch]">
          {translate(
            "Found a bug, have an idea, or want a new feature? The channels below reach the developer directly — Telegram usually gets the fastest reply."
          )}
        </p>
      </header>

      {/* ---- Summary tiles ---- */}
      <div className="an-grid contact-stats gap-2.5 sm:gap-3">
        <AntaresStat
          label={translate("Channels")}
          icon="forum"
          tone="default"
          value={CONTACTS.length}
          foot={translate("ways to reach out")}
        />
        <AntaresStat
          label={translate("Fastest")}
          icon="bolt"
          tone="ok"
          value="Telegram"
          foot={translate("quickest response")}
        />
        <AntaresStat
          label={translate("Source")}
          icon="code"
          tone="violet"
          value="GitHub"
          foot={translate("code, issues & contributions")}
        />
        <AntaresStat
          label={translate("Email")}
          icon="mail"
          tone="default"
          value={translate("Open")}
          foot={translate("for longer discussions")}
        />
      </div>

      {/* ---- Channels ---- */}
      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">forum</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Contact Channels")}</h2>
            <p className="an-panel-sub">
              {CONTACTS.length} {translate("ways to reach the developer")}
            </p>
          </div>
          <div className="an-panel-actions">
            <span className="an-chip">{CONTACTS.length}</span>
          </div>
        </header>

        <div className="an-panel-pad">
          <div className="an-conn-list">
            {CONTACTS.map((contact) => (
              <ChannelRow key={contact.platform} contact={contact} />
            ))}
          </div>
        </div>
      </section>

      {/* ---- Before you reach out ---- */}
      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">lightbulb</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Before you reach out")}</h2>
            <p className="an-panel-sub">
              {translate("A few details make a bug report much easier to fix.")}
            </p>
          </div>
        </header>

        <div className="an-panel-pad flex flex-col gap-2.5">
          <div className="an-kv">
            <span className="shrink-0">{translate("Include")}</span>
            <code className="flex-1 min-w-0">
              {translate("RouterMod version · steps to reproduce · the exact error message")}
            </code>
          </div>
          <div className="an-kv">
            <span className="shrink-0">{translate("Screenshots")}</span>
            <code className="flex-1 min-w-0">
              {translate("Console Log (dashboard → Console Log) captures request traffic")}
            </code>
          </div>
          <div className="an-kv">
            <span className="shrink-0">{translate("Feature requests")}</span>
            <code className="flex-1 min-w-0">
              {translate("Describe the workflow you want, not only the UI")}
            </code>
          </div>
        </div>
      </section>

      <p className="text-center text-[11.5px] text-[var(--t-muted)]">
        RouterMod · {translate("A project by")}{" "}
        <span className="font-mono text-[var(--t-ink)]">techwiz37</span>
      </p>
    </div>
  );
}
