"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import KeyDashboardLayout from "../KeyDashboardLayout";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresNotice from "@/shared/components/AntaresNotice";
import Input from "@/shared/components/Input";
import StarField from "@/shared/components/StarField";
import { PagePendingMarker, usePageReady } from "@/shared/components/PageReadyContext";
import { onLocaleChange, translate } from "@/i18n/runtime";
import { CUSTOM_API_KEY_HELP, customApiKeyError } from "@/shared/utils/customApiKey.js";

// Same Antares surfaces/type as admin. ENERGY 1 / RHYTHM 1 / MOTION 1.
// A single form keeps the secret replacement and its consequences together.
export default function ManageKeysPage() {
  const router = useRouter();
  const [key, setKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [newKey, setNewKey] = useState("");
  const [confirmKey, setConfirmKey] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [, setLocaleVersion] = useState(0);

  // The app-wide preloader covers the first fetch; no inline loading panel, so
  // the rendered key data appears in one step instead of flashing twice.
  usePageReady(loading);

  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/public/key-dashboard?period=7d", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (response.status === 401) { router.replace("/login-key"); return; }
        if (!response.ok) throw new Error(data.error || translate("Could not load key information."));
        setKey(data.key);
      } catch (loadError) {
        if (!controller.signal.aborted) setLoadError(loadError.message || translate("Could not load key information."));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [router, retry]);

  async function logout() {
    await fetch("/api/public/key-dashboard", { method: "DELETE", cache: "no-store" }).catch(() => {});
    router.replace("/login-key");
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSuccess("");
    const validation = customApiKeyError(newKey);
    if (validation) { setError(translate(validation)); return; }
    if (newKey !== confirmKey) { setError(translate("API key confirmation does not match.")); return; }
    if (!acknowledged) { setError(translate("Confirm that you will update the key in client applications.")); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/public/key-dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newKey }),
        cache: "no-store",
      });
      const data = await response.json();
      if (response.status === 401) { router.replace("/login-key"); return; }
      if (!response.ok) throw new Error(data.error || translate("Could not change the API key."));
      setKey(data.key);
      setNewKey("");
      setConfirmKey("");
      setAcknowledged(false);
      setSuccess(translate("API key updated. The old key is no longer valid. Update it in your applications; this dashboard session already uses the new key."));
    } catch (error) {
      setError(error.message || translate("Could not change the API key. Check the connection and try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyDashboardLayout onLogout={logout}>
      <div className="an-scope an-shell key-dashboard-page">
        <div className="an-shell-bg" aria-hidden="true"><StarField /></div>
        <PagePendingMarker active={loading} />
        <div className="key-dashboard-main">
        <header className="key-dashboard-title-row">
          <div className="key-dashboard-title-copy">
            <p className="an-eyebrow"><span className="an-num">02</span><span className="an-rule" /><span>{translate("Personal key settings")}</span></p>
            <h1 className="an-h1">{translate("Manage Keys")}</h1>
            <p className="key-dashboard-key-name">{translate("Change the API key value you use to sign in.")}</p>
          </div>
        </header>
        {loading ? null : loadError ? (
          <section className="an-panel key-dashboard-error" role="alert">
            <p>{loadError}</p>
            <AntaresButton variant="ghost" onClick={() => setRetry((value) => value + 1)}>{translate("Retry")}</AntaresButton>
          </section>
        ) : !key ? <section className="an-panel key-dashboard-panel">{translate("No active key to manage.")}</section> : (
          <AntaresPanel className="key-manage-panel" icon="key" title={translate("Custom API key")} subtitle={translate("Only this session's key can be changed. Permissions, limits and expiry follow admin settings.")} aria-label={translate("Custom API key")}>
            <dl className="key-manage-current">
              <div className="key-manage-current-tile"><dt>{translate("Key name")}</dt><dd>{key.name || translate("API key")}</dd></div>
              <div className="key-manage-current-tile"><dt>{translate("Current key")}</dt><dd><code>{key.masked}</code></dd></div>
            </dl>
            <AntaresNotice variant="warn" icon="warning" className="key-manage-warning" >
              <p id="custom-key-warning">{translate("Once saved, the old key stops working immediately. Store the new key safely and update every application that uses it. Usage history is not reset.")}</p>
            </AntaresNotice>
            <form onSubmit={save} className="key-manage-form">
              <Input
                id="new-api-key"
                variant="antares"
                label={translate("New API key")}
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                minLength={5}
                maxLength={128}
                pattern="[A-Za-z0-9_\-]{5,128}"
                value={newKey}
                onChange={(event) => { setNewKey(event.target.value); setSuccess(""); }}
                hint={translate(CUSTOM_API_KEY_HELP)}
                required
                disabled={saving}
                aria-describedby="custom-key-warning"
              />
              <Input
                id="confirm-api-key"
                variant="antares"
                label={translate("Repeat new API key")}
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={128}
                value={confirmKey}
                onChange={(event) => setConfirmKey(event.target.value)}
                required
                disabled={saving}
              />
              <label className="key-manage-confirm">
                <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={saving} required className="peer sr-only" />
                <span className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-[var(--t-line)] bg-[var(--t-field)] text-transparent transition-colors peer-checked:border-[var(--t-accent)] peer-checked:bg-[var(--t-accent)] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--t-accent)]">
                  <span className="material-symbols-outlined text-[13px] leading-none" aria-hidden="true">check</span>
                </span>
                <span>{translate("I have saved the new key and will update it in my applications.")}</span>
              </label>
              {error && <p className="key-manage-feedback is-error" role="alert">{error}</p>}
              {success && <p className="key-manage-feedback" role="status">{success}</p>}
              <div><AntaresButton type="submit" loading={saving} disabled={saving}>{translate("Save new API key")}</AntaresButton></div>
            </form>
          </AntaresPanel>
        )}
        </div>
      </div>
    </KeyDashboardLayout>
  );
}
