"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

/**
 * Antares segmented control — a row of chips inside a pill track. Scrolls
 * horizontally on narrow screens instead of wrapping.
 */
export default function AntaresSegmented({
  options = [],
  value,
  onChange,
  size = "md",
  className,
}) {
  return (
    <div className={cn("an-segmented", size === "sm" && "an-segmented-sm", className)}>
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            className={cn("an-segmented-btn", isActive && "active")}
          >
            {option.icon && (
              <span className="material-symbols-outlined" aria-hidden>
                {option.icon}
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

AntaresSegmented.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.node.isRequired,
      icon: PropTypes.string,
    })
  ),
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  size: PropTypes.oneOf(["sm", "md"]),
  className: PropTypes.string,
};
