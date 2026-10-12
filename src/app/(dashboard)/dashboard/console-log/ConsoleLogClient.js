"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LEVELS = {
  LOG:   { label: "LOG",   text: "text-emerald-500 dark:text-emerald-400", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500 dark:bg-emerald-400", row: "border-emerald-500/15 bg-emerald-500/5" },
  INFO:  { label: "INFO",  text: "text-sky-500 dark:text-sky-400",         badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400",         dot: "bg-sky-500 dark:bg-sky-400",         row: "border-sky-500/15 bg-sky-500/5" },
  WARN:  { label: "WARN",  text: "text-amber-500 dark:text-amber-400",     badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",     dot: "bg-amber-500 dark:bg-amber-400",     row: "border-amber-500/15 bg-amber-500/5" },
  ERROR: { label: "ERROR", text: "text-red-500 dark:text-red-400",         badge: "bg-red-500/10 text-red-600 dark:text-red-400",         dot: "bg-red-500 dark:bg-red-400",         row: "border-red-500/15 bg-red-500/5" },
  DEBUG: { label: "DEBUG", text: "text-purple-500 dark:text-purple-400",   badge: "bg-purple-500/10 text-purple-600 dark:text-purple-400",   dot: "bg-purple-500 dark:bg-purple-400",   row: "border-purple-500/15 bg-purple-500/5" },
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
    <div className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border ${s.row} font-mono text-xs`}>
      <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${s.dot}`} />
      <span className="shrink-0 text-text-muted text-[10px] mt-0.5 tabular-nums">{entry.time}</span>
      <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider mt-0.5 ${s.badge}`}>
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
    <div className="flex flex-col gap-4" style={{ height: "calc(100vh - 120px)" }}>

      {/* Toolbar */}
      <Card className="shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Title */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="size-9 rounded-lg border-2 border-border bg-surface-2 shadow-[2px_2px_0_var(--color-border)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px] text-text-muted">terminal</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-mono font-bold text-sm uppercase tracking-wider text-text-main">Console Log</h1>
                <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${connected ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                  <span className={`size-1.5 rounded-full ${connected ? "bg-emerald-500 dark:bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
                  {connected ? "Live" : "Disconnected"}
                </span>
              </div>
              <p className="text-[11px] text-text-muted">{entries.length} entries</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-0 max-w-xs">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-text-muted pointer-events-none">search</span>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 h-8 rounded-lg border-2 border-border bg-surface text-xs font-mono text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAutoScroll((v) => !v)}
              className={`h-8 px-2.5 rounded-lg border-2 text-[11px] font-mono font-bold transition-all ${autoScroll ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface-2 text-text-muted hover:border-border"}`}
            >
              ↓ Auto
            </button>
            <Button size="sm" variant="outline" icon="delete_sweep" onClick={handleClear}>Clear</Button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 flex-wrap mt-3 pt-3 border-t border-border/40">
          {ALL_FILTERS.map((f) => {
            const s = LEVELS[f];
            const cnt = f === "ALL" ? entries.length : (counts[f] || 0);
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border transition-all ${
                  active && s ? `${s.badge} border-current/30` :
                  active      ? "bg-surface-2 text-text-main border-border" :
                                "bg-transparent text-text-muted border-transparent hover:border-border hover:bg-surface-2"
                }`}
              >
                {s && <span className={`size-1.5 rounded-full ${s.dot}`} />}
                {f} <span className="opacity-60">{cnt}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Log panel */}
      <Card className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col border-2 border-border">
        {/* Mac-style title bar */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b-2 border-border bg-surface-2 shrink-0">
          <span className="size-2.5 rounded-full bg-red-400/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-2 text-[10px] font-mono text-text-muted select-none">routermod — stdout</span>
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }}
              className="ml-auto text-[10px] font-mono text-primary hover:underline"
            >↓ Jump to latest</button>
          )}
        </div>

        {/* Entries */}
        <div
          ref={logRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 space-y-1 bg-surface font-mono text-xs"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted select-none">
              <span className="material-symbols-outlined text-[36px] opacity-25">terminal</span>
              <p className="text-xs opacity-50">{entries.length === 0 ? "Waiting for logs..." : "No results"}</p>
            </div>
          ) : (
            filtered.map((e) => <LogRow key={e.id} entry={e} />)
          )}
        </div>

        {/* Status bar */}
        <div className="shrink-0 px-4 py-1.5 border-t border-border/40 bg-surface-2 flex items-center justify-between">
          <span className="text-[10px] font-mono text-text-muted">
            {filtered.length !== entries.length ? `${filtered.length} / ${entries.length}` : `${entries.length}`} lines
          </span>
          <span className="text-[10px] font-mono text-text-muted">max {CONSOLE_LOG_CONFIG.maxLines}</span>
        </div>
      </Card>
    </div>
  );
}
