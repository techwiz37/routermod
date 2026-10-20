"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { Tooltip } from "@/shared/components";
import AntaresSwitch from "@/shared/components/AntaresSwitch";
import CooldownTimer from "./CooldownTimer";

export default function ConnectionRow({ connection, proxyPools, isOAuth, isFirst, isLast, onMoveUp, onMoveDown, onToggleActive, onUpdateProxy, onEdit, onDelete, oneByOneStatus = null, autoPing = null }) {
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [updatingProxy, setUpdatingProxy] = useState(false);
  const proxyDropdownRef = useRef(null);
  const proxyBtnRef = useRef(null);
  const [proxyDropdownStyle, setProxyDropdownStyle] = useState(null);

  const proxyPoolMap = new Map((proxyPools || []).map((pool) => [pool.id, pool]));
  const boundProxyPoolId = connection.providerSpecificData?.proxyPoolId || null;
  const boundProxyPool = boundProxyPoolId ? proxyPoolMap.get(boundProxyPoolId) : null;
  const hasLegacyProxy = connection.providerSpecificData?.connectionProxyEnabled === true && !!connection.providerSpecificData?.connectionProxyUrl;
  const hasAnyProxy = !!boundProxyPoolId || hasLegacyProxy;
  const proxyDisplayText = boundProxyPool
    ? `Pool: ${boundProxyPool.name}`
    : boundProxyPoolId
      ? `Pool: ${boundProxyPoolId} (inactive/missing)`
      : hasLegacyProxy
        ? `Legacy: ${connection.providerSpecificData?.connectionProxyUrl}`
        : "";
  const autoPingTooltip = (() => {
    if (!autoPing) return "";
    const activeModes = [];
    if (autoPing.reactiveOn) activeModes.push("On reset");
    if (autoPing.scheduleOn) activeModes.push(`Scheduled (${autoPing.scheduleSummary || "active"})`);
    if (activeModes.length > 0) {
      return `Auto-ping active: ${activeModes.join(" + ")}. Click to configure.`;
    }
    return autoPing.provider === "codex"
      ? "Auto-starts the next 5h Codex window after reset or on schedule. Click to configure."
      : "Auto-starts a new window on quota reset or fixed schedule. Click to configure.";
  })();

  let maskedProxyUrl = "";
  if (boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl) {
    const rawProxyUrl = boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl;
    try {
      const parsed = new URL(rawProxyUrl);
      maskedProxyUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    } catch {
      maskedProxyUrl = rawProxyUrl;
    }
  }

  const noProxyText = boundProxyPool?.noProxy || connection.providerSpecificData?.connectionNoProxy || "";

  let proxyBadgeVariant = "default";
  if (boundProxyPool?.isActive === true) {
    proxyBadgeVariant = "success";
  } else if (boundProxyPoolId || hasLegacyProxy) {
    proxyBadgeVariant = "error";
  }

  // Render via portal + fixed positioning so ancestor overflow (scrollable
  // connections list) can't clip the dropdown
  const toggleProxyDropdown = () => {
    if (showProxyDropdown) {
      setShowProxyDropdown(false);
      return;
    }
    const rect = proxyBtnRef.current?.getBoundingClientRect();
    if (!rect) {
      setShowProxyDropdown(true);
      return;
    }
    const estimatedHeight = ((proxyPools?.length || 0) + 1) * 34 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    setProxyDropdownStyle({
      position: "fixed",
      right: window.innerWidth - rect.right,
      ...(flipUp
        ? { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.max(rect.top - 8, 120) }
        : { top: rect.bottom + 4, maxHeight: Math.max(spaceBelow - 8, 120) }),
    });
    setShowProxyDropdown(true);
  };

  // Close dropdown when clicking outside, scrolling, or resizing
  useEffect(() => {
    if (!showProxyDropdown) return;
    const handleClick = (e) => {
      if (
        proxyDropdownRef.current?.contains(e.target) ||
        proxyBtnRef.current?.contains(e.target)
      ) return;
      setShowProxyDropdown(false);
    };
    const close = () => setShowProxyDropdown(false);
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [showProxyDropdown]);

  const handleSelectProxy = async (poolId) => {
    setUpdatingProxy(true);
    try {
      await onUpdateProxy(poolId === "__none__" ? null : poolId);
    } finally {
      setUpdatingProxy(false);
      setShowProxyDropdown(false);
    }
  };

  const rowAuthType = connection.authType || (isOAuth ? "oauth" : "apikey");
  const isOAuthConnection = rowAuthType === "oauth";
  const isCookieConnection = rowAuthType === "cookie";
  const authIcon = isCookieConnection ? "cookie" : isOAuthConnection ? "lock" : "key";
  const authLabel = isOAuthConnection ? "OAuth" : isCookieConnection ? "Cookie" : "API Key";
  const displayName = connection.name?.trim()
    || connection.email?.trim()
    || connection.displayName?.trim()
    || (isOAuthConnection ? "OAuth Account" : isCookieConnection ? "Cookie Account" : "API Key");
  const secondaryDisplayName = connection.name?.trim() && connection.email?.trim() && connection.name.trim() !== connection.email.trim()
    ? connection.email.trim()
    : connection.name?.trim() && connection.displayName?.trim() && connection.name.trim() !== connection.displayName.trim()
      ? connection.displayName.trim()
      : null;

  const [isCooldown, setIsCooldown] = useState(false);

  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_"))
    .map(([, v]) => v)
    .filter(v => !!v)
    .sort()[0] || null;

  useEffect(() => {
    const checkCooldown = () => {
      const until = Object.entries(connection)
        .filter(([k]) => k.startsWith("modelLock_"))
        .map(([, v]) => v)
        .filter(v => v && new Date(v).getTime() > Date.now())
        .sort()[0] || null;
      setIsCooldown(!!until);
    };

    checkCooldown();
    const interval = modelLockUntil ? setInterval(checkCooldown, 1000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [modelLockUntil]);

  const effectiveStatus = (connection.testStatus === "unavailable" && !isCooldown)
    ? "active"  // Cooldown expired u2192 treat as active
    : connection.testStatus;

  // Antares chip style for the connection state.
  const statusLabel =
    connection.isActive === false
      ? "Off"
      : effectiveStatus === "active" || effectiveStatus === "success"
        ? "Active"
        : effectiveStatus === "unavailable"
          ? "Unavailable"
          : effectiveStatus === "expired"
            ? "Expired"
            : effectiveStatus || "Unknown";
  const statusChipClass =
    connection.isActive === false
      ? ""
      : effectiveStatus === "active" || effectiveStatus === "success"
        ? "ok"
        : effectiveStatus === "unavailable" || effectiveStatus === "expired"
          ? "danger"
          : "";
  const statusDotClass =
    connection.isActive === false
      ? "bg-[var(--t-dim)]"
      : effectiveStatus === "active" || effectiveStatus === "success"
        ? "bg-[var(--t-ok)]"
        : effectiveStatus === "unavailable" || effectiveStatus === "expired"
          ? "bg-[var(--t-danger)]"
          : "bg-[var(--t-dim)]";

  const oneByOneChipClass =
    oneByOneStatus?.state === "success"
      ? "ok"
      : oneByOneStatus?.state === "failed"
        ? "danger"
        : oneByOneStatus?.state === "testing"
          ? "accent"
          : "";

  const getOneByOneLabel = () => {
    if (!oneByOneStatus) return null;
    if (oneByOneStatus.state === "queued") return "queued";
    if (oneByOneStatus.state === "testing") return "testing";
    if (oneByOneStatus.state === "success") return "success";
    if (oneByOneStatus.state === "failed") return oneByOneStatus.error ? `failed: ${oneByOneStatus.error}` : "failed";
    return null;
  };

  return (
    <div className={`an-conn ${connection.isActive === false ? "is-off" : ""}`}>
      <div className="an-conn-main">
        {/* Priority arrows */}
        <div className="an-conn-prio">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move up"
            aria-label="Move up"
          >
            <span className="material-symbols-outlined">keyboard_arrow_up</span>
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            title="Move down"
            aria-label="Move down"
          >
            <span className="material-symbols-outlined">keyboard_arrow_down</span>
          </button>
        </div>

        <span className="an-conn-ico" aria-hidden>
          <span className="material-symbols-outlined">{authIcon}</span>
        </span>

        <div className="an-conn-id">
          <p className="an-conn-name" title={displayName}>
            {displayName}
          </p>
          {secondaryDisplayName && (
            <p className="an-conn-sub" title={secondaryDisplayName}>
              {secondaryDisplayName}
            </p>
          )}
          <div className="an-conn-chips">
            <span className={`an-chip ${statusChipClass}`}>
              <span className={`size-1.5 rounded-full shrink-0 ${statusDotClass}`} />
              {statusLabel}
            </span>
            <span className="an-chip">{authLabel}</span>
            {hasAnyProxy && (
              <span className={`an-chip ${proxyBadgeVariant === "success" ? "ok" : proxyBadgeVariant === "error" ? "danger" : ""}`}>
                Proxy
              </span>
            )}
            {isCooldown && connection.isActive !== false && <CooldownTimer until={modelLockUntil} />}
            {connection.lastError && connection.isActive !== false && (
              <span className="an-conn-meta !text-[var(--t-danger)]" title={connection.lastError}>
                {connection.lastError}
              </span>
            )}
            <span className="an-conn-meta">#{connection.priority}</span>
            {connection.globalPriority && (
              <span className="an-conn-meta">Auto: {connection.globalPriority}</span>
            )}
            {getOneByOneLabel() && (
              <span className={`an-chip ${oneByOneChipClass}`}>{getOneByOneLabel()}</span>
            )}
          </div>
          {hasAnyProxy && (
            <div className="an-conn-chips !mt-1.5">
              <span className="an-conn-meta" title={proxyDisplayText}>
                {proxyDisplayText}
              </span>
              {maskedProxyUrl && (
                <code className="an-conn-meta !text-[var(--t-muted)]" title={maskedProxyUrl}>
                  {maskedProxyUrl}
                </code>
              )}
              {noProxyText && (
                <span className="an-conn-meta" title={noProxyText}>
                  no_proxy: {noProxyText}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="an-conn-actions">
        {/* Proxy button with inline dropdown */}
        {(proxyPools || []).length > 0 && (
          <div className="relative">
            <button
              ref={proxyBtnRef}
              onClick={toggleProxyDropdown}
              className="an-conn-btn"
              title={hasAnyProxy ? proxyDisplayText : "Set proxy"}
              aria-label="Proxy"
              disabled={updatingProxy}
            >
              <span className="material-symbols-outlined">
                {updatingProxy ? "progress_activity" : "lan"}
              </span>
            </button>
            {showProxyDropdown && createPortal(
              <div
                ref={proxyDropdownRef}
                style={proxyDropdownStyle}
                className="an-panel z-[60] max-w-[78vw] min-w-[160px] overflow-y-auto !rounded-[10px] py-1"
              >
                <button
                  onClick={() => handleSelectProxy("__none__")}
                  className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-[var(--t-raised)] ${!boundProxyPoolId ? "text-[var(--t-star-ink)] font-medium" : "text-[var(--t-ink)]"}`}
                >
                  None
                </button>
                {(proxyPools || []).map((pool) => (
                  <button
                    key={pool.id}
                    onClick={() => handleSelectProxy(pool.id)}
                    className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-[var(--t-raised)] ${boundProxyPoolId === pool.id ? "text-[var(--t-star-ink)] font-medium" : "text-[var(--t-ink)]"}`}
                  >
                    {pool.name}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
        )}
        {autoPing && (
          <Tooltip text={autoPingTooltip}>
            <button
              onClick={() => autoPing.onConfigure()}
              className="an-conn-btn"
              title={autoPingTooltip}
              aria-label="Auto-ping"
            >
              <span className="material-symbols-outlined">bolt</span>
            </button>
          </Tooltip>
        )}
        <button onClick={onEdit} className="an-conn-btn" title="Edit" aria-label="Edit">
          <span className="material-symbols-outlined">edit</span>
        </button>
        <button onClick={onDelete} className="an-conn-btn danger" title="Delete" aria-label="Delete">
          <span className="material-symbols-outlined">delete</span>
        </button>
        <AntaresSwitch
          on={connection.isActive ?? true}
          onChange={onToggleActive}
          label={(connection.isActive ?? true) ? "On" : "Off"}
          title={(connection.isActive ?? true) ? "Disable connection" : "Enable connection"}
          ariaLabel="Toggle connection"
        />
      </div>
    </div>
  );
}

ConnectionRow.propTypes = {
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    displayName: PropTypes.string,
    modelLockUntil: PropTypes.string,
    testStatus: PropTypes.string,
    isActive: PropTypes.bool,
    lastError: PropTypes.string,
    priority: PropTypes.number,
    globalPriority: PropTypes.number,
  }).isRequired,
  proxyPools: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    proxyUrl: PropTypes.string,
    noProxy: PropTypes.string,
    isActive: PropTypes.bool,
  })),
  isOAuth: PropTypes.bool.isRequired,
  isFirst: PropTypes.bool.isRequired,
  isLast: PropTypes.bool.isRequired,
  onMoveUp: PropTypes.func.isRequired,
  onMoveDown: PropTypes.func.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  onUpdateProxy: PropTypes.func,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  oneByOneStatus: PropTypes.shape({
    state: PropTypes.string,
    error: PropTypes.string,
  }),
  autoPing: PropTypes.shape({
    isActive: PropTypes.bool,
    provider: PropTypes.string,
    reactiveOn: PropTypes.bool,
    scheduleOn: PropTypes.bool,
    scheduleSummary: PropTypes.string,
    onConfigure: PropTypes.func,
  }),
};
