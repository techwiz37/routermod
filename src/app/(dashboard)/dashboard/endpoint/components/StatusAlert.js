"use client";

export default function StatusAlert({ status, className = "" }) {
  const map = {
    success: {
      wrap: "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-500/50",
      icon: "check_circle",
      iconColor: "text-emerald-500",
      text: "text-emerald-800 dark:text-emerald-300",
      shadow: "shadow-[2px_2px_0px_theme(colors.emerald.400)]",
    },
    warning: {
      wrap: "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500/50",
      icon: "warning",
      iconColor: "text-amber-500",
      text: "text-amber-800 dark:text-amber-300",
      shadow: "shadow-[2px_2px_0px_theme(colors.amber.400)]",
    },
    info: {
      wrap: "border-blue-400 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-500/50",
      icon: "info",
      iconColor: "text-blue-500",
      text: "text-blue-800 dark:text-blue-300",
      shadow: "shadow-[2px_2px_0px_theme(colors.blue.400)]",
    },
    error: {
      wrap: "border-red-400 bg-red-50 dark:bg-red-950/30 dark:border-red-500/50",
      icon: "error",
      iconColor: "text-red-500",
      text: "text-red-800 dark:text-red-300",
      shadow: "shadow-[2px_2px_0px_theme(colors.red.400)]",
    },
  };

  const s = map[status.type] ?? map.error;

  const renderMessage = (msg) => {
    const parts = msg.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, i) =>
      /^https?:\/\
        ? <a key={i} href={part} target="_blank" rel="noreferrer" className="underline font-semibold hover:opacity-80">{part}</a>
        : part
    );
  };

  return (
    <div className={`flex items-start gap-3 px-3.5 py-2.5 rounded-lg border-2 ${s.wrap} ${s.shadow} ${className}`}>
      <span className={`material-symbols-outlined text-[17px] shrink-0 mt-0.5 ${s.iconColor}`}>
        {s.icon}
      </span>
      <p className={`text-xs flex-1 leading-relaxed font-medium ${s.text}`}>
        {renderMessage(status.message)}
      </p>
    </div>
  );
}
