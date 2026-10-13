"use client";

import { useState, useEffect } from "react";
import Card from "@/shared/components/Card";
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
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function MetricProgress({ label, percent, valueText, color = "bg-primary" }) {
  const clamped = Math.max(0, Math.min(100, percent || 0));
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-xs">
        <span className="font-bold text-text-muted uppercase tracking-wider">{label}</span>
        <span className="font-mono font-bold text-text-main">{valueText || `${clamped}%`}</span>
      </div>
      <div className="h-3 w-full rounded-md border-2 border-border bg-surface-2 overflow-hidden p-0.5">
        <div
          className={`h-full rounded-sm transition-all duration-500 ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
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
    } catch {} finally {
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
          <span>Memuat telemetri server...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner / Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-border bg-surface p-4 shadow-[3px_3px_0_var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-main">Live Host & Resource Monitor</h3>
            <p className="font-mono text-[11px] text-text-muted">
              PID: {metrics?.pid} · Node {metrics?.nodeVersion} · {metrics?.platform}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={autoRefresh ? "secondary" : "ghost"}
            icon={autoRefresh ? "sync" : "sync_disabled"}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? "Auto (3s)" : "Paused"}
          </Button>
          <Button size="sm" icon="refresh" onClick={fetchMetrics}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Grid of Resource Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* CPU */}
        <Card className="flex flex-col justify-between p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">CPU Usage</p>
              <h4 className="mt-1 font-mono text-2xl font-black text-text-main">{metrics?.cpu?.percent ?? 0}%</h4>
            </div>
            <div className="rounded-lg border-2 border-border bg-primary/10 p-2 text-primary shadow-[1.5px_1.5px_0_var(--color-border)]">
              <span className="material-symbols-outlined text-[20px]">memory</span>
            </div>
          </div>
          <MetricProgress
            label="Load"
            percent={metrics?.cpu?.percent ?? 0}
            color={metrics?.cpu?.percent > 80 ? "bg-red-500" : "bg-primary"}
          />
          <div className="border-t border-border/50 pt-2 font-mono text-[11px] text-text-muted">
            {metrics?.cpu?.cores} Cores · {metrics?.cpu?.model?.slice(0, 24)}...
          </div>
        </Card>

        {/* RAM (Host) */}
        <Card className="flex flex-col justify-between p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Host Memory (RAM)</p>
              <h4 className="mt-1 font-mono text-2xl font-black text-text-main">
                {metrics?.memory?.percent ?? 0}%
              </h4>
            </div>
            <div className="rounded-lg border-2 border-border bg-indigo-500/10 p-2 text-indigo-500 shadow-[1.5px_1.5px_0_var(--color-border)]">
              <span className="material-symbols-outlined text-[20px]">developer_board</span>
            </div>
          </div>
          <MetricProgress
            label="Used / Total"
            percent={metrics?.memory?.percent ?? 0}
            valueText={`${formatBytes(metrics?.memory?.used)} / ${formatBytes(metrics?.memory?.total)}`}
            color={metrics?.memory?.percent > 85 ? "bg-red-500" : "bg-indigo-500"}
          />
          <div className="border-t border-border/50 pt-2 font-mono text-[11px] text-text-muted">
            Free: {formatBytes(metrics?.memory?.free)}
          </div>
        </Card>

        {/* Process App Memory (RSS) */}
        <Card className="flex flex-col justify-between p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">RouterMod Process</p>
              <h4 className="mt-1 font-mono text-2xl font-black text-text-main">
                {formatBytes(metrics?.memory?.processRss)}
              </h4>
            </div>
            <div className="rounded-lg border-2 border-border bg-emerald-500/10 p-2 text-emerald-500 shadow-[1.5px_1.5px_0_var(--color-border)]">
              <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
            </div>
          </div>
          <MetricProgress
            label="Heap Used"
            percent={metrics?.memory?.processHeapTotal ? Math.round((metrics.memory.processHeapUsed / metrics.memory.processHeapTotal) * 100) : 0}
            valueText={`${formatBytes(metrics?.memory?.processHeapUsed)} / ${formatBytes(metrics?.memory?.processHeapTotal)}`}
            color="bg-emerald-500"
          />
          <div className="border-t border-border/50 pt-2 font-mono text-[11px] text-text-muted">
            Up: {formatUptime(metrics?.processUptime)}
          </div>
        </Card>

        {/* Disk Storage */}
        <Card className="flex flex-col justify-between p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Disk Storage</p>
              <h4 className="mt-1 font-mono text-2xl font-black text-text-main">
                {metrics?.disk?.percent ?? 0}%
              </h4>
            </div>
            <div className="rounded-lg border-2 border-border bg-amber-500/10 p-2 text-amber-500 shadow-[1.5px_1.5px_0_var(--color-border)]">
              <span className="material-symbols-outlined text-[20px]">hard_drive</span>
            </div>
          </div>
          <MetricProgress
            label="Used / Total"
            percent={metrics?.disk?.percent ?? 0}
            valueText={`${formatBytes(metrics?.disk?.used)} / ${formatBytes(metrics?.disk?.total)}`}
            color={metrics?.disk?.percent > 90 ? "bg-red-500" : "bg-amber-500"}
          />
          <div className="border-t border-border/50 pt-2 font-mono text-[11px] text-text-muted">
            Free: {formatBytes(metrics?.disk?.free)}
          </div>
        </Card>
      </div>

      {/* Network & Host Details Card */}
      <Card className="p-5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Host System Information</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 font-mono text-xs">
          <div className="rounded-lg border-2 border-border bg-surface-2 p-3 shadow-[1.5px_1.5px_0_var(--color-border)]">
            <span className="text-[10px] uppercase font-bold text-text-muted block">Internal IP</span>
            <span className="text-text-main font-bold mt-0.5 block">{metrics?.localIp}</span>
          </div>
          <div className="rounded-lg border-2 border-border bg-surface-2 p-3 shadow-[1.5px_1.5px_0_var(--color-border)]">
            <span className="text-[10px] uppercase font-bold text-text-muted block">System Uptime</span>
            <span className="text-text-main font-bold mt-0.5 block">{formatUptime(metrics?.uptime)}</span>
          </div>
          <div className="rounded-lg border-2 border-border bg-surface-2 p-3 shadow-[1.5px_1.5px_0_var(--color-border)]">
            <span className="text-[10px] uppercase font-bold text-text-muted block">Node Runtime</span>
            <span className="text-text-main font-bold mt-0.5 block">{metrics?.nodeVersion}</span>
          </div>
          <div className="rounded-lg border-2 border-border bg-surface-2 p-3 shadow-[1.5px_1.5px_0_var(--color-border)]">
            <span className="text-[10px] uppercase font-bold text-text-muted block">Architecture</span>
            <span className="text-text-main font-bold mt-0.5 block">{process.arch} / {process.platform}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
