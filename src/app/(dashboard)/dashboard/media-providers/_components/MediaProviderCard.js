"use client";

import Link from "next/link";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { translate } from "@/i18n/runtime";

export function getEffectiveStatus(conn) {
  const isCooldown = Object.entries(conn).some(
    ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now()
  );
  return conn.testStatus === "unavailable" && !isCooldown ? "active" : conn.testStatus;
}

function providerSubtitle(provider, fallback) {
  const site = provider?.website || provider?.websiteUrl;
  if (site) {
    try {
      return new URL(site).hostname.replace(/^www\./, "");
    } catch {}
  }
  return fallback;
}

export default function MediaProviderCard({ provider, kind, connections, isCustom, onToggle }) {
  const providerInfo = AI_PROVIDERS[provider.id];
  const isNoAuth = !!providerInfo?.noAuth;

  const providerConns = connections.filter((c) => c.provider === provider.id);
  const connected = providerConns.filter((c) => {
    const s = getEffectiveStatus(c);
    return s === "active" || s === "success";
  }).length;
  const error = providerConns.filter((c) => {
    const s = getEffectiveStatus(c);
    return s === "error" || s === "expired" || s === "unavailable";
  }).length;
  const total = providerConns.length;
  const allDisabled = total > 0 && providerConns.every((c) => c.isActive === false);

  const handleToggleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggle) onToggle(provider.id, allDisabled);
  };

  const chips = [];
  if (isNoAuth) {
    chips.push(
      <span key="ready" className="an-chip ok">
        <span className="size-1.5 rounded-full bg-[var(--t-ok)] shrink-0" />
        {translate("Ready")}
      </span>
    );
  } else if (allDisabled) {
    chips.push(<span key="off" className="an-chip">{translate("All accounts off")}</span>);
  } else if (total === 0) {
    chips.push(<span key="none" className="an-chip">{translate("No connections")}</span>);
  } else {
    if (connected > 0) {
      chips.push(
        <span key="connected" className="an-chip ok">
          <span className="size-1.5 rounded-full bg-[var(--t-ok)] shrink-0" />
          <span>{connected}</span>
          <span>{translate("Connected")}</span>
        </span>
      );
    }
    if (error > 0) {
      chips.push(
        <span key="error" className="an-chip danger">
          <span className="size-1.5 rounded-full bg-[var(--t-danger)] shrink-0" />
          <span>{error}</span>
          <span>{translate("Error")}</span>
        </span>
      );
    }
    if (connected === 0 && error === 0) {
      chips.push(<span key="added" className="an-chip">{total} {translate("added")}</span>);
    }
  }

  return (
    <Link href={`/dashboard/media-providers/${kind}/${provider.id}`} className="group block h-full">
      <article className={`an-pcard ${allDisabled ? "is-off" : ""}`}>
        <div className="an-pcard-top">
          <span
            className="an-pcard-ico"
            style={{
              backgroundColor:
                provider.color?.length > 7
                  ? provider.color
                  : (provider.color || "#888") + "22",
            }}
          >
            <ProviderIcon
              src={`/providers/${provider.id}.png`}
              alt={provider.name}
              size={24}
              className="object-contain rounded max-w-[24px] max-h-[24px]"
              fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
              fallbackColor={provider.color}
            />
          </span>

          <div className="an-pcard-head">
            <p className="an-pcard-title truncate">{provider.name}</p>
            <p className="an-pcard-sub truncate">
              {isCustom ? translate("Custom endpoint") : providerSubtitle(provider, provider.kindLabel)}
            </p>
          </div>

          {total > 0 && (
            <button
              type="button"
              role="switch"
              aria-checked={!allDisabled}
              aria-label={`${allDisabled ? translate("Enable") : translate("Disable")} ${provider.name}`}
              title={allDisabled ? `${translate("Enable")} ${provider.name}` : `${translate("Disable")} ${provider.name}`}
              onClick={handleToggleClick}
              className={`an-switch ${allDisabled ? "off" : "on"}`}
            >
              <span className="an-switch-knob" />
              {allDisabled ? translate("Off") : translate("On")}
            </button>
          )}
        </div>

        <div className="an-pcard-chips">{chips}</div>

        <div className="an-pcard-foot">
          <span className="an-pcard-meta">
            {total > 0 ? (
              <>
                <span className="material-symbols-outlined text-[13px]">group</span>
                <span>{total}</span>{" "}
                <span>{translate("accounts")}</span>
              </>
            ) : (
              <span>{translate("No accounts yet")}</span>
            )}
          </span>
          <span className="material-symbols-outlined text-[15px] text-[var(--t-dim)] group-hover:text-[var(--t-star-ink)] transition-colors">
            arrow_outward
          </span>
        </div>
      </article>
    </Link>
  );
}
