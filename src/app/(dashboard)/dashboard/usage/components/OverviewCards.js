"use client";

import PropTypes from "prop-types";
import Card from "@/shared/components/Card";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

export default function OverviewCards({ stats }) {
  const cards = [
    {
      label: "Total Permintaan",
      value: fmt(stats.totalRequests),
      icon: "swap_horiz",
      color: "text-text-main",
      border: "border-border",
      bg: "bg-surface-2",
    },
    {
      label: "Token Masukan",
      value: fmt(stats.totalPromptTokens),
      icon: "input",
      color: "text-primary",
      border: "border-primary/40",
      bg: "bg-primary/5",
    },
    {
      label: "Token Cache",
      value: fmt(stats.totalCachedTokens),
      icon: "offline_bolt",
      color: "text-blue-500",
      border: "border-blue-500/40",
      bg: "bg-blue-500/5",
    },
    {
      label: "Token Keluaran",
      value: fmt(stats.totalCompletionTokens),
      icon: "output",
      color: "text-emerald-500",
      border: "border-emerald-500/40",
      bg: "bg-emerald-500/5",
    },
    {
      label: "Perkiraan Biaya",
      value: `~${fmtCost(stats.totalCost)}`,
      icon: "attach_money",
      color: "text-amber-500",
      border: "border-amber-500/40",
      bg: "bg-amber-500/5",
      subtitle: "Estimasi token rate",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      {cards.map((c, i) => (
        <Card
          key={c.label}
          className={`flex flex-col justify-between p-2.5 sm:p-3 border-2 shadow-[2px_2px_0_var(--color-border)] ${
            i === cards.length - 1 ? "col-span-2 sm:col-span-1" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-1 mb-1 sm:mb-1.5">
            <span className="text-[9.5px] sm:text-[10.5px] font-bold uppercase tracking-wider text-text-muted truncate">
              {c.label}
            </span>
            <div className={`flex size-5 sm:size-6 shrink-0 items-center justify-center rounded border border-border ${c.bg} ${c.color}`}>
              <span className="material-symbols-outlined text-[12px] sm:text-[14px]">{c.icon}</span>
            </div>
          </div>
          <div className="min-w-0">
            <span className={`block font-mono text-sm sm:text-base lg:text-lg font-black tracking-tight truncate ${c.color}`}>
              {c.value}
            </span>
            {c.subtitle ? (
              <span className="mt-0.5 block text-[8.5px] sm:text-[9px] text-text-muted truncate">{c.subtitle}</span>
            ) : (
              <span className="mt-0.5 block text-[8.5px] sm:text-[9px] text-text-muted opacity-40">RouterMod API</span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
};
