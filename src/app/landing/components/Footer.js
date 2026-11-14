"use client";

import Link from "next/link";
import { APP_CONFIG } from "@/shared/constants/config";
import { SOCIAL_ITEMS, SOCIAL_LINKS } from "@/shared/components/SocialIcons";
import { useLandingT } from "../LandingLocaleContext";

export default function Footer() {
  const { t } = useLandingT();

  const COLUMNS = [
    {
      title: t("footProduct"),
      links: [
        { label: t("footFeatures"), href: "#features" },
        { label: t("footHow"), href: "#how-it-works" },
        { label: t("footStart"), href: "#get-started" },
        { label: t("footDashboard"), href: "/dashboard" },
      ],
    },
    {
      title: t("footResources"),
      links: [
        { label: t("footDocs"), href: SOCIAL_LINKS.github, external: true },
        { label: t("footChangelog"), href: `${SOCIAL_LINKS.github}/commits`, external: true },
        { label: t("footBug"), href: `${SOCIAL_LINKS.github}/issues`, external: true },
      ],
    },
    {
      title: t("footCommunity"),
      links: [
        { label: t("footTelegram"), href: SOCIAL_LINKS.telegram, external: true },
        { label: t("footWhatsApp"), href: SOCIAL_LINKS.whatsapp, external: true },
        { label: t("footGitHub"), href: SOCIAL_LINKS.github, external: true },
      ],
    },
  ];

  return (
    <footer className="relative border-t border-[var(--l-line)] bg-[var(--l-bg-veil-strong)] px-5 pb-8 pt-14 sm:px-8">
      <div className="mx-auto max-w-none">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-5 lg:gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--l-line)] bg-[var(--l-raised)] text-[var(--l-accent-ink)]">
                <span className="material-symbols-outlined text-[19px]">hub</span>
              </span>
              <span className="flex flex-col items-start leading-none">
                <span className="text-[15px] font-semibold tracking-tight text-[var(--l-ink)]">
                  {APP_CONFIG.name}
                </span>
                <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--l-dim)]">
                  AI Gateway
                </span>
              </span>
            </div>

            <p className="mt-5 max-w-xs text-[12.5px] leading-relaxed text-[var(--l-muted)]">
              {t("footDesc")}
            </p>

            <div className="mt-5 flex items-center gap-2.5">
              {SOCIAL_ITEMS.map(({ key, label, href, Icon }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  title={label}
                  className="flex size-9 items-center justify-center rounded-[9px] border border-[var(--l-line)] bg-[var(--l-raised)] text-[var(--l-muted)] transition-colors hover:border-[var(--l-accent)]/40 hover:text-[var(--l-ink)]"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--l-dim)]">
                {col.title}
              </h4>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12.5px] text-[var(--l-muted)] transition-colors hover:text-[var(--l-ink)]"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-[12.5px] text-[var(--l-muted)] transition-colors hover:text-[var(--l-ink)]"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[var(--l-line)] pt-6 sm:flex-row">
          <p className="font-mono text-[11px] text-[var(--l-dim)]">
            Â© {new Date().getFullYear()} {APP_CONFIG.name} · v{APP_CONFIG.version}
          </p>
          <div className="flex items-center gap-4 font-mono text-[11px] text-[var(--l-dim)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[var(--l-ok)]" />
              {t("footAllOk")}
            </span>
            <span className="text-[var(--l-line)]">·</span>
            <span>{t("footBy")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
