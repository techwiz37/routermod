"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getStatusVariant as getConnectionStatusVariant } from "@/shared/utils/connectionStatus";
import PropTypes from "prop-types";
import { Badge, Button, EditConnectionModal, ConfirmModal } from "@/shared/components";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresSwitch from "@/shared/components/AntaresSwitch";
import AntaresModal from "@/shared/components/AntaresModal";
import AntaresSelect from "@/shared/components/AntaresSelect";
import { translate } from "@/i18n/runtime";
import { useNotificationStore } from "@/store/notificationStore";

function CooldownTimer({ until }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(until).getTime() - Date.now();
      if (diff <= 0) { setRemaining(""); return; }
      const s = Math.floor(diff / 1000);
      if (s < 60) setRemaining(`${s}s`);
      else if (s < 3600) setRemaining(`${Math.floor(s / 60)}m ${s % 60}s`);
      else setRemaining(`${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [until]);

  if (!remaining) return null;
  return <span className="text-xs text-orange-500 font-mono">⏱ {remaining}</span>;
}

CooldownTimer.propTypes = { until: PropTypes.string.isRequired };

function ConnectionRow({ connection, proxyPools, isOAuth, isFirst, isLast, onMoveUp, onMoveDown, onToggleActive, onUpdateProxy, onEdit, onDelete }) {
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [updatingProxy, setUpdatingProxy] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const proxyDropdownRef = useRef(null);

  const proxyPoolMap = new Map((proxyPools || []).map((p) => [p.id, p]));
  const boundProxyPoolId = connection.providerSpecificData?.proxyPoolId || null;
  const boundProxyPool = boundProxyPoolId ? proxyPoolMap.get(boundProxyPoolId) : null;
  const hasLegacyProxy = connection.providerSpecificData?.connectionProxyEnabled === true && !!connection.providerSpecificData?.connectionProxyUrl;
  const hasAnyProxy = !!boundProxyPoolId || hasLegacyProxy;

  const proxyDisplayText = boundProxyPool
    ? `Pool: ${boundProxyPool.name}`
    : boundProxyPoolId ? `Pool: ${boundProxyPoolId} (inactive/missing)`
    : hasLegacyProxy ? `Legacy: ${connection.providerSpecificData?.connectionProxyUrl}` : "";

  let maskedProxyUrl = "";
  const rawProxyUrl = boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl;
  if (rawProxyUrl) {
    try {
      const p = new URL(rawProxyUrl);
      maskedProxyUrl = `${p.protocol}//${p.hostname}${p.port ? `:${p.port}` : ""}`;
    } catch { maskedProxyUrl = rawProxyUrl; }
  }

  const noProxyText = boundProxyPool?.noProxy || connection.providerSpecificData?.connectionNoProxy || "";
  const proxyBadgeVariant = boundProxyPool?.isActive === true ? "success" : (boundProxyPoolId || hasLegacyProxy) ? "error" : "default";

  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_"))
    .map(([, v]) => v).filter(Boolean).sort()[0] || null;

  useEffect(() => {
    const check = () => {
      const until = Object.entries(connection)
        .filter(([k]) => k.startsWith("modelLock_"))
        .map(([, v]) => v).filter(v => v && new Date(v).getTime() > Date.now()).sort()[0] || null;
      setIsCooldown(!!until);
    };
    check();
    const t = modelLockUntil ? setInterval(check, 1000) : null;
    return () => { if (t) clearInterval(t); };
  }, [modelLockUntil]);

  useEffect(() => {
    if (!showProxyDropdown) return;
    const handler = (e) => {
      if (proxyDropdownRef.current && !proxyDropdownRef.current.contains(e.target))
        setShowProxyDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProxyDropdown]);

  const effectiveStatus = connection.testStatus === "unavailable" && !isCooldown ? "active" : connection.testStatus;

  const getStatusVariant = () => getConnectionStatusVariant(connection.isActive, effectiveStatus);

  const displayName = isOAuth
    ? connection.name || connection.email || connection.displayName || "OAuth Account"
    : connection.name;

  const handleSelectProxy = async (poolId) => {
    setUpdatingProxy(true);
    try { await onUpdateProxy(poolId === "__none__" ? null : poolId); }
    finally { setUpdatingProxy(false); setShowProxyDropdown(false); }
  };

  const showConnectionError = () => {
    addNotification({
      type: "error",
      title: translate("Connection error"),
      message: connection.lastError,
      duration: 8000,
    });
  };

  const statusLabel = connection.isActive === false ? "Off" : (effectiveStatus || "Unknown");
  const statusChipClass = connection.isActive === false
    ? "danger"
    : effectiveStatus === "active" || effectiveStatus === "success"
      ? "ok"
      : effectiveStatus === "unavailable" || effectiveStatus === "expired"
        ? "danger"
        : "";
  const chipVariantClass = (variant) => variant === "success" ? "ok" : variant === "error" ? "danger" : "";

  return (
    <div className={`an-conn ${connection.isActive === false ? "is-off" : ""}`}>
      <div className="an-conn-main">
        <div className="an-conn-prio">
          <button onClick={onMoveUp} disabled={isFirst} title={translate("Move up")} aria-label={translate("Move up")}>
            <span className="material-symbols-outlined">keyboard_arrow_up</span>
          </button>
          <button onClick={onMoveDown} disabled={isLast} title={translate("Move down")} aria-label={translate("Move down")}>
            <span className="material-symbols-outlined">keyboard_arrow_down</span>
          </button>
        </div>

        <span className="an-conn-ico" aria-hidden>
          <span className="material-symbols-outlined">{isOAuth ? "lock" : "key"}</span>
        </span>

        <div className="an-conn-id">
          <p className="an-conn-name" title={displayName}>{displayName}</p>
          <div className="an-conn-chips">
            <span className={`an-chip ${statusChipClass}`}>
              <span className="size-1.5 rounded-full shrink-0 bg-current" />
              {statusLabel}
            </span>
            <span className="an-chip">{isOAuth ? "OAuth" : "API Key"}</span>
            <span className="an-conn-meta">#{connection.priority}</span>
            {hasAnyProxy && <span className={`an-chip ${chipVariantClass(proxyBadgeVariant)}`}>Proxy</span>}
            {isCooldown && connection.isActive !== false && <CooldownTimer until={modelLockUntil} />}
            {connection.lastError && connection.isActive !== false && (
              <button
                type="button"
                onClick={showConnectionError}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--t-star-ink)] transition-colors hover:bg-[var(--t-accent-soft)]"
                title={translate("Show connection error")}
                aria-label={translate("Show connection error")}
              >
                <span className="material-symbols-outlined text-[15px]">error</span>
              </button>
            )}
          </div>
          {hasAnyProxy && (
            <div className="an-conn-chips !mt-1.5">
              <span className="an-conn-meta" title={proxyDisplayText}>{proxyDisplayText}</span>
              {maskedProxyUrl && <code className="an-conn-meta" title={maskedProxyUrl}>{maskedProxyUrl}</code>}
              {noProxyText && <span className="an-conn-meta" title={noProxyText}>no_proxy: {noProxyText}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="an-conn-actions">
        {(proxyPools || []).length > 0 && (
          <div className="relative" ref={proxyDropdownRef}>
            <button
              onClick={() => setShowProxyDropdown((v) => !v)}
              className="an-conn-btn"
              title={hasAnyProxy ? proxyDisplayText : translate("Set proxy")}
              aria-label={translate("Proxy")}
              disabled={updatingProxy}
            >
              <span className="material-symbols-outlined">{updatingProxy ? "progress_activity" : "lan"}</span>
            </button>
            {showProxyDropdown && (
              <div className="an-panel absolute right-0 top-full z-[60] mt-1 max-h-[240px] min-w-[170px] max-w-[80vw] overflow-y-auto !rounded-[10px] py-1">
                <button onClick={() => handleSelectProxy("__none__")} className={`w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--t-raised)] ${!boundProxyPoolId ? "text-[var(--t-star-ink)] font-medium" : "text-[var(--t-ink)]"}`}>
                  None
                </button>
                {(proxyPools || []).map((pool) => (
                  <button key={pool.id} onClick={() => handleSelectProxy(pool.id)} className={`w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--t-raised)] ${boundProxyPoolId === pool.id ? "text-[var(--t-star-ink)] font-medium" : "text-[var(--t-ink)]"}`}>
                    {pool.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={onEdit} className="an-conn-btn" title={translate("Edit")} aria-label={translate("Edit")}>
          <span className="material-symbols-outlined">edit</span>
        </button>
        <button onClick={onDelete} className="an-conn-btn danger" title={translate("Delete")} aria-label={translate("Delete")}>
          <span className="material-symbols-outlined">delete</span>
        </button>
        <AntaresSwitch
          on={connection.isActive ?? true}
          onChange={onToggleActive}
          ariaLabel={translate("Toggle connection")}
          title={(connection.isActive ?? true) ? translate("Disable") : translate("Enable")}
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
    testStatus: PropTypes.string,
    isActive: PropTypes.bool,
    lastError: PropTypes.string,
    priority: PropTypes.number,
  }).isRequired,
  proxyPools: PropTypes.array,
  isOAuth: PropTypes.bool.isRequired,
  isFirst: PropTypes.bool.isRequired,
  isLast: PropTypes.bool.isRequired,
  onMoveUp: PropTypes.func.isRequired,
  onMoveDown: PropTypes.func.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  onUpdateProxy: PropTypes.func,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

function AddApiKeyModal({ isOpen, provider, providerName, proxyPools, onSave, onClose }) {
  const NONE = "__none__";
  const [formData, setFormData] = useState({ name: "", apiKey: "", priority: 1, proxyPoolId: NONE });
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: formData.apiKey }),
      });
      const data = await res.json();
      setValidationResult(data.valid ? "success" : "failed");
    } catch { setValidationResult("failed"); }
    finally { setValidating(false); }
  };

  const handleSubmit = async () => {
    if (!provider || !formData.apiKey) return;
    setSaving(true);
    try {
      let isValid = false;
      try {
        setValidating(true); setValidationResult(null);
        const res = await fetch("/api/providers/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey: formData.apiKey }),
        });
        const data = await res.json();
        isValid = !!data.valid;
        setValidationResult(isValid ? "success" : "failed");
      } catch { setValidationResult("failed"); }
      finally { setValidating(false); }
      await onSave({
        name: formData.name,
        apiKey: formData.apiKey,
        priority: formData.priority,
        proxyPoolId: formData.proxyPoolId === NONE ? null : formData.proxyPoolId,
        testStatus: isValid ? "active" : "unknown",
      });
    } finally { setSaving(false); }
  };

  if (!provider) return null;

  return (
    <AntaresModal
      isOpen={isOpen}
      title={`Add ${providerName || provider} API Key`}
      subtitle={translate("Add a credential for this provider")}
      size="lg"
      hideScrollbar
      onClose={onClose}
      footer={
        <div className="flex w-full gap-2">
          <Button skin="antares" onClick={handleSubmit} fullWidth disabled={!formData.name || !formData.apiKey || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button skin="antares" variant="ghost" onClick={onClose} fullWidth>Cancel</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-text-muted mb-1 block">Name</label>
          <input className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Production Key" />
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="text-xs text-text-muted mb-1 block">API Key</label>
            <input type="password" className="w-full h-[42px] px-3 text-[16px] sm:text-sm border border-[var(--t-line)] rounded-[10px] bg-[var(--t-field)] text-[var(--t-ink)] placeholder:text-[var(--t-dim)] focus:outline-none focus:border-[var(--t-accent)]" value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} />
          </div>
          <Button onClick={handleValidate} disabled={!formData.apiKey || validating || saving} variant="secondary" className="!h-[42px] shrink-0">
            {validating ? "Checking..." : "Check"}
          </Button>
        </div>
        {validationResult && (
          <Badge variant={validationResult === "success" ? "success" : "error"}>
            {validationResult === "success" ? "Valid" : "Invalid"}
          </Badge>
        )}
        <div>
          <label className="text-xs text-text-muted mb-1 block">Priority</label>
          <input type="number" className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value) || 1 })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted">{translate("Proxy Pool")}</label>
          <AntaresSelect
            value={formData.proxyPoolId}
            onChange={(e) => setFormData({ ...formData, proxyPoolId: e.target.value })}
            ariaLabel={translate("Proxy Pool")}
            portal
            placement="top"
            maxVisible={5}
            buttonClassName="h-[42px] font-mono"
            options={[{ value: NONE, label: translate("None") }, ...(proxyPools || []).map((p) => ({ value: p.id, label: p.name }))]}
            placeholder={translate("None")}
          />
        </div>
      </div>
    </AntaresModal>
  );
}

AddApiKeyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  provider: PropTypes.string,
  providerName: PropTypes.string,
  proxyPools: PropTypes.array,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default function ConnectionsCard({ providerId, isOAuth }) {
  const [connections, setConnections] = useState([]);
  const [proxyPools, setProxyPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [providerStrategy, setProviderStrategy] = useState(null);
  const [providerStickyLimit, setProviderStickyLimit] = useState("1");
  const [confirmState, setConfirmState] = useState(null);

  const fetch_ = useCallback(async () => {
    try {
      const [connRes, proxyRes, settingsRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/proxy-pools?isActive=true", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      const connData = await connRes.json();
      const proxyData = await proxyRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      if (connRes.ok) setConnections((connData.connections || []).filter((c) => c.provider === providerId));
      if (proxyRes.ok) setProxyPools(proxyData.proxyPools || []);
      const override = (settingsData.providerStrategies || {})[providerId] || {};
      setProviderStrategy(override.fallbackStrategy || null);
      setProviderStickyLimit(override.stickyRoundRobinLimit != null ? String(override.stickyRoundRobinLimit) : "1");
    } catch (e) { console.log("ConnectionsCard fetch error:", e); }
    finally { setLoading(false); }
  }, [providerId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const saveStrategy = async (strategy, stickyLimit) => {
    try {
      const res = await fetch("/api/providers/strategy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          strategy,
          stickyRoundRobinLimit: strategy === "round-robin" ? Number(stickyLimit) || 1 : undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) { console.log("saveStrategy error:", e); }
  };

  const handleSwapPriority = async (i1, i2) => {
    const next = [...connections];
    [next[i1], next[i2]] = [next[i2], next[i1]];
    setConnections(next);
    try {
      await Promise.all([
        fetch(`/api/providers/${next[i1].id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priority: i1 }) }),
        fetch(`/api/providers/${next[i2].id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priority: i2 }) }),
      ]);
    } catch { await fetch_(); }
  };

  const handleDelete = async (id) => {
    setConfirmState({
      title: "Delete Connection",
      message: "Delete this connection?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
          if (res.ok) setConnections((prev) => prev.filter((c) => c.id !== id));
        } catch (e) { console.log("delete error:", e); }
      }
    });
  };

  const handleToggleActive = async (id, isActive) => {
    try {
      const res = await fetch(`/api/providers/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }) });
      if (res.ok) setConnections((prev) => prev.map((c) => c.id === id ? { ...c, isActive } : c));
    } catch (e) { console.log("toggle error:", e); }
  };

  const handleUpdateProxy = async (connId, proxyPoolId) => {
    try {
      const res = await fetch(`/api/providers/${connId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proxyPoolId: proxyPoolId || null }) });
      if (res.ok) setConnections((prev) => prev.map((c) => c.id === connId ? { ...c, providerSpecificData: { ...c.providerSpecificData, proxyPoolId: proxyPoolId || null } } : c));
    } catch (e) { console.log("proxy error:", e); }
  };

  const handleSaveApiKey = async (formData) => {
    try {
      const res = await fetch("/api/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: providerId, ...formData }) });
      if (res.ok) { await fetch_(); setShowAddModal(false); }
    } catch (e) { console.log("save apikey error:", e); }
  };

  const handleUpdateConnection = async (formData) => {
    try {
      const res = await fetch(`/api/providers/${selectedConnection.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) });
      if (res.ok) { await fetch_(); setShowEditModal(false); }
    } catch (e) { console.log("update connection error:", e); }
  };

  if (loading) return <AntaresPanel><div className="h-20 animate-pulse rounded-[10px] bg-[var(--t-raised)]" /></AntaresPanel>;

  return (
    <>
      <AntaresPanel
        icon="hub"
        title={translate("Connections")}
        subtitle={translate("Manage accounts and proxies for this provider")}
        headClassName="an-connections-head"
        action={<span className="an-chip">{connections.length} {translate("connections")}</span>}
        bodyClassName="!p-0"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--t-line-soft)] px-3 py-2.5 sm:px-5 sm:py-3">
          <AntaresSwitch
            on={providerStrategy === "round-robin"}
            label={translate("Round Robin")}
            ariaLabel={translate("Round Robin")}
            onChange={(enabled) => {
              const strategy = enabled ? "round-robin" : null;
              const sticky = enabled ? (Number(providerStickyLimit) > 0 ? providerStickyLimit : "1") : undefined;
              if (enabled) setProviderStickyLimit(String(sticky));
              setProviderStrategy(strategy);
              saveStrategy(strategy, sticky);
            }}
          />
          {providerStrategy === "round-robin" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--t-muted)]">{translate("Sticky:")}</span>
              <input
                type="number"
                min={1}
                value={providerStickyLimit}
                onChange={(e) => {
                  const value = e.target.value;
                  setProviderStickyLimit(value);
                  const n = Number(value);
                  // Ignore empty/invalid intermediate values while typing.
                  if (Number.isInteger(n) && n > 0) saveStrategy("round-robin", n);
                }}
                className="h-6 w-12 rounded-[6px] border border-[var(--t-line)] bg-[var(--t-raised)] px-1.5 text-center font-mono text-[11px] text-[var(--t-ink)] focus:border-[var(--t-accent)] focus:outline-none"
              />
            </div>
          )}
        </div>

        {connections.length === 0 ? (
          <div className="flex flex-col gap-3 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-3">
              <div className="an-conn-ico shrink-0">
                <span className="material-symbols-outlined">{isOAuth ? "lock" : "key"}</span>
              </div>
              <p className="text-[13px] text-[var(--t-ink)]">{translate("No connections yet")}</p>
            </div>
            <Button skin="antares" size="sm" icon="add" onClick={() => setShowAddModal(true)}>{translate("Add Connection")}</Button>
          </div>
        ) : (
          <div className="px-3 py-3 sm:px-4">
            <div className="an-conn-list scrollbar-none max-h-[600px] overflow-y-auto pr-0.5">
              {connections.map((conn, idx) => (
                <ConnectionRow
                  key={conn.id}
                  connection={conn}
                  proxyPools={proxyPools}
                  isOAuth={isOAuth}
                  isFirst={idx === 0}
                  isLast={idx === connections.length - 1}
                  onMoveUp={() => handleSwapPriority(idx, idx - 1)}
                  onMoveDown={() => handleSwapPriority(idx, idx + 1)}
                  onToggleActive={(isActive) => handleToggleActive(conn.id, isActive)}
                  onUpdateProxy={(poolId) => handleUpdateProxy(conn.id, poolId)}
                  onEdit={() => { setSelectedConnection(conn); setShowEditModal(true); }}
                  onDelete={() => handleDelete(conn.id)}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button skin="antares" size="sm" icon="add" onClick={() => setShowAddModal(true)}>{translate("Add Connection")}</Button>
            </div>
          </div>
        )}
      </AntaresPanel>

      <AddApiKeyModal
        isOpen={showAddModal}
        provider={providerId}
        proxyPools={proxyPools}
        onSave={handleSaveApiKey}
        onClose={() => setShowAddModal(false)}
      />
      <EditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        proxyPools={proxyPools}
        onSave={handleUpdateConnection}
        onClose={() => setShowEditModal(false)}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </>
  );
}

ConnectionsCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  isOAuth: PropTypes.bool,
};
