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
      className="relative border-t border-[var(--l-line)] px-5 py-14 sm:px-8 sm:py-16"
    >
      <div className="mx-auto grid max-w-none grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
        {/* Steps */}
        <div>
          <p className="landing-eyebrow">
            <span className="landing-eyebrow-dot" />
            {t("startEyebrow")}
          </p>
          <h2 className="landing-h2 mt-3">{t("startTitle")}</h2>
          <p className="landing-lead mt-3 max-w-md">{t("startDesc")}</p>

          <div className="mt-6 flex flex-col gap-3">
            {STEPS.map((s) => (
              <div key={s.n} className="flex items-start gap-3">
                <span className="flex size-7 flex-none items-center justify-center rounded-full border border-[var(--l-accent)]/40 bg-[var(--l-accent-soft)] font-mono text-[11px] font-semibold text-[var(--l-accent-ink)]">
                  {s.n}
                </span>
                <div className="min-w-0">
                  <h3 className="landing-h3">{s.title}</h3>
                  <p className="mt-0.5 text-[12px] text-[var(--l-muted)]">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Terminal */}
        <div className="overflow-hidden rounded-xl border border-[var(--l-line)] bg-[var(--l-card)] shadow-[0_24px_60px_-30px_var(--l-accent-glow-strong)]">
          <div className="flex items-center gap-2 border-b border-[var(--l-line)] bg-[var(--l-raised)] px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-[var(--l-accent)]" />
            <span className="size-2.5 rounded-full bg-[var(--l-dim)]" />
            <span className="size-2.5 rounded-full bg-[var(--l-ok)]" />
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--l-dim)]">
              terminal
            </span>
          </div>

          <div className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed">
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

            <div className="mt-3 space-y-1 text-[var(--l-muted)]">
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
