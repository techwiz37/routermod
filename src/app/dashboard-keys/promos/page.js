"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import KeyDashboardLayout from "../KeyDashboardLayout";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresNotice from "@/shared/components/AntaresNotice";
import AntaresPanel from "@/shared/components/AntaresPanel";
import StarField from "@/shared/components/StarField";
import { PagePendingMarker, usePageReady } from "@/shared/components/PageReadyContext";
import { getCurrentLocale, onLocaleChange, translate, translateServerMessage } from "@/i18n/runtime";

function compact(value, locale) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function displayDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = getCurrentLocale();
  return date.toLocaleString(locale === "id" ? "id-ID" : locale, { timeZone: "Asia/Jakarta" });
}

export default function KeyPromosPage() {
  const router = useRouter();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [notice, setNotice] = useState(null);
  const [locale, setLocale] = useState(getCurrentLocale());
  const [, setLocaleVersion] = useState(0);

  usePageReady(loading);

  useEffect(() => onLocaleChange(() => {
    setLocaleVersion((value) => value + 1);
    setLocale(getCurrentLocale());
  }), []);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/public/promos/claims", { cache: "no-store", signal });
      if (response.status === 401) { router.replace("/login-key"); return; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || translate("Could not load your promo claims."));
      setClaims(Array.isArray(data.claims) ? data.claims : []);
    } catch (error) {
      if (error.name !== "AbortError") {
        setLoadError(translateServerMessage(error.message) || translate("Could not load your promo claims."));
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

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
      setNotice({
        variant: "info",
        text: translate("Promo claimed. {tokens} tokens were added and are valid until {date}.")
          .replace("{tokens}", compact(result.tokens, locale))
          .replace("{date}", displayDate(result.expiresAt)),
      });
      await load();
    } catch (claimError) {
      setNotice({ variant: "danger", text: translateServerMessage(claimError.message) || translate("Could not claim the promo code.") });
    } finally {
      setClaiming(false);
    }
  };

  const logout = async () => {
    await fetch("/api/public/key-dashboard", { method: "DELETE", cache: "no-store" }).catch(() => {});
    router.replace("/login-key");
  };

  return (
    <KeyDashboardLayout onLogout={logout}>
      <div className="an-scope an-shell key-dashboard-page promo-page">
        <div className="an-shell-bg" aria-hidden="true"><StarField /></div>
        <PagePendingMarker active={loading} />
        <div className="key-dashboard-main">
          <header className="key-dashboard-title-row">
            <div className="key-dashboard-title-copy">
              <p className="an-eyebrow"><span className="an-num">08</span><span className="an-rule" /><span>{translate("Promo & rewards")}</span></p>
              <h1 className="an-h1">{translate("Promo")}</h1>
              <p className="an-hint key-dashboard-intro">
                {translate("Claim a promo code to add bonus tokens to your topup balance. Every code can be claimed once per key.")}
              </p>
            </div>
            <AntaresButton type="button" variant="ghost" icon="refresh" loading={loading} onClick={() => load()}>
              {translate("Refresh status")}
            </AntaresButton>
          </header>

          {notice && (
            <AntaresNotice variant={notice.variant} icon={notice.variant === "danger" ? "error" : "check_circle"} className="topup-notice">
              <p>{notice.text}</p>
            </AntaresNotice>
          )}

          <AntaresPanel
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
            icon="history"
            title={translate("Claim history")}
            subtitle={translate("Promo codes this key has claimed.")}
          >
            {loading ? (
              <p className="an-hint">{translate("Loading…")}</p>
            ) : loadError ? (
              <div className="flex flex-col items-start gap-3">
                <p className="an-hint text-[var(--t-danger)]">{loadError}</p>
                <AntaresButton variant="ghost" icon="refresh" onClick={() => load()}>{translate("Retry")}</AntaresButton>
              </div>
            ) : claims.length === 0 ? (
              <p className="an-hint py-2">{translate("No promo claims yet. Enter a code above to add bonus tokens.")}</p>
            ) : (
              <ul className="topup-history" tabIndex={0} aria-label={translate("Claim history")}>
                {claims.map((claim) => (
                  <li key={claim.id}>
                    <div className="topup-history-main">
                      <span className="topup-history-code">{claim.code || "—"}</span>
                      <span className="topup-history-tokens">{compact(claim.tokens, locale)} {translate("tokens")}</span>
                    </div>
                    <div className="topup-history-side">
                      <span className="topup-history-amount">{displayDate(claim.claimedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AntaresPanel>
        </div>
      </div>
    </KeyDashboardLayout>
  );
}
