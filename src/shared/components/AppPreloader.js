"use client";

import { useEffect, useRef } from "react";

// Professional terminal-style preloader, synced to RouterMod Neobrutalism theme.
// Reads localStorage before hydration to avoid theme flash.
// Mimics zettai.my.id: sequential boot log lines, animated progress bar.

const BOOT_LINES = [
  "INITIALIZING ROUTERMOD CORE...",
  "LOADING AI PROVIDER REGISTRY...",
  "MOUNTING SECURE SESSION...",
  "SYNCING ENDPOINT CONFIGURATION...",
  "READY",
];

export default function AppPreloader() {
  const rootRef = useRef(null);
  const logRef = useRef(null);
  const barRef = useRef(null);
  const pctRef = useRef(null);

  useEffect(() => {
    // Apply theme class
    const root = rootRef.current;
    if (!root) return;
    try {
      const s = localStorage.getItem("theme");
      const t = s ? (JSON.parse(s).state || {}).theme : "system";
      const dark =
        t === "dark" ||
        (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("rpl-dark", dark);
    } catch { /* light fallback */ }

    // Animate boot lines
    const log = logRef.current;
    const bar = barRef.current;
    const pct = pctRef.current;
    if (!log || !bar || !pct) return;

    let cancelled = false;
    const TOTAL = BOOT_LINES.length;

    async function typeLine(text, lineEl) {
      for (let i = 0; i <= text.length; i++) {
        if (cancelled) return;
        lineEl.textContent = text.slice(0, i) + (i < text.length ? "▌" : "");
        await sleep(18 + Math.random() * 18);
      }
    }

    async function run() {
      for (let idx = 0; idx < TOTAL; idx++) {
        if (cancelled) return;
        const lineEl = document.createElement("div");
        lineEl.className = "rpl-log-line" + (idx === TOTAL - 1 ? " rpl-log-ok" : "");
        const prefix = document.createElement("span");
        prefix.className = "rpl-prefix";
        prefix.textContent = idx === TOTAL - 1 ? "[✓] " : `[${String(idx + 1).padStart(2, "0")}] `;
        lineEl.appendChild(prefix);
        const textSpan = document.createElement("span");
        lineEl.appendChild(textSpan);
        log.appendChild(lineEl);
        log.scrollTop = log.scrollHeight;

        await typeLine(BOOT_LINES[idx], textSpan);
        if (cancelled) return;

        const progress = Math.round(((idx + 1) / TOTAL) * 100);
        bar.style.width = progress + "%";
        pct.textContent = progress + "%";
        await sleep(120);
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div ref={rootRef} className="rpl-root" suppressHydrationWarning>
      <style>{CSS}</style>
      {/* top accent bar */}
      <div className="rpl-topbar" />
      {/* terminal card */}
      <div className="rpl-card">
        {/* header bar */}
        <div className="rpl-card-header">
          <div className="rpl-dots-row">
            <span className="rpl-dot rpl-dot-r" />
            <span className="rpl-dot rpl-dot-y" />
            <span className="rpl-dot rpl-dot-g" />
          </div>
          <span className="rpl-title-bar">ROUTERMOD // BOOT SEQUENCE</span>
          <span className="rpl-version">v1.0</span>
        </div>
        {/* log area */}
        <div className="rpl-log" ref={logRef} />
        {/* progress */}
        <div className="rpl-progress-section">
          <div className="rpl-progress-track">
            <div className="rpl-progress-fill" ref={barRef} style={{ width: "0%" }} />
            <div className="rpl-progress-shimmer" />
          </div>
          <span className="rpl-pct" ref={pctRef}>0%</span>
        </div>
        {/* status row */}
        <div className="rpl-status-row">
          <span className="rpl-status-dot" />
          <span className="rpl-status-text">SYSTEM ONLINE</span>
          <span className="rpl-host">localhost:1945</span>
        </div>
      </div>
    </div>
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const CSS = `
  .rpl-root {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f0f2f7;
    --acc: #ff1a53;
    --border: #111827;
    --surface: #ffffff;
    --surface2: #f8fafc;
    --text: #111827;
    --muted: #6b7280;
    --muted2: #9ca3af;
    --shadow: #111827;
    --prefix: #ff1a53;
    --ok: #16a34a;
    font-family: ui-monospace, 'JetBrains Mono', 'Courier New', monospace;
    z-index: 9999;
  }
  .rpl-root.rpl-dark {
    background: #0b0e14;
    --border: #e2e8f0;
    --surface: #0f1117;
    --surface2: #161922;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --muted2: #475569;
    --shadow: #000000;
  }

  /* top accent */
  .rpl-topbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent 0%, var(--acc) 30%, #ff6b8a 60%, var(--acc) 80%, transparent 100%);
    animation: rpl-topglow 2.4s ease-in-out infinite;
    z-index: 10000;
  }
  @keyframes rpl-topglow {
    0%, 100% { opacity: 0.55; }
    50%       { opacity: 1; }
  }

  /* card */
  .rpl-card {
    width: min(520px, 92vw);
    background: var(--surface);
    border: 2.5px solid var(--border);
    border-radius: 14px;
    box-shadow: 6px 6px 0 var(--shadow);
    overflow: hidden;
    animation: rpl-up 0.35s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes rpl-up {
    from { opacity: 0; transform: translateY(16px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* header */
  .rpl-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    background: var(--surface2);
    border-bottom: 2px solid var(--border);
  }
  .rpl-dots-row { display: flex; gap: 6px; align-items: center; }
  .rpl-dot {
    width: 12px; height: 12px;
    border-radius: 50%;
    border: 1.5px solid var(--border);
  }
  .rpl-dot-r { background: #ff5f57; }
  .rpl-dot-y { background: #febc2e; }
  .rpl-dot-g { background: #28c840; }
  .rpl-title-bar {
    flex: 1;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .rpl-version {
    font-size: 9px;
    color: var(--muted2);
    letter-spacing: 0.1em;
  }

  /* logo row */
  .rpl-logo-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 20px 12px;
  }
  .rpl-logo-mark {
    width: 44px; height: 44px;
    background: var(--acc);
    border: 2px solid var(--border);
    border-radius: 10px;
    box-shadow: 3px 3px 0 var(--shadow);
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    font-size: 20px; font-weight: 900;
    letter-spacing: -1px;
    flex-shrink: 0;
  }
  .rpl-logo-text { font-size: 13px; font-weight: 700; color: var(--text); letter-spacing: 0.05em; }
  .rpl-logo-sub  { font-size: 10px; color: var(--muted); letter-spacing: 0.08em; margin-top: 2px; }

  /* log */
  .rpl-log {
    min-height: 110px;
    max-height: 130px;
    overflow-y: auto;
    padding: 16px 20px 8px;
    scrollbar-width: none;
  }
  .rpl-log::-webkit-scrollbar { display: none; }
  .rpl-log-line {
    font-size: 11.5px;
    line-height: 1.75;
    color: var(--text);
    white-space: nowrap;
  }
  .rpl-log-ok { color: var(--ok); }
  .rpl-prefix { color: var(--prefix); }

  /* progress */
  .rpl-progress-section {
    padding: 12px 20px 6px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .rpl-progress-track {
    flex: 1;
    height: 6px;
    background: color-mix(in srgb, var(--border) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--border) 22%, transparent);
    border-radius: 99px;
    overflow: hidden;
    position: relative;
  }
  .rpl-progress-fill {
    height: 100%;
    background: var(--acc);
    border-radius: 99px;
    transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    z-index: 1;
  }
  .rpl-progress-shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%);
    animation: rpl-shimmer 1.6s ease-in-out infinite;
    z-index: 2;
  }
  @keyframes rpl-shimmer {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }
  .rpl-pct {
    font-size: 10px;
    font-weight: 700;
    color: var(--acc);
    min-width: 32px;
    text-align: right;
    letter-spacing: 0.05em;
  }

  /* status row */
  .rpl-status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px 16px;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .rpl-status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #16a34a;
    box-shadow: 0 0 0 2px rgba(22,163,74,0.22);
    animation: rpl-ping 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes rpl-ping {
    0%, 100% { box-shadow: 0 0 0 2px rgba(22,163,74,0.22); }
    50%       { box-shadow: 0 0 0 5px rgba(22,163,74,0.12); }
  }
  .rpl-status-text { flex: 1; }
  .rpl-host { color: var(--muted2); font-size: 9px; }
`;
