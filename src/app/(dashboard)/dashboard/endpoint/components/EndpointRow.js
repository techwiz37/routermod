"use client";

import { Input } from "@/shared/components";

/** Reusable endpoint row — label+input on top, actions below on mobile */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {/* Label + input row */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[11px] sm:text-xs font-mono font-bold uppercase px-2 py-1.5 rounded-md shrink-0 w-[74px] sm:w-[88px] text-center border border-border shadow-[1.5px_1.5px_0px_var(--color-border)] ${
          (badge === "CF" || badge === "TS") ? "bg-[#ff1a53]/15 text-[#ff1a53]" : "bg-surface-2 text-text-muted"
        }`}>{label}</span>
        <Input value={url} readOnly className="flex-1 min-w-0 font-mono text-xs sm:text-sm truncate" />
      </div>
      {/* Actions row — indented to align with input */}
      <div className="flex items-center gap-1.5 pl-[82px] sm:pl-[96px]">
        <button
          onClick={() => onCopy(url, copyId)}
          className="p-1.5 hover:bg-surface-2 border-2 border-border shadow-[1.5px_1.5px_0px_var(--color-border)] active:translate-y-0.5 rounded-lg text-text-muted hover:text-text-main transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[17px]">{copied === copyId ? "check" : "content_copy"}</span>
        </button>
        {actions}
      </div>
    </div>
  );
}
