"use client";

import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import AntaresSegmented from "@/shared/components/AntaresSegmented";

const BAR_COLORS = ["#14b8a6", "#6366f1", "#f59e0b", "#ff1a53", "#8b5cf6", "#06b6d4", "#10b981", "#f97316"];
const PAGE_SIZE = 5;

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const truncate = (s, max = 26) => (s && s.length > max ? s.slice(0, max - 1) + "…" : s || "");

export default function TopModelsChart({ byModel }) {
  const [viewMode, setViewMode] = useState("tokens");
  const [page, setPage] = useState(0);

  const allRows = useMemo(() => {
    if (!byModel) return [];
    const list = Object.values(byModel)
      .map((data) => ({
        name: truncate(data.rawModel || "Unknown"),
        provider: data.provider || "",
        tokens: (data.promptTokens || 0) + (data.completionTokens || 0),
        requests: data.requests || 0,
      }))
      .filter((d) => d[viewMode] > 0)
      .sort((a, b) => b[viewMode] - a[viewMode]);
    const max = Math.max(...list.map((d) => d[viewMode]), 1);
    return list.map((d, i) => ({ ...d, pct: (d[viewMode] / max) * 100, color: BAR_COLORS[i % BAR_COLORS.length] }));
  }, [byModel, viewMode]);

  const totalPages = Math.ceil(allRows.length / PAGE_SIZE);
  const rows = allRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const fmt = viewMode === "tokens" ? fmtTokens : String;

  const handleViewMode = (v) => { setViewMode(v); setPage(0); };

  return (
    <section className="an-panel">
      <div className="an-chart">
      <div className="an-chart-head">
        <span className="an-chart-title">
          <span className="material-symbols-outlined" aria-hidden>model_training</span>
          <span className="truncate">Top Models</span>
        </span>
        <AntaresSegmented
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
        <div className="h-44 flex flex-col items-center justify-center gap-2 text-[var(--t-muted)]">
          <span className="material-symbols-outlined text-[28px] opacity-30">model_training</span>
          <span className="text-xs font-medium">Belum ada penggunaan model</span>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 py-1 min-h-[calc(5*42px)]">
            {rows.map((r) => (
              <div key={r.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11.5px] text-[var(--t-ink)] truncate" title={r.name}>{r.name}</span>
                  <span className="font-mono text-[11.5px] font-medium shrink-0" style={{ color: r.color }}>
                    {fmt(r[viewMode])}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--t-raised)] overflow-hidden">
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
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--t-line-soft)]">
              <span className="font-mono text-[10.5px] text-[var(--t-dim)]">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allRows.length)} / {allRows.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                  className="an-page-btn !min-w-[26px] !h-[26px] !px-1"
                  aria-label="Previous page"
                >
                  <span className="material-symbols-outlined text-[15px]">chevron_left</span>
                </button>
                <span className="font-mono text-[10.5px] text-[var(--t-dim)] px-1">{page + 1}/{totalPages}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                  className="an-page-btn !min-w-[26px] !h-[26px] !px-1"
                  aria-label="Next page"
                >
                  <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </section>
  );
}

TopModelsChart.propTypes = {
  byModel: PropTypes.object,
};
