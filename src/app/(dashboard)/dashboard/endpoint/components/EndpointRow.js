"use client";

import { Input } from "@/shared/components";

/**
 * Layout:
 *   [Local]           ← badge label
 *   [http://... ] [⧉] ← input full-width + copy button beside
 */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      {/* Badge */}
      <span className={`self-start text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
        (badge === "CF" || badge === "TS")
          ? "bg-[#ff1a53]/10 text-[#ff1a53] border-[#ff1a53]/30"
          : "bg-surface-2 text-text-muted border-border"
      }`}>
        {label}
      </span>
      {/* Input + actions */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Input value={url} readOnly className="flex-1 min-w-0 font-mono text-xs" />
        <button
          onClick={() => onCopy(url, copyId)}
          title="Copy"
          className="p-2 rounded-lg border-2 border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-text-main transition-colors shrink-0"
          style={{ boxShadow: "1.5px 1.5px 0 var(--color-border)" }}
        >
          <span className="material-symbols-outlined text-[16px]">
            {copied === copyId ? "check" : "content_copy"}
          </span>
        </button>
        {actions}
      </div>
    </div>
  );
}
