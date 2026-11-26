"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

/**
 * Antares checkbox — a native input stays the source of truth (so existing
 * checked/onChange handlers keep working) but is visually replaced by a
 * themed box with a check icon. The label itself is a 44px tap target.
 */
export default function AntaresCheckbox({
  checked,
  onChange,
  label,
  disabled = false,
  ariaLabel,
  className,
  compact = false,
}) {
  return (
    <label
      // `relative` anchors the 1x1 sr-only input to this label. Without it the
      // browser scrolls the nearest scrollable ancestor (the dashboard root,
      // which uses overflow:hidden but is still programmatically scrollable)
      // when the input receives focus — shifting the whole page up and leaving
      // a blank area below after clicking Select All.
      className={cn("an-checkbox relative", compact && "an-checkbox-compact", disabled && "an-checkbox-disabled", className)}
      aria-label={ariaLabel}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="peer sr-only"
      />
      <span className="an-checkbox-box" aria-hidden="true">
        <span className="material-symbols-outlined">check</span>
      </span>
      {label != null && <span className="an-checkbox-label">{label}</span>}
    </label>
  );
}

AntaresCheckbox.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func,
  label: PropTypes.node,
  disabled: PropTypes.bool,
  ariaLabel: PropTypes.string,
  className: PropTypes.string,
  compact: PropTypes.bool,
};
