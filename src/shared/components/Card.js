"use client";

import { cn } from "@/shared/utils/cn";
import { useSurfaceSkin } from "./SurfaceSkinContext";

export default function Card({
  children,
  title,
  subtitle,
  icon,
  action,
  padding = "md",
  hover = false,
  elev = false,
  skin,
  className,
  ...props
}) {
  const contextSkin = useSurfaceSkin();
  const paddings = {
    none: "",
    xs: "p-3",
    sm: "p-4",
    md: "p-5 sm:p-6",
    lg: "p-6 sm:p-8",
  };
  const activeSkin = skin || contextSkin;

  if (activeSkin === "antares") {
    return (
      <div
        className={cn(
          "an-panel",
          hover && "transition-colors cursor-pointer hover:border-[var(--t-hover-line)]",
          className
        )}
        {...props}
      >
        {(title || subtitle || icon || action) && (
          <div className="an-panel-head">
            {icon && (
              <span className="an-panel-ico" aria-hidden>
                <span className="material-symbols-outlined">{icon}</span>
              </span>
            )}
            {(title || subtitle) && (
              <div className="min-w-0 flex-1">
                {title && <h3 className="an-panel-title truncate">{title}</h3>}
                {subtitle && <p className="an-panel-sub">{subtitle}</p>}
              </div>
            )}
            {action && <div className="an-panel-actions">{action}</div>}
          </div>
        )}
        <div className={cn(paddings[padding])}>{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-surface border-2 border-border rounded-xl",
        elev ? "shadow-[4px_5px_0px_var(--color-border)]" : "shadow-[3px_4px_0px_var(--color-border)]",
        hover && "hover:-translate-y-0.5 hover:shadow-[4px_5.5px_0px_var(--color-border)] transition-all cursor-pointer",
        paddings[padding],
        className
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-4 border-b-2 border-border pb-3">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="p-2 rounded-lg bg-surface-2 border-2 border-border shadow-[2px_2px_0px_var(--color-border)] text-[var(--color-primary)]">
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-text-main font-mono font-bold text-sm uppercase tracking-wider">{title}</h3>
              )}
              {subtitle && (
                <p className="text-xs font-mono text-text-muted">{subtitle}</p>
              )}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

Card.Section = function CardSection({ children, className, ...props }) {
  const skin = useSurfaceSkin();
  if (skin === "antares") {
    return (
      <div
        className={cn("rounded-[10px] border border-[var(--t-line)] bg-[var(--t-raised)] p-4", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "p-4 rounded-lg",
        "bg-surface-2 border-2 border-border shadow-[2px_2px_0px_var(--color-border)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.Row = function CardRow({ children, className, ...props }) {
  const skin = useSurfaceSkin();
  if (skin === "antares") {
    return (
      <div
        className={cn(
          "p-3 -mx-3 px-3 transition-colors",
          "border-b border-[var(--t-line-soft)] last:border-b-0",
          "hover:bg-white/[0.015]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "p-3 -mx-3 px-3 transition-colors",
        "border-b border-border-subtle last:border-b-0",
        "hover:bg-surface-2/50",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.ListItem = function CardListItem({
  children,
  actions,
  className,
  ...props
}) {
  const skin = useSurfaceSkin();
  if (skin === "antares") {
    return (
      <div
        className={cn(
          "group flex items-center justify-between p-3 -mx-3 px-3",
          "border-b border-[var(--t-line-soft)] last:border-b-0",
          "hover:bg-white/[0.015] transition-colors",
          className
        )}
        {...props}
      >
        <div className="flex-1 min-w-0">{children}</div>
        {actions && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {actions}
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "group flex items-center justify-between p-3 -mx-3 px-3",
        "border-b border-border-subtle last:border-b-0",
        "hover:bg-surface-2/50 transition-colors",
        className
      )}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {actions && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  );
};
