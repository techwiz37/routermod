"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import KeyDashboardLayout from "../KeyDashboardLayout";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresNotice from "@/shared/components/AntaresNotice";
import StarField from "@/shared/components/StarField";
import { PagePendingMarker, usePageReady } from "@/shared/components/PageReadyContext";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";
import { formatCompact, formatFull } from "@/shared/utils/compactNumber";
import { isIpBlacklisted, parseIpBlacklistInput } from "@/shared/utils/ipBlacklist.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const locale = getCurrentLocale();
  return date.toLocaleString(locale === "id" ? "id-ID" : locale, {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayShortDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]}${sameYear ? "" : ` ${date.getFullYear()}`}`;
}

function formatLimit(value) {
  return Number(value) > 0 ? formatCompact(value) : translate("Unlimited");
}

function LimitTile({ label, value, title }) {
  return (
    <div className="ip-limit-tile">
      <dt>{label}</dt>
      <dd title={title}>{value}</dd>
    </div>
  );
}

export default function KeyPermissionsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [search, setSearch] = useState("");
  const [, setLocaleVersion] = useState(0);

  usePageReady(loading);

  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/public/key-permissions", { cache: "no-store", signal });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace("/login-key");
        return;
      }
      if (!response.ok) throw new Error(result.error || translate("Could not load IP access."));
      setData(result);
    } catch (loadError) {
      if (loadError.name !== "AbortError") setError(loadError.message || translate("Could not load IP access."));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const logout = async () => {
    await fetch("/api/public/key-dashboard", { method: "DELETE", cache: "no-store" }).catch(() => {});
    router.replace("/login-key");
  };

  const blacklist = data?.blacklist || [];
  const permissions = data?.permissions || { restricted: false, allow: [] };
  const limits = data?.limits || {};

  const saveBlacklist = useCallback(async (nextList, message) => {
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      const response = await fetch("/api/public/key-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ipBlacklist: nextList }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace("/login-key");
        return false;
      }
      if (!response.ok) throw new Error(result.error || translate("Could not save the IP blacklist."));
      setData((previous) => {
        if (!previous) return previous;
        const saved = Array.isArray(result.blacklist) ? result.blacklist : nextList;
        return {
          ...previous,
          blacklist: saved,
          ips: previous.ips.map((row) => ({ ...row, blocked: isIpBlacklisted(row.ip, saved) })),
        };
      });
      setNotice(message || translate("IP blacklist updated."));
      return true;
    } catch (saveFailure) {
      setSaveError(saveFailure.message || translate("Could not save the IP blacklist."));
      return false;
    } finally {
      setSaving(false);
    }
  }, [router]);

  const toggleBlock = (ip, blocked) => {
    if (saving) return;
    const next = blocked
      ? blacklist.filter((entry) => entry !== ip)
      : [...blacklist, ip];
    saveBlacklist(next, blocked
      ? `${ip} ${translate("is allowed again.")}`
      : `${ip} ${translate("is blocked for this key.")}`);
  };

  const addManual = async (event) => {
    event.preventDefault();
    if (saving) return;
    const { valid, invalid } = parseIpBlacklistInput(draft);
    if (invalid.length) {
      setDraftError(`${translate("Invalid IP")}: ${invalid.slice(0, 5).join(", ")}`);
      return;
    }
    if (!valid.length) {
      setDraftError(translate("Enter at least one IP or CIDR range."));
      return;
    }
    const next = [...blacklist];
    for (const entry of valid) {
      if (!next.includes(entry)) next.push(entry);
    }
    if (next.length === blacklist.length) {
      setDraftError(translate("Those IPs are already blocked."));
      return;
    }
    const saved = await saveBlacklist(next);
    if (saved) {
      setDraft("");
      setDraftError("");
    }
  };

  const filteredIps = useMemo(() => {
    const list = data?.ips || [];
    const query = search.trim().toLowerCase();
    return query ? list.filter((row) => row.ip.toLowerCase().includes(query)) : list;
  }, [data, search]);

  const blockedCount = blacklist.length;
  const ipCount = data?.ips?.length || 0;

  return (
    <KeyDashboardLayout onLogout={logout}>
      <div className="an-scope an-shell key-dashboard-page key-ip-page">
        <div className="an-shell-bg" aria-hidden="true"><StarField /></div>
        <PagePendingMarker active={loading && !data} />
        <div className="key-dashboard-main">
          <section className="key-dashboard-title-row" aria-labelledby="key-ip-title">
            <div className="key-dashboard-title-copy">
              <p className="an-eyebrow">
                <span className="an-num">07</span>
                <span className="an-rule" />
                <span>{translate("Access control")}</span>
              </p>
              <h1 id="key-ip-title" className="an-h1">
                {translate("Permissions")} <span className="an-dim">&amp; {translate("List IP")}</span>
              </h1>
              <p className="an-hint key-dashboard-intro">
                {translate("See what this key may call and which IP addresses used it. Blocked addresses are rejected before the request reaches a provider.")}
              </p>
              {data?.key && (
                <p className="key-dashboard-key-name">
                  <span>{data.key.name || translate("API key")}</span>
                  <span aria-hidden>·</span>
                  <code className="key-dashboard-masked">{data.key.masked}</code>
                </p>
              )}
            </div>
          </section>

          {error && (
            <section role="alert" className="an-panel key-dashboard-error">
              <div className="key-dashboard-error-copy">
                <p className="key-dashboard-error-title">{translate("Failed to load IP access")}</p>
                <p className="key-dashboard-error-message">{error}</p>
              </div>
              <AntaresButton type="button" variant="ghost" onClick={() => load()} className="key-dashboard-retry">
                {translate("Retry")}
              </AntaresButton>
            </section>
          )}

          {data && (
            <div className="key-dashboard-content key-ip-content" aria-busy={loading}>
              <AntaresPanel
                icon="shield"
                title={translate("Permissions")}
                subtitle={translate("Model access and limits are managed by the administrator.")}
                className="key-ip-panel"
              >
                <div className="key-ip-access">
                  <div className="min-w-0">
                    <p className="key-ip-label">{translate("Model access")}</p>
                    {permissions.restricted ? (
                      <>
                        <p className="key-ip-scope">
                          <span className="material-symbols-outlined" aria-hidden>lock</span>
                          {translate("Restricted to the models and combos below.")}
                        </p>
                        {permissions.allow?.length ? (
                          <ul className="key-ip-chips" aria-label={translate("Allowed models and combos")}>
                            {permissions.allow.map((entry) => (
                              <li key={entry} className="key-ip-chip" title={entry}>{entry}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="key-ip-scope is-warn">{translate("No model is allowed yet, so this key can call nothing.")}</p>
                        )}
                      </>
                    ) : (
                      <p className="key-ip-scope">
                        <span className="material-symbols-outlined" aria-hidden>public</span>
                        {translate("Full access — every model and combo enabled on the router.")}
                      </p>
                    )}
                  </div>
                </div>

                <dl className="key-ip-limits" aria-label={translate("Limits")}>
                  <LimitTile label={translate("Requests / day")} value={formatLimit(limits.dailyLimit)} title={`${formatFull(limits.dailyLimit || 0)}`} />
                  <LimitTile label={translate("Requests / minute")} value={formatLimit(limits.minuteLimit)} title={`${formatFull(limits.minuteLimit || 0)}`} />
                  <LimitTile label={translate("Requests / month")} value={formatLimit(limits.monthLimit)} title={`${formatFull(limits.monthLimit || 0)}`} />
                  <LimitTile
                    label={`${translate("Tokens")} / ${limits.tokenLimitWindow || "24h"}`}
                    value={formatLimit(limits.tokenLimit)}
                    title={`${formatFull(limits.tokenLimit || 0)}`}
                  />
                  <LimitTile label={translate("Tokens / minute")} value={formatLimit(limits.tokensPerMinuteLimit)} title={`${formatFull(limits.tokensPerMinuteLimit || 0)}`} />
                  <LimitTile label={translate("Concurrent requests")} value={formatLimit(limits.maxConcurrentLimit)} title={`${formatFull(limits.maxConcurrentLimit || 0)}`} />
                </dl>
              </AntaresPanel>

              <AntaresPanel
                icon="lan"
                title={translate("IP addresses used with this key")}
                subtitle={`${ipCount} ${translate("addresses recorded")} · ${blockedCount} ${translate("blocked")}`}
                className="key-ip-panel"
                action={ipCount > 0 ? (
                  <div className="an-search key-ip-search">
                    <span className="material-symbols-outlined" aria-hidden>search</span>
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={translate("Filter IP...")}
                      className="an-input"
                      aria-label={translate("Filter IP addresses")}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                ) : null}
              >
                {saveError && <p className="key-ip-feedback is-error" role="alert">{saveError}</p>}
                {notice && <p className="key-ip-feedback" role="status">{notice}</p>}

                {filteredIps.length ? (
                  <>
                    <ul className={`key-ip-list${filteredIps.length > 5 ? " is-scroll" : ""}`}>
                      {filteredIps.map((row) => (
                        <li key={row.ip} className={`key-ip-row${row.blocked ? " is-blocked" : ""}`}>
                          <div className="key-ip-row-copy">
                            <code className="key-ip-address">{row.ip}</code>
                            <span className={`key-ip-state${row.blocked ? " is-blocked" : ""}`}>
                              {row.blocked ? translate("Blocked") : translate("Allowed")}
                            </span>
                            <p className="key-ip-meta">
                              <span title={`${formatFull(row.requests)} ${translate("requests")}`}>
                                {formatCompact(row.requests)} {translate("requests")}
                              </span>
                              <span aria-hidden>·</span>
                              <span title={`${formatFull(row.tokens)} ${translate("tokens")}`}>
                                {formatCompact(row.tokens)} {translate("tokens")}
                              </span>
                              <span aria-hidden>·</span>
                              <span title={displayDate(row.lastSeenAt)}>
                                {translate("last seen")} {displayShortDate(row.lastSeenAt)}
                              </span>
                            </p>
                          </div>
                          {blacklist.includes(row.ip) ? (
                            <AntaresButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              icon="lock_open"
                              disabled={saving}
                              onClick={() => toggleBlock(row.ip, true)}
                            >
                              {translate("Unblock")}
                            </AntaresButton>
                          ) : row.blocked ? (
                            <span className="key-ip-range-note">{translate("Blocked by a range")}</span>
                          ) : (
                            <AntaresButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              icon="block"
                              className="key-ip-block-btn"
                              disabled={saving}
                              onClick={() => toggleBlock(row.ip, false)}
                            >
                              {translate("Block")}
                            </AntaresButton>
                          )}
                        </li>
                      ))}
                    </ul>
                    {filteredIps.length > 5 && (
                      <p className="key-ip-scroll-hint">
                        <span className="material-symbols-outlined" aria-hidden>swipe_vertical</span>
                        {translate("Scroll to see all addresses")}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="key-dashboard-empty">
                    <span className="material-symbols-outlined" aria-hidden>{search ? "search_off" : "lan"}</span>
                    <h2>{search ? translate("No IP matches your filter") : translate("No IP recorded yet")}</h2>
                    <p>
                      {search
                        ? translate("Try a different address or clear the filter.")
                        : translate("Addresses appear here after this key sends its first request.")}
                    </p>
                  </div>
                )}
              </AntaresPanel>

              <AntaresPanel
                icon="block"
                title={translate("Blocked IPs")}
                subtitle={translate("Requests from these addresses are rejected with HTTP 403.")}
                className="key-ip-panel"
              >
                <AntaresNotice variant="warn" icon="info" className="key-ip-notice">
                  <p>{translate("Supports IPv4, IPv6, and IPv4 CIDR ranges such as 10.0.0.0/24. Blocking takes effect on the next request.")}</p>
                </AntaresNotice>

                <form className="key-ip-add" onSubmit={addManual}>
                  <label className="sr-only" htmlFor="block-ip-input">{translate("IP or CIDR to block")}</label>
                  <input
                    id="block-ip-input"
                    type="text"
                    value={draft}
                    onChange={(event) => { setDraft(event.target.value); setDraftError(""); }}
                    placeholder="203.0.113.10, 10.0.0.0/24"
                    className="an-input"
                    autoComplete="off"
                    spellCheck={false}
                    inputMode="text"
                  />
                  <AntaresButton type="submit" icon="add" loading={saving} disabled={saving || !draft.trim()}>
                    {translate("Block IP")}
                  </AntaresButton>
                </form>
                {draftError && <p className="key-ip-feedback is-error" role="alert">{draftError}</p>}

                {blacklist.length ? (
                  <ul className="key-ip-chips is-managed" aria-label={translate("Blocked IPs")}>
                    {blacklist.map((entry) => (
                      <li key={entry} className="key-ip-chip is-blocked">
                        <code>{entry}</code>
                        <button
                          type="button"
                          onClick={() => toggleBlock(entry, true)}
                          disabled={saving}
                          aria-label={`${translate("Unblock")} ${entry}`}
                          title={`${translate("Unblock")} ${entry}`}
                        >
                          <span className="material-symbols-outlined" aria-hidden>close</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="key-dashboard-panel-empty">{translate("No blocked IPs yet.")}</p>
                )}
              </AntaresPanel>
            </div>
          )}
        </div>
      </div>
    </KeyDashboardLayout>
  );
}
