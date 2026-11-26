"use client";

import { useLandingT } from "../LandingLocaleContext";

export default function Features() {
  const { t } = useLandingT();

  const FEATURES = [
    { icon: "alt_route", title: t("feat1Title"), desc: t("feat1Desc") },
    { icon: "bolt", title: t("feat2Title"), desc: t("feat2Desc") },
    { icon: "vpn_key", title: t("feat3Title"), desc: t("feat3Desc") },
    { icon: "monitoring", title: t("feat4Title"), desc: t("feat4Desc") },
    { icon: "shield_lock", title: t("feat5Title"), desc: t("feat5Desc") },
    { icon: "terminal", title: t("feat6Title"), desc: t("feat6Desc") },
    { icon: "hub", title: t("feat7Title"), desc: t("feat7Desc") },
    { icon: "tune", title: t("feat8Title"), desc: t("feat8Desc") },
  ];

  return (
    <section id="features" className="relative landing-section py-20 sm:py-24">
      <div className="mx-auto landing-container">
        <div className="mb-9 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="landing-eyebrow">
              <span className="landing-eyebrow-dot" />
              {t("featEyebrow")}
            </p>
            <h2 className="landing-h2 mt-3">{t("featTitle")}</h2>
          </div>
          <p className="landing-lead max-w-sm">{t("featDesc")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="an-card p-5">
              <div className="flex items-center gap-3.5">
                <span className="an-ic !size-10 !w-10 !h-10 flex-none" aria-hidden>
                  <span className="material-symbols-outlined">{f.icon}</span>
                </span>
                <h3 className="an-card-title min-w-0 flex-1 leading-snug">{f.title}</h3>
              </div>
              <p className="lf-card-desc mt-4">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
