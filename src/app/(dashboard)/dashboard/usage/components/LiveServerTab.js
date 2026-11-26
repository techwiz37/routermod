"use client";

import { useState, useEffect, memo } from "react";
import Button from "@/shared/components/Button";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds) {
  if (!seconds) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const METRIC_COLORS = {
  primary: "#ff4d63",
  "indigo-500": "#818cf8",
  "emerald-500": "#3fb37f",
  "violet-500": "#a78bfa",
  "cyan-500": "#22d3ee",
  "amber-500": "#ffb800",
};

const MetricCard = memo(({ icon, label, value, subtext, color = "primary", percent }) => {
  const accent = METRIC_COLORS[color] || METRIC_COLORS.primary;
  const barColor = percent > 85 ? "#ef4444" : percent > 60 ? "#f59e0b" : accent;

  return (
    <div className="us-metric" style={{ "--us-accent": accent, "--us-soft": `${accent}1f` }}>
      <div className="us-metric-top">
        <div className="min-w-0 flex-1">
          <p className="us-metric-label">{label}</p>
          <h4 className="us-metric-value">{value}</h4>
        </div>
        <span className="us-metric-icon" aria-hidden>
          <span className="material-symbols-outlined">{icon}</span>
        </span>
      </div>

      {percent !== undefined && (
        <div className="us-metric-bar" aria-hidden>
          <i style={{ width: `${Math.min(100, percent)}%`, background: barColor }} />
        </div>
      )}

      {subtext && <div className="us-metric-foot">{subtext}</div>}
    </div>
  );
});
MetricCard.displayName = "MetricCard";

function SectionHead({ icon, title, subtitle }) {
  return (
    <div className="us-live-section-head">
      <span className="an-panel-ico" aria-hidden>
        <span className="material-symbols-outlined">{icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="us-section-title">{title}</h3>
        <p className="us-section-sub">{subtitle}</p>
      </div>
      <span className="us-section-rule" aria-hidden="true" />
    </div>
  );
}

export default function LiveServerTab() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = async () => {
    try {
      const res = await fetch("/api/system/metrics");
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error("Failed to fetch metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (loading && !metrics) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          <span>Memuat telemetri...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 us-live-tab">
      {/* Top Banner - Responsive */}
      <div className="us-live-banner">
        <div className="us-live-banner-grid" aria-hidden="true" />
        <div className="us-live-banner-content">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span className="us-live-pulse" aria-hidden="true">
              <span className="material-symbols-outlined">monitor_heart</span>
            </span>
            <div className="min-w-0">
              <div className="us-eyebrow">TELEMETRY · LIVE</div>
              <h3 className="us-live-title">Live Host Monitor</h3>
              <p className="us-live-host">
                {metrics?.global?.platform} · {metrics?.global?.hostname}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="us-live-status">
              <span className="us-live-dot" aria-hidden="true" />
              ONLINE
            </span>
            <Button
              size="sm"
              variant={autoRefresh ? "secondary" : "ghost"}
              icon={autoRefresh ? "sync" : "sync_disabled"}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? "Auto" : "Paused"}
            </Button>
            <Button size="sm" icon="refresh" onClick={fetchMetrics}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Global Resources - Responsive Grid */}
      <div>
        <SectionHead icon="public" title="Global Resources" subtitle="Kesehatan dan kapasitas sistem host" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            icon="memory"
            label="CPU Usage"
            value={`${metrics?.global?.cpu?.usage ?? 0}%`}
            subtext={`${metrics?.global?.cpu?.cores} Cores`}
            color="primary"
            percent={metrics?.global?.cpu?.usage}
          />
          <MetricCard
            icon="developer_board"
            label="Memory (RAM)"
            value={`${formatBytes(metrics?.global?.memory?.used)}`}
            subtext={`${formatBytes(metrics?.global?.memory?.total)} Total`}
            color="indigo-500"
            percent={metrics?.global?.memory?.usagePercent}
          />
          <MetricCard
            icon="schedule"
            label="System Uptime"
            value={formatUptime(metrics?.global?.uptime)}
            subtext={`${metrics?.global?.platform} ${metrics?.global?.arch}`}
            color="emerald-500"
          />
        </div>
      </div>

      {/* RouterMod Process - Responsive Grid */}
      <div>
        <SectionHead icon="hub" title="RouterMod Process" subtitle="Penggunaan sumber daya proses gateway" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            icon="speed"
            label="Process CPU"
            value={`${metrics?.routermod?.cpu?.toFixed(1) ?? 0}%`}
            subtext={`Status: ${metrics?.routermod?.status?.toUpperCase() ?? 'UNKNOWN'}`}
            color="violet-500"
            percent={metrics?.routermod?.cpu}
          />
          <MetricCard
            icon="data_usage"
            label="Process Memory"
            value={formatBytes(metrics?.routermod?.memory)}
            subtext={`${metrics?.routermod?.memoryPercent?.toFixed(1) ?? 0}% of total`}
            color="cyan-500"
            percent={metrics?.routermod?.memoryPercent}
          />
          <MetricCard
            icon="rocket_launch"
            label="Process Uptime"
            value={formatUptime(Math.floor((metrics?.routermod?.uptime ?? 0) / 1000))}
            subtext={`PID: ${metrics?.routermod?.pid ?? 'N/A'}`}
            color="amber-500"
          />
        </div>
      </div>

      {/* Live btop Terminal - Responsive */}
      <div>
        <SectionHead icon="terminal" title="Live System Monitor" subtitle="btop · aktivitas sistem langsung" />
        <section className="an-panel overflow-hidden">
          <header className="an-panel-head">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined">terminal</span>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="an-panel-title">btop Terminal</h2>
              <p className="an-panel-sub">Monitoring proses dan resource secara real-time</p>
            </div>
            <span className="us-count-chip">LIVE</span>
          </header>
          <div className="us-btop-shell">
            <div className="us-btop-scroll">
              <iframe
                src="/btop/"
                className="us-btop-frame"
                title="Live btop terminal"
                allow="clipboard-write"
                loading="lazy"
                onLoad={(event) => {
                  // Same-origin ttyd frame: restyle its shell so the terminal
                  // sits inside the dashboard instead of looking pasted in.
                  const doc = event.currentTarget.contentDocument;
                  if (!doc?.head) return;
                  const apply = () => {
                    if (doc.getElementById("an-btop-style")) return;
                    const style = doc.createElement("style");
                    style.id = "an-btop-style";
                    style.textContent = `
                      :root { color-scheme: dark; }
                      html, body { background: #0c0e11 !important; margin: 0 !important; padding: 0 !important; }
                      body > * { background: transparent !important; }
                      .xterm { background: #0c0e11 !important; padding: 4px !important; }
                      .xterm-viewport, .xterm-screen { background: #0c0e11 !important; }
                      .xterm-viewport::-webkit-scrollbar { width: 6px; }
                      .xterm-viewport::-webkit-scrollbar-thumb { background: #2a2e37; border-radius: 99px; }
                    `;
                    doc.head.appendChild(style);
                  };
                  apply();
                  requestAnimationFrame(apply);
                  setTimeout(apply, 600);
                }}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Top Processes - Responsive Table */}
      <div>
        <SectionHead icon="bolt" title="Top Processes" subtitle="10 proses dengan penggunaan CPU tertinggi" />
        <section className="an-panel">
          <header className="an-panel-head">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined">bar_chart</span>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="an-panel-title">Process Leaderboard</h2>
              <p className="an-panel-sub">Diurutkan berdasarkan beban CPU saat ini</p>
            </div>
            <span className="us-count-chip">TOP 10</span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[10px] sm:text-xs us-process-table">
              <thead style={{ borderBottom: '2px solid var(--t-line)', background: 'var(--t-hover)' }}>
                <tr className="text-[9px] uppercase tracking-wider sm:text-[10px]" style={{ color: 'var(--t-dim)' }}>
                  <th className="px-2 py-1.5 text-left font-bold sm:px-3 sm:py-2">PID</th>
                  <th className="px-2 py-1.5 text-right font-bold sm:px-3 sm:py-2">CPU %</th>
                  <th className="hidden px-2 py-1.5 text-right font-bold sm:table-cell sm:px-3 sm:py-2">MEM %</th>
                  <th className="px-2 py-1.5 text-right font-bold sm:px-3 sm:py-2">RSS</th>
                  <th className="px-2 py-1.5 text-left font-bold sm:px-3 sm:py-2">Command</th>
                </tr>
              </thead>
              <tbody style={{ borderColor: 'var(--t-line)' }}>
                {!metrics?.topProcesses || metrics.topProcesses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-center sm:px-3 sm:py-4" style={{ color: 'var(--t-dim)' }}>
                      No process data
                    </td>
                  </tr>
                ) : (
                  metrics.topProcesses.slice(0, 10).map((proc, idx) => (
                    <tr
                      key={proc.pid}
                      className="transition-colors"
                      style={{ 
                        borderTop: idx > 0 ? '1px solid var(--t-line)' : 'none',
                        background: idx % 2 === 0 ? 'var(--t-hover)' : 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--t-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? 'var(--t-hover)' : 'transparent'}
                    >
                      <td className="px-2 py-1.5 sm:px-3 sm:py-2" style={{ color: 'var(--t-ink)' }}>{proc.pid}</td>
                      <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
                        <span
                          className="font-bold"
                          style={{ 
                            color: proc.cpu > 50 ? '#ef4444' : proc.cpu > 20 ? '#f59e0b' : 'var(--color-primary)'
                          }}
                        >
                          {proc.cpu.toFixed(1)}
                        </span>
                      </td>
                      <td className="hidden px-2 py-1.5 text-right sm:table-cell sm:px-3 sm:py-2" style={{ color: 'var(--t-ink)' }}>
                        {proc.mem.toFixed(1)}
                      </td>
                      <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2" style={{ color: 'var(--t-ink)' }}>
                        {formatBytes(proc.rss)}
                      </td>
                      <td className="max-w-[120px] truncate px-2 py-1.5 sm:max-w-none sm:px-3 sm:py-2" style={{ color: 'var(--t-dim)' }} title={proc.cmd}>
                        {proc.cmd}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
