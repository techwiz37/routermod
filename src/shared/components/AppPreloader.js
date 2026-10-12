"use client";

import { useEffect, useRef } from "react";

// Preloader: SVG logo draw animation (stroke-dashoffset) + fade out
// Style: neoxr.eu — logo draws itself, then screen fades away

export default function AppPreloader() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Theme detection before hydration
    try {
      const s = localStorage.getItem("theme");
      const t = s ? (JSON.parse(s).state || {}).theme : "system";
      const dark =
        t === "dark" ||
        (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.dark = dark ? "1" : "0";
    } catch { root.dataset.dark = "0"; }

    // Fade out after animation completes
    const timer = setTimeout(() => {
      root.classList.add("rpl-done");
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={rootRef} className="rpl-root" suppressHydrationWarning>
      <style>{CSS}</style>

      {/* Center stage */}
      <div className="rpl-stage">
        {/* SVG logo — "RM" lettermark drawn by stroke animation */}
        <div className="rpl-logo-wrap">
          <svg
            className="rpl-svg"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer ring */}
            <circle
              className="rpl-ring"
              cx="60" cy="60" r="54"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* "R" letterform */}
            <path
              className="rpl-letter"
              d="M34 38 L34 82 M34 38 L54 38 Q66 38 66 52 Q66 64 54 64 L34 64 M54 64 L66 82"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* "M" letterform */}
            <path
              className="rpl-letter rpl-letter-m"
              d="M72 82 L72 45 L86 68 L100 45 L100 82"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Glow ring behind logo */}
          <div className="rpl-glow" />
        </div>

        {/* App name */}
        <div className="rpl-name-wrap">
          <span className="rpl-name">RouterMod</span>
          <span className="rpl-tagline">AI Gateway</span>
        </div>

        {/* Loading bar */}
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
    width: 120px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── glow ── */
  .rpl-glow {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,26,83,0.18) 0%, transparent 70%);
    animation: rpl-pulse 2s ease-in-out infinite;
  }
  @keyframes rpl-pulse {
    0%, 100% { transform: scale(0.9); opacity: 0.6; }
    50%       { transform: scale(1.15); opacity: 1; }
  }

  /* ── SVG ── */
  .rpl-svg {
    width: 120px;
    height: 120px;
    position: relative;
    z-index: 1;
  }

  /* Outer ring — draws in 0.7s, starts at 0.1s */
  .rpl-ring {
    stroke: var(--acc);
    stroke-dasharray: 340;
    stroke-dashoffset: 340;
    animation: rpl-draw-ring 0.75s cubic-bezier(0.4,0,0.2,1) 0.1s forwards;
  }
  @keyframes rpl-draw-ring {
    to { stroke-dashoffset: 0; }
  }

  /* Letters — draws in 0.8s, starts at 0.55s */
  .rpl-letter {
    stroke: var(--acc);
    stroke-dasharray: 260;
    stroke-dashoffset: 260;
    animation: rpl-draw-letter 0.8s cubic-bezier(0.4,0,0.2,1) 0.55s forwards;
  }
  .rpl-letter-m {
    stroke-dasharray: 200;
    stroke-dashoffset: 200;
    animation: rpl-draw-m 0.7s cubic-bezier(0.4,0,0.2,1) 0.9s forwards;
  }
  @keyframes rpl-draw-letter {
    to { stroke-dashoffset: 0; }
  }
  @keyframes rpl-draw-m {
    to { stroke-dashoffset: 0; }
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
