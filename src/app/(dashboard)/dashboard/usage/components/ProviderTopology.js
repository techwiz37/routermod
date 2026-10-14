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

function ProviderIcon({ providerId, color, size = 20 }) {
  const [err, setErr] = useState(false);
  const src = getProviderIconSrc(providerId);
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

ProviderIcon.propTypes = { providerId: PropTypes.string, color: PropTypes.string, size: PropTypes.number };

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function Cable({ x1, y1, x2, y2, color, active, delay = 0, isLast }) {
  const mx = (x1 + x2) / 2;
  const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  const stroke = active ? color : isLast ? "#f59e0b" : "var(--color-border)";
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
      {active && [0, 0.45, 0.9].map((off, i) => (
        <circle key={i} r={3.5} fill={color} fillOpacity={0.95}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
          <animateMotion dur="1.6s" repeatCount="indefinite" begin={`${delay + off}s`}>
            <mpath href={`#cable-path-${Math.round(x1)}-${Math.round(y1)}-${i}`} />
          </animateMotion>
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.88;1"
            dur="1.6s" repeatCount="indefinite" begin={`${delay + off}s`} />
        </circle>
      ))}
      {active && (
        <path id={`cable-path-${Math.round(x1)}-${Math.round(y1)}-0`} d={d} fill="none" stroke="none" />
      )}
      {active && (
        <path id={`cable-path-${Math.round(x1)}-${Math.round(y1)}-1`} d={d} fill="none" stroke="none" />
      )}
      {active && (
        <path id={`cable-path-${Math.round(x1)}-${Math.round(y1)}-2`} d={d} fill="none" stroke="none" />
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

  const NODE_W = 108;
  const NODE_H = 30;
  const NODE_ICON = 17;
  const NODE_PAD = 6;
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
      `}</style>

      <div className="flex flex-col min-w-0 rounded-xl border-2 border-border overflow-hidden"
        style={{ boxShadow: "2.5px 2.5px 0 var(--color-border)", background: "var(--color-surface)" }}>

        <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-border bg-surface-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[var(--color-primary)]">device_hub</span>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-muted">Provider Topology</span>
          </div>
          <div className="flex items-center gap-2">
            {isPowering && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md border-2 border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] font-bold text-emerald-600">
                <span className="size-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                {activeCount} aktif
              </span>
            )}
            <span className="font-mono text-[11px] text-text-muted font-bold">{providers.length} provider</span>
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-text-muted">
            <span className="material-symbols-outlined text-[32px] opacity-20">device_hub</span>
            <span className="text-xs font-mono">Belum ada provider terhubung</span>
          </div>
        ) : (
          <div className="w-full flex items-center justify-center p-0">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" style={{ maxHeight: 260 }} preserveAspectRatio="xMidYMid meet">
              <defs>
                <radialGradient id="hub-radial" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.03" />
                </radialGradient>
                <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="1.5" dy="1.5" stdDeviation="0" floodColor="var(--color-border)" floodOpacity="1" />
                </filter>
                <filter id="glow-filter" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

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
                  <circle r={36} fill="url(#hub-radial)" stroke="var(--color-primary)"
                    strokeWidth={1.5} strokeOpacity={0.35}
                    style={{ animation: "topo-hub-pulse 2.2s ease-in-out infinite" }} />
                )}
                {isPowering && (
                  <circle r={30} fill="none" stroke="var(--color-primary)"
                    strokeWidth={1} strokeOpacity={0.18} strokeDasharray="3 6"
                    style={{ animation: "topo-hub-ring 10s linear infinite", transformOrigin: "center" }} />
                )}
                <rect x={-HUB_W / 2} y={-HUB_H / 2} width={HUB_W} height={HUB_H} rx={8}
                  fill="var(--color-surface)"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  filter="url(#node-shadow)"
                  style={{
                    filter: isPowering
                      ? "drop-shadow(1.5px 1.5px 0 var(--color-border)) drop-shadow(0 0 10px color-mix(in srgb, var(--color-primary) 35%, transparent))"
                      : "drop-shadow(1.5px 1.5px 0 var(--color-border))",
                  }}
                />
                <foreignObject x={-15} y={-15} width={30} height={30}>
                  <div style={{ width: "100%", height: "100%" }}>
                    <Soft3DLogo className="size-7" />
                  </div>
                </foreignObject>
                {isPowering && (
                  <g transform={`translate(${HUB_W / 2 - 8}, ${-HUB_H / 2 - 6})`}>
                    <rect x={-11} y={-7} width={22} height={14} rx={7}
                      fill="var(--color-primary)" />
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
                const labelShort = label.length > 13 ? label.slice(0, 12) + "…" : label;
                const borderColor = active ? color : hasError ? "#ef4444" : isLast ? "#f59e0b" : "var(--color-border)";
                const nodeBg = active ? `${color}0d` : hasError ? "#ef444408" : isLast ? "#f59e0b06" : "var(--color-surface-2)";

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
                          ? `drop-shadow(1.5px 1.5px 0 var(--color-border)) drop-shadow(0 0 6px ${color}40)`
                          : "drop-shadow(1.5px 1.5px 0 var(--color-border))",
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
                          <ProviderIcon providerId={p.provider} color={color} size={NODE_ICON * 0.7} />
                        </div>
                      </foreignObject>
                    </g>

                    <text x={-NODE_W / 2 + NODE_PAD + 10 + 17} y={3.5}
                      textAnchor="start" fontSize={10} fontWeight={800}
                      fill="var(--color-text-main)" style={{ fontFamily: "monospace" }}>
                      {labelShort}
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
      </div>
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
