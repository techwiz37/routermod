"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import AntaresSegmented from "@/shared/components/AntaresSegmented";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;
const fmtRequests = (n) => String(n || 0);

const VIEW_MODES = [
  { value: "tokens", label: "Tokens" },
  { value: "requests", label: "Requests" },
  { value: "cost", label: "Cost" },
];

const VIEW_CONFIG = {
  tokens:   { dataKey: "tokens",   color: "#6366f1", gradId: "gradTokens",   formatter: fmtTokens,   label: "Tokens" },
  requests: { dataKey: "requests", color: "#14b8a6", gradId: "gradRequests", formatter: fmtRequests, label: "Requests" },
  cost:     { dataKey: "cost",     color: "#f59e0b", gradId: "gradCost",     formatter: fmtCost,     label: "Cost" },
};

export default function UsageChart({ period = "7d" }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("tokens");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usage/chart?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to fetch chart data:", e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const cfg = VIEW_CONFIG[viewMode];
  const hasData = data.some((d) => (d[cfg.dataKey] || 0) > 0);

  return (
    <section className="an-panel">
      <div className="an-chart">
        <div className="an-chart-head">
          <span className="an-chart-title">
            <span className="material-symbols-outlined" aria-hidden>show_chart</span>
            <span className="truncate">Grafik Penggunaan & Beban</span>
          </span>
          <AntaresSegmented
            options={VIEW_MODES}
            value={viewMode}
            onChange={setViewMode}
            size="sm"
            className="w-full sm:w-auto"
          />
        </div>

      {loading ? (
        <div className="h-52 flex items-center justify-center text-[var(--t-muted)] text-sm gap-2">
          <span className="material-symbols-outlined animate-spin text-[var(--t-star-ink)] text-[18px]">progress_activity</span>
          Memuat data...
        </div>
      ) : !hasData ? (
        <div className="h-52 flex flex-col items-center justify-center text-[var(--t-muted)] gap-2">
          <span className="material-symbols-outlined text-[32px] opacity-30">bar_chart</span>
          <span className="text-xs font-medium">Belum ada data untuk periode ini</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.08} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.45 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.45 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={cfg.formatter}
              width={50}
            />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="an-tip">
                    <div className="an-tip-label">{label}</div>
                    {payload.map((p) => (
                      <div key={p.dataKey} className="flex items-center justify-between gap-4">
                        <span style={{ color: p.color }}>{cfg.label}</span>
                        <span>{cfg.formatter(p.value)}</span>
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey={cfg.dataKey}
              stroke={cfg.color}
              strokeWidth={2.5}
              fill={`url(#${cfg.gradId})`}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, fill: "var(--color-surface)", stroke: cfg.color }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
      </div>
    </section>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
};
