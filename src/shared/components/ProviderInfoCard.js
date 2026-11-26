"use client";

import AntaresPanel from "./AntaresPanel";

const FIELD_SCHEMA = {
  mode:             { label: "Mode",       format: (v) => v },
  defaultModel:     { label: "Model",      format: (v) => v, mono: true },
  baseUrl:          { label: "Endpoint",   format: (v) => v, isLink: true, mono: true },
  costPerQuery:     { label: "Cost / call", format: (v) => v === 0 ? "Free" : `$${v.toFixed(4)}` },
  pricingUrl:       { label: "Pricing",    format: () => "View pricing", isLink: true },
  freeTier:         { label: "Free tier",  format: (v) => v },
  freeMonthlyQuota: { label: "Free quota",  format: (v) => v === 0 ? "—" : v >= 999999 ? "Unlimited" : `${v.toLocaleString()} / mo` },
  searchTypes:      { label: "Types",      format: (v) => v.join(", ") },
  formats:          { label: "Formats",    format: (v) => v.join(", ") },
  maxMaxResults:    { label: "Max results", format: (v) => v },
  maxCharacters:    { label: "Max chars",  format: (v) => v.toLocaleString() },
};

export default function ProviderInfoCard({ config, provider, title = "Provider Info" }) {
  if (!config) return null;

  const rows = Object.entries(FIELD_SCHEMA)
    .filter(([key]) => config[key] !== undefined && config[key] !== null && config[key] !== "")
    .map(([key, schema]) => ({
      key,
      label: schema.label,
      value: schema.format(config[key]),
      isLink: schema.isLink,
      mono: schema.mono,
      raw: config[key],
    }));

  const signupUrl = provider?.notice?.apiKeyUrl || provider?.website;
  const noticeText = provider?.notice?.text;

  return (
    <AntaresPanel
      icon="info"
      title={title}
      action={
        signupUrl ? (
          <a
            href={signupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="an-chip accent"
          >
            <span className="material-symbols-outlined">open_in_new</span>
            Get API Key
          </a>
        ) : null
      }
    >
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className="flex min-w-0 items-baseline gap-3">
            <dt className="w-24 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--t-muted)]">
              {r.label}
            </dt>
            <dd className="min-w-0 flex-1">
              {r.isLink ? (
                <a
                  href={r.raw}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block break-words text-[13px] text-[var(--t-star-ink)] hover:underline ${r.mono ? "font-mono" : ""}`}
                >
                  {r.value}
                </a>
              ) : (
                <span className={`block break-words text-[13px] text-[var(--t-ink)] ${r.mono ? "font-mono" : ""}`}>
                  {r.value}
                </span>
              )}
            </dd>
          </div>
        ))}
        {noticeText && (
          <div className="flex min-w-0 items-start gap-3 sm:col-span-2">
            <dt className="w-24 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--t-muted)]">
              Notice
            </dt>
            <dd className="min-w-0 flex-1 text-[13px] leading-relaxed text-[var(--t-ink)]">
              {noticeText}
            </dd>
          </div>
        )}
      </dl>
    </AntaresPanel>
  );
}
