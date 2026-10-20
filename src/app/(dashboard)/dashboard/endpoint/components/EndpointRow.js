"use client";

export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className={`an-chip self-start ${badge === "CF" || badge === "TS" ? "accent" : ""}`}>
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        <input
          value={url}
          readOnly
          className="an-input flex-1 min-w-0 py-1.5 text-xs truncate"
        />
        <button
          onClick={() => onCopy(url, copyId)}
          title="Copy"
          aria-label={`Copy ${label} URL`}
          className="an-btn an-ghost h-9 w-9 px-0 shrink-0"
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
