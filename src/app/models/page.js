"use client";

import Link from "next/link";
import LandingShell from "../landing/components/LandingShell";
import StatsModels from "../landing/components/StatsModels";
import { useLandingT } from "../landing/LandingLocaleContext";

function ModelsBreadcrumb() {
  const { t } = useLandingT();
  return (
    <div className="landing-section border-b border-[var(--l-line)] pb-3 pt-20 sm:pt-4">
      <div className="mx-auto landing-container">
        <Link href="/landing" className="an-btn an-ghost h-9 px-3 text-xs gap-2">
          <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_back</span>
          {t("navHome")}
        </Link>
      </div>
    </div>
  );
}

export default function ModelsPage() {
  return (
    <LandingShell>
      <ModelsBreadcrumb />
      <StatsModels />
    </LandingShell>
  );
}
