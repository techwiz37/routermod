"use client";

import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import SegmentedControl from "@/shared/components/SegmentedControl";

const BAR_COLORS = ["#ff1a53", "#6366f1", "#14b8a6", "#f59e0b", "#8b5cf6", "#06b6d4", "#10b981", "#f97316"];
const PAGE_SIZE = 5;

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

export default function ProviderBarChart({ byProvider }) {
  const [viewMode, setViewMode] = useState("tokens");
  const [page, setPage] = useState(0);

  const allRows = useMemo(() => {
    if (!byProvider) return [];
    const list = Object.entries(byProvider)
      .map(([id, data]) => ({
        name: id,
        tokens: (data.promptTokens || 0) + (data.completionTokens || 0),
        requests: data.requests || 0,
      }))
      .filter((d) => d[viewMode] > 0)
      .sort((a, b) => b[viewMode] - a[viewMode]);
    const max = Math.max(...list.map((d) => d[viewMode]), 1);
    return list.map((d, i) => ({ ...d, pct: (d[viewMode] / max) * 100, color: BAR_COLORS[i % BAR_COLORS.length] }));
  }, [byProvider, viewMode]);

  const totalPages = Math.ceil(allRows.length / PAGE_SIZE);
  const rows = allRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const fmt = viewMode === "tokens" ? fmtTokens : String;

  const handleViewMode = (v) => { setViewMode(v); setPage(0); };

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4 border-2 shadow-[2.5px_2.5px_0_var(--color-border)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-text-muted">By Provider</span>
        <SegmentedControl
          options={[
            { value: "tokens", label: "Token" },
            { value: "requests", label: "Permintaan" },
          ]}
          value={viewMode}
          onChange={handleViewMode}
          size="sm"
        />
      </div>

      {!allRows.length ? (
        <div className="h-44 flex flex-col items-center justify-center gap-2 text-text-muted">
          <span className="material-symbols-outlined text-[28px] opacity-30">hub</span>
          <span className="text-xs font-medium">Belum ada penggunaan provider</span>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5 py-1 min-h-[calc(5*42px)]">
            {rows.map((r) => (
              <div key={r.name} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-text-main truncate">{r.name}</span>
                  <span className="font-mono text-[11px] font-bold shrink-0" style={{ color: r.color }}>
                    {fmt(r[viewMode])}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full border-2 border-border bg-surface-2 overflow-hidden"
                  style={{ boxShadow: "1px 1px 0 var(--color-border)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.max(r.pct, 4)}%`,
                      background: `linear-gradient(90deg, ${r.color}, ${r.color}bb)`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t-2 border-border">
              <span className="font-mono text-[10px] text-text-muted">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allRows.length)} / {allRows.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                  className="size-6 flex items-center justify-center rounded border-2 border-border bg-surface hover:bg-surface-2 text-text-muted disabled:opacity-30 shadow-[1px_1px_0_var(--color-border)]"
                >
                  <span className="material-symbols-outlined text-[13px]">chevron_left</span>
                </button>
                <span className="font-mono text-[10px] text-text-muted px-1">{page + 1}/{totalPages}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                  className="size-6 flex items-center justify-center rounded border-2 border-border bg-surface hover:bg-surface-2 text-text-muted disabled:opacity-30 shadow-[1px_1px_0_var(--color-border)]"
                >
                  <span className="material-symbols-outlined text-[13px]">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

ProviderBarChart.propTypes = {
  byProvider: PropTypes.object,
};
