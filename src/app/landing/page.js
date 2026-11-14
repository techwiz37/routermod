"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "./components/Navigation";
import HeroSection from "./components/HeroSection";
import HowItWorks from "./components/HowItWorks";
import Features from "./components/Features";
import GetStarted from "./components/GetStarted";
import Footer from "./components/Footer";
import StarField from "@/shared/components/StarField";
import Soft3DLogo from "@/shared/components/Soft3DLogo";
import { APP_CONFIG } from "@/shared/constants/config";
import { SOCIAL_LINKS } from "@/shared/components/SocialIcons";
import { LandingLocaleProvider, useLandingT } from "./LandingLocaleContext";

function LandingContent() {
  const router = useRouter();
  const { t } = useLandingT();
  // Same boot sequence as the login page: hold the shared preloader until the
  // first paint of the real content is ready, then reveal it. A short minimum
  // display time keeps it a smooth branded intro instead of a 1-frame flicker.
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const MIN_MS = 420;
    const started = performance.now();
    let raf2 = 0;
    let timer = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const wait = Math.max(0, MIN_MS - (performance.now() - started));
        timer = setTimeout(() => setBooting(false), wait);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (booting) {
    return (
      <div className="an-scope login-skin lf-root" data-i18n-skip="true">
        <div className="login-bg">
          <StarField />
          <div className="login-fade" />
        </div>
        <div className="lf-loading-wrap">
          <Soft3DLogo className="size-10" />
          <div className="lf-loading-dots">
            <span /><span /><span />
          </div>
          <p className="lf-loading-text">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="an-scope login-skin lf-root landing-root" data-i18n-skip="true">
      <div className="login-bg">
        <StarField />
        <div className="login-fade" />
      </div>

      <div className="relative z-10">
        <Navigation />

        <main>
          <HeroSection />
          <HowItWorks />
          <Features />
          <GetStarted />

          {/* Closing CTA */}
          <section className="relative overflow-hidden border-t border-[var(--l-line)] px-5 py-16 sm:px-8 sm:py-20">
            <div className="landing-cta-glow pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-6 text-center">
              <p className="landing-eyebrow justify-center">
                <span className="landing-eyebrow-dot" />
                {APP_CONFIG.name} · v{APP_CONFIG.version}
              </p>
              <h2 className="landing-h2 max-w-2xl">{t("ctaTitle")}</h2>
              <p className="landing-lead max-w-xl">{t("ctaDesc")}</p>
              <div className="flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="landing-btn landing-btn-primary w-full sm:w-auto"
                >
                  <span className="material-symbols-outlined">login</span>
                  {t("ctaLogin")}
                </button>
                <a
                  href={SOCIAL_LINKS.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-btn landing-btn-ghost w-full sm:w-auto"
                >
                  <span className="material-symbols-outlined">download</span>
                  {t("ctaInstall")}
                </a>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>

      <style jsx global>{`
        .landing-root {
          --l-bg: var(--t-bg);
          --l-bg-veil: color-mix(in srgb, var(--t-bg) 78%, transparent);
          --l-bg-veil-strong: color-mix(in srgb, var(--t-bg) 97%, transparent);
          --l-card: var(--t-card);
          --l-card-veil: color-mix(in srgb, var(--t-card) 60%, transparent);
          --l-card-veil-soft: color-mix(in srgb, var(--t-card) 45%, transparent);
          --l-raised: var(--t-raised);
          --l-raised-hover: color-mix(in srgb, var(--t-raised) 70%, #fff 8%);
          --l-line: var(--t-line);
          --l-line-soft: var(--t-line-soft);
          --l-hover-line: var(--t-hover-line);
          --l-ink: var(--t-ink);
          --l-muted: var(--t-muted);
          --l-dim: var(--t-dim);
          --l-accent: var(--t-accent);
          --l-accent-hover: color-mix(in srgb, var(--t-accent) 82%, #fff 18%);
          --l-accent-ink: var(--t-star-ink);
          --l-accent-soft: var(--t-accent-soft);
          --l-accent-glow: color-mix(in srgb, var(--t-accent) 14%, transparent);
          --l-accent-glow-strong: color-mix(in srgb, var(--t-accent) 45%, transparent);
          --l-on-accent: var(--t-accent-ink);
          --l-ok: var(--t-ok);
          --l-mono: var(--t-mono);
        }

        .landing-cta-glow {
          background: radial-gradient(ellipse 60% 100% at 50% 100%, var(--l-accent-glow), transparent 70%);
        }

        .landing-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: var(--l-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--l-muted);
        }
        .landing-eyebrow-dot {
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: var(--l-accent);
          box-shadow: 0 0 0 3px var(--l-accent-soft);
        }

        .landing-h1 {
          font-weight: 350;
          letter-spacing: -0.035em;
          line-height: 1.05;
          font-size: clamp(2rem, 4.6vw, 3.15rem);
          color: var(--l-ink);
        }
        .landing-h2 {
          font-weight: 350;
          letter-spacing: -0.03em;
          line-height: 1.12;
          font-size: clamp(1.5rem, 3.2vw, 2.1rem);
          color: var(--l-ink);
        }
        .landing-h3 {
          font-weight: 500;
          letter-spacing: -0.015em;
          font-size: 0.9375rem;
          color: var(--l-ink);
        }
        .landing-accent { color: var(--l-accent-ink); }
        .landing-dim { color: var(--l-dim); }

        .landing-lead {
          font-family: var(--l-mono);
          font-size: 12.5px;
          line-height: 1.65;
          color: var(--l-muted);
        }

        .landing-card {
          background: var(--l-card);
          border: 1px solid var(--l-line);
          border-radius: 12px;
          transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
        }
        .landing-card:hover {
          border-color: color-mix(in srgb, var(--l-accent) 35%, transparent);
          background: var(--l-raised);
          transform: translateY(-2px);
        }

        .landing-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 42px;
          padding: 0 18px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
          cursor: pointer;
          transition: background 0.18s ease, border-color 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease;
        }
        .landing-btn:active { transform: translateY(1px); }
        .landing-btn .material-symbols-outlined { font-size: 17px; }

        .landing-btn-primary {
          background: var(--l-accent);
          border: 1px solid var(--l-accent);
          color: var(--l-on-accent);
          box-shadow: 0 8px 24px -12px color-mix(in srgb, var(--l-accent) 90%, transparent);
        }
        .landing-btn-primary:hover {
          background: var(--l-accent-hover);
          border-color: var(--l-accent-hover);
          box-shadow: 0 10px 30px -10px color-mix(in srgb, var(--l-accent) 95%, transparent);
        }

        .landing-btn-ghost {
          background: var(--l-raised);
          border: 1px solid var(--l-line);
          color: var(--l-ink);
        }
        .landing-btn-ghost:hover {
          border-color: var(--l-hover-line);
          background: var(--l-raised-hover);
        }

        .landing-chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 4px 10px;
          border-radius: 9999px;
          border: 1px solid var(--l-line);
          background: color-mix(in srgb, var(--l-raised) 70%, transparent);
          font-family: var(--l-mono);
          font-size: 10.5px;
          color: var(--l-muted);
        }

        .landing-ico {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 9px;
          border: 1px solid var(--l-line);
          background: var(--l-raised);
          color: var(--l-accent-ink);
          flex: none;
        }
        .landing-ico .material-symbols-outlined { font-size: 17px; }

        .landing-divider {
          height: 1px;
          background: linear-gradient(to right, transparent, var(--l-line), transparent);
        }

        @keyframes landing-dash {
          to { stroke-dashoffset: -24; }
        }
        .landing-dash { animation: landing-dash 1.6s linear infinite; }

        @media (prefers-reduced-motion: reduce) {
          .landing-dash { animation: none; }
        }
      `}</style>
    </div>
  );
}

export default function LandingPage() {
  return (
    <LandingLocaleProvider>
      <LandingContent />
    </LandingLocaleProvider>
  );
}
