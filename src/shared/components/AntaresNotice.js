import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

/**
 * Antares notice banner — thin 1px border, soft tinted background, no hard
 * shadow. Used for deprecation notices, risk warnings and inline info.
 */
export default function AntaresNotice({
  variant = "info",
  icon = "info",
  children,
  action,
  className,
}) {
  return (
    <div className={cn("an-notice", variant, className)} role="note">
      <span className="an-notice-ico" aria-hidden>
        <span className="material-symbols-outlined">{icon}</span>
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="flex items-center gap-2 flex-none">{action}</div>}
    </div>
  );
}

AntaresNotice.propTypes = {
  variant: PropTypes.oneOf(["info", "warn", "danger"]),
  icon: PropTypes.string,
  children: PropTypes.node,
  action: PropTypes.node,
  className: PropTypes.string,
};
