"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

/**
 * Antares stat tile — the dashboard counterpart of the login-page metric
 * blocks: light-weight number, mono label, thin border, no hard shadow.
 */
export default function AntaresStat({
  label,
  value,
  unit,
  foot,
  icon,
  tone = "default",
  className,
  valueClassName,
}) {
  const tones = {
    default: { value: "var(--t-ink)", chip: "var(--t-accent-soft)", chipInk: "var(--t-star-ink)" },
    ok: { value: "var(--t-ok)", chip: "var(--t-ok-soft)", chipInk: "var(--t-ok)" },
    warn: { value: "#f0a13a", chip: "rgba(240,161,58,0.14)", chipInk: "#f0a13a" },
    danger: { value: "var(--t-danger)", chip: "var(--t-danger-soft)", chipInk: "var(--t-danger)" },
    violet: { value: "var(--t-ink)", chip: "rgba(167,139,250,0.14)", chipInk: "#a78bfa" },
  };
  const c = tones[tone] || tones.default;

  return (
    <div className={cn("an-stat", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="an-stat-label truncate">{label}</span>
        {icon && (
          <span
            className="inline-flex items-center justify-center size-6 rounded-md shrink-0"
            style={{ background: c.chip, color: c.chipInk }}
          >
            <span className="material-symbols-outlined text-[15px] leading-none">{icon}</span>
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className="an-stat-value truncate"
          style={{ color: c.value }}
        >
          {value}
        </span>
        {unit && <span className="an-stat-foot shrink-0">{unit}</span>}
      </div>

      {foot && (
        <div className="an-stat-foot">{foot}</div>
      )}
    </div>
  );
}

AntaresStat.propTypes = {
  label: PropTypes.string,
  value: PropTypes.node,
  unit: PropTypes.string,
  foot: PropTypes.string,
  icon: PropTypes.string,
  tone: PropTypes.string,
  className: PropTypes.string,
  valueClassName: PropTypes.string,
};
