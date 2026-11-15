"use client";

import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";
import { TOKEN_WINDOWS } from "@/shared/constants/keyQuota.js";

function formatNumber(n) { return (Number(n) || 0).toLocaleString("en-US"); }
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
function formatCountdown(resetAt, now) {
  const total = Math.max(0, Math.ceil((new Date(resetAt).getTime() - now) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return days > 0 ? `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m` : `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export default function KeyLiveStats({ keyData, stats, onReset }) {
  const nowRef = useRef(Date.now());
  const now = nowRef.current;
  const resetNotified = useRef(null);
  const s = stats || {};
  const resetAt = s.resetAt || null;
  const tokenLimit = Math.max(0, Number(keyData?.tokenLimit) || 0);
  const used = Number(s.tokensUsed) || 0;
  const pct = tokenLimit > 0 ? Math.min(100, (used / tokenLimit) * 100) : 0;
  const over = tokenLimit > 0 && used >= tokenLimit;
  const near = tokenLimit > 0 && !over && pct >= 80;

  useEffect(() => {
    if (!resetAt) return undefined;
    const timer = setInterval(() => {
      nowRef.current = Date.now();
      const current = nowRef.current;
      if (new Date(resetAt).getTime() <= current && resetNotified.current !== resetAt) {
        resetNotified.current = resetAt;
        onReset?.();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [resetAt, onReset]);

  const barColor = over ? "var(--t-danger)" : near ? "#f0a13a" : "var(--t-accent)";
  return (
    <div className="mt-3 min-w-0 space-y-2">
      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[var(--t-muted)] sm:flex sm:flex-wrap sm:gap-4">
        <span className="inline-flex min-w-0 items-center gap-1"><span className="material-symbols-outlined text-[13px]">bolt</span><span className="truncate">{translate("Last minute")}: {formatNumber(s.requestsPerMinute)} {translate("req")}</span></span>
        <span className="inline-flex min-w-0 items-center gap-1"><span className="material-symbols-outlined text-[13px]">sync</span><span className="truncate">{formatNumber(s.inFlight)} {translate("active")}</span></span>
        <span className="inline-flex min-w-0 items-center gap-1"><span className="material-symbols-outlined text-[13px]">token</span><span className="truncate">{formatCompact(used)} {translate("tokens used")}</span></span>
      </div>
      {tokenLimit > 0 ? (
        <div className="min-w-0 rounded-lg border border-[var(--t-line-soft)] bg-[var(--t-raised)] p-2.5">
          <div className="flex flex-col gap-1.5 text-[10px] font-mono text-[var(--t-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold uppercase tracking-wider">{translate("Token quota")}</span>
            <span className="break-words" style={{ color: over ? "var(--t-danger)" : undefined }}>{formatNumber(used)} / {formatNumber(tokenLimit)} · {windowLabel(keyData?.tokenLimitWindow)}</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--t-line-soft)]"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} /></div>
          <div className="mt-2 flex min-w-0 items-center gap-1 text-[10px] font-mono text-[var(--t-accent)]">
            <span className="material-symbols-outlined text-[13px]">timer</span>
            <span className="truncate">{resetAt && new Date(resetAt).getTime() > now ? `${translate("Resets in")}: ${formatCountdown(resetAt, now)}` : translate("Reset window ready")}</span>
          </div>
        </div>
      ) : <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--t-muted)]"><span className="material-symbols-outlined mr-1 align-middle text-[13px] text-[var(--t-ok)]">all_inclusive</span>{translate("Token quota")}: {translate("Unlimited")}</div>}
    </div>
  );
}

KeyLiveStats.propTypes = { keyData: PropTypes.object, stats: PropTypes.object, onReset: PropTypes.func };

