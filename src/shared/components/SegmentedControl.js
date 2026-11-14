"use client";

import { cn } from "@/shared/utils/cn";

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  className,
}) {
  const sizes = {
    sm: "h-7 text-xs px-2.5",
    md: "h-9 text-xs sm:text-sm px-3.5",
    lg: "h-10 text-sm sm:text-base px-4",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1 rounded-xl border-2 border-border bg-surface-2 shadow-[2px_2px_0_var(--color-border)] overflow-x-auto custom-scrollbar",
        className
      )}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "shrink-0 rounded-lg font-mono font-bold transition-all flex items-center justify-center cursor-pointer",
              sizes[size],
              isActive
                ? "bg-[var(--color-primary)] text-white shadow-[1px_1px_0_var(--color-border)]"
                : "text-text-muted hover:text-text-main hover:bg-surface"
            )}
          >
            {option.icon && (
              <span className="material-symbols-outlined text-[16px] mr-1.5">
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
