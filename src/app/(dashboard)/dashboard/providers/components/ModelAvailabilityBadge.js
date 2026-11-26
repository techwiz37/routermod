"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";
import { translate } from "@/i18n/runtime";

const STATUS_CONFIG = {
  available: { icon: "check_circle", color: "ok", label: "Available" },
  cooldown: { icon: "schedule", color: "warn", label: "Cooldown" },
  unavailable: { icon: "error", color: "danger", label: "Unavailable" },
  unknown: { icon: "help", color: "", label: "Unknown" },
};

export default function ModelAvailabilityBadge() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [clearing, setClearing] = useState(null);
  const [dropUp, setDropUp] = useState(false);
  const [maxListH, setMaxListH] = useState(300);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const notify = useNotificationStore();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/models/availability");
      if (res.ok) setData(await res.json());
    } catch {
      /* keep the last known status */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setExpanded(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [expanded]);

  const handleClearCooldown = async (provider, model) => {
    setClearing(`${provider}:${model}`);
    try {
      const res = await fetch("/api/models/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clearCooldown", provider, model }),
      });
      if (res.ok) {
        notify.success(translate("Cooldown cleared for {model}").replace("{model}", model));
        await fetchStatus();
      } else {
        notify.error(translate("Failed to clear cooldown"));
      }
    } catch {
      notify.error(translate("Failed to clear cooldown"));
    } finally {
      setClearing(null);
    }
  };

  if (loading) return null;

  const models = data?.models || [];
  const unavailableCount =
    data?.unavailableCount || models.filter((m) => m.status !== "available").length;
  const isHealthy = unavailableCount === 0;

  const byProvider = {};
  models.forEach((m) => {
    if (m.status === "available") return;
    const key = m.provider || "unknown";
    if (!byProvider[key]) byProvider[key] = [];
    byProvider[key].push(m);
  });

  return (
    <div className="an-model-status relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          const next = !expanded;
          if (next && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const gap = 12;
            const headerH = 74; // header + card padding
            const roomAbove = rect.top - gap;
            const roomBelow = window.innerHeight - rect.bottom - gap;
            // Open upward when there is not enough room below but more room
            // above, so the panel never spills past the screen edge.
            const up = roomBelow < headerH + 180 && roomAbove > roomBelow;
            setDropUp(up);
            setMaxListH(Math.max(120, Math.min(300, (up ? roomAbove : roomBelow) - headerH)));
          }
          setExpanded(next);
        }}
        aria-expanded={expanded}
        className={`an-chip ${isHealthy ? "ok" : ""} h-8 cursor-pointer`}
        title={translate("Model availability")}
      >
        <span className="material-symbols-outlined text-[14px]">
          {isHealthy ? "verified" : "warning"}
        </span>
        {isHealthy
          ? translate("Models OK")
          : translate("{n} models with issues").replace("{n}", unavailableCount)}
        <span className="material-symbols-outlined text-[13px] opacity-70">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <div
          className={`an-model-status-pop an-panel absolute z-50 left-0 right-0 w-auto sm:left-auto sm:right-0 sm:w-[min(88vw,340px)] ${
            dropUp ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="an-panel-head">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined">
                {isHealthy ? "verified" : "warning"}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="an-panel-title">{translate("Model Status")}</h4>
              <p className="an-panel-sub">{translate("Live availability per model")}</p>
            </div>
            <button
              type="button"
              onClick={fetchStatus}
              title={translate("Refresh")}
              aria-label={translate("Refresh")}
              className="grid size-8 place-items-center rounded-lg border border-[var(--t-line)] text-[var(--t-dim)] transition-colors hover:border-[var(--t-dim)] hover:text-[var(--t-ink)]"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
            </button>
          </div>

          <div
            className="scrollbar-none overflow-y-auto p-2.5"
            style={{ maxHeight: maxListH }}
          >
            {isHealthy ? (
              <p className="an-meta px-2 py-5 text-center">
                {translate("All models are responding normally.")}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {Object.entries(byProvider).map(([provider, provModels]) => (
                  <div key={provider} className="min-w-0">
                    <p className="an-meta mb-1.5 truncate px-1 capitalize" title={provider}>{provider}</p>
                    <div className="flex flex-col gap-1">
                      {provModels.map((m) => {
                        const status = STATUS_CONFIG[m.status] || STATUS_CONFIG.unknown;
                        const isClearing = clearing === `${m.provider}:${m.model}`;
                        return (
                          <div
                            key={`${m.provider}-${m.model}`}
                            className="flex min-w-0 items-center gap-2 rounded-[9px] border border-[var(--t-line-soft)] bg-[var(--t-card)] px-2.5 py-2"
                          >
                            <span
                              className={`material-symbols-outlined shrink-0 text-[15px] ${
                                status.color === "ok"
                                  ? "text-[var(--t-ok)]"
                                  : status.color === "warn"
                                    ? "text-amber-400"
                                    : status.color === "danger"
                                      ? "text-[var(--t-danger)]"
                                      : "text-[var(--t-dim)]"
                              }`}
                            >
                              {status.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-mono text-[11px] text-[var(--t-ink)]" title={m.model}>
                                {m.model === "__all" ? translate("All models") : m.model}
                              </span>
                              {m.connectionName && (
                                <span className="block truncate text-[10px] text-[var(--t-dim)]" title={m.connectionName}>
                                  {m.connectionName}
                                </span>
                              )}
                            </span>
                            <span className="an-meta shrink-0">{translate(status.label)}</span>
                            {m.status === "cooldown" && (
                              <Button
                                skin="antares"
                                size="xs"
                                variant="ghost"
                                onClick={() => handleClearCooldown(m.provider, m.model)}
                                disabled={isClearing}
                                className="!min-h-0 !px-1.5 !py-0.5 !text-[10px]"
                              >
                                {isClearing ? "…" : translate("Clear")}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
