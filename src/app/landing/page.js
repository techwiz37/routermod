"use client";

import { useRouter } from "next/navigation";
import LandingShell from "./components/LandingShell";
import HeroSection from "./components/HeroSection";
import HowItWorks from "./components/HowItWorks";
import Features from "./components/Features";
import GetStarted from "./components/GetStarted";
import { APP_CONFIG } from "@/shared/constants/config";
import { SOCIAL_LINKS } from "@/shared/components/SocialIcons";
import { useLandingT } from "./LandingLocaleContext";

function ClosingCTA() {
  const router = useRouter();
  const { t } = useLandingT();

  return (
    <section className="landing-section relative overflow-hidden border-t border-[var(--l-line)] py-20 sm:py-24">
      <div className="landing-cta-glow pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative z-10 mx-auto landing-container">
        <div className="an-card lf-card">
          <div className="an-card-head flex-col items-center text-center">
            <span className="an-ic" aria-hidden>
              <span className="material-symbols-outlined">rocket_launch</span>
            </span>
            <div className="min-w-0">
              <h2 className="an-card-title mt-3 justify-center">{t("ctaTitle")}</h2>
              <p className="lf-card-desc mx-auto mt-2 max-w-md">{t("ctaDesc")}</p>
            </div>
          </div>
          <div className="lf-card-body items-center">
            <p className="an-label">{APP_CONFIG.name} · v{APP_CONFIG.version}</p>
            <div className="flex w-full flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="an-btn an-primary an-full lf-submit-btn"
              >
                <span className="material-symbols-outlined" aria-hidden>login</span>
                {t("ctaLogin")}
              </button>
              <a
                href={SOCIAL_LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                className="an-btn an-ghost an-full lf-submit-btn"
              >
                <span className="material-symbols-outlined" aria-hidden>download</span>
                {t("ctaInstall")}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <link rel="preload" href="/api/public/models" as="fetch" crossOrigin="anonymous" />
      <LandingShell>
        <HeroSection />
        <HowItWorks />
        <Features />
        <GetStarted />
        <ClosingCTA />
      </LandingShell>
    </>
  );
}
