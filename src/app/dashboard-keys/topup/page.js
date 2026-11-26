"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import KeyDashboardLayout from "../KeyDashboardLayout";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresNotice from "@/shared/components/AntaresNotice";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresStat from "@/shared/components/AntaresStat";
import StarField from "@/shared/components/StarField";
import { SOCIAL_LINKS } from "@/shared/components/SocialIcons";
import { PagePendingMarker, usePageReady } from "@/shared/components/PageReadyContext";
import { getCurrentLocale, onLocaleChange, translate, translateServerMessage } from "@/i18n/runtime";
import { TOKEN_PACKAGES, TOPUP_VALIDITY_DAYS } from "@/shared/constants/tokenPackages.js";

function compact(value, locale) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function displayDate(value, dateOnly = false) {
  if (!value) return translate("Not available");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate("Not available");
  const locale = getCurrentLocale();
  return dateOnly
    ? date.toLocaleDateString(locale === "id" ? "id-ID" : locale, { timeZone: "Asia/Jakarta" })
    : date.toLocaleString(locale === "id" ? "id-ID" : locale, { timeZone: "Asia/Jakarta" });
}

function toneFor(percent) {
  if (percent == null) return "none";
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warn";
  return "ok";
}

const STATUS_META = {
  pending: { label: "Awaiting payment", tone: "warn", icon: "schedule" },
  paid: { label: "Paid", tone: "ok", icon: "check_circle" },
  expired: { label: "Failed", tone: "muted", icon: "event_busy" },
  cancelled: { label: "Cancelled", tone: "muted", icon: "block" },
};

