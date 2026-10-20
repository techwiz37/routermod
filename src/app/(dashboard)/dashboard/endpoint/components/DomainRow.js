"use client";

import { Button } from "@/shared/components";

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

  const iconBtn = (onClick, icon, title, extra = "") => (
    <button onClick={onClick} title={title} aria-label={title}
      className={`an-btn an-ghost h-9 w-9 px-0 shrink-0 ${extra}`}>
      <span className="material-symbols-outlined text-[15px]">{icon}</span>
    </button>
  );

  const offBtn = (onClick, title = "Disable") => (
    <button onClick={onClick} title={title} aria-label={title}
      className="an-btn h-9 w-9 px-0 shrink-0 border border-[rgba(255,106,117,0.4)] bg-transparent text-[var(--t-danger)] hover:bg-[var(--t-danger-soft)]">
      <span className="material-symbols-outlined text-[15px]">power_settings_new</span>
    </button>
  );

  const statusBox = (icon, text, tone = "default", spin = false) => {
    const tones = {
      default: { bg: "var(--t-raised)", ink: "var(--t-muted)", border: "var(--t-line)" },
      warn: { bg: "rgba(240,161,58,0.12)", ink: "#f0a13a", border: "rgba(240,161,58,0.3)" },
      danger: { bg: "var(--t-danger-soft)", ink: "var(--t-danger)", border: "rgba(255,106,117,0.3)" },
    };
    const c = tones[tone] || tones.default;
    return (
      <div
        className="flex-1 min-w-0 flex items-center gap-1.5 px-3 py-2 rounded-[10px] border text-xs"
        style={{ background: c.bg, borderColor: c.border, color: c.ink }}
      >
        <span className={`material-symbols-outlined text-[13px] shrink-0 ${spin ? "animate-spin" : ""}`}>{icon}</span>
        <span className="truncate">{text}</span>
      </div>
    );
  };

  let content, actions;

  if (isActive) {
    content = (
      <input value={`${activeUrl}/v1`} readOnly className="an-input flex-1 min-w-0 py-1.5 text-xs truncate" />
    );
    actions = (
      <>
        {iconBtn(() => copy(`${activeUrl}/v1`, "domain_url"),
          copied === "domain_url" ? "check" : "content_copy", "Copy URL")}
        <a href={activeUrl} target="_blank" rel="noopener noreferrer" title="Open" aria-label="Open domain"
          className="an-btn an-ghost h-9 w-9 px-0 shrink-0">
          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
        </a>
        {offBtn(onDisable, "Disable & delete domain")}
      </>
    );
  } else if (isWaiting) {
    content = statusBox("progress_activity",
      tunnelEverReachable ? "Reconnecting…" : "Checking domain…", "warn", true);
    actions = offBtn(onDisable, "Disable & delete domain");
  } else if (tunnelLoading) {
    content = statusBox("progress_activity",
      tunnelProgress || "Generating domain…", "default", true);
    actions = offBtn(onCancelLoading, "Cancel");
  } else if (isError) {
    content = statusBox("error_outline", tunnelStatus.message, "danger");
    actions = <Button skin="antares" size="sm" icon="refresh" onClick={onGenerate}>Retry</Button>;
  } else if (tunnelChecking) {
    content = statusBox("progress_activity", "Checking…", "default", true);
    actions = offBtn(onCancelChecking, "Cancel");
  } else {
    content = statusBox("public", "Free public domain · *.toolwiz.id", "default");
    actions = (
      <Button skin="antares" size="sm" icon="add_link" onClick={() => {
        if (isLoginUnsafe) { addNotification({ type: "error", title: "Security Required", message: unsafeReason }); return; }
        if (!requireApiKey) { addNotification({ type: "warning", title: "Security Required", message: "Enable \"Require API key\" before activating the domain." }); return; }
        onGenerate();
      }}>
        Generate
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className={`an-chip self-start ${tunnelEnabled ? "accent" : ""}`}>Domain</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {content}
        <div className="flex items-center gap-1 shrink-0">{actions}</div>
      </div>
    </div>
  );
}
