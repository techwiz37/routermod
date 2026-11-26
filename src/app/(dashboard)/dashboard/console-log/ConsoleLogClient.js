"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePageReady } from "@/shared/components/PageReadyContext";
import { ConfirmModal } from "@/shared/components";
import AntaresSegmented from "@/shared/components/AntaresSegmented";
import AntaresStat from "@/shared/components/AntaresStat";
import AntaresModal from "@/shared/components/AntaresModal";
import StarField from "@/shared/components/StarField";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import { translate, onLocaleChange } from "@/i18n/runtime";
import { parseConsoleLine, isProviderCallParsed } from "@/lib/logLineParse";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { activeConsoleProviders, consoleLogMatches } from "@/shared/utils/consoleLogFilters";
import ConsoleFilter from "./ConsoleFilter";
import styles from "./console-log.module.css";

// MatLog-style rows: every line renders as time + level badge + short tag +
// one plain message, so the panel scans like a logcat viewer. Badges are a
// solid square with a bold dark letter (I green, W yellow, E red, D blue).
const LEVEL_BADGES = {
  E: "bg-[#f44336] text-black",
  W: "bg-[#ffeb3b] text-black",
  I: "bg-[#4caf50] text-black",
  D: "bg-[#2196f3] text-black",
  "✓": "bg-[#4caf50] text-black",
  "·": "bg-[#9e9e9e] text-black",
};

const LEVEL_FILTERS = ["ALL", "E", "W", "I", "D"];
const PROVIDER_ONLY_KEY = "consoleLogProviderOnly";

function formatForCopy(p) {
  const tag = p.tag ? ` [${p.tag}]` : "";
  return `${p.time || "--:--:--"} ${p.level}${tag} ${p.message}${p.details ? `\n${p.details}` : ""}`;
}

function LogRow({ p, onClick }) {
  const kind = p.level === "E" ? "error" : p.level === "W" ? "warning" : p.level === "✓" ? "success" : "info";
  const labels = { E: "Error", W: "Warn", I: "Info", D: "Debug", "✓": "Success", "·": "Log" };
  return <button type="button" className="console-row" data-level={kind} onClick={() => onClick(p)}>
    <span className="console-time">{p.time || "--:--:--"}</span>
    <span className="console-level">{translate(labels[p.level] || "Log")}</span>
    <span className="console-source" title={p.tag || undefined}>{p.tag || "SYSTEM"}</span>
    <span className="console-message">{p.message}</span>
    <span className="material-symbols-outlined console-open" aria-hidden="true">open_in_full</span>
  </button>;
}

