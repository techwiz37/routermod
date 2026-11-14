"use client";

import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

export default function OverviewCards({ stats }) {
  const cards = [
    {
      label: translate("Total Requests"),
      value: fmt(stats.totalRequests),
      icon: "swap_horiz",
      color: "var(--t-ink)",
      foot: "RouterMod API",
    },
    {
      label: translate("Input Tokens"),
      value: fmt(stats.totalPromptTokens),
      icon: "input",
      color: "var(--t-star-ink)",
      foot: "RouterMod API",
    },
    {
      label: translate("Cache Tokens"),
      value: fmt(stats.totalCachedTokens),
      icon: "offline_bolt",
      color: "#5b9dff",
      foot: "RouterMod API",
    },
    {
      label: translate("Output Tokens"),
      value: fmt(stats.totalCompletionTokens),
      icon: "output",
      color: "var(--t-ok)",
      foot: "RouterMod API",
    },
    {
      label: translate("Estimated Cost"),
      value: `~${fmtCost(stats.totalCost)}`,
      icon: "attach_money",
      color: "#ffb800",
      foot: translate("Token rate estimate"),
      wide: true,
    },
  ];

  return (
    <div className="an-stats-grid">
      {cards.map((c) => (
        <div key={c.label} className={`an-stat an-usage-stat ${c.wide ? "an-stat-wide" : ""}`}>
          <span className="an-stat-label">
            <span className="material-symbols-outlined" aria-hidden>
              {c.icon}
            </span>
            <span className="min-w-0">{c.label}</span>
          </span>
          <span className="an-stat-value" style={{ color: c.color }}>
            {c.value}
          </span>
          <span className="an-stat-foot">{c.foot}</span>
        </div>
      ))}
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
};
