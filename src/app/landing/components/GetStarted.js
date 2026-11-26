"use client";

import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { APP_CONFIG } from "@/shared/constants/config";
import { useLandingT } from "../LandingLocaleContext";

export default function GetStarted() {
  const { copied, copy } = useCopyToClipboard();
  const { t } = useLandingT();
  const installCmd = "npx routermod";

  const STEPS = [
    { n: 1, title: t("start1Title"), desc: t("start1Desc") },
    { n: 2, title: t("start2Title"), desc: t("start2Desc") },
    { n: 3, title: t("start3Title"), desc: t("start3Desc") },
  ];

  return (
    <section
      id="get-started"
      className="landing-section relative border-t border-[var(--l-line)] py-20 sm:py-24"
    >
      <div className="mx-auto grid landing-container grid-cols-1 gap-10 lg:grid-cols-2 lg:items-stretch lg:gap-14">
        {/* Steps */}
        <div>
          <p className="landing-eyebrow">
            <span className="landing-eyebrow-dot" />
            {t("startEyebrow")}
          </p>
          <h2 className="landing-h2 mt-3">{t("startTitle")}</h2>
          <p className="landing-lead mt-3 max-w-md">{t("startDesc")}</p>

          <div className="mt-6 flex flex-col gap-2.5">
            {STEPS.map((s) => (
              <div key={s.n} className="an-card flex items-start gap-3 p-3">
                <span className="an-ic !size-8 !w-8 !h-8 flex-none font-mono text-[11px]" aria-hidden>
                  <span className="material-symbols-outlined text-[14px]">{s.n}</span>
                </span>
                <div className="min-w-0">
                  <h3 className="an-card-title">{s.title}</h3>
                  <p className="lf-card-desc mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Terminal */}
        <div className="an-card flex h-full flex-col overflow-hidden">
          <div className="an-card-head">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="an-ic" aria-hidden>
                <span className="material-symbols-outlined">terminal</span>
              </span>
              <div className="min-w-0">
                <h2 className="an-card-title">Terminal</h2>
                <p className="lf-card-desc">npx routermod</p>
              </div>
            </div>
            <span className="flex items-center gap-1.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-[var(--l-accent)]" />
              <span className="size-2.5 rounded-full bg-[var(--l-dim)]" />
              <span className="size-2.5 rounded-full bg-[var(--l-ok)]" />
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-between gap-3 overflow-x-auto p-4 font-mono text-[12px] leading-relaxed">
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => copy(installCmd, "landing")}
                className="group flex w-full items-center gap-2 text-left"
              >
                <span className="text-[var(--l-ok)]">$</span>
                <span className="text-[var(--l-ink)]">{installCmd}</span>
                <span className="ml-auto text-[10px] text-[var(--l-dim)] opacity-0 transition-opacity group-hover:opacity-100">
                  {copied === "landing" ? t("termCopied") : t("termCopy")}
                </span>
              </button>

              <div className="space-y-1 text-[var(--l-muted)]">
                <p>
                  <span className="text-[var(--l-accent-ink)]">&gt;</span> {t("termBooting")}
                </p>
                <p>
                  <span className="text-[var(--l-accent-ink)]">&gt;</span> {t("termRunning")}{" "}
                  <span className="text-[var(--l-ink)]">http://localhost:1337</span>
                </p>
                <p>
                  <span className="text-[var(--l-accent-ink)]">&gt;</span> {t("termDashboard")}{" "}
                  <span className="text-[var(--l-ink)]">/dashboard</span>
                </p>
                <p className="text-[var(--l-ok)]">&gt; {t("termReady")}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-1 border-t border-[var(--l-line)] pt-3 text-[11px] text-[var(--l-dim)] sm:grid-cols-2">
              <p>
                <span className="text-[var(--l-muted)]">{t("termEndpoint")}</span> :1337/v1
              </p>
              <p>
                <span className="text-[var(--l-muted)]">{t("termData")}</span> %APPDATA%/
                {APP_CONFIG.name.toLowerCase()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
