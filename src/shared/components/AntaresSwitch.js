import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

/**
 * Antares switch — a pill toggle with a filled knob. `on` reflects the real
 * state, `onChange` receives the next state so callers never invert it.
 */
export default function AntaresSwitch({
  on = false,
  onChange,
  label,
  disabled = false,
  title,
  ariaLabel,
  className,
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onChange) onChange(!on);
      }}
      className={cn("an-switch", on ? "on" : "off", disabled && "opacity-50 cursor-not-allowed", className)}
    >
      <span className="an-switch-knob" />
      {label !== undefined && <span>{label}</span>}
    </button>
  );
}

AntaresSwitch.propTypes = {
  on: PropTypes.bool,
  onChange: PropTypes.func,
  label: PropTypes.string,
  disabled: PropTypes.bool,
  title: PropTypes.string,
  ariaLabel: PropTypes.string,
  className: PropTypes.string,
};
