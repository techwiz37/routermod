"use client";

import { useEffect, useRef } from "react";

export default function AppPreloader() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    try {
      const s = localStorage.getItem("theme");
      const t = s ? (JSON.parse(s).state || {}).theme : "system";
      const dark =
        t === "dark" ||
        (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.dark = dark ? "1" : "0";
    } catch { root.dataset.dark = "0"; }

    const timer = setTimeout(() => {
      root.classList.add("rpl-done");
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={rootRef} className="rpl-root" suppressHydrationWarning>
      <style>{CSS}</style>

      {}
      <div className="rpl-stage">
        {}
        <div className="rpl-logo-wrap">
          {}
          <div className="rpl-glow" />

          <svg className="rpl-svg" viewBox="0 0 120 120">
            <defs>
              <linearGradient id="rpl-grad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ff1a53" />
                <stop offset="100%" stopColor="#dc2626" />
              </linearGradient>
            </defs>

            {}
            <rect className="rpl-card-bg" x="8" y="8" width="104" height="104" rx="22" fill="#181c24" />
            <rect className="rpl-card-inner" x="12" y="12" width="96" height="96" rx="18" />

            {}
            <path className="rpl-tri" d="M12 36L36 12H12v24z" fill="url(#rpl-grad)" />

            {}
            <circle className="rpl-dot rpl-dot-g" cx="94" cy="26" r="4.5" fill="#10b981" />

            {}
            <rect className="rpl-stem" x="34" y="30" width="16" height="60" rx="4" />
            {}
            <path className="rpl-bowl" d="M48 30h23c10.5 0 18.5 7 18.5 18s-8 18-18.5 18H48V30z" />
            {}
            <path className="rpl-bowl-inner" d="M50 41.5h20c4.5 0 8 3 8 6.5s-3.5 6.5-8 6.5H50v-13z" />

            {}
            <path className="rpl-leg" d="M60 62L83 90H65L48 68h14z" fill="url(#rpl-grad)" />

            {}
            <circle className="rpl-dot rpl-dot-b" cx="88" cy="88" r="4.5" fill="#3b82f6" />
          </svg>
        </div>

        {}
        <div className="rpl-name-wrap">
          <span className="rpl-name">RouterMod</span>
          <span className="rpl-tagline">AI Gateway</span>
        </div>

        {}
        <div className="rpl-bar-wrap">
          <div className="rpl-bar" />
        </div>
      </div>
    </div>
  );
}

const CSS = `
  .rpl-root {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f0f2f7;
    --acc: #ff1a53;
    --text: #111827;
    --sub: #6b7280;
    transition: opacity 0.55s ease, visibility 0.55s ease;
  }
  .rpl-root[data-dark="1"] {
    background: #0b0e14;
    --text: #e2e8f0;
    --sub: #64748b;
  }
  .rpl-root.rpl-done {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  /* ── stage ── */
  .rpl-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    animation: rpl-up 0.5s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes rpl-up {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── logo wrap ── */
  .rpl-logo-wrap {
    position: relative;
    width: 110px;
    height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── glow ── */
  .rpl-glow {
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,26,83,0.2) 0%, transparent 70%);
    animation: rpl-pulse 2s ease-in-out infinite;
  }
  @keyframes rpl-pulse {
    0%, 100% { transform: scale(0.85); opacity: 0.5; }
    50%       { transform: scale(1.1); opacity: 1; }
  }

  /* ── SVG ── */
  .rpl-svg {
    width: 110px;
    height: 110px;
    position: relative;
    z-index: 1;
    filter: drop-shadow(2.5px 3px 0px rgba(0,0,0,0.75));
  }

  /* Card layers — pop in first */
  .rpl-card-bg {
    animation: rpl-popin 0.35s cubic-bezier(0.16,1,0.3,1) 0.05s both;
  }
  .rpl-card-inner {
    fill: #ffffff;
    animation: rpl-popin 0.35s cubic-bezier(0.16,1,0.3,1) 0.1s both;
  }
  .rpl-root[data-dark="1"] .rpl-card-inner { fill: #1b1f2b; }

  /* Corner triangle */
  .rpl-tri {
    animation: rpl-popin 0.3s cubic-bezier(0.16,1,0.3,1) 0.25s both;
  }

  /* R stem + bowl */
  .rpl-stem, .rpl-bowl {
    fill: #181c24;
    animation: rpl-popin 0.35s cubic-bezier(0.16,1,0.3,1) 0.35s both;
  }
  .rpl-root[data-dark="1"] .rpl-stem,
  .rpl-root[data-dark="1"] .rpl-bowl { fill: #ffffff; }

  /* Bowl inner cutout */
  .rpl-bowl-inner {
    fill: #ffffff;
    animation: rpl-popin 0.3s cubic-bezier(0.16,1,0.3,1) 0.4s both;
  }
  .rpl-root[data-dark="1"] .rpl-bowl-inner { fill: #1b1f2b; }

  /* R leg */
  .rpl-leg {
    animation: rpl-popin 0.35s cubic-bezier(0.16,1,0.3,1) 0.5s both;
  }

  /* Dots — last */
  .rpl-dot {
    animation: rpl-popin 0.3s cubic-bezier(0.16,1,0.3,1) 0.6s both;
  }
  .rpl-dot-b {
    animation-delay: 0.65s;
  }

  @keyframes rpl-popin {
    from { opacity: 0; transform: scale(0.7); }
    to   { opacity: 1; transform: scale(1); }
  }

  /* ── name ── */
  .rpl-name-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    animation: rpl-fadein 0.5s ease 0.9s both;
  }
  @keyframes rpl-fadein {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .rpl-name {
    font-family: ui-monospace, 'JetBrains Mono', monospace;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--text);
    text-transform: uppercase;
  }
  .rpl-tagline {
    font-family: ui-monospace, 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.2em;
    color: var(--acc);
    text-transform: uppercase;
  }

  /* ── loading bar ── */
  .rpl-bar-wrap {
    width: 120px;
    height: 2px;
    background: color-mix(in srgb, var(--acc) 15%, transparent);
    border-radius: 99px;
    overflow: hidden;
    animation: rpl-fadein 0.4s ease 1s both;
  }
  .rpl-bar {
    height: 100%;
    width: 0%;
    background: var(--acc);
    border-radius: 99px;
    animation: rpl-fill 1.1s cubic-bezier(0.4,0,0.2,1) 1s forwards;
    position: relative;
  }
  .rpl-bar::after {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 40px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6));
    border-radius: 99px;
  }
  @keyframes rpl-fill {
    0%   { width: 0%; }
    60%  { width: 80%; }
    100% { width: 100%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .rpl-ring, .rpl-letter, .rpl-letter-m { animation: none; stroke-dashoffset: 0; }
    .rpl-bar { animation: none; width: 100%; }
    .rpl-glow { animation: none; }
  }
`;
