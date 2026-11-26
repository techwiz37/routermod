"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import KeyDashboardLayout from "../KeyDashboardLayout";
import { INFORMATION_READ_EVENT } from "../components/KeyInformationsPopup";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresNotice from "@/shared/components/AntaresNotice";
import AntaresPanel from "@/shared/components/AntaresPanel";
import StarField from "@/shared/components/StarField";
import { PagePendingMarker, usePageReady } from "@/shared/components/PageReadyContext";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";

function formatDate(value, locale) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function KeyInformationsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [locale, setLocale] = useState(getCurrentLocale());
  const [, setLocaleVersion] = useState(0);

  usePageReady(loading);

  useEffect(() => onLocaleChange(() => {
    setLocaleVersion((value) => value + 1);
    setLocale(getCurrentLocale());
  }), []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/public/informations", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (response.status === 401) { router.replace("/login-key"); return; }
        if (!response.ok) throw new Error(data.error || translate("Could not load informations."));
        setItems(data.items || []);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error.message || translate("Could not load informations."));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [router, retry]);

  // The popup mounted in the layout acknowledges the same items. Reflect that
  // immediately instead of leaving stale "new" badges on this page.
  useEffect(() => {
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener(INFORMATION_READ_EVENT, refresh);
    return () => window.removeEventListener(INFORMATION_READ_EVENT, refresh);
  }, []);

  const logout = async () => {
    await fetch("/api/public/key-dashboard", { method: "DELETE", cache: "no-store" }).catch(() => {});
    router.replace("/login-key");
  };

  const unread = items.filter((item) => !item.read);

  const markAllRead = useCallback(async () => {
    if (saving || unread.length === 0) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/public/informations/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unread.map((item) => item.id) }),
        cache: "no-store",
      });
      if (response.status === 401) { router.replace("/login-key"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || translate("Could not save read state."));
      setItems((previous) => previous.map((item) => (item.read ? item : { ...item, read: true, readAt: new Date().toISOString() })));
      setNotice(translate("All informations marked as read."));
    } catch (error) {
      setNotice(error.message || translate("Could not save read state."));
    } finally {
      setSaving(false);
    }
  }, [router, saving, unread]);

  return (
    <KeyDashboardLayout onLogout={logout}>
      <div className="an-scope an-shell key-dashboard-page">
        <div className="an-shell-bg" aria-hidden="true"><StarField /></div>
        <PagePendingMarker active={loading} />
        <div className="key-dashboard-main">
          <header className="key-dashboard-title-row">
            <div className="key-dashboard-title-copy">
              <p className="an-eyebrow"><span className="an-num">03</span><span className="an-rule" /><span>{translate("Announcements for your key")}</span></p>
              <h1 className="an-h1">{translate("Informations")}</h1>
              <p className="key-dashboard-key-name">
                {translate("Announcements published by the administrator for API-key owners.")}
              </p>
            </div>
            {unread.length > 0 && (
              <AntaresButton icon="done_all" onClick={markAllRead} loading={saving}>
                {translate("I have read")}
              </AntaresButton>
            )}
          </header>

          {notice && (
            <AntaresNotice
              variant="info"
              icon="check_circle"
              action={<button type="button" className="an-btn an-ghost h-8 px-3 text-[12px]" onClick={() => setNotice("")}>{translate("Dismiss")}</button>}
            >
              {notice}
            </AntaresNotice>
          )}

          {unread.length > 0 && (
            <AntaresNotice variant="warn" icon="campaign" className="mt-3">
              {translate("You have {count} unread information(s). They will keep appearing as a popup until marked as read.")
                .replace("{count}", String(unread.length))}
            </AntaresNotice>
          )}

          {loading ? null : loadError ? (
            <section className="an-panel key-dashboard-error" role="alert">
              <p>{loadError}</p>
              <AntaresButton variant="ghost" onClick={() => setRetry((value) => value + 1)}>{translate("Retry")}</AntaresButton>
            </section>
          ) : (
            <AntaresPanel
              className="mt-3"
              icon="campaign"
              title={translate("All informations")}
              subtitle={translate("{total} announcement(s) · {unread} unread")
                .replace("{total}", String(items.length))
                .replace("{unread}", String(unread.length))}
            >
              {items.length === 0 ? (
                <p className="an-hint">{translate("There are no announcements yet.")}</p>
              ) : (
                <ul className="flex flex-col">
                  {items.map((item) => (
                    <li key={item.id} className="border-b border-[var(--t-line-soft)] py-3.5 first:pt-0 last:border-b-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-sm font-semibold text-[var(--t-ink)]">{item.title}</h2>
                        {!item.read && (
                          <span className="rounded-full border border-[var(--t-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--t-accent)]">
                            {translate("New")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 whitespace-pre-line break-words [overflow-wrap:anywhere] text-[12.5px] leading-relaxed text-[var(--t-muted)]">{item.body}</p>
                      <p className="mt-1.5 font-mono text-[10.5px] text-[var(--t-dim)]">{formatDate(item.createdAt, locale)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </AntaresPanel>
          )}
        </div>
      </div>
    </KeyDashboardLayout>
  );
}
