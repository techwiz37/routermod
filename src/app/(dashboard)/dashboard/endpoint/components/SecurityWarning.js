"use client";

import Link from "next/link";

/**
 * Security warning banner — Neobrutalism style.
 * type: "warning" (default) | "error" | "info"
 */
export default function SecurityWarning({ message, action, type = "warning" }) {
  const styles = {
    warning: {
      wrap: "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500/50",
      icon: "warning",
      iconColor: "text-amber-500",
      text: "text-amber-800 dark:text-amber-300",
      action: "text-amber-700 dark:text-amber-400 border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40",
      shadow: "shadow-[2px_2px_0px_theme(colors.amber.400)]",
    },
    error: {
      wrap: "border-red-400 bg-red-50 dark:bg-red-950/30 dark:border-red-500/50",
      icon: "error",
      iconColor: "text-red-500",
      text: "text-red-800 dark:text-red-300",
      action: "text-red-700 dark:text-red-400 border-red-400 hover:bg-red-100 dark:hover:bg-red-900/40",
      shadow: "shadow-[2px_2px_0px_theme(colors.red.400)]",
    },
    info: {
      wrap: "border-blue-400 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-500/50",
      icon: "info",
      iconColor: "text-blue-500",
      text: "text-blue-800 dark:text-blue-300",
      action: "text-blue-700 dark:text-blue-400 border-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40",
      shadow: "shadow-[2px_2px_0px_theme(colors.blue.400)]",
    },
  };

  const s = styles[type] ?? styles.warning;
  const isInternal = action?.href?.startsWith("/") || action?.href?.startsWith("#");

  const handleClick = action?.href?.startsWith("#")
    ? (e) => {
        e.preventDefault();
        document.getElementById(action.href.slice(1))?.scrollIntoView({ behavior: "smooth" });
      }
    : undefined;

  return (
    <div className={`flex items-start gap-3 px-3.5 py-2.5 rounded-lg border-2 ${s.wrap} ${s.shadow}`}>
      <span className={`material-symbols-outlined text-[17px] shrink-0 mt-0.5 ${s.iconColor}`}>
        {s.icon}
      </span>
      <p className={`text-xs flex-1 leading-relaxed font-medium ${s.text}`}>{message}</p>
      {action && (
        isInternal && !action.href.startsWith("#") ? (
          <Link
            href={action.href}
            className={`text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded border whitespace-nowrap shrink-0 transition-colors ${s.action}`}
          >
            {action.label}
          </Link>
        ) : (
          <a
            href={action.href}
            onClick={handleClick}
            target={action.href.startsWith("http") ? "_blank" : undefined}
            rel={action.href.startsWith("http") ? "noopener noreferrer" : undefined}
            className={`text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded border whitespace-nowrap shrink-0 transition-colors ${s.action}`}
          >
            {action.label}
          </a>
        )
      )}
    </div>
  );
}
