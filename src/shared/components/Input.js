"use client";

import { cn } from "@/shared/utils/cn";
import { useSurfaceSkin } from "./SurfaceSkinContext";

export default function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  hint,
  icon,
  disabled = false,
  required = false,
  variant,
  className,
  inputClassName,
  ...props
}) {
  const contextSkin = useSurfaceSkin();
  const isAntares = (variant || contextSkin) === "antares";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className={cn("text-sm font-medium", isAntares ? "text-[var(--t-ink)]" : "text-text-main")}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            isAntares
              ? "w-full py-2.5 px-3.5 text-sm text-[var(--t-ink)] bg-[var(--t-field)] rounded-[10px] border border-[var(--t-line)] placeholder:text-[var(--t-dim)] font-mono focus:outline-none focus:border-[var(--t-accent)] focus:shadow-[var(--t-focus)] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              : "w-full py-2.5 px-3.5 text-sm text-text-main bg-surface rounded-lg",
            !isAntares && "border-2 border-border shadow-[2px_2px_0px_var(--color-border)] placeholder-text-muted/60 font-mono",
            !isAntares && "focus:outline-none focus:border-[var(--color-primary)] focus:shadow-[3px_3px_0px_var(--color-primary)]",
            !isAntares && "transition-all duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed",
            "text-[16px] sm:text-sm",
            icon && "pl-10",
            error && (isAntares ? "border-[var(--t-danger)]" : "border-red-500 shadow-[2px_2px_0px_#ef4444]"),
            inputClassName
          )}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-text-muted">{hint}</p>
      )}
    </div>
  );
}
