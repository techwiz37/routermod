"use client";

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
    { value: "150+", label: t("statProviders") },
    { value: "1", label: t("statEndpoint") },
    { value: "0", label: t("statNoCode") },
  ];

  const METRICS = [
    { k: t("panelLatency"), v: "108ms" },
    { k: t("panelRpm"), v: "24" },
    { k: t("panelUptime"), v: "99.9%" },
  ];

  return (
    <section className="relative px-5 pb-14 pt-24 sm:px-8 sm:pb-16 sm:pt-28">
      <div className="mx-auto grid max-w-none grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        {/* Copy */}
        <div className="flex flex-col items-start">
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
              className="landing-btn landing-btn-primary w-full sm:w-auto"
            >
              <span className="material-symbols-outlined">login</span>
              {t("heroCtaLogin")}
            </button>
            <a
              href={SOCIAL_LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-btn landing-btn-ghost w-full sm:w-auto"
            >
              <span className="material-symbols-outlined">download</span>
              {t("heroCtaInstall")}
            </a>
          </div>

          <div className="mt-8 grid w-full max-w-md grid-cols-3 gap-2.5">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-[10px] border border-[var(--l-line)] bg-[var(--l-card-veil)] px-3 py-2.5"
              >
                <p className="font-mono text-lg font-semibold leading-none text-[var(--l-ink)]">
                  {s.value}
                </p>
                <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--l-dim)]">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Visual panel */}
        <div className="relative">
          <div className="landing-card overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-[var(--l-line)] bg-[var(--l-raised)] px-4 py-2.5">
              <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--l-dim)]">
                <span className="size-1.5 rounded-full bg-[var(--l-ok)]" />
                {t("panelLive")}
              </span>
              <span className="font-mono text-[10px] text-[var(--l-dim)]">:1337</span>
            </div>

            <div className="relative px-4 py-5">
              <div className="flex items-center gap-3">
                {/* Client */}
                <div className="flex flex-col items-center gap-1.5">
                  <span className="flex size-11 items-center justify-center rounded-[10px] border border-[var(--l-line)] bg-[var(--l-raised)] text-[var(--l-muted)]">
                    <span className="material-symbols-outlined text-[20px]">terminal</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--l-dim)]">
                    {t("panelClient")}
                  </span>
                </div>

                <svg className="h-8 min-w-0 flex-1" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
                  <path
                    className="landing-dash"
                    d="M 0 16 L 100 16"
                    fill="none"
                    stroke="var(--l-line)"
                    strokeDasharray="4,4"
                    strokeWidth="1.5"
                  />
                </svg>

                {/* Hub */}
                <div className="flex flex-col items-center gap-1.5">
                  <span className="flex size-14 items-center justify-center rounded-full border border-[var(--l-accent)]/60 bg-[var(--l-card)] text-[var(--l-accent-ink)] shadow-[0_0_28px_-10px_var(--l-accent-glow-strong)]">
                    <span className="material-symbols-outlined text-[24px]">hub</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--l-accent-ink)]">
                    {t("panelGateway")}
                  </span>
                </div>

                <svg className="h-8 min-w-0 flex-1" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
                  <path
                    className="landing-dash"
                    d="M 0 16 L 100 16"
                    fill="none"
                    stroke="var(--l-accent-glow-strong)"
                    strokeDasharray="4,4"
                    strokeWidth="1.5"
                  />
                </svg>

                {/* Providers */}
                <div className="flex flex-col items-center gap-1.5">
                  <span className="flex size-11 items-center justify-center rounded-[10px] border border-[var(--l-line)] bg-[var(--l-raised)] text-[var(--l-muted)]">
                    <span className="material-symbols-outlined text-[20px]">cloud</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--l-dim)]">
                    {t("panelProvider")}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-4 gap-2">
                {PROVIDERS.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-center rounded-lg border border-[var(--l-line)] bg-[var(--l-raised)] px-2 py-2.5 transition-colors hover:border-[var(--l-accent)]/40"
                    title={p.name}
                  >
                    <ProviderIcon
                      src={p.image}
                      alt={p.name}
                      size={20}
                      className="size-5 rounded object-contain"
                      fallbackText={p.name.slice(0, 2).toUpperCase()}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-[var(--l-line)] border-t border-[var(--l-line)]">
              {METRICS.map((m) => (
                <div key={m.k} className="px-3 py-2.5 text-center">
                  <p className="font-mono text-[12px] font-semibold text-[var(--l-ink)]">{m.v}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--l-dim)]">
                    {m.k}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
