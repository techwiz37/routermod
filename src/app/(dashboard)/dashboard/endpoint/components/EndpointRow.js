"use client";

import { Input } from "@/shared/components";

export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className={`self-start text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
        (badge === "CF" || badge === "TS")
          ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/30"
          : "bg-surface-2 text-text-muted border-border"
      }`}>
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        <input
          value={url}
          readOnly
          className="flex-1 min-w-0 font-mono text-xs py-1.5 px-2.5 rounded-lg border-2 border-border bg-surface text-text-main focus:outline-none focus:border-[var(--color-primary)] shadow-[1.5px_1.5px_0px_var(--color-border)] truncate"
        />
        <button
          onClick={() => onCopy(url, copyId)}
          title="Copy"
          className="p-1.5 rounded-lg border-2 border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-text-main transition-colors shrink-0"
          style={{ boxShadow: "1.5px 1.5px 0 var(--color-border)" }}
        >
          <span className="material-symbols-outlined text-[15px]">
            {copied === copyId ? "check" : "content_copy"}
          </span>
        </button>
        {actions}
      </div>
    </div>
  );
}
