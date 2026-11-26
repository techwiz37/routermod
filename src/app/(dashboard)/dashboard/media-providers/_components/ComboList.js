"use client";

import Link from "next/link";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { translate } from "@/i18n/runtime";

function ComboRows({ combos }) {
  return (
    <div className="flex flex-col">
      {combos.map((combo) => (
        <Link
          key={combo.id}
          href={`/dashboard/media-providers/combo/${combo.id}`}
          className="flex min-w-0 items-center gap-3 border-t border-[var(--t-line-soft)] px-4 py-3 transition-colors hover:bg-white/[0.02] first:border-t-0 md:px-5"
        >
          <span className="material-symbols-outlined shrink-0 text-[18px] text-[var(--t-accent)]">layers</span>
          <code className="min-w-0 flex-1 truncate font-mono text-sm font-medium">{combo.name}</code>
          <div className="hidden min-w-0 flex-wrap items-center gap-1 sm:flex sm:shrink-0">
            {combo.models.slice(0, 6).map((entry, i) => {
              const pid = typeof entry === "string" ? entry.split("/")[0] : "";
              const p = AI_PROVIDERS[pid];
              return (
                <div key={`${entry}-${i}`} title={p?.name || entry} className="size-5 rounded flex items-center justify-center" style={{ backgroundColor: `${(p?.color ?? "#888")}15` }}>
                  <ProviderIcon
                    src={`/providers/${pid}.png`}
                    alt={p?.name || pid}
                    size={18}
                    className="object-contain rounded max-w-[18px] max-h-[18px]"
                    fallbackText={p?.textIcon || pid.slice(0, 2).toUpperCase()}
                    fallbackColor={p?.color}
                  />
                </div>
              );
            })}
            {combo.models.length > 6 && (
              <span className="text-[10px] text-text-muted ml-1">+{combo.models.length - 6}</span>
            )}
          </div>
          <span className="shrink-0 font-mono text-[11px] text-[var(--t-muted)]">{combo.models.length}</span>
          <span className="material-symbols-outlined shrink-0 text-[16px] text-[var(--t-muted)]">chevron_right</span>
        </Link>
      ))}
    </div>
  );
}

export default function ComboList({ combos, title = "Combos", subtitle = "Ordered fallback chains for this media kind", bare = false }) {
  if (combos.length === 0) return null;

  if (bare) {
    return (
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="material-symbols-outlined text-[16px] text-[var(--t-accent)]">layers</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--t-muted)]">
            {translate(title)}
          </span>
          <span className="font-mono text-[11px] text-[var(--t-muted)]">· {combos.length}</span>
        </div>
        <div className="overflow-hidden rounded-[10px] border border-[var(--t-line-soft)]">
          <ComboRows combos={combos} />
        </div>
      </div>
    );
  }

  return (
    <section className="an-panel overflow-hidden">
      <header className="an-panel-head">
        <span className="an-panel-ico" aria-hidden>
          <span className="material-symbols-outlined">layers</span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="an-panel-title">{translate(title)}</h2>
          <p className="an-panel-sub">{translate(subtitle)}</p>
        </div>
      </header>
      <ComboRows combos={combos} />
    </section>
  );
}
