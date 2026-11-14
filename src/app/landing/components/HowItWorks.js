"use client";

import { useLandingT } from "../LandingLocaleContext";

export default function HowItWorks() {
  const { t } = useLandingT();

  const STEPS = [
    { n: "01", icon: "terminal", title: t("how1Title"), desc: t("how1Desc") },
    { n: "02", icon: "hub", title: t("how2Title"), desc: t("how2Desc") },
    { n: "03", icon: "cloud", title: t("how3Title"), desc: t("how3Desc") },
  ];

  return (
    <section
      id="how-it-works"
      className="relative border-y border-[var(--l-line)] bg-[var(--l-card-veil-soft)] px-5 py-14 sm:px-8 sm:py-16"
    >
      <div className="mx-auto max-w-none">
        <div className="mb-9 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="landing-eyebrow">
              <span className="landing-eyebrow-dot" />
              {t("howEyebrow")}
            </p>
            <h2 className="landing-h2 mt-3">{t("howTitle")}</h2>
          </div>
          <p className="landing-lead max-w-sm">{t("howDesc")}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="landing-card relative p-4">
              <div className="flex items-start gap-3">
                <span
                  className={`landing-ico ${
                    i === 1 ? "border-[var(--l-accent)]/50 text-[var(--l-accent-ink)]" : ""
                  }`}
                >
                  <span className="material-symbols-outlined">{s.icon}</span>
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--l-dim)]">
                    {t("howStep")} {s.n}
                  </p>
                  <h3 className="landing-h3 mt-1">{s.title}</h3>
                </div>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--l-muted)]">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
