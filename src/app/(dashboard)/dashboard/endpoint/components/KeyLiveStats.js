"use client";

import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";
import { TOKEN_WINDOWS } from "@/shared/constants/keyQuota.js";

function formatNumber(n) {
  const value = Number(n) || 0;
  return value.toLocaleString("en-US");
}

function formatCompact(n) {
  const value = Number(n) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}

function windowLabel(window) {
  const key = TOKEN_WINDOWS[window] ? window : "24h";
  return translate(TOKEN_WINDOWS[key].label);
}

/**
 * Live counters for one API key: requests/min, in-flight requests, and the
 * token quota bar (used vs limit) for the key's configured window.
 */
export default function KeyLiveStats({ keyData, stats }) {
  const s = stats || {};
  const tokenLimit = Math.max(0, Number(keyData?.tokenLimit) || 0);
  const used = Number(s.tokensUsed) || 0;
  const pct = tokenLimit > 0 ? Math.min(100, (used / tokenLimit) * 100) : 0;
  const over = tokenLimit > 0 && used >= tokenLimit;
  const near = tokenLimit > 0 && !over && pct >= 80;
  const requestsPerMinute = Number(s.requestsPerMinute) || 0;
  const inFlight = Number(s.inFlight) || 0;

  const barColor = over
    ? "var(--t-danger)"
    : near
      ? "#f0a13a"
      : "var(--t-accent)";

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono text-[var(--t-muted)]">
        <span className="inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px]">bolt</span>
          {translate("Last minute")}: {formatNumber(requestsPerMinute)} {translate("req")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px]">sync</span>
          {formatNumber(inFlight)} {translate("active")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px]">token</span>
          {formatCompact(used)} {translate("tokens used")}
        </span>
      </div>

      {tokenLimit > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-[var(--t-muted)]">
            <span className="uppercase tracking-wider">{translate("Token quota")}</span>
            <span style={{ color: over ? "var(--t-danger)" : undefined }}>
              {formatNumber(used)} / {formatNumber(tokenLimit)} · {windowLabel(keyData?.tokenLimitWindow)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--t-raised)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--t-muted)]">
          <span className="material-symbols-outlined text-[13px] text-[var(--t-ok)]">all_inclusive</span>
          {translate("Token quota")}: {translate("Unlimited")}
        </div>
      )}
    </div>
  );
}

KeyLiveStats.propTypes = {
  keyData: PropTypes.object,
  stats: PropTypes.shape({
    requestsPerMinute: PropTypes.number,
    inFlight: PropTypes.number,
    tokensUsed: PropTypes.number,
    requests: PropTypes.number,
    cost: PropTypes.number,
  }),
};
