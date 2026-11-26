"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_CONFIG } from "@/shared/constants/config";
import { SOCIAL_LINKS } from "@/shared/components/SocialIcons";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useLandingT } from "../LandingLocaleContext";

const PROVIDERS = [
  { id: "openai", name: "OpenAI", image: "/providers/openai.png" },
  { id: "anthropic", name: "Anthropic", image: "/providers/anthropic.png" },
  { id: "gemini", name: "Gemini", image: "/providers/gemini.png" },
  { id: "deepseek", name: "DeepSeek", image: "/providers/deepseek.png" },
  { id: "grok", name: "Grok", image: "/providers/xai.png" },
  { id: "copilot", name: "Copilot", image: "/providers/copilot.png" },
  { id: "groq", name: "Groq", image: "/providers/groq.png" },
  { id: "ollama", name: "Ollama", image: "/providers/ollama.png" },
];

export default function HeroSection() {
  const router = useRouter();
  const { t } = useLandingT();

  const STATS = [
    { value: "OpenAI", label: t("statApi") },
    { value: "1", label: t("statEndpoint") },
    { value: t("statSelfHostedValue"), label: t("statDeployment") },
  ];

  const METRICS = [
    { k: t("panelRouting"), v: t("panelRoutingValue") },
    { k: t("panelFailover"), v: t("panelFailoverValue") },
    { k: t("panelQuotas"), v: t("panelQuotasValue") },
  ];

  return (
    <section className="landing-section relative pb-20 pt-24 sm:pb-24 sm:pt-28">
      <div className="mx-auto grid landing-container grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <div className="min-w-0">
          <div className="landing-chip">
            <span className="landing-eyebrow-dot" />
            v{APP_CONFIG.version} · {t("heroBadge")}
          </div>

          <h1 className="landing-h1 mt-5">
            {t("heroTitle1")}
            <br />
            <span className="landing-accent">{t("heroTitle2")}</span>
          </h1>
          <p className="landing-lead mt-4 max-w-lg">{t("heroDesc")}</p>

          <div className="mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="an-btn an-primary an-full sm:w-auto h-11 px-5 text-xs"
            >
              <span className="material-symbols-outlined" aria-hidden>login</span>
              {t("heroCtaLogin")}
            </button>
            <Link
              href="/models"
              className="an-btn an-ghost an-full sm:w-auto h-11 px-5 text-xs"
            >
              <span className="material-symbols-outlined" aria-hidden>view_list</span>
              {t("navModels")}
            </Link>
            <a
              href={SOCIAL_LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="an-btn an-ghost an-full sm:w-auto h-11 px-5 text-xs"
            >
              <span className="material-symbols-outlined" aria-hidden>download</span>
              {t("heroCtaInstall")}
            </a>
          </div>

          <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-3">
            {STATS.map((s) => (
              <div key={s.label} className="an-card px-3 py-3">
                <p className="break-words font-mono text-sm font-semibold leading-tight text-[var(--l-ink)] sm:text-base">
                  {s.value}
                </p>
                <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--l-dim)]">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="an-card lf-card overflow-hidden">
            <div className="an-card-head">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="an-ic" aria-hidden>
                  <span className="material-symbols-outlined">hub</span>
                </span>
                <div className="min-w-0">
                  <h2 className="an-card-title">{t("panelOverview")}</h2>
                  <p className="lf-card-desc">:1337 · {APP_CONFIG.name}</p>
                </div>
              </div>
              <span className="an-chip">v{APP_CONFIG.version}</span>
            </div>

            <div className="lf-card-body">
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="flex size-11 items-center justify-center rounded-[10px] border border-[var(--l-line)] bg-[var(--l-raised)] text-[var(--l-muted)]">
                    <span className="material-symbols-outlined text-[20px]" aria-hidden>terminal</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--l-dim)]">
                    {t("panelClient")}
                  </span>
                </div>

                <svg className="h-8 min-w-0 flex-1" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
                  <path className="landing-dash" d="M 0 16 L 100 16" fill="none" stroke="var(--l-line)" strokeDasharray="4,4" strokeWidth="1.5" />
                </svg>

                <div className="flex flex-col items-center gap-1.5">
                  <span className="flex size-14 items-center justify-center rounded-full border border-[var(--l-accent)]/60 bg-[var(--l-card)] text-[var(--l-accent-ink)] shadow-[0_0_28px_-10px_var(--l-accent-glow-strong)]">
                    <span className="material-symbols-outlined text-[24px]" aria-hidden>hub</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--l-accent-ink)]">
                    {t("panelGateway")}
                  </span>
                </div>

                <svg className="h-8 min-w-0 flex-1" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
                  <path className="landing-dash" d="M 0 16 L 100 16" fill="none" stroke="var(--l-accent-glow-strong)" strokeDasharray="4,4" strokeWidth="1.5" />
                </svg>

                <div className="flex flex-col items-center gap-1.5">
                  <span className="flex size-11 items-center justify-center rounded-[10px] border border-[var(--l-line)] bg-[var(--l-raised)] text-[var(--l-muted)]">
                    <span className="material-symbols-outlined text-[20px]" aria-hidden>cloud</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--l-dim)]">
                    {t("panelProvider")}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {PROVIDERS.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-center rounded-lg border border-[var(--l-line)] bg-[var(--l-raised)] px-2 py-2.5 transition-colors hover:border-[var(--l-accent)]/40"
                    title={p.name}
                  >
                    <ProviderIcon src={p.image} alt={p.name} size={20} className="size-5 rounded object-contain" fallbackText={p.name.slice(0, 2).toUpperCase()} />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-[var(--l-line)] border-t border-[var(--l-line)]">
              {METRICS.map((m) => (
                <div key={m.k} className="px-3 py-2.5 text-center">
                  <p className="font-mono text-[11px] font-semibold text-[var(--l-ink)] sm:text-[12px]">{m.v}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--l-dim)]">{m.k}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
