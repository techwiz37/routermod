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
import Card from "@/shared/components/Card";
import SegmentedControl from "@/shared/components/SegmentedControl";

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
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4 border-2 shadow-[2.5px_2.5px_0_var(--color-border)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Grafik Penggunaan & Beban</span>
        <SegmentedControl
          options={VIEW_MODES}
          value={viewMode}
          onChange={setViewMode}
          size="sm"
          className="w-full sm:w-auto"
        />
      </div>

      {loading ? (
        <div className="h-52 flex items-center justify-center text-text-muted text-sm gap-2">
          <span className="material-symbols-outlined animate-spin text-primary text-[18px]">progress_activity</span>
          Memuat data...
        </div>
      ) : !hasData ? (
        <div className="h-52 flex flex-col items-center justify-center text-text-muted gap-2">
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
              contentStyle={{
                backgroundColor: "var(--color-surface)",
                border: "2px solid var(--color-border)",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: "bold",
                boxShadow: "3px 3px 0 var(--color-border)",
              }}
              labelStyle={{ color: "var(--color-text-muted)", fontWeight: 600, marginBottom: 4 }}
              formatter={(value) => [cfg.formatter(value), cfg.label]}
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
    </Card>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
};
