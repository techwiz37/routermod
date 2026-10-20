"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LEVELS = {
  LOG:   { label: "LOG",   text: "text-[#3fbf87]", badge: "ok",   dot: "bg-[#3fbf87]", row: "border-[rgba(63,191,135,0.22)] bg-[rgba(63,191,135,0.05)]" },
  INFO:  { label: "INFO",  text: "text-[#5b9dff]", badge: "accent", dot: "bg-[#5b9dff]", row: "border-[rgba(91,157,255,0.22)] bg-[rgba(91,157,255,0.05)]" },
  WARN:  { label: "WARN",  text: "text-[#ffb800]", badge: "warn",  dot: "bg-[#ffb800]", row: "border-[rgba(255,184,0,0.22)] bg-[rgba(255,184,0,0.05)]" },
  ERROR: { label: "ERROR", text: "text-[var(--t-danger)]", badge: "danger", dot: "bg-[var(--t-danger)]", row: "border-[rgba(232,0,31,0.25)] bg-[var(--t-accent-soft)]" },
  DEBUG: { label: "DEBUG", text: "text-[var(--t-muted)]", badge: "",   dot: "bg-[var(--t-dim)]", row: "border-[var(--t-line-soft)] bg-[var(--t-raised)]" },
};

const ALL_FILTERS = ["ALL", "LOG", "INFO", "WARN", "ERROR", "DEBUG"];

let globalIdx = 0;

function parseLine(raw) {
  const levelMatch = raw.match(/^\[(LOG|INFO|WARN|ERROR|DEBUG)\]\s*/i);
  const level = levelMatch ? levelMatch[1].toUpperCase() : "LOG";
  const message = levelMatch ? raw.slice(levelMatch[0].length) : raw;
  const now = new Date();
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  const ss = now.getSeconds().toString().padStart(2, "0");
  const ms = now.getMilliseconds().toString().padStart(3, "0");
  return { id: globalIdx++, level, message, time: `${hh}:${mm}:${ss}.${ms}` };
}

