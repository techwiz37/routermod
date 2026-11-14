"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";
import Soft3DLogo from "@/shared/components/Soft3DLogo";

const FE_ACTIVE_TIMEOUT_MS = 60000;
const FE_ACTIVE_TICK_MS = 1000;

function getProviderConfig(id) {
  return AI_PROVIDERS[id] || { color: "#6b7280", name: id };
}

// Custom nodes often do not have a bundled icon under their generated id.
// Fall back to the node name and provider type, like 9Router Pro does.
function getProviderImageUrl(provider) {
  return getProviderIconSrc(provider.provider)
    || getProviderIconSrc(provider.nodeName)
    || getProviderIconSrc(provider.providerType === "anthropic-compatible" ? "anthropic" : "openai");
}

function ProviderIcon({ providerId, imageUrl, color, size = 20 }) {
  const [err, setErr] = useState(false);
  const src = imageUrl || getProviderIconSrc(providerId);
  const config = getProviderConfig(providerId);
  const textIcon = config.textIcon || (providerId || "?").slice(0, 2).toUpperCase();
  if (src && !err) {
    return (
      <img src={src} alt={providerId}
        style={{ width: size, height: size, objectFit: "contain" }}
        onError={() => {
          const m = src?.match(/^\/providers\/([^/]+)\.png$/i);
          if (m) markProviderIconMissing(m[1]);
          setErr(true);
        }}
      />
    );
  }
  return <span style={{ fontSize: size * 0.55, fontWeight: 900, color, lineHeight: 1 }}>{textIcon}</span>;
}

ProviderIcon.propTypes = { providerId: PropTypes.string, imageUrl: PropTypes.string, color: PropTypes.string, size: PropTypes.number };

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function Cable({ x1, y1, x2, y2, color, active, delay = 0, isLast }) {
  const mx = (x1 + x2) / 2;
  const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  const stroke = active ? color : isLast ? "#f59e0b" : "var(--t-line)";
  const opacity = active ? 0.9 : isLast ? 0.5 : 0.3;
  const sw = active ? 2.5 : 1.5;

  return (
    <g>
      {active && (
        <path d={d} fill="none" stroke={color} strokeWidth={8} strokeOpacity={0.12}
          style={{ filter: `blur(3px)` }} />
      )}
      <path d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity={opacity}
        strokeDasharray={active ? "none" : "4 5"}
        style={!active ? { animation: "topo-march 1.5s linear infinite" } : {}}
      />
      {active && (
        <path d={d} fill="none" stroke="#fff" strokeWidth={sw} strokeOpacity={0.55}
          strokeLinecap="round" strokeDasharray="6 10"
          style={{ animation: `topo-flow 1.2s linear infinite`, animationDelay: `${delay}s` }} />
      )}
    </g>
  );
}

Cable.propTypes = {
  x1: PropTypes.number, y1: PropTypes.number, x2: PropTypes.number, y2: PropTypes.number,
  color: PropTypes.string, active: PropTypes.bool, delay: PropTypes.number, isLast: PropTypes.bool,
};

