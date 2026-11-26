"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_CONFIG } from "@/shared/constants/config";
import { SOCIAL_LINKS } from "@/shared/components/SocialIcons";
import { useLandingT } from "../LandingLocaleContext";
import { LANDING_LOCALES, LANDING_LOCALE_NAMES } from "../landingCopy";
import AntaresSelect from "@/shared/components/AntaresSelect";

const LINKS = (t) => [
  { label: t("navBuyKey"), href: "/buy-key", icon: "shopping_cart" },
  { label: t("navModels"), href: "/models", icon: "view_list" },
  { label: t("navFeatures"), href: "/landing#features", icon: "grid_view" },
  { label: t("navHow"), href: "/landing#how-it-works", icon: "account_tree" },
  { label: t("navStart"), href: "/landing#get-started", icon: "rocket_launch" },
];

export default function LandingSidebar() {
  const router = useRouter();
  const { t, locale, setLocale } = useLandingT();

  return (
    <aside className="landing-sidebar fixed inset-y-0 left-0 z-50 w-[var(--l-sidebar-w)] flex-col border-r border-[var(--l-line)] bg-[var(--l-bg-veil-strong)] backdrop-blur-xl">
      <div className="flex items-center gap-3 border-b border-[var(--l-line)] px-5 py-5">
        <span className="an-ic !size-9 !w-9 !h-9" aria-hidden>
          <span className="material-symbols-outlined">hub</span>
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold tracking-tight text-[var(--l-ink)]">{APP_CONFIG.name}</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--l-dim)]">AI Gateway · v{APP_CONFIG.version}</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-5" aria-label={t("navSection")}>
        <p className="an-label px-3">{t("navSection")}</p>
        {LINKS(t).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="an-btn an-ghost h-10 justify-start px-3 text-xs gap-3"
          >
            <span className="material-symbols-outlined text-[17px] text-[var(--l-dim)]" aria-hidden>{link.icon}</span>
            {link.label}
          </Link>
        ))}

        <div className="my-4 h-px bg-[var(--l-line)]" />
        <p className="an-label px-3">{t("navResources")}</p>
        <a href={SOCIAL_LINKS.github} target="_blank" rel="noopener noreferrer" className="an-btn an-ghost h-10 justify-start px-3 text-xs gap-3">
          <span className="material-symbols-outlined text-[17px] text-[var(--l-dim)]" aria-hidden>download</span>
          {t("navInstall")}
        </a>
        <a href={SOCIAL_LINKS.telegram} target="_blank" rel="noopener noreferrer" className="an-btn an-ghost h-10 justify-start px-3 text-xs gap-3">
          <span className="material-symbols-outlined text-[17px] text-[var(--l-dim)]" aria-hidden>send</span>
          Telegram
        </a>
      </nav>

      <div className="border-t border-[var(--l-line)] p-3">
        <div className="mb-3 flex flex-col gap-1.5">
          <label className="an-label px-2">
            {locale === "id" ? "Bahasa" : "Language"}
          </label>
          <AntaresSelect
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            ariaLabel={locale === "id" ? "Bahasa" : "Language"}
            buttonClassName="h-10 w-full px-3 text-xs"
            options={LANDING_LOCALES.map((code) => ({ value: code, label: LANDING_LOCALE_NAMES[code] }))}
          />
        </div>
        <button
          type="button"
          onClick={() => router.push("/buy-key")}
          className="an-btn an-primary an-full mb-2 h-11 text-xs"
        >
          <span className="material-symbols-outlined" aria-hidden>shopping_cart</span>
          {t("navBuyKey")}
        </button>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="an-btn an-ghost an-full h-11 text-xs"
        >
          <span className="material-symbols-outlined" aria-hidden>login</span>
          {t("navLogin")}
        </button>
      </div>
    </aside>
  );
}
