"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePageReady } from "@/shared/components/PageReadyContext";
import { ConfirmModal } from "@/shared/components";
import AntaresSegmented from "@/shared/components/AntaresSegmented";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import { translate, onLocaleChange } from "@/i18n/runtime";
import { parseConsoleLine, isProviderCallParsed } from "@/lib/logLineParse";

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

function LogRow({ p }) {
  const [open, setOpen] = useState(false);
  const [detailCopied, setDetailCopied] = useState(false);
  const badge = LEVEL_BADGES[p.level] || LEVEL_BADGES["·"];
  const isError = p.level === "E";

  const handleCopyDetails = async () => {
    try {
      await navigator.clipboard.writeText(p.details);
      setDetailCopied(true);
      setTimeout(() => setDetailCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex items-start gap-2 border-b border-[var(--t-line-soft)] px-3 py-[3px] last:border-0 hover:bg-[var(--t-raised)]">
      <span className="w-[52px] shrink-0 pt-[2px] tabular-nums text-[var(--t-dim)]">{p.time || "—"}</span>
      <span
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] text-[10px] font-extrabold ${badge}`}
        aria-label={p.level}
      >
        {p.level}
      </span>
      <span className="flex w-[76px] shrink-0 items-center gap-1 pt-[2px]">
        {p.dot ? <span className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: p.dot }} /> : null}
        <span className="truncate text-[10px] font-semibold tracking-wide text-[var(--t-muted)]" title={p.tag || undefined}>
          {p.tag}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <span
          className={`whitespace-pre-wrap break-words ${isError ? "text-[var(--t-danger)]" : "text-[var(--t-ink)]"}`}
        >
          {p.message}
        </span>
        {p.details && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="ml-2 inline-flex items-center text-[10px] text-[var(--t-dim)] hover:text-[var(--t-ink)]"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12, lineHeight: 1 }}>
                {open ? "expand_less" : "expand_more"}
              </span>
              {open ? translate("Hide details") : translate("Show details")}
            </button>
            {open && (
              <div className="mt-2 rounded border border-[var(--t-line-soft)] bg-[var(--t-raised)]">
                <div className="flex items-center justify-between border-b border-[var(--t-line-soft)] px-2 py-1.5">
                  <span className="text-[10px] font-semibold text-[var(--t-muted)]">
                    {isError ? "Error Details" : "Details"}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyDetails}
                    title={translate("Copy details")}
                    className="inline-flex items-center gap-1 text-[10px] text-[var(--t-dim)] hover:text-[var(--t-ink)]"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 12, lineHeight: 1 }}>
                      {detailCopied ? "check" : "content_copy"}
                    </span>
                    {detailCopied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words px-2 py-1.5 text-[11px] text-[var(--t-muted)]">
                  {p.details}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
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
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  usePageReady(!initialLoaded);

  const logRef = useRef(null);
  const pausedRef = useRef(false);
  const pendingRef = useRef([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => onLocaleChange(() => setLocaleVersion((v) => v + 1)), []);

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
      if (msg.type === "init") merge(msg.logs);
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

  const counts = useMemo(() => {
    const result = { ALL: 0, E: 0, W: 0, I: 0, D: 0 };
    for (const p of parsed) {
      if (providerOnly && !isProviderCallParsed(p)) continue;
      result.ALL++;
      const key = p.level === "✓" ? "I" : p.level;
      if (key in result) result[key]++;
    }
    return result;
  }, [parsed, providerOnly]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return parsed.filter((p) => {
      if (providerOnly && !isProviderCallParsed(p)) return false;
      if (levelFilter !== "ALL") {
        const key = p.level === "✓" ? "I" : p.level;
        if (key !== levelFilter) return false;
      }
      if (!needle) return true;
      return `${p.tag} ${p.message} ${p.details}`.toLowerCase().includes(needle);
    });
  }, [parsed, providerOnly, levelFilter, search]);

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

  const statusText = connected
    ? translate("Live")
    : retries > 0
      ? `${translate("Reconnecting…")} (${retries})`
      : translate("Connecting…");

  return (
    <div className="an-scope flex flex-col gap-3" style={{ height: "calc(100vh - 120px)" }}>
      <p className="shrink-0 text-xs text-[var(--t-muted)]">
        <span>Live server console output — not per-request traffic. Request logs live in</span>{" "}
        <Link href="/dashboard/usage?tab=logs" className="font-medium text-[var(--t-star-ink)] hover:underline">
          Usage → Logs
        </Link>
        .
      </p>

      <section className="an-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">terminal</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">Console Log</h2>
            <p className="an-panel-sub">
              <span>{visible.length}</span> / <span>{entries.length}</span> <span>{translate("lines")}</span>
              {paused && pendingCount > 0 && (
                <span className="ml-2 text-[var(--t-star-ink)]">
                  · <span>{pendingCount}</span> <span>new on hold</span>
                </span>
              )}
            </p>
          </div>
          <div className="an-panel-actions">
            <span className={`an-chip ${connected ? "ok" : ""}`}>
              <span
                className={`size-1.5 shrink-0 rounded-full ${connected ? "animate-pulse bg-[var(--t-ok)]" : "bg-[var(--t-dim)]"}`}
              />
              <span>{statusText}</span>
            </span>
          </div>
        </header>

        <div className="an-panel-pad flex shrink-0 flex-col gap-2.5 border-b border-[var(--t-line-soft)]">
          <div className="flex flex-wrap items-center gap-2">
            <AntaresSegmented
              size="sm"
              value={providerOnly ? "provider" : "all"}
              onChange={(v) => changeProviderOnly(v === "provider")}
              options={[
                { value: "all", label: translate("All") },
                { value: "provider", label: translate("Providers only") },
              ]}
            />
            <div className="an-search min-w-[160px] flex-1">
              <span className="material-symbols-outlined">search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={translate("Search message, source, or details...")}
                aria-label={translate("Search logs")}
                className="an-input"
              />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {!connected && (
                <button
                  type="button"
                  onClick={() => setConnectKey((k) => k + 1)}
                  className="an-btn an-ghost h-8 gap-1.5 px-3 text-[11px]"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  Reconnect
                </button>
              )}
              <button
                type="button"
                onClick={togglePause}
                aria-pressed={paused}
                title={paused ? translate("Resume log stream") : translate("Pause log stream")}
                className={`an-btn h-8 gap-1.5 px-3 text-[11px] ${paused ? "an-primary" : "an-ghost"}`}
              >
                <span className="material-symbols-outlined text-[14px]">{paused ? "play_arrow" : "pause"}</span>
                {paused ? <span>Resume</span> : <span>Pause</span>}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                title={translate("Copy visible logs")}
                className="an-btn an-ghost h-8 gap-1.5 px-3 text-[11px]"
              >
                <span className="material-symbols-outlined text-[14px]">{copied ? "check" : "content_copy"}</span>
                {copied ? <span>Copied</span> : <span>Copy</span>}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                title={translate("Download visible logs")}
                className="an-btn an-ghost h-8 gap-1.5 px-3 text-[11px]"
              >
                <span className="material-symbols-outlined text-[14px]">download</span>
                Download
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                title={translate("Clear logs")}
                className="an-btn an-ghost h-8 gap-1.5 px-3 text-[11px]"
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
                Clear
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {LEVEL_FILTERS.map((value) => {
              const active = levelFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLevelFilter(value)}
                  aria-pressed={active}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] transition-colors ${
                    active
                      ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)] text-[var(--t-ink)]"
                      : "border-[var(--t-line-soft)] text-[var(--t-muted)] hover:border-[var(--t-hover-line)] hover:text-[var(--t-ink)]"
                  }`}
                >
                  {value === "ALL" ? (
                    <span className="uppercase tracking-wider">{translate("All")}</span>
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

        <div
          ref={logRef}
          onScroll={handleScroll}
          className="relative min-h-0 flex-1 overflow-y-auto bg-[var(--t-field)] py-1 font-mono text-xs"
        >
          {visible.length === 0 ? (
            <div className="space-y-1 px-4 py-3 text-[var(--t-muted)]">
              <p>
                {entries.length > 0 && (search || levelFilter !== "ALL")
                  ? translate("No results")
                  : providerOnly
                    ? translate("No provider calls yet.")
                    : translate("No console logs yet.")}
              </p>
              {entries.length === 0 && (
                <p className="text-[var(--t-dim)]">
                  Logs stream here live while the server runs — send a request through the router and entries
                  appear. If this stays empty after traffic, the stream may have dropped: use Reconnect above, or
                  refresh the page.
                </p>
              )}
            </div>
          ) : (
            visible.map((p) => <LogRow key={p.id} p={p} />)
          )}
        </div>

        {!autoScroll && !paused && visible.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setAutoScroll(true);
              logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
            }}
            className="shrink-0 border-t border-[var(--t-line-soft)] bg-[var(--t-raised)] py-1.5 font-mono text-[10px] text-[var(--t-star-ink)] hover:underline"
          >
            ↓ <span>Jump to latest</span>
          </button>
        )}
      </section>

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