export default function ProviderTopology({
  providers = [], activeRequests = [], lastProvider = "", errorProvider = ""
}) {
  const activeKey = useMemo(
    () => activeRequests.map(r => r.provider?.toLowerCase()).filter(Boolean).sort().join(","),
    [activeRequests]
  );
  const lastKey = lastProvider?.toLowerCase() || "";
  const errorKey = errorProvider?.toLowerCase() || "";

  const rawActiveSet = useMemo(() => new Set(activeKey ? activeKey.split(",") : []), [activeKey]);
  const lastSet = useMemo(() => new Set(lastKey ? [lastKey] : []), [lastKey]);
  const errorSet = useMemo(() => new Set(errorKey ? [errorKey] : []), [errorKey]);

  const firstSeenRef = useRef({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const seen = firstSeenRef.current;
    const now = Date.now();
    for (const p of rawActiveSet) if (!seen[p]) seen[p] = now;
    for (const p of Object.keys(seen)) if (!rawActiveSet.has(p)) delete seen[p];
  }, [rawActiveSet]);

  useEffect(() => {
    if (rawActiveSet.size === 0) return;
    const id = setInterval(() => setTick(t => t + 1), FE_ACTIVE_TICK_MS);
    return () => clearInterval(id);
  }, [rawActiveSet]);

  const activeSet = useMemo(() => {
    const now = Date.now();
    const s = new Set();
    for (const p of rawActiveSet) {
      const ts = firstSeenRef.current[p];
      if (!ts || now - ts < FE_ACTIVE_TIMEOUT_MS) s.add(p);
    }
    return s;
  }, [rawActiveSet, tick]);

  const activeCount = activeSet.size;
  const isPowering = activeCount > 0;

  const NODE_W = 124;
  const NODE_H = 34;
  const NODE_ICON = 17;
  const NODE_PAD = 6;
  // Maximum characters that fit inside the node box (monospace, 14px).
  const NODE_LABEL_MAX = 9;
  const HUB_W = 68;
  const HUB_H = 42;

  const displayProviders = providers.slice(0, 6);
  const count = displayProviders.length;

  // Canvas: wider than tall so a left/right column layout has room.
  const W = 520;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2;

  // ── Layout strategy ───────────────────────────────────────────────────────
  // 1-4 providers → radial orbit (looks great, plenty of room).
  // 5-6 providers → two columns (2 left, 2-3 right): an orbit with 5-6 wide
  //   nodes overlaps because the ring circumference is too small, so switch to
  //   a grid that guarantees horizontal breathing room.
  const useGrid = count >= 5;

  let nodePositions;
  if (useGrid) {
    const leftCount = Math.ceil(count / 2);
    const rightCount = count - leftCount;
    const colLeftX = 96;
    const colRightX = W - 96;
    const topPad = 58;
    const bottomPad = 58;
    const usableH = H - topPad - bottomPad;

    const columnY = (n, idx) => {
      if (n <= 1) return cy;
      return topPad + (usableH * idx) / (n - 1);
    };

    nodePositions = [];
    for (let i = 0; i < count; i++) {
      if (i < leftCount) {
        nodePositions.push({ x: colLeftX, y: columnY(leftCount, i) });
      } else {
        nodePositions.push({ x: colRightX, y: columnY(rightCount, i - leftCount) });
      }
    }
  } else {
    // Radial orbit: pick the largest radius that keeps cables clear of the
    // node edges without neighbours colliding.
    const orbitR = Math.min(
      cx - NODE_W / 2 - 28,
      cy - NODE_H / 2 - 28,
      count <= 2 ? 118 : 112
    );
    const angleOffset = count <= 3 ? -90 : count === 4 ? -45 : -90;
    nodePositions = displayProviders.map((_, i) => {
      const angle = angleOffset + (i / count) * 360;
      return polar(cx, cy, orbitR, angle);
    });
  }

  return (
    <>
      <style>{`
        @keyframes topo-march { to { stroke-dashoffset: -18; } }
        @keyframes topo-hub-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes topo-hub-ring {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes topo-node-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
        @keyframes topo-icon-pulse {
          0%, 100% { r: 16; opacity: 0.7; }
          50% { r: 19; opacity: 0.3; }
        }
        @keyframes topo-flow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: 16px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .topo-flow, .topo-march { animation: none !important; }
        }
        @keyframes topo-star-drift {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-18px, 10px, 0); }
        }
        @keyframes topo-nebula {
          0%, 100% { opacity: 0.24; transform: scale(1); }
          50% { opacity: 0.42; transform: scale(1.08); }
        }
        @keyframes topo-orbit-drift {
          0%, 100% { transform: translate(-50%, -50%) rotate(-4deg) scale(1); opacity: 0.45; }
          50% { transform: translate(-50%, -50%) rotate(4deg) scale(1.04); opacity: 0.8; }
        }
      `}</style>

      <section className="an-panel flex flex-col min-w-0 overflow-hidden">

        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">device_hub</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">Provider Topology</h2>
            <p className="an-panel-sub">
              <span>{providers.length}</span>{" "}
              <span>provider terhubung</span>
            </p>
          </div>
          <div className="an-panel-actions">
            {isPowering && (
              <span className="an-chip ok">
                <span className="size-1.5 rounded-full bg-[var(--t-ok)] animate-pulse shrink-0" />
                <span>{activeCount}</span>{" "}
                <span>aktif</span>
              </span>
            )}
          </div>
        </header>

        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-[var(--t-muted)]">
            <span className="material-symbols-outlined text-[32px] opacity-20">device_hub</span>
            <span className="text-xs font-mono">Belum ada provider terhubung</span>
          </div>
        ) : (
          <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden border-t border-[var(--t-line-soft)] bg-[radial-gradient(ellipse_at_center,rgba(31,100,180,0.11),transparent_52%),linear-gradient(145deg,#0b111a,#080a10_58%,#100d17)] p-0">
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-16 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" style={{ animation: "topo-nebula 8s ease-in-out infinite" }} />
              <div className="absolute -right-16 top-1/3 h-56 w-56 rounded-full bg-rose-500/10 blur-3xl" style={{ animation: "topo-nebula 10s ease-in-out infinite reverse" }} />
              <div className="absolute inset-0 opacity-35" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,.75) 0 1px, transparent 1.5px)", backgroundSize: "43px 37px", animation: "topo-star-drift 18s linear infinite" }} />
              <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,.8) 0 1px, transparent 1.5px)", backgroundSize: "71px 59px", backgroundPosition: "19px 13px", animation: "topo-star-drift 26s linear infinite reverse" }} />
              <div className="absolute left-1/2 top-1/2 h-[72%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-cyan-300/10" style={{ animation: "topo-orbit-drift 14s linear infinite" }} />
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" style={{ maxHeight: 260 }} preserveAspectRatio="xMidYMid meet">
              <defs>
                <radialGradient id="hub-radial" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="var(--t-accent)" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="var(--t-accent)" stopOpacity="0.03" />
                </radialGradient>
                <linearGradient id="hub-glass" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#202b3b" stopOpacity="0.96" />
                  <stop offset="55%" stopColor="var(--t-card)" stopOpacity="0.94" />
                  <stop offset="100%" stopColor="#111722" stopOpacity="0.98" />
                </linearGradient>
                <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="1.5" dy="1.5" stdDeviation="0" floodColor="var(--t-line)" floodOpacity="1" />
                </filter>
                <filter id="glow-filter" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              <ellipse cx={cx} cy={cy} rx={Math.min(190, cx - 92)} ry={Math.min(112, cy - 52)}
                fill="none" stroke="var(--t-line)" strokeWidth={1} strokeOpacity={0.5} />
              <ellipse cx={cx} cy={cy} rx={Math.min(122, cx - 116)} ry={Math.min(72, cy - 76)}
                fill="none" stroke="var(--t-line)" strokeWidth={1} strokeOpacity={0.28} />

              {displayProviders.map((p, i) => {
                const pos = nodePositions[i];
                const pid = p.provider?.toLowerCase();
                const active = activeSet.has(pid);
                const config = getProviderConfig(p.provider);
                const color = config.color || "#6b7280";
                const dx = cx - pos.x;
                const dy = cy - pos.y;
                const len = Math.hypot(dx, dy) || 1;
                const gapNode = 4;
                const gapHubX = HUB_W / 2 + 3;
                const gapHubY = HUB_H / 2 + 3;
                const x1 = pos.x + (dx / len) * (NODE_W / 2 + gapNode) * (Math.abs(dx) / len > 0.3 ? 1 : 1);
                const y1 = pos.y + (dy / len) * (NODE_H / 2 + gapNode);
                const hubR = Math.min(gapHubX / Math.max(Math.abs(dx / len), 0.001), gapHubY / Math.max(Math.abs(dy / len), 0.001));
                const x2 = cx - (dx / len) * Math.min(hubR, HUB_W / 2);
                const y2 = cy - (dy / len) * Math.min(hubR, HUB_H / 2);
                const isLast = !active && lastSet.has(pid);

                return (
                  <Cable key={`cable-${p.provider}`}
                    x1={x1} y1={y1}
                    x2={x2} y2={y2}
                    color={color} active={active} delay={i * 0.28} isLast={isLast}
                  />
                );
              })}

              <g transform={`translate(${cx}, ${cy})`}>
                {isPowering && (
                  <circle r={36} fill="url(#hub-radial)" stroke="var(--t-accent)"
                    strokeWidth={1.5} strokeOpacity={0.35}
                    style={{ animation: "topo-hub-pulse 2.2s ease-in-out infinite" }} />
                )}
                {isPowering && (
                  <circle r={30} fill="none" stroke="var(--t-accent)"
                    strokeWidth={1} strokeOpacity={0.18} strokeDasharray="3 6"
                    style={{ animation: "topo-hub-ring 10s linear infinite", transformOrigin: "center" }} />
                )}
                <circle r={Math.max(HUB_W, HUB_H) / 2}
                  fill="url(#hub-glass)"
                  stroke="var(--t-accent)"
                  strokeWidth={2}
                  filter="url(#node-shadow)"
                  style={{
                    filter: isPowering
                      ? "drop-shadow(1.5px 1.5px 0 var(--t-line)) drop-shadow(0 0 10px color-mix(in srgb, var(--t-accent) 35%, transparent))"
                      : "drop-shadow(1.5px 1.5px 0 var(--t-line))",
                  }}
                />
                <foreignObject x={-16} y={-16} width={32} height={32}>
                        <div style={{ width: "100%", height: "100%" }}>
                    <Soft3DLogo className="size-8" />
                  </div>
                </foreignObject>
                {isPowering && (
                  <g transform={`translate(${HUB_W / 2 - 8}, ${-HUB_H / 2 - 6})`}>
                    <rect x={-11} y={-7} width={22} height={14} rx={7}
                      fill="var(--t-accent)" />
                    <text x={0} y={3.5} textAnchor="middle" fontSize={8} fontWeight={900}
                      fill="white" style={{ fontFamily: "monospace" }}>
                      {activeCount}
                    </text>
                  </g>
                )}
              </g>

              {displayProviders.map((p, i) => {
                const pos = nodePositions[i];
                const pid = p.provider?.toLowerCase();
                const active = activeSet.has(pid);
                const isLast = !active && lastSet.has(pid);
                const hasError = !active && errorSet.has(pid);
                const config = getProviderConfig(p.provider);
                const color = config.color || "#6b7280";
                const label = (config.name !== p.provider ? config.name : null) || p.nodeName || p.name || p.provider;
                const labelShort =
                  label.length > NODE_LABEL_MAX
                    ? label.slice(0, NODE_LABEL_MAX - 1).trimEnd() + "…"
                    : label;
                const borderColor = active ? color : hasError ? "#ef4444" : isLast ? "#f59e0b" : "var(--t-line)";
                const nodeBg = active ? `${color}0d` : hasError ? "#ef444408" : isLast ? "#f59e0b06" : "var(--t-raised)";

                return (
                  <g key={`node-${p.provider}`} transform={`translate(${pos.x}, ${pos.y})`}>
                    {active && (
                      <rect x={-NODE_W / 2 - 2} y={-NODE_H / 2 - 2}
                        width={NODE_W + 4} height={NODE_H + 4} rx={10}
                        fill="none" stroke={color} strokeWidth={1.2} strokeOpacity={0.4}
                        style={{ animation: "topo-node-glow 2s ease-in-out infinite" }} />
                    )}
                    <rect x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={8}
                      fill={nodeBg} stroke={borderColor} strokeWidth={1.8}
                      style={{
                        filter: active
                          ? `drop-shadow(1.5px 1.5px 0 var(--t-line)) drop-shadow(0 0 6px ${color}40)`
                          : "drop-shadow(1.5px 1.5px 0 var(--t-line))",
                      }}
                    />

                    <g transform={`translate(${-NODE_W / 2 + NODE_PAD + 10}, 0)`}>
                      {active && (
                        <circle r={13} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.35}
                          style={{ animation: "topo-icon-pulse 1.8s ease-in-out infinite" }} />
                      )}
                      <circle r={11} fill={color} fillOpacity={0.15}
                        stroke={color} strokeWidth={active ? 1.6 : 1}
                        strokeOpacity={active ? 0.9 : 0.4} />
                      <foreignObject x={-NODE_ICON / 2 * 0.75} y={-NODE_ICON / 2 * 0.75}
                        width={NODE_ICON * 0.75} height={NODE_ICON * 0.75}>
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <ProviderIcon providerId={p.provider} imageUrl={getProviderImageUrl(p)} color={color} size={NODE_ICON * 0.7} />
                        </div>
                      </foreignObject>
                    </g>

                    <text x={-NODE_W / 2 + NODE_PAD + 10 + 17} y={4.5}
                      textAnchor="start" fontSize={14} fontWeight={700}
                      fill="var(--t-ink)" style={{ fontFamily: "var(--t-mono)" }}>
                      {labelShort}
                      <title>{label}</title>
                    </text>

                    {active && (
                      <g transform={`translate(${NODE_W / 2 - 8}, ${-NODE_H / 2 + 8})`}>
                        <circle r={3.5} fill="#22c55e"
                          style={{ filter: "drop-shadow(0 0 3px #22c55e)" }}>
                          <animate attributeName="r" values="2.5;4;2.5" dur="1.4s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.7;1;0.7" dur="1.4s" repeatCount="indefinite" />
                        </circle>
                      </g>
                    )}
                    {hasError && (
                      <g transform={`translate(${NODE_W / 2 - 8}, ${-NODE_H / 2 + 8})`}>
                        <circle r={3} fill="#ef4444" />
                      </g>
                    )}
                    {isLast && (
                      <g transform={`translate(${NODE_W / 2 - 8}, ${-NODE_H / 2 + 8})`}>
                        <circle r={3} fill="#f59e0b" />
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </section>
    </>
  );
}

ProviderTopology.propTypes = {
  providers: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    provider: PropTypes.string,
    name: PropTypes.string,
  })),
  activeRequests: PropTypes.arrayOf(PropTypes.shape({
    provider: PropTypes.string,
    model: PropTypes.string,
    account: PropTypes.string,
  })),
  lastProvider: PropTypes.string,
  errorProvider: PropTypes.string,
};
