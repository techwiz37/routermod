"use client";

import { CAPACITY_META } from "@/shared/constants/models";
import Tooltip from "./Tooltip";
import { translate } from "@/i18n/runtime";

export default function CapacityBadges({ caps, className = "", size = 16, showAll = false }) {
  if (!caps) return null;
  const active = Object.keys(CAPACITY_META).filter((k) => showAll || caps[k]);
  if (active.length === 0) return null;

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {active.map((k) => (
        <Tooltip key={k} text={`${CAPACITY_META[k].label}: ${translate(caps[k] ? CAPACITY_META[k].desc : "Not declared as supported")}`}>
          <span
            role="img" aria-label={`${CAPACITY_META[k].label}: ${translate(caps[k] ? "Supported" : "Not declared as supported")}`}
            title={`${CAPACITY_META[k].label}: ${translate(caps[k] ? "Supported" : "Not declared as supported")}`}
            className={`material-symbols-outlined leading-none cursor-help ${caps[k] ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            style={{ fontSize: `${size}px` }}
          >
            {CAPACITY_META[k].icon}
          </span>
        </Tooltip>
      ))}
    </span>
  );
}
