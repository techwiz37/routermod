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
      className="relative landing-section border-y border-[var(--l-line)] bg-[var(--l-card-veil-soft)] py-20 sm:py-24"
    >
      <div className="mx-auto landing-container">
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="an-card overflow-hidden">
              <div className="an-card-head">
                <span className={`an-ic ${i === 1 ? "border-[var(--l-accent)]/60" : ""}`} aria-hidden>
                  <span className="material-symbols-outlined">{s.icon}</span>
                </span>
                <span className="an-chip">{t("howStep")} {s.n}</span>
              </div>
              <div className="lf-card-body">
                <h3 className="an-card-title">{s.title}</h3>
                <p className="lf-card-desc">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
