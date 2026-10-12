"use client";

import { Input } from "@/shared/components";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`text-[11px] sm:text-xs font-mono font-bold uppercase px-2 py-1.5 rounded-md shrink-0 w-[74px] sm:w-[88px] text-center border border-border shadow-[1.5px_1.5px_0px_var(--color-border)] ${
          (badge === "CF" || badge === "TS") ? "bg-[#ff1a53]/15 text-[#ff1a53]" : "bg-surface-2 text-text-muted"
        }`}>{label}</span>
      <Input value={url} readOnly className="flex-1 min-w-0 font-mono text-xs sm:text-sm truncate" />
      <button
        onClick={() => onCopy(url, copyId)}
        className="p-1.5 sm:p-2 hover:bg-surface-2 border-2 border-border shadow-[1.5px_1.5px_0px_var(--color-border)] active:translate-y-0.5 rounded-lg text-text-muted hover:text-text-main transition-all shrink-0 cursor-pointer"
      >
        <span className="material-symbols-outlined text-[17px] sm:text-[18px]">{copied === copyId ? "check" : "content_copy"}</span>
      </button>
      {actions}
    </div>
  );
}
