"use client";

import { Input, Button } from "@/shared/components";

export default function DomainRow({
  tunnelEnabled, tunnelLoading, tunnelReachable, tunnelEverReachable,
  tunnelProgress, tunnelStatus, tunnelChecking,
  tunnelPublicUrl, tunnelUrl,
  copied, copy,
  isLoginUnsafe, unsafeReason, requireApiKey, addNotification,
  onDisable, onGenerate, onCancelLoading, onCancelChecking,
}) {
  const activeUrl = tunnelPublicUrl || tunnelUrl;
  const isActive   = tunnelEnabled && !tunnelLoading && tunnelReachable;
  const isWaiting  = tunnelEnabled && !tunnelLoading && !tunnelReachable;
  const isError    = tunnelStatus?.type === "error";

  const badgeClass = `self-start text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
    tunnelEnabled
      ? "bg-[#ff1a53]/10 text-[#ff1a53] border-[#ff1a53]/30"
      : "bg-surface-2 text-text-muted border-border"
  }`;

  const iconBtn = (onClick, icon, title, extra = "") => (
    <button onClick={onClick} title={title}
      className={`p-2 rounded-lg border-2 border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-text-main transition-colors shrink-0 ${extra}`}
      style={{ boxShadow: "1.5px 1.5px 0 var(--color-border)" }}>
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </button>
  );

  const offBtn = (onClick, title = "Disable") => (
    <button onClick={onClick} title={title}
      className="p-2 rounded-lg border-2 border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-500 transition-colors shrink-0"
      style={{ boxShadow: "1.5px 1.5px 0 var(--color-border)" }}>
      <span className="material-symbols-outlined text-[16px]">power_settings_new</span>
    </button>
  );

  const statusBox = (icon, text, colorClass, spin = false) => (
    <div className={`flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-border text-xs font-mono ${colorClass}`}
      style={{ boxShadow: "1.5px 1.5px 0 var(--color-border)" }}>
      <span className={`material-symbols-outlined text-[14px] shrink-0 ${spin ? "animate-spin" : ""}`}>{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );

  let content, actions;

  if (isActive) {
    content = (
      <Input value={`${activeUrl}/v1`} readOnly className="flex-1 min-w-0 font-mono text-xs" />
    );
    actions = (
      <>
        {iconBtn(() => copy(`${activeUrl}/v1`, "domain_url"),
          copied === "domain_url" ? "check" : "content_copy", "Copy URL")}
        <a href={activeUrl} target="_blank" rel="noopener noreferrer" title="Open"
          className="p-2 rounded-lg border-2 border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-text-main transition-colors shrink-0"
          style={{ boxShadow: "1.5px 1.5px 0 var(--color-border)" }}>
          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
        </a>
        {offBtn(onDisable, "Disable & delete domain")}
      </>
    );
  } else if (isWaiting) {
    content = statusBox("progress_activity",
      tunnelEverReachable ? "Reconnecting…" : "Checking domain…",
      "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border-amber-300/60 dark:border-amber-700/40", true);
    actions = offBtn(onDisable, "Disable & delete domain");
  } else if (tunnelLoading) {
    content = statusBox("progress_activity",
      tunnelProgress || "Generating domain…",
      "text-text-muted bg-surface-2", true);
    actions = offBtn(onCancelLoading, "Cancel");
  } else if (isError) {
    content = statusBox("error_outline", tunnelStatus.message,
      "text-red-500 bg-red-50 dark:bg-red-900/10 border-red-300/60 dark:border-red-700/40");
    actions = <Button size="sm" icon="refresh" onClick={onGenerate}>Retry</Button>;
  } else if (tunnelChecking) {
    content = statusBox("progress_activity", "Checking…", "text-text-muted bg-surface-2", true);
    actions = offBtn(onCancelChecking, "Cancel");
  } else {
    content = statusBox("public", "Free public domain · *.toolwiz.id", "text-text-muted bg-surface-2");
    actions = (
      <Button size="sm" icon="add_link" onClick={() => {
        if (isLoginUnsafe) { addNotification({ type: "error", title: "Security Required", message: unsafeReason }); return; }
        if (!requireApiKey) { addNotification({ type: "warning", title: "Security Required", message: "Enable \"Require API key\" before activating the domain." }); return; }
        onGenerate();
      }}>
        Generate
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className={badgeClass}>Domain</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {content}
        <div className="flex items-center gap-1 shrink-0">{actions}</div>
      </div>
    </div>
  );
}