export default function ConsoleLogClient() {
  const [, setLocaleVersion] = useState(0);
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [retries, setRetries] = useState(0);
  const [connectKey, setConnectKey] = useState(0);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [providerOnly, setProviderOnly] = useState(false);
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [providerFilter, setProviderFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [providerNodes, setProviderNodes] = useState([]);
  const [providerConnections, setProviderConnections] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState(false);
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailCopied, setDetailCopied] = useState(false);
  usePageReady(!initialLoaded);

  const logRef = useRef(null);
  const pausedRef = useRef(false);
  const pendingRef = useRef([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => onLocaleChange(() => setLocaleVersion((v) => v + 1)), []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const responses = await Promise.all(["/api/provider-nodes", "/api/providers?view=summary"].map((url) => fetch(url, { cache: "no-store", signal: controller.signal })));
        if (responses.some((res) => !res.ok)) throw new Error("Provider load failed");
        const [nodes, summary] = await Promise.all(responses.map((res) => res.json()));
        if (controller.signal.aborted) return;
        setProviderNodes(nodes.nodes || []); setProviderConnections(summary.connections || []); setProvidersError(false);
      } catch { if (!controller.signal.aborted) setProvidersError(true); }
      finally { if (!controller.signal.aborted) setProvidersLoading(false); }
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("routermod:providers-changed", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("routermod:providers-changed", refresh); };
  }, [connectKey]);

  // Remember the provider-only choice across visits. Read once after mount
  // (deferred) so the server render stays identical and hydration matches.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (window.localStorage.getItem(PROVIDER_ONLY_KEY) === "1") setProviderOnly(true);
      } catch {
        /* storage unavailable */
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const changeProviderOnly = (value) => {
    setProviderOnly(value);
    try {
      window.localStorage.setItem(PROVIDER_ONLY_KEY, value ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  const mergeNow = useCallback((incoming) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setEntries((prev) => {
      const byId = new Map();
      for (const entry of prev) byId.set(entry.id, entry);
      for (const entry of incoming) {
        if (!entry || typeof entry.id !== "number") continue;
        byId.set(entry.id, entry);
      }
      const next = [...byId.values()].sort((a, b) => a.id - b.id);
      const max = CONSOLE_LOG_CONFIG.maxLines;
      return next.length > max ? next.slice(-max) : next;
    });
  }, []);

  // Entries are merged by id so the live stream and the polling fallback can
  // run side by side without duplicating rows.
  const merge = useCallback(
    (incoming) => {
      if (!Array.isArray(incoming) || incoming.length === 0) return;
      if (pausedRef.current) {
        pendingRef.current = pendingRef.current.concat(incoming.filter((e) => e && typeof e.id === "number"));
        setPendingCount(pendingRef.current.length);
        return;
      }
      mergeNow(incoming);
    },
    [mergeNow]
  );

  const resetAll = useCallback(() => {
    setEntries([]);
    pendingRef.current = [];
    setPendingCount(0);
  }, []);

  const togglePause = () => {
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      const pending = pendingRef.current;
      pendingRef.current = [];
      setPendingCount(0);
      if (pending.length) mergeNow(pending);
    } else {
      pausedRef.current = true;
      setPaused(true);
    }
  };

  const handleClear = async () => {
    resetAll();
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
    } catch {
      /* ignore */
    }
  };

  // Live stream. EventSource retries on its own; failures are counted for the
  // status chip and Reconnect tears the stream down and opens a fresh one.
  useEffect(() => {
    let closed = false;
    const es = new EventSource("/api/translator/console-logs/stream");
    es.onopen = () => {
      if (closed) return;
      setConnected(true);
      setRetries(0);
    };
    es.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === "init") {
        merge(msg.logs);
        setInitialLoaded(true);
      }
      else if (msg.type === "line") merge([msg.line]);
      else if (msg.type === "lines") merge(msg.lines);
      else if (msg.type === "clear") resetAll();
    };
    es.onerror = () => {
      if (closed) return;
      setConnected(false);
      setRetries((r) => r + 1);
    };
    return () => {
      closed = true;
      es.close();
    };
  }, [merge, resetAll, connectKey]);

  // Polling fallback: some proxies (tunnels) buffer SSE frames.
  useEffect(() => {
    let stopped = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/translator/console-logs", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped && Array.isArray(data?.logs)) merge(data.logs);
      } catch {
        /* ignore */
      } finally {
        if (!stopped) setInitialLoaded(true);
      }
    };
    pull();
    const timer = setInterval(pull, CONSOLE_LOG_CONFIG.pollIntervalMs || 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [merge, connectKey]);

  const parsed = useMemo(
    () => entries.map((entry) => ({ id: entry.id, ...parseConsoleLine(entry.message, entry) })),
    [entries]
  );

  const providers = useMemo(() => [
    ...Object.values(AI_PROVIDERS).map((p) => ({
      id: p.id.toLowerCase(),
      name: p.name || p.id,
      noAuth: !!p.noAuth,
      keys: [p.id, p.alias, p.name].filter(Boolean).map((key) => key.toLowerCase()),
    })),
    ...providerNodes.map((p) => ({ id: p.id.toLowerCase(), name: p.name || p.prefix || p.id, keys: [p.id, p.prefix].filter(Boolean).map((key) => key.toLowerCase()) })),
  ], [providerNodes]);

  // Providers that actually appear in the current buffer. Log lines carry the
  // routed target's id/alias (e.g. "freepi", a node UUID), which is not always
  // tied to an active connection row yet, so the filter must list whatever the
  // log is currently producing or the dropdown can never select it.
  const observedProviders = useMemo(() => {
    const seen = new Set();
    for (const entry of parsed) if (entry.provider) seen.add(entry.provider);
    return [...seen];
  }, [parsed]);

  const providerOptions = useMemo(() => {
    const active = activeConsoleProviders(providers, providerConnections);
    const known = new Set(active.map((p) => p.id));
    const extras = [];
    for (const observed of observedProviders) {
      const knownProvider = providers.find((p) => p.keys.includes(observed));
      const id = knownProvider?.id || observed;
      if (known.has(id)) continue;
      known.add(id);
      const fallback = String(id).replace(/[-_]+/g, " ").trim();
      extras.push({
        id,
        name: knownProvider?.name || (fallback ? fallback.charAt(0).toUpperCase() + fallback.slice(1) : id),
      });
    }
    return [...active, ...extras].sort((a, b) => a.name.localeCompare(b.name));
  }, [providers, providerConnections, observedProviders]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!providersLoading && !providersError && providerFilter && !providerOptions.some((p) => p.id === providerFilter)) setProviderFilter("");
  }, [providerOptions, providerFilter, providersLoading, providersError]);

  const counts = useMemo(() => {
    const result = { ALL: 0, E: 0, W: 0, I: 0, D: 0 };
    for (const p of parsed) {
      if (providerOnly && !isProviderCallParsed(p)) continue;
      if (!consoleLogMatches(p, { provider: providerFilter, outcome: outcomeFilter, providers })) continue;
      result.ALL++;
      const key = p.level === "✓" ? "I" : p.level;
      if (key in result) result[key]++;
    }
    return result;
  }, [parsed, providerOnly, providerFilter, outcomeFilter, providers]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return parsed.filter((p) => {
      if (providerOnly && !isProviderCallParsed(p)) return false;
      if (!consoleLogMatches(p, { provider: providerFilter, outcome: outcomeFilter, providers })) return false;
      if (levelFilter !== "ALL") {
        const key = p.level === "✓" ? "I" : p.level;
        if (key !== levelFilter) return false;
      }
      if (!needle) return true;
      return `${p.tag} ${p.message} ${p.details}`.toLowerCase().includes(needle);
    });
  }, [parsed, providerOnly, levelFilter, search, providerFilter, outcomeFilter, providers]);

  useEffect(() => {
    if (!autoScroll || paused || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visible, autoScroll, paused]);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const handleCopy = async () => {
    const text = visible.map(formatForCopy).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleDownload = () => {
    const blob = new Blob([visible.map(formatForCopy).join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `routermod-console-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyDetails = async () => {
    if (!selectedLog) return;
    try {
      const fullText = formatForCopy(selectedLog);
      await navigator.clipboard.writeText(fullText);
      setDetailCopied(true);
      setTimeout(() => setDetailCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const statusText = connected
    ? translate("Live")
    : retries > 0
      ? `${translate("Reconnecting…")} (${retries})`
      : translate("Connecting…");

  return (
    <div className="an-scope an-shell console-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="console-hero">
        <div className="min-w-0 flex-1">
          <p className="an-eyebrow">
            <span className="an-num">10</span>
            <span className="an-rule" />
            <span>{translate("RouterMod · AI Gateway")}</span>
          </p>
          <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">
            {translate("Console Log")}
          </h1>
          <p className="an-hint max-w-[70ch]">
            {translate("Live output from the server process. Send a request through the router and lines appear here in real time.")}
          </p>
        </div>
        <Link
          href="/dashboard/usage?tab=logs"
          className="an-btn an-ghost h-9 px-3 text-[11px] gap-1.5 shrink-0"
        >
          <span className="material-symbols-outlined text-[14px]">receipt_long</span>
          {translate("Request traffic")}
        </Link>
      </header>

      {/* ---- Summary tiles ---- */}
      <div className="an-grid console-stats gap-2.5 sm:gap-3">
        <AntaresStat
          label={translate("Shown")}
          icon="visibility"
          value={visible.length}
          foot={`${counts.ALL} ${translate("matching lines")}`}
        />
        <AntaresStat
          label={translate("Buffer")}
          icon="database"
          value={entries.length}
          foot={`${CONSOLE_LOG_CONFIG.maxLines} ${translate("max lines")}`}
        />
        <AntaresStat
          label={translate("Errors")}
          icon="error"
          tone="danger"
          value={counts.E}
          foot={translate("in current view")}
        />
        <AntaresStat
          label={translate("Stream")}
          icon="sensors"
          tone={paused ? "warn" : connected ? "ok" : "default"}
          value={paused ? translate("Paused") : connected ? translate("Live") : translate("Offline")}
          foot={statusText}
        />
      </div>

      <section className="an-panel flex min-w-0 flex-col console-panel">
        <header className="an-panel-head console-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">terminal</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Live console")}</h2>
            <p className="an-panel-sub">
              <span>{visible.length}</span> / <span>{entries.length}</span> <span>{translate("lines")}</span>
              {paused && pendingCount > 0 && (
                <span className="text-[var(--t-star-ink)]">
                  {" "}· <span>{pendingCount}</span> <span>{translate("new on hold")}</span>
                </span>
              )}
            </p>
          </div>
          <div className="an-panel-actions">
            <span className={`an-chip ${connected ? "ok" : ""}`}>
              <span
                className={`size-1.5 shrink-0 rounded-full ${connected ? "bg-[var(--t-ok)]" : "bg-[var(--t-dim)]"}`}
              />
              <span>{statusText}</span>
            </span>
          </div>
        </header>

        <div className="console-controls">
          <div className="console-toolbar">
            <div className="an-search console-search">
              <span className="material-symbols-outlined" aria-hidden>search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={translate("Search message, source, or details...")}
                aria-label={translate("Search logs")}
                className="an-input"
              />
            </div>
            <AntaresSegmented
              size="sm"
              value={providerOnly ? "provider" : "all"}
              onChange={(v) => changeProviderOnly(v === "provider")}
              options={[
                { value: "all", label: translate("All") },
                { value: "provider", label: translate("Providers only") },
              ]}
            />
            <div className="console-actions">
              {!connected && (
                <button
                  type="button"
                  onClick={() => setConnectKey((k) => k + 1)}
                  className="an-btn an-ghost console-action"
                >
                  <span className="material-symbols-outlined">refresh</span>
                  <span>{translate("Reconnect")}</span>
                </button>
              )}
              <button
                type="button"
                onClick={togglePause}
                aria-pressed={paused}
                title={paused ? translate("Resume log stream") : translate("Pause log stream")}
                className={`an-btn console-action ${paused ? "an-primary" : "an-ghost"}`}
              >
                <span className="material-symbols-outlined">{paused ? "play_arrow" : "pause"}</span>
                <span>{paused ? translate("Resume") : translate("Pause")}</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                title={translate("Copy visible logs")}
                className="an-btn an-ghost console-action"
              >
                <span className="material-symbols-outlined">{copied ? "check" : "content_copy"}</span>
                <span>{copied ? translate("Copied") : translate("Copy")}</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                title={translate("Download visible logs")}
                className="an-btn an-ghost console-action"
              >
                <span className="material-symbols-outlined">download</span>
                <span>{translate("Download")}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                title={translate("Clear logs")}
                className="an-btn an-ghost console-action"
              >
                <span className="material-symbols-outlined">delete</span>
                <span>{translate("Clear")}</span>
              </button>
            </div>
          </div>

          <div className={`${styles.filters} console-filters`}>
            <ConsoleFilter label={translate("Provider")} value={providerFilter} onChange={setProviderFilter} icon="dns" searchable disabled={providersLoading || providersError}
              options={[{ value: "", label: translate(providersLoading ? "Loading providers..." : "All active providers"), icon: "dns" },
                ...providerOptions.map((p) => ({ value: p.id, label: p.name, description: translate("Active provider") }))]} />
            <ConsoleFilter label={translate("Result")} value={outcomeFilter} onChange={(value) => { setOutcomeFilter(value); setLevelFilter("ALL"); }} icon="filter_alt"
              options={[
                { value: "all", label: translate("All results"), icon: "filter_alt" },
                { value: "success", label: translate("Successful requests"), icon: "check_circle" },
                { value: "failed", label: translate("Errors"), icon: "error" },
              ]} />
            <div className={`${styles.levelField} console-level`}>
              <span>{translate("Log level")}</span>
              <div className="console-level-chips">
                {LEVEL_FILTERS.map((value) => {
                  const active = levelFilter === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLevelFilter(value)}
                      aria-pressed={active}
                      className={`inline-flex min-h-9 cursor-pointer shrink-0 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] transition-colors active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-accent)] ${
                        active
                          ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)] text-[var(--t-ink)]"
                          : "border-[var(--t-line-soft)] text-[var(--t-muted)] hover:border-[var(--t-hover-line)] hover:text-[var(--t-ink)]"
                      }`}
                    >
                      {value === "ALL" ? (
                        <span className="uppercase">{translate("All")}</span>
                      ) : (
                        <span
                          className={`flex size-[15px] items-center justify-center rounded-[3px] text-[9px] font-extrabold ${LEVEL_BADGES[value]}`}
                        >
                          {value}
                        </span>
                      )}
                      <span className="opacity-60 tabular-nums">{counts[value]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {providersError && (
            <p role="alert" className="console-note text-[var(--t-danger)]">
              {translate("Could not load active providers. Use Reconnect to retry.")}{" "}
              <button type="button" className={styles.retry} onClick={() => setConnectKey((k) => k + 1)}>{translate("Retry")}</button>
            </p>
          )}
          {!providersLoading && !providersError && providerOptions.length === 0 && (
            <p className="console-note">{translate("No active providers. Enable a provider connection to filter its logs.")}</p>
          )}
          {(providerFilter || outcomeFilter !== "all") && (
            <p className="console-note">{translate("Provider and result filters also apply to copied and downloaded logs.")}</p>
          )}
        </div>

        <div className="console-columns" aria-hidden="true"><span>{translate("Time")}</span><span>{translate("Level")}</span><span>{translate("Source")}</span><span>{translate("Message")}</span></div>
        <div
          ref={logRef}
          onScroll={handleScroll}
          className="console-viewport"
        >
          {visible.length === 0 ? (
            <div className="an-empty console-empty">
              <span className="material-symbols-outlined" aria-hidden>
                {entries.length > 0 ? "filter_alt_off" : "terminal"}
              </span>
              <p>
                {entries.length > 0 && (search || levelFilter !== "ALL" || providerFilter || outcomeFilter !== "all")
                  ? translate("No results")
                  : providerOnly
                    ? translate("No provider calls yet.")
                    : translate("No console logs yet.")}
              </p>
              {entries.length === 0 && (
                <p className="console-empty-hint">
                  {translate("Send a request through the router to see its logs here. Use Reconnect if the stream is interrupted.")}
                </p>
              )}
            </div>
          ) : (
            visible.map((p) => <LogRow key={p.id} p={p} onClick={setSelectedLog} />)
          )}
        </div>
        <footer className="console-footer">
          <span className="console-footer-live">
            <span className="material-symbols-outlined" aria-hidden="true">{paused ? "pause_circle" : "sensors"}</span>
            {translate(paused ? "Paused" : connected ? "Live stream" : "Connecting…")}
          </span>
          <span>{visible.length} / {entries.length} {translate("lines")}</span>
        </footer>

        {!autoScroll && !paused && visible.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setAutoScroll(true);
              logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
            }}
            className="console-jump"
          >
            ↓ <span>{translate("Jump to latest")}</span>
          </button>
        )}
      </section>

      {/* Log Detail Modal */}
      <AntaresModal
        isOpen={!!selectedLog}
        onClose={() => {
          setSelectedLog(null);
          setDetailCopied(false);
        }}
        title="Log Detail"
        size="lg"
      >
        {selectedLog && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--t-raised)] border border-[var(--t-line-soft)]">
              <span
                className={`mt-0.5 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded text-[11px] font-bold ${LEVEL_BADGES[selectedLog.level] || LEVEL_BADGES["·"]}`}
              >
                {selectedLog.level}
              </span>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] tabular-nums text-[var(--t-dim)]">{selectedLog.time || "--:--:--"}</span>
                  {selectedLog.dot && <span className="size-[6px] shrink-0 rounded-full" style={{ backgroundColor: selectedLog.dot }} />}
                  <span className="text-[11px] font-medium text-[var(--t-muted)]">{selectedLog.tag}</span>
                </div>
                <p className={`text-sm leading-relaxed ${selectedLog.level === "E" ? "text-[var(--t-danger)]" : "text-[var(--t-ink)]"}`}>
                  {selectedLog.message}
                </p>
              </div>
            </div>

            {selectedLog.details && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--t-muted)]">
                    {selectedLog.level === "E" ? "Error Details" : "Details"}
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyDetails}
                    className="inline-flex items-center gap-1.5 text-[11px] text-[var(--t-dim)] hover:text-[var(--t-ink)] transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {detailCopied ? "check" : "content_copy"}
                    </span>
                    {detailCopied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="max-h-[400px] overflow-auto rounded-lg bg-[#0a0a0a] border border-[var(--t-line-soft)] p-4 text-[11px] leading-relaxed text-[#00ff00] font-mono whitespace-pre-wrap break-words">
{selectedLog.details}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedLog(null);
                  setDetailCopied(false);
                }}
                className="an-btn an-primary h-9 px-4"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </AntaresModal>

      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => {
          setShowClearConfirm(false);
          handleClear();
        }}
        title={translate("Clear console logs")}
        message={translate("Clear all console logs? This cannot be undone.")}
        confirmText={translate("Clear")}
        cancelText={translate("Cancel")}
        variant="danger"
      />

    </div>
  );
}
