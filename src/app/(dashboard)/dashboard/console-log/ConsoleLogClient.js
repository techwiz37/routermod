"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LEVELS = {
  LOG:   { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  INFO:  { color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/20",     dot: "bg-sky-400" },
  WARN:  { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   dot: "bg-amber-400" },
  ERROR: { color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     dot: "bg-red-400" },
  DEBUG: { color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/20",  dot: "bg-purple-400" },
};

const ALL_FILTERS = ["ALL", "LOG", "INFO", "WARN", "ERROR", "DEBUG"];

function parseLine(raw, index) {
  const now = new Date();
  // Try extract [LEVEL] prefix added by consoleLogBuffer
  const levelMatch = raw.match(/^\[(LOG|INFO|WARN|ERROR|DEBUG)\]\s*/i);
  const level = levelMatch ? levelMatch[1].toUpperCase() : "LOG";
  const message = levelMatch ? raw.slice(levelMatch[0].length) : raw;
  return { id: index, level, message, time: now };
}

function LogRow({ entry }) {
  const style = LEVELS[entry.level] || LEVELS.LOG;
  const hh = entry.time.getHours().toString().padStart(2, "0");
  const mm = entry.time.getMinutes().toString().padStart(2, "0");
  const ss = entry.time.getSeconds().toString().padStart(2, "0");
  const ms = entry.time.getMilliseconds().toString().padStart(3, "0");
  const timeStr = `${hh}:${mm}:${ss}.${ms}`;

  return (
    <div className={`flex gap-2 px-3 py-1.5 rounded-md border ${style.border} ${style.bg} group`}>
      {/* dot */}
      <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${style.dot}`} />
      {/* timestamp */}
      <span className="text-[10px] text-text-muted font-mono shrink-0 mt-0.5 select-none">
        {timeStr}
      </span>
      {/* badge */}
      <span className={`text-[9px] font-bold font-mono shrink-0 mt-0.5 px-1 rounded uppercase tracking-wider ${style.color}`}>
        {entry.level}
      </span>
      {/* message */}
      <span className={`text-xs font-mono break-all leading-relaxed ${style.color} flex-1 min-w-0`}>
        {entry.message}
      </span>
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
  const idxRef = useRef(0);

  const addLines = useCallback((lines) => {
    setEntries((prev) => {
      const parsed = lines.map((l) => parseLine(l, idxRef.current++));
      const next = [...prev, ...parsed];
      return next.length > CONSOLE_LOG_CONFIG.maxLines
        ? next.slice(-CONSOLE_LOG_CONFIG.maxLines)
        : next;
    });
  }, []);

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
    } catch {}
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        idxRef.current = 0;
        setEntries(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines).map((l, i) => parseLine(l, i)));
        idxRef.current = msg.logs.length;
      } else if (msg.type === "line") {
        addLines([msg.line]);
      } else if (msg.type === "lines") {
        addLines(msg.lines);
      } else if (msg.type === "clear") {
        setEntries([]);
        idxRef.current = 0;
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [addLines]);

  // Auto-scroll
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

  const counts = entries.reduce((acc, e) => {
    acc[e.level] = (acc[e.level] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-80px)]">
      {/* Header bar */}
      <Card className="shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Title + status */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="size-9 rounded-lg border-2 border-border bg-surface-2 shadow-[2px_2px_0_var(--color-border)] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px] text-text-muted">terminal</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-mono font-bold text-sm uppercase tracking-wider text-text-main">Console Log</h1>
                <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${connected ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                  <span className={`size-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                  {connected ? "Live" : "Disconnected"}
                </span>
              </div>
              <p className="text-[11px] text-text-muted font-mono">{entries.length} entries captured</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-0 max-w-xs">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-text-muted pointer-events-none">search</span>
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 h-8 rounded-lg border-2 border-border bg-surface text-xs font-mono text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAutoScroll((v) => !v)}
              title="Auto-scroll"
              className={`h-8 px-2.5 rounded-lg border-2 border-border text-[11px] font-mono font-bold transition-colors ${autoScroll ? "bg-primary/15 text-primary border-primary/30" : "bg-surface-2 text-text-muted"}`}
            >
              {autoScroll ? "↓ Auto" : "↓ Off"}
            </button>
            <Button size="sm" variant="outline" icon="delete_sweep" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 flex-wrap mt-3 pt-3 border-t border-border/50">
          {ALL_FILTERS.map((f) => {
            const style = f === "ALL" ? null : LEVELS[f];
            const cnt = f === "ALL" ? entries.length : (counts[f] || 0);
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border transition-all ${
                  active
                    ? style
                      ? `${style.bg} ${style.color} ${style.border} border`
                      : "bg-surface-2 text-text-main border-border"
                    : "bg-transparent text-text-muted border-transparent hover:border-border hover:bg-surface-2"
                }`}
              >
                {style && <span className={`size-1.5 rounded-full ${style.dot}`} />}
                {f}
                <span className="opacity-60">{cnt}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Log viewport */}
      <Card className="flex-1 min-h-0 overflow-hidden p-0 flex flex-col">
        {/* Terminal header strip */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b-2 border-border bg-surface-2 shrink-0">
          <span className="size-2.5 rounded-full bg-red-500/70" />
          <span className="size-2.5 rounded-full bg-yellow-500/70" />
          <span className="size-2.5 rounded-full bg-green-500/70" />
          <span className="ml-2 text-[10px] font-mono text-text-muted">routermod — console output</span>
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }}
              className="ml-auto text-[10px] font-mono text-primary hover:underline"
            >
              ↓ Scroll to bottom
            </button>
          )}
        </div>

        {/* Log lines */}
        <div
          ref={logRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 space-y-1 bg-[#0d0d0f] dark:bg-[#0d0d0f]"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
              <span className="material-symbols-outlined text-[40px] opacity-30">terminal</span>
              <p className="text-sm font-mono opacity-50">
                {entries.length === 0 ? "Waiting for logs..." : "No matching logs"}
              </p>
            </div>
          ) : (
            filtered.map((e) => <LogRow key={e.id} entry={e} />)
          )}
        </div>

        {/* Bottom status bar */}
        <div className="shrink-0 px-4 py-1.5 border-t border-border/30 bg-surface-2 flex items-center justify-between">
          <span className="text-[10px] font-mono text-text-muted">
            {filtered.length === entries.length
              ? `${entries.length} lines`
              : `${filtered.length} / ${entries.length} lines`}
          </span>
          <span className="text-[10px] font-mono text-text-muted">max {CONSOLE_LOG_CONFIG.maxLines}</span>
        </div>
      </Card>
    </div>
  );
}