function LogRow({ entry }) {
  const s = LEVELS[entry.level] || LEVELS.LOG;
  return (
    <div className={`flex items-start gap-2.5 rounded-[10px] border px-3 py-2 font-mono text-[11.5px] ${s.row}`}>
      <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${s.dot}`} />
      <span className="shrink-0 text-[var(--t-dim)] text-[10px] mt-0.5 tabular-nums">{entry.time}</span>
      <span className={`an-chip !h-auto shrink-0 !px-1.5 !py-0.5 !text-[9px] uppercase tracking-wider mt-0.5 ${s.badge}`}>
        {entry.level}
      </span>
      <span className={`flex-1 min-w-0 break-all leading-relaxed ${s.text}`}>{entry.message}</span>
    </div>
  );
}

export default function ConsoleLogClient() {
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef(null);

  const addLines = useCallback((lines) => {
    setEntries((prev) => {
      const parsed = lines.map(parseLine);
      const next = [...prev, ...parsed];
      return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
    });
  }, []);

  const handleClear = async () => {
    try { await fetch("/api/translator/console-logs", { method: "DELETE" }); } catch {}
  };

  useEffect(() => {
    globalIdx = 0;
    const es = new EventSource("/api/translator/console-logs/stream");
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        globalIdx = 0;
        setEntries(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines).map(parseLine));
      } else if (msg.type === "line") {
        addLines([msg.line]);
      } else if (msg.type === "lines") {
        addLines(msg.lines);
      } else if (msg.type === "clear") {
        setEntries([]);
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [addLines]);

  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries, autoScroll]);

  const handleScroll = () => {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  const filtered = entries.filter((e) => {
    if (filter !== "ALL" && e.level !== filter) return false;
    if (search && !e.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = entries.reduce((acc, e) => { acc[e.level] = (acc[e.level] || 0) + 1; return acc; }, {});

  return (
    <div className="an-scope flex flex-col gap-4" style={{ height: "calc(100vh - 120px)" }}>

      {/* Toolbar */}
      <section className="an-panel shrink-0">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">terminal</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">Log Konsol</h2>
            <p className="an-panel-sub">
              <span>{entries.length}</span>{" "}
              <span>baris log server</span>
            </p>
          </div>
          <div className="an-panel-actions">
            <span className={`an-chip ${connected ? "ok" : "danger"}`}>
              <span className={`size-1.5 rounded-full shrink-0 ${connected ? "bg-[var(--t-ok)] animate-pulse" : "bg-[var(--t-danger)]"}`} />
              <span>{connected ? "live" : "terputus"}</span>
            </span>
          </div>
        </header>

        <div className="an-panel-pad flex flex-col gap-3">
          <div className="an-toolbar">
            <div className="an-search flex-1 max-w-none">
              <span className="material-symbols-outlined">search</span>
              <input
                type="text"
                placeholder="Cari log..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="an-input"
                aria-label="Cari log"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => setAutoScroll((v) => !v)}
                aria-pressed={autoScroll}
                className={`an-btn h-8 px-3 text-[11px] gap-1.5 ${autoScroll ? "an-primary" : "an-ghost"}`}
              >
                <span className="material-symbols-outlined text-[14px]">south</span>
                Auto
              </button>
              <button type="button" onClick={handleClear} className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5">
                <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                Bersihkan
              </button>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex gap-1.5 flex-wrap">
          {ALL_FILTERS.map((f) => {
            const s = LEVELS[f];
            const cnt = f === "ALL" ? entries.length : (counts[f] || 0);
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active}
                className={`an-chip !h-auto !px-2.5 !py-1 !text-[10px] uppercase tracking-wider cursor-pointer ${
                  active && s ? s.badge :
                  active ? "accent" : ""
                }`}
              >
                {s && <span className={`size-1.5 rounded-full ${s.dot}`} />}
                <span>{f}</span>{" "}
                <span className="opacity-60">{cnt}</span>
              </button>
            );
          })}
          </div>
        </div>
      </section>

      {/* Log panel */}
      <section className="an-panel flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--t-line-soft)] bg-[var(--t-raised)] shrink-0">
          <span className="size-2.5 rounded-full bg-[#ff5f57]/70" />
          <span className="size-2.5 rounded-full bg-[#febc2e]/70" />
          <span className="size-2.5 rounded-full bg-[#28c840]/70" />
          <span className="ml-2 text-[10px] font-mono text-[var(--t-dim)] select-none truncate">
            routermod — stdout
          </span>
          {!autoScroll && (
            <button
              type="button"
              onClick={() => { setAutoScroll(true); logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }}
              className="ml-auto text-[10px] font-mono text-[var(--t-star-ink)] hover:underline shrink-0"
            >
              ↓ Jump to latest
            </button>
          )}
        </div>

        {/* Entries */}
        <div
          ref={logRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5 bg-[var(--t-field)] font-mono text-xs"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--t-muted)] select-none">
              <span className="material-symbols-outlined text-[36px] opacity-25">terminal</span>
              <p className="text-xs opacity-50">
                {entries.length === 0 ? "Menunggu log..." : "Tidak ada hasil"}
              </p>
            </div>
          ) : (
            filtered.map((e) => <LogRow key={e.id} entry={e} />)
          )}
        </div>

        {/* Status bar */}
        <div className="shrink-0 px-4 py-1.5 border-t border-[var(--t-line-soft)] bg-[var(--t-raised)] flex items-center justify-between">
          <span className="text-[10px] font-mono text-[var(--t-dim)]">
            {filtered.length !== entries.length ? `${filtered.length} / ${entries.length}` : `${entries.length}`} baris
          </span>
          <span className="text-[10px] font-mono text-[var(--t-dim)]">
            maks {CONSOLE_LOG_CONFIG.maxLines}
          </span>
        </div>
      </section>
    </div>
  );
}