export default function TopupTokenPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [topup, setTopup] = useState({ tokens: 0, expiresAt: null, effectiveTokenLimit: 0, keyExpiresAt: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [selected, setSelected] = useState("");
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [qris, setQris] = useState(null);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [, setLocaleVersion] = useState(0);
  const hydrated = useRef(false);
  const syncedOnce = useRef(false);

  usePageReady(loading);

  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  useEffect(() => {
    hydrated.current = false;
  }, []);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const [billingResponse, invoiceResponse] = await Promise.all([
        fetch("/api/public/billing?period=7d", { cache: "no-store", signal }),
        fetch("/api/public/topup/invoices", { cache: "no-store", signal }),
      ]);
      if (billingResponse.status === 401 || invoiceResponse.status === 401) {
        router.replace("/login-key");
        return;
      }
      const billing = await billingResponse.json().catch(() => ({}));
      const invoiceData = await invoiceResponse.json().catch(() => ({}));
      if (!billingResponse.ok) throw new Error(billing.error || translate("Could not load your token quota."));
      if (!invoiceResponse.ok) throw new Error(invoiceData.error || translate("Could not load your topup invoices."));
      setData(billing);
      setInvoices(invoiceData.invoices || []);
      setTopup(invoiceData.topup || { tokens: 0, expiresAt: null, effectiveTokenLimit: 0, keyExpiresAt: null });
    } catch (loadError) {
      if (loadError.name !== "AbortError") setError(translateServerMessage(loadError.message) || translate("Could not load your token quota."));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refreshBilling = useCallback(async () => {
    const response = await fetch("/api/public/billing?period=7d", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const result = await response.json().catch(() => null);
    if (result) setData(result);
  }, []);

  const syncNow = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setChecking(true);
    try {
      const response = await fetch("/api/public/topup/sync", { method: "POST", cache: "no-store" });
      if (response.status === 401) { router.replace("/login-key"); return; }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("Could not check the payment status."));
      if (Array.isArray(result.invoices)) {
        setInvoices(result.invoices);
        setActiveInvoice((current) => {
          if (!current) return current;
          const fresh = result.invoices.find((invoice) => invoice.id === current.id);
          return fresh ? { ...current, ...fresh } : current;
        });
      }
      if (result.topup) setTopup(result.topup);
      if (result.settled > 0) {
        const extendedTo = result.keyExtendedTo;
        setNotice({
          variant: "info",
          text: extendedTo
            ? translate("Payment received. Tokens were added and your key is now active until {date}.").replace("{date}", displayDate(extendedTo))
            : translate("Payment received. Your tokens were added automatically."),
        });
        await refreshBilling();
      }
      return result;
    } catch (syncError) {
      if (!silent) setNotice({ variant: "danger", text: translateServerMessage(syncError.message) });
      return null;
    } finally {
      if (!silent) setChecking(false);
    }
  }, [refreshBilling, router]);

  // Auto-credit: poll while at least one invoice is still waiting for money.
  // Every 10s keeps the confirmation close to the QRIS settlement without
  // hammering GoBiz: the route itself throttles concurrent reads.
  const hasPending = useMemo(() => invoices.some((invoice) => invoice.status === "pending"), [invoices]);
  useEffect(() => {
    if (!hasPending) return undefined;
    const timer = window.setInterval(() => { syncNow({ silent: true }); }, 10000);
    return () => window.clearInterval(timer);
  }, [hasPending, syncNow]);

  const logout = async () => {
    await fetch("/api/public/key-dashboard", { method: "DELETE", cache: "no-store" }).catch(() => {});
    router.replace("/login-key");
  };

  const tokenLimit = Number(data?.limits?.tokenLimit) || 0;
  const cycle = data?.cycle;
  const used = Number(cycle?.tokensUsed) || 0;
  const percent = cycle?.tokenPercent;
  const remaining = tokenLimit > 0 ? Math.max(0, tokenLimit - used) : null;
  const locale = getCurrentLocale();
  const validity = translate("Valid {days} days").replace("{days}", String(TOPUP_VALIDITY_DAYS));
  const keyExpiresAt = topup.keyExpiresAt || data?.key?.expiresAt || null;

  const rupiah = (value) => new Intl.NumberFormat(locale === "id" ? "id-ID" : locale, {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

  const createInvoice = async (packageId, { silent = false } = {}) => {
    const pkg = TOKEN_PACKAGES.find((entry) => entry.id === packageId);
    if (!pkg) return;
    setCreating(true);
    if (!silent) setNotice(null);
    try {
      const response = await fetch("/api/public/topup/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      if (response.status === 401) { router.replace("/login-key"); return; }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("Failed to create the topup invoice."));
      setActiveInvoice(result.invoice);
      setQris(result.qris || null);
      if (result.topup) setTopup(result.topup);
      if (!silent) {
        setNotice({
          variant: "info",
          text: result.reused
            ? translate("You already have a pending invoice for this package. It is shown below.")
            : translate("Invoice created. Scan the QRIS and pay the exact amount."),
        });
      }
      const list = await fetch("/api/public/topup/invoices", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (list?.invoices) setInvoices(list.invoices);
    } catch (createError) {
      if (!silent) setNotice({ variant: "danger", text: translateServerMessage(createError.message) });
    } finally {
      setCreating(false);
    }
  };

  const claimPromoCode = async (event) => {
    event?.preventDefault();
    if (claiming) return;
    const code = promoCode.trim().toUpperCase();
    if (!code) {
      setNotice({ variant: "danger", text: translate("Enter a promo code first.") });
      return;
    }
    setClaiming(true);
    setNotice(null);
    try {
      const response = await fetch("/api/public/promos/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (response.status === 401) { router.replace("/login-key"); return; }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("Could not claim the promo code."));
      setPromoCode("");
      setTopup((previous) => ({
        ...previous,
        tokens: Number(result.totalTokens) || 0,
        expiresAt: result.expiresAt || previous.expiresAt,
      }));
      setNotice({
        variant: "info",
        text: translate("Promo claimed. {tokens} tokens were added and are valid until {date}.")
          .replace("{tokens}", compact(result.tokens, locale))
          .replace("{date}", displayDate(result.expiresAt, true)),
      });
      await refreshBilling();
    } catch (claimError) {
      setNotice({ variant: "danger", text: translateServerMessage(claimError.message) || translate("Could not claim the promo code.") });
    } finally {
      setClaiming(false);
    }
  };

  // Restore the QR for a pending invoice after a page reload. The create
  // endpoint reuses the live pending invoice instead of making a duplicate.
  // Restoring is silent: the reused-invoice notice belongs to an explicit
  // click, not to every page load.
  useEffect(() => {
    if (loading || hydrated.current || activeInvoice) return;
    const pending = invoices.find((invoice) => invoice.status === "pending");
    if (!pending) return;
    hydrated.current = true;
    setSelected(pending.packageId);
    createInvoice(pending.packageId, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, invoices, activeInvoice]);

  // One-shot sync after the first load so a payment made while the page was
  // closed is credited without waiting for the 20s poll.
  useEffect(() => {
    if (loading || syncedOnce.current) return;
    syncedOnce.current = true;
    syncNow({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const activeMeta = activeInvoice ? (STATUS_META[activeInvoice.status] || STATUS_META.pending) : null;

  return (
    <KeyDashboardLayout onLogout={logout}>
      <div className="an-scope an-shell key-dashboard-page topup-page">
        <div className="an-shell-bg" aria-hidden="true"><StarField /></div>
        <PagePendingMarker active={loading} />
        <div className="key-dashboard-main">
          <header className="key-dashboard-title-row">
            <div className="key-dashboard-title-copy">
              <p className="an-eyebrow"><span className="an-num">05</span><span className="an-rule" /><span>{translate("Token balance")}</span></p>
              <h1 className="an-h1">{translate("Topup Token")}</h1>
              <p className="an-hint key-dashboard-intro">{translate("Pick a token package, pay the exact amount with QRIS, and your tokens are added automatically. While your key is still active, every topup also adds {days} more days to its active period.").replace("{days}", String(TOPUP_VALIDITY_DAYS))}</p>
            </div>
            <AntaresButton type="button" variant="ghost" icon="refresh" loading={loading} onClick={() => load()}>
              {translate("Refresh status")}
            </AntaresButton>
          </header>

          {error && (
            <AntaresNotice
              variant="danger"
              icon="error"
              className="topup-notice"
              action={<AntaresButton type="button" variant="ghost" size="sm" onClick={() => load()}>{translate("Retry")}</AntaresButton>}
            >
              <p>{error}</p>
            </AntaresNotice>
          )}

          {notice && (
            <AntaresNotice variant={notice.variant} icon={notice.variant === "danger" ? "error" : "check_circle"} className="topup-notice">
              <p>{notice.text}</p>
            </AntaresNotice>
          )}

          {data && (
            <div className="topup-content">
              <section aria-label={translate("Token quota status")} className="topup-stats">
                <AntaresStat
                  icon="add_card"
                  label={translate("Active topup")}
                  value={topup.tokens > 0 ? compact(topup.tokens, locale) : "—"}
                  foot={topup.expiresAt
                    ? `${translate("Valid until")} ${displayDate(topup.expiresAt, true)}`
                    : translate("No active topup")}
                  tone={topup.tokens > 0 ? "ok" : "default"}
                />
                <AntaresStat
                  icon="event"
                  label={translate("Key active until")}
                  value={keyExpiresAt ? displayDate(keyExpiresAt, true) : translate("Lifetime")}
                  foot={data.key?.name
                    ? `${data.key.name}${data.key.masked ? ` · ${data.key.masked}` : ""}`
                    : translate("No expiry set")}
                  tone={keyExpiresAt ? "ok" : "default"}
                />
                <AntaresStat
                  icon="token"
                  label={translate("Used this cycle")}
                  value={compact(used, locale)}
                  foot={`${translate("of")} ${tokenLimit > 0 ? compact(tokenLimit, locale) : translate("Unlimited")}`}
                />
                <AntaresStat
                  icon="savings"
                  label={translate("Tokens left")}
                  value={remaining == null ? "—" : compact(remaining, locale)}
                  foot={translate(cycle?.window || "24h")}
                  tone={remaining == null ? "default" : percent >= 90 ? "danger" : percent >= 70 ? "warn" : "ok"}
                />
              </section>

              <AntaresPanel
                className="topup-promo-panel"
                icon="redeem"
                title={translate("Claim a promo code")}
                subtitle={translate("Have a promo code? Enter it to add bonus tokens to your topup balance.")}
              >
                <form onSubmit={claimPromoCode} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="promo-claim-code" className="an-label">{translate("Promo code")}</label>
                    <input
                      id="promo-claim-code"
                      type="text"
                      value={promoCode}
                      onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                      placeholder={translate("Enter your promo code")}
                      maxLength={32}
                      autoComplete="off"
                      spellCheck={false}
                      className="an-input font-mono uppercase tracking-wide"
                    />
                  </div>
                  <AntaresButton
                    type="submit"
                    icon="redeem"
                    loading={claiming}
                    disabled={!promoCode.trim()}
                    className="w-full sm:w-auto"
                  >
                    {translate("Claim code")}
                  </AntaresButton>
                </form>
              </AntaresPanel>

              <AntaresPanel
                className="topup-packs-panel"
                icon="sell"
                title={translate("Choose a token package")}
                subtitle={translate("Tokens are valid for {days} days after payment. While your key is still active, each topup also extends its active period by {days} days.").replaceAll("{days}", String(TOPUP_VALIDITY_DAYS))}
              >
                <div className="topup-packs" role="radiogroup" aria-label={translate("Choose a token package")}>
                  {TOKEN_PACKAGES.map((pkg) => {
                    const isSelected = selected === pkg.id;
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`topup-pack${isSelected ? " is-selected" : ""}`}
                        onClick={() => setSelected(pkg.id)}
                      >
                        <span className="topup-pack-tokens">{compact(pkg.tokens, locale)}<small> {translate("tokens")}</small></span>
                        <span className="topup-pack-price">{rupiah(pkg.price)}</span>
                        <span className="topup-pack-note">{validity}</span>
                        <span className="material-symbols-outlined topup-pack-check" aria-hidden="true">
                          {isSelected ? "check_circle" : "radio_button_unchecked"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="topup-pack-actions">
                  <AntaresButton
                    type="button"
                    icon="qr_code_2"
                    loading={creating}
                    disabled={!selected}
                    onClick={() => createInvoice(selected)}
                  >
                    {translate("Create QRIS invoice")}
                  </AntaresButton>
                  <p className="topup-pack-hint">{translate("The invoice amount comes from the package you pick. The QR code is the merchant's static QRIS.")}</p>
                </div>
              </AntaresPanel>

              <AntaresPanel
                className="topup-invoice-panel"
                icon="qr_code_2"
                title={translate("Payment invoice")}
                subtitle={activeInvoice
                  ? `${activeInvoice.code} · ${displayDate(activeInvoice.createdAt)}`
                  : translate("Create an invoice to see the QR code.")}
                action={activeMeta ? (
                  <span className={`topup-status ${activeMeta.tone}`}>
                    <span className="material-symbols-outlined" aria-hidden="true">{activeMeta.icon}</span>
                    {translate(activeMeta.label)}
                  </span>
                ) : null}
              >
                {!activeInvoice && (
                  <div className="topup-empty">
                    <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
                    <p>{translate("No invoice selected yet. Pick a package above, then create the QRIS invoice.")}</p>
                  </div>
                )}

                {activeInvoice && (
                  <div className={`topup-invoice${activeInvoice.status !== "pending" ? " is-settled" : ""}`}>
                    {activeInvoice.status === "pending" && qris?.dataUrl && (
                      <div className="topup-invoice-qr">
                        <img src={qris.dataUrl} alt={translate("Static merchant QRIS")} />
                      </div>
                    )}
                    <div className="topup-invoice-info">
                      <p className="pay-label">{translate("Exact amount")}</p>
                      <p className="topup-invoice-total">{rupiah(activeInvoice.amount)}</p>
                      {qris?.merchant && <p className="topup-invoice-merchant">{qris.merchant}</p>}

                      <dl className="topup-invoice-meta">
                        <div><dt>{translate("Invoice code")}</dt><dd>{activeInvoice.code}</dd></div>
                        <div><dt>{translate("Tokens")}</dt><dd>{compact(activeInvoice.tokens, locale)}</dd></div>
                        <div><dt>{translate("Created")}</dt><dd>{displayDate(activeInvoice.createdAt)}</dd></div>
                        <div><dt>{translate("Expires")}</dt><dd>{displayDate(activeInvoice.expiresAt)}</dd></div>
                      </dl>

                      {activeInvoice.status === "pending" && (
                        <>
                          <div className="topup-invoice-actions">
                            <AntaresButton type="button" icon="sync" loading={checking} onClick={() => syncNow()}>
                              {translate("Check payment")}
                            </AntaresButton>
                            {qris?.dataUrl && (
                              <a
                                className="an-btn an-ghost inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[13px] font-medium"
                                href={qris.dataUrl}
                                download={`QRIS-${activeInvoice.code}.png`}
                              >
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">download</span>
                                {translate("Download QR")}
                              </a>
                            )}
                          </div>
                          <p className="pay-hint">{translate("Pay the exact amount shown. Tokens are credited automatically once the payment is detected within 10 minutes. If not detected, the invoice is marked failed.")}</p>
                        </>
                      )}

                      {activeInvoice.status === "paid" && (
                        <AntaresNotice variant="info" icon="check_circle" className="mt-3">
                          <p>{translate("Payment received. Your tokens were added automatically.")}</p>
                        </AntaresNotice>
                      )}

                      {activeInvoice.status === "expired" && (
                        <AntaresNotice variant="warn" icon="event_busy" className="mt-3">
                          <p>{translate("This invoice failed because payment was not detected within 10 minutes. Create a new invoice to continue.")}</p>
                        </AntaresNotice>
                      )}
                    </div>
                  </div>
                )}
              </AntaresPanel>

              {invoices.length > 0 && (
                <AntaresPanel
                  className="topup-history-panel"
                  icon="history"
                  title={translate("Invoice history")}
                  subtitle={translate("Your most recent topup invoices.")}
                >
                  <ul className="topup-history" tabIndex={0} aria-label={translate("Invoice history")}>
                    {invoices.map((invoice) => {
                      const meta = STATUS_META[invoice.status] || STATUS_META.pending;
                      return (
                        <li key={invoice.id} className={activeInvoice?.id === invoice.id ? "is-active" : ""}>
                          <div className="topup-history-main">
                            <span className="topup-history-code">{invoice.code}</span>
                            <span className="topup-history-tokens">{compact(invoice.tokens, locale)} {translate("tokens")}</span>
                          </div>
                          <div className="topup-history-side">
                            <span className="topup-history-amount">{rupiah(invoice.amount)}</span>
                            <span className={`topup-status ${meta.tone}`}>
                              <span className="material-symbols-outlined" aria-hidden="true">{meta.icon}</span>
                              {translate(meta.label)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </AntaresPanel>
              )}

              <AntaresPanel
                className="topup-quota"
                icon="data_usage"
                title={translate("Current token quota")}
                subtitle={tokenLimit > 0
                  ? translate("Cycle usage for this key · resets {time}").replace("{time}", displayDate(cycle?.resetAt))
                  : translate("No token limit is set for this key")}
                action={tokenLimit > 0 ? (
                  <span className={`billing-status ${toneFor(percent)}`}>
                    <span className="material-symbols-outlined" aria-hidden="true">{percent >= 90 ? "error" : percent >= 70 ? "warning" : "check_circle"}</span>
                    {Math.round(percent || 0)}% {translate("used")}
                  </span>
                ) : <span className="billing-status none">{translate("Unlimited")}</span>}
              >
                {tokenLimit > 0 && (
                  <div className={`billing-progress ${toneFor(percent)}`} role="progressbar" aria-valuenow={Math.round(percent || 0)} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${percent || 0}%` }} />
                  </div>
                )}
                <p className="topup-quota-note">
                  {translate("Topup tokens are added to your quota automatically and stay usable for {days} days. If your key is still active, its active period is extended by another {days} days.").replaceAll("{days}", String(TOPUP_VALIDITY_DAYS))}
                </p>
              </AntaresPanel>

              <section className="topup-grid">
                <AntaresPanel
                  icon="bolt"
                  title={translate("Automatic topup")}
                  subtitle={translate("No manual confirmation needed.")}
                >
                  <ul className="topup-auto">
                    <li>
                      <span className="material-symbols-outlined" aria-hidden="true">qr_code_scanner</span>
                      <p>{translate("Your invoice code and exact amount identify the payment automatically.")}</p>
                    </li>
                    <li>
                      <span className="material-symbols-outlined" aria-hidden="true">bolt</span>
                      <p>{translate("Tokens are credited and your key active period grows by {days} days as soon as the payment is detected.").replace("{days}", String(TOPUP_VALIDITY_DAYS))}</p>
                    </li>
                    <li>
                      <span className="material-symbols-outlined" aria-hidden="true">support_agent</span>
                      <p>{translate("Only contact us if the payment is still not detected after a few minutes.")}</p>
                    </li>
                  </ul>
                </AntaresPanel>

                <AntaresPanel
                  icon="chat"
                  title={translate("Contact administrator")}
                  subtitle={translate("Contact us if a payment is not detected. Include your invoice code so we can check it.")}
                >
                  <div className="topup-contact-actions">
                    <a
                      className="an-btn an-primary inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] px-4 text-[13px] font-medium"
                      href={SOCIAL_LINKS.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chat</span>
                      {translate("Chat on WhatsApp")}
                    </a>
                    <a
                      className="an-btn an-ghost inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] px-4 text-[13px] font-medium"
                      href={SOCIAL_LINKS.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">send</span>
                      {translate("Chat on Telegram")}
                    </a>
                  </div>
                </AntaresPanel>
              </section>

              <AntaresPanel icon="list_alt" title={translate("How it works")} subtitle={translate("Three short steps to top up your token quota.")}>
                <ol className="topup-steps">
                  <li><span>1</span><p>{translate("Pick a token package, then create a QRIS invoice.")}</p></li>
                  <li><span>2</span><p>{translate("Scan the static QRIS and pay the exact invoice amount.")}</p></li>
                  <li><span>3</span><p>{translate("Tokens are credited automatically once the payment is detected, stay valid for {days} days, and your key active period grows by {days} days while it is still active.").replaceAll("{days}", String(TOPUP_VALIDITY_DAYS))}</p></li>
                </ol>
              </AntaresPanel>
            </div>
          )}
        </div>
      </div>
    </KeyDashboardLayout>
  );
}
