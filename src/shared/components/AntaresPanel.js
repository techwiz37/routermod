"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

/**
 * Antares panel — the dashboard counterpart of the login page card.
 * Thin 1px lines, soft radius, no hard shadow; the accent red is reserved
 * for icons and primary actions.
 */
export default function AntaresPanel({
  children,
  title,
  subtitle,
  icon,
  action,
  className,
  bodyClassName,
  padded = true,
  ...props
}) {
  const hasHead = !!(title || subtitle || icon || action);

  return (
    <section className={cn("an-panel", className)} {...props}>
      {hasHead && (
        <header className="an-panel-head">
          {icon && (
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined">{icon}</span>
            </span>
          )}
          {(title || subtitle) && (
            <div className="min-w-0 flex-1">
              {title && <h2 className="an-panel-title truncate">{title}</h2>}
              {subtitle && <p className="an-panel-sub">{subtitle}</p>}
            </div>
          )}
          {action && <div className="an-panel-actions">{action}</div>}
        </header>
      )}
      <div className={cn(padded && "an-panel-pad", bodyClassName)}>{children}</div>
    </section>
  );
}

AntaresPanel.propTypes = {
  children: PropTypes.node,
  title: PropTypes.string,
  subtitle: PropTypes.string,
  icon: PropTypes.string,
  action: PropTypes.node,
  className: PropTypes.string,
  bodyClassName: PropTypes.string,
  padded: PropTypes.bool,
};
