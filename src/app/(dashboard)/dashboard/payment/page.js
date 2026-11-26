"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePageReady } from "@/shared/components/PageReadyContext";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresNotice from "@/shared/components/AntaresNotice";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresStat from "@/shared/components/AntaresStat";
import StarField from "@/shared/components/StarField";
import { ConfirmModal } from "@/shared/components/Modal";
import { useNotificationStore } from "@/store/notificationStore";
import {
  getCurrentLocale,
  onLocaleChange,
  translate,
  translateServerMessage,
} from "@/i18n/runtime";

function intlTag(locale) {
  return locale === "id" ? "id-ID" : locale || "en";
}

function money(value, locale) {
  return new Intl.NumberFormat(intlTag(locale), {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function fmtDate(value, locale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(intlTag(locale), { dateStyle: "medium", timeStyle: "short" });
}

function fmtDay(value, locale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(intlTag(locale), { day: "2-digit", month: "short", year: "numeric" });
}

function statusTone(key) {
  const value = String(key || "").toLowerCase();
  if (["settlement", "success", "paid", "capture"].includes(value)) return "ok";
  if (["refund", "partial_refund", "pending"].includes(value)) return "warn";
  if (["failed", "cancel", "cancelled", "expired", "deny", "denied"].includes(value)) return "danger";
  return "default";
}

function StatusPill({ status, tone }) {
  return (
    <span className={`pay-pill ${tone || "default"}`}>
      <span className="pay-pill-dot" aria-hidden />
      {status || translate("Unknown")}
    </span>
  );
}

export default function PaymentMutasiPage() {
  const notify = useNotificationStore((state) => state.addNotification);
  const [locale, setLocale] = useState(() => getCurrentLocale());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  usePageReady(loading);

  const [qrisBusy, setQrisBusy] = useState(false);
  const [qrisError, setQrisError] = useState("");
  const [qrisPaste, setQrisPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef(null);

  const [gopayForm, setGopayForm] = useState({ email: "", password: "" });
  const [gopayMode, setGopayMode] = useState("otp");
  const [gopayChallenge, setGopayChallenge] = useState(null);
  const [gopayOtp, setGopayOtp] = useState("");
  const [gopayBusy, setGopayBusy] = useState("");
  const [gopayError, setGopayError] = useState("");

  const [limits, setLimits] = useState({ min: 10000, max: 10000000 });
  const [limitsBusy, setLimitsBusy] = useState(false);

  const [range, setRange] = useState("month");
  const [mutasi, setMutasi] = useState(null);
  const [mutasiLoading, setMutasiLoading] = useState(false);
  const [mutasiError, setMutasiError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => onLocaleChange(() => setLocale(getCurrentLocale())), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/payment", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("Failed to load payment settings."));
      setData(result);
      setLimits({ min: result.topup?.min || 10000, max: result.topup?.max || 10000000 });
    } catch (error) {
      notify({ type: "error", title: translate("Error"), message: translateServerMessage(error.message) });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const gopayConnected = !!data?.gopay?.authorized;

  const loadMutasi = useCallback(async (nextRange = range) => {
    if (!data?.gopay?.authorized) return;
    setMutasiLoading(true);
    setMutasiError("");
    try {
      const response = await fetch(`/api/payment/mutasi?range=${nextRange}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("Failed to fetch GoPay mutations."));
      setMutasi(result);
      if (result.gopay) setData((current) => current ? { ...current, gopay: result.gopay } : current);
    } catch (error) {
      setMutasiError(translateServerMessage(error.message));
    } finally {
      setMutasiLoading(false);
    }
  }, [data?.gopay?.authorized, range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (gopayConnected) loadMutasi(range);
    // Only react to the connection or the selected range; loadMutasi also
    // changes when `data` changes, which must not re-trigger a fetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gopayConnected, range]);

  const uploadQris = async (file) => {
    if (!file) return;
    setQrisBusy(true);
    setQrisError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/payment/qris", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("Failed to save QRIS."));
      setData((current) => current ? { ...current, qris: { ...current.qris, ...result.qris } } : current);
      notify({ type: "success", title: translate("QRIS saved"), message: translate("Static QRIS is ready for dynamic topups.") });
    } catch (error) {
      setQrisError(translateServerMessage(error.message));
    } finally {
      setQrisBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const savePastedQris = async () => {
    const template = qrisPaste.trim();
    if (!template) return;
    setQrisBusy(true);
    setQrisError("");
    try {
      const response = await fetch("/api/payment/qris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("Failed to save QRIS."));
      setData((current) => current ? { ...current, qris: { ...current.qris, ...result.qris } } : current);
      setQrisPaste("");
      setShowPaste(false);
      notify({ type: "success", title: translate("QRIS saved"), message: translate("Static QRIS is ready for dynamic topups.") });
    } catch (error) {
      setQrisError(translateServerMessage(error.message));
    } finally {
      setQrisBusy(false);
    }
  };

  const deleteQris = async () => {
    setQrisBusy(true);
    setQrisError("");
    try {
      const response = await fetch("/api/payment/qris", { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("Failed to delete QRIS."));
      setData((current) => current ? {
        ...current,
        qris: { configured: false, merchant: "", updatedAt: "", template: "", previewDataUrl: "" },
      } : current);
      setConfirmDelete(false);
      notify({ type: "success", title: translate("QRIS deleted"), message: "" });
    } catch (error) {
      setQrisError(translateServerMessage(error.message));
    } finally {
      setQrisBusy(false);
    }
  };

  const saveLimits = async () => {
    setLimitsBusy(true);
    try {
      const response = await fetch("/api/payment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topupMin: limits.min, topupMax: limits.max }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("Failed to save topup limits."));
      setData((current) => current ? { ...current, topup: result.topup } : current);
      notify({ type: "success", title: translate("Topup limits saved"), message: "" });
    } catch (error) {
      notify({ type: "error", title: translate("Error"), message: translateServerMessage(error.message) });
    } finally {
      setLimitsBusy(false);
    }
  };

  const submitGopay = async (event) => {
    event.preventDefault();
    setGopayBusy("login");
    setGopayError("");
    try {
      const response = await fetch("/api/payment/gopay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", ...gopayForm }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("GoPay Merchant login failed."));
      setData((current) => current ? { ...current, gopay: result.gopay } : current);
      setGopayForm({ email: "", password: "" });
      notify({ type: "success", title: translate("GoPay Merchant connected"), message: result.gopay?.email || "" });
    } catch (error) {
      setGopayError(translateServerMessage(error.message));
    } finally {
      setGopayBusy("");
    }
  };

  const requestGopayOtp = async (event) => {
    event.preventDefault();
    const email = gopayForm.email.trim();
    if (!email) return;
    setGopayBusy("otp-request");
    setGopayError("");
    try {
      const response = await fetch("/api/payment/gopay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_otp", email }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("Failed to send the GoPay OTP code."));
      setGopayChallenge({ ...result.challenge, email });
      setGopayOtp("");
      notify({
        type: "success",
        title: translate("OTP sent"),
        message: translate("Check the inbox for this GoPay account."),
      });
    } catch (error) {
      setGopayError(translateServerMessage(error.message));
    } finally {
      setGopayBusy("");
    }
  };

  const verifyGopayOtp = async (event) => {
    event.preventDefault();
    if (!gopayChallenge) return;
    setGopayBusy("otp-login");
    setGopayError("");
    try {
      const response = await fetch("/api/payment/gopay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login_otp",
          email: gopayChallenge.email,
          otp: gopayOtp,
          otpToken: gopayChallenge.otpToken,
          deviceId: gopayChallenge.deviceId,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("The GoPay OTP code is invalid or has expired."));
      setData((current) => current ? { ...current, gopay: result.gopay } : current);
      setGopayChallenge(null);
      setGopayOtp("");
      setGopayForm({ email: "", password: "" });
      notify({ type: "success", title: translate("GoPay Merchant connected"), message: result.gopay?.email || "" });
    } catch (error) {
      setGopayError(translateServerMessage(error.message));
    } finally {
      setGopayBusy("");
    }
  };

  const resetGopayChallenge = () => {
    setGopayChallenge(null);
    setGopayOtp("");
    setGopayError("");
  };

  const gopayAction = async (action) => {
    setGopayBusy(action);
    setGopayError("");
    try {
      const response = await fetch("/api/payment/gopay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || translate("GoPay action failed."));
      setData((current) => current ? { ...current, gopay: result.gopay } : current);
      if (action === "logout") {
        setMutasi(null);
        notify({ type: "success", title: translate("GoPay Merchant disconnected"), message: "" });
      } else {
        notify({ type: "success", title: translate("GoPay session refreshed"), message: "" });
      }
    } catch (error) {
      setGopayError(translateServerMessage(error.message));
    } finally {
      setGopayBusy("");
    }
  };

  const rows = useMemo(() => {
    const list = mutasi?.rows || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((row) => [row.id_trx, row.nama, row.issuer, row.status, row.nominal]
      .join(" ").toLowerCase().includes(needle));
  }, [mutasi, query]);

  return (
    <div className="an-scope an-shell payment-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="flex min-w-0 flex-col gap-2">
        <p className="an-eyebrow">
          <span className="an-num">03</span>
          <span className="an-rule" />
          <span>{translate("RouterMod · AI Gateway")}</span>
        </p>
        <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">
          {translate("Payment")} <span className="an-dim mx-2">{translate("& Mutations")}</span>
        </h1>
        <p className="an-hint max-w-[70ch]">
          {translate("Manage a static QRIS for token topups and track GoPay Merchant mutations in one place.")}
        </p>
      </header>

      {/* ---- Summary tiles ---- */}
      <div className="an-grid media-stats gap-2.5 sm:gap-3">
        <AntaresStat
          label="QRIS"
          icon="qr_code_2"
          tone={data?.qris?.configured ? "ok" : "default"}
          value={data?.qris?.configured ? translate("Ready") : translate("Not set")}
          foot={translate("merchant template")}
        />
        <AntaresStat
          label="GoPay"
          icon="storefront"
          tone={gopayConnected ? "ok" : "default"}
          value={gopayConnected ? translate("Connected") : translate("Offline")}
          foot={data?.gopay?.merchantId || translate("not signed in")}
        />
        <AntaresStat
          label={translate("Mutations")}
          icon="receipt_long"
          tone="violet"
          value={mutasi?.count ?? "—"}
          foot={mutasi?.total ? money(mutasi.total, locale) : translate("this month")}
        />
        <AntaresStat
          label="Topup"
          icon="add_card"
          value={`${Math.round((data?.topup?.min || 0) / 1000)}k`}
          foot={translate("up to {amount}").replace("{amount}", money(data?.topup?.max || 0, locale))}
        />
      </div>

      <div className="payment-grid">
        <AntaresPanel
          icon="qr_code_2"
          title={translate("Static Merchant QRIS")}
          subtitle={translate("Upload a static QRIS; the amount is filled in automatically at topup.")}
          action={data?.qris?.configured ? (
            <span className="pay-chip ok"><span className="material-symbols-outlined">check_circle</span>{translate("Active")}</span>
          ) : (
            <span className="pay-chip"><span className="material-symbols-outlined">pending</span>{translate("Not configured")}</span>
          )}
        >
          {qrisError && (
            <AntaresNotice variant="danger" icon="error" className="mb-3">
              <p>{qrisError}</p>
            </AntaresNotice>
          )}

          {data?.qris?.configured ? (
            <div className="pay-qris-grid">
              <div className="pay-qris-preview">
                <img src={data.qris.previewDataUrl} alt={translate("Merchant QRIS preview")} />
              </div>
              <div className="min-w-0">
                <dl className="pay-meta">
                  <div><dt>{translate("Merchant")}</dt><dd>{data.qris.merchant || "—"}</dd></div>
                  <div><dt>{translate("Updated")}</dt><dd>{fmtDate(data.qris.updatedAt, locale)}</dd></div>
                  <div><dt>{translate("Mode")}</dt><dd><span className="pay-pill ok">{translate("Static")}</span></dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <AntaresButton type="button" variant="ghost" icon="upload" loading={qrisBusy} onClick={() => fileRef.current?.click()}>
                    {translate("Replace QRIS")}
                  </AntaresButton>
                  <AntaresButton type="button" variant="quiet" icon="content_paste" onClick={() => setShowPaste((v) => !v)}>
                    {translate("Paste string")}
                  </AntaresButton>
                  <AntaresButton type="button" variant="quiet" icon="delete" onClick={() => setConfirmDelete(true)}>
                    {translate("Delete")}
                  </AntaresButton>
                </div>
              </div>
            </div>
          ) : (
            <div className="pay-drop">
              <span className="material-symbols-outlined pay-drop-ico" aria-hidden>qr_code_scanner</span>
              <p className="pay-drop-title">{translate("Upload a static QRIS from GoPay Merchant")}</p>
              <p className="pay-drop-sub">{translate("PNG/JPG image. The QR is read automatically and saved as a template.")}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <AntaresButton type="button" icon="upload" loading={qrisBusy} onClick={() => fileRef.current?.click()}>
                  {translate("Choose QRIS image")}
                </AntaresButton>
                <AntaresButton type="button" variant="ghost" icon="content_paste" onClick={() => setShowPaste((v) => !v)}>
                  {translate("Paste QRIS string")}
                </AntaresButton>
              </div>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => uploadQris(event.target.files?.[0])}
          />

          {showPaste && (
            <div className="mt-4 border-t border-[var(--t-line)] pt-4">
              <label htmlFor="qris-paste" className="pay-label">{translate("Static QRIS string")}</label>
              <textarea
                id="qris-paste"
                className="an-input mt-1.5 min-h-[98px] w-full resize-y font-mono text-[12px]"
                value={qrisPaste}
                onChange={(event) => setQrisPaste(event.target.value)}
                placeholder="000201010211…6304ABCD"
                spellCheck={false}
              />
              <div className="mt-2 flex justify-end gap-2">
                <AntaresButton type="button" variant="quiet" onClick={() => { setShowPaste(false); setQrisPaste(""); }}>
                  {translate("Cancel")}
                </AntaresButton>
                <AntaresButton type="button" icon="save" loading={qrisBusy} disabled={!qrisPaste.trim()} onClick={savePastedQris}>
                  {translate("Save QRIS")}
                </AntaresButton>
              </div>
            </div>
          )}

          <div className="pay-limits">
            <div className="min-w-0">
              <p className="pay-label">{translate("Topup amount limits")}</p>
              <p className="pay-hint">{translate("Dynamic QRIS amounts customers may generate.")}</p>
            </div>
            <div className="pay-limits-fields">
              <label className="min-w-0">
                <span>{translate("Min")}</span>
                <input
                  className="an-input h-9 w-full text-[12px]"
                  type="number"
                  min={1000}
                  step={1000}
                  value={limits.min}
                  onChange={(event) => setLimits((current) => ({ ...current, min: event.target.value }))}
                />
              </label>
              <label className="min-w-0">
                <span>{translate("Max")}</span>
                <input
                  className="an-input h-9 w-full text-[12px]"
                  type="number"
                  min={1000}
                  step={1000}
                  value={limits.max}
                  onChange={(event) => setLimits((current) => ({ ...current, max: event.target.value }))}
                />
              </label>
              <AntaresButton type="button" size="sm" icon="save" loading={limitsBusy} onClick={saveLimits}>
                {translate("Save")}
              </AntaresButton>
            </div>
          </div>
        </AntaresPanel>

        <AntaresPanel
          icon="storefront"
          title={translate("GoPay Merchant")}
          subtitle={translate("Sign in to read merchant QRIS mutations.")}
          action={(
            <span className={`pay-chip ${gopayConnected ? "ok" : ""}`}>
              <span className="material-symbols-outlined">{gopayConnected ? "link" : "link_off"}</span>
              {gopayConnected ? translate("Connected") : translate("Offline")}
            </span>
          )}
        >
          {gopayError && (
            <AntaresNotice variant="danger" icon="error" className="mb-3">
              <p>{gopayError}</p>
            </AntaresNotice>
          )}

          {gopayConnected ? (
            <div className="space-y-4">
              <dl className="pay-meta">
                <div><dt>{translate("Email")}</dt><dd className="truncate">{data.gopay.email || "—"}</dd></div>
                <div><dt>{translate("Merchant ID")}</dt><dd className="truncate font-mono">{data.gopay.merchantId || "—"}</dd></div>
                <div><dt>{translate("Last sign-in")}</dt><dd>{fmtDate(data.gopay.updatedAt, locale)}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <AntaresButton type="button" icon="refresh" loading={gopayBusy === "refresh"} onClick={() => gopayAction("refresh")}>
                  {translate("Refresh session")}
                </AntaresButton>
                <AntaresButton type="button" variant="ghost" icon="receipt_long" onClick={() => loadMutasi(range)}>
                  {translate("Load mutations")}
                </AntaresButton>
                <AntaresButton type="button" variant="quiet" icon="logout" loading={gopayBusy === "logout"} onClick={() => gopayAction("logout")}>
                  {translate("Disconnect")}
                </AntaresButton>
              </div>
              <p className="pay-hint">
                {translate("The password is not stored. Only the merchant access token is kept on the local server.")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="pay-range" role="tablist" aria-label={translate("GoPay sign-in method")}>
                {[
                  { id: "otp", label: translate("Email OTP") },
                  { id: "password", label: translate("Password") },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={gopayMode === option.id}
                    className={gopayMode === option.id ? "active" : ""}
                    onClick={() => {
                      setGopayMode(option.id);
                      setGopayError("");
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {gopayMode === "otp" ? (
                gopayChallenge ? (
                  <form className="space-y-3" onSubmit={verifyGopayOtp}>
                    <p className="pay-hint">
                      {translate("Enter the OTP code sent to")} <span className="font-medium">{gopayChallenge.email}</span>.
                    </p>
                    <label className="block">
                      <span className="pay-label">{translate("OTP code")}</span>
                      <input
                        className="an-input mt-1.5 h-10 w-full font-mono tracking-[0.4em]"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={gopayChallenge.otpLength || 6}
                        value={gopayOtp}
                        onChange={(event) => setGopayOtp(event.target.value.replace(/\D/g, ""))}
                        placeholder="••••"
                        required
                      />
                    </label>
                    <AntaresButton type="submit" icon="verified" loading={gopayBusy === "otp-login"} fullWidth>
                      {translate("Verify and sign in")}
                    </AntaresButton>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" className="pay-link" onClick={resetGopayChallenge}>
                        {translate("Use another email")}
                      </button>
                      <button
                        type="button"
                        className="pay-link"
                        disabled={gopayBusy === "otp-request"}
                        onClick={requestGopayOtp}
                      >
                        {translate("Resend OTP code")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className="space-y-3" onSubmit={requestGopayOtp}>
                    <label className="block">
                      <span className="pay-label">{translate("GoPay Merchant email")}</span>
                      <input
                        className="an-input mt-1.5 h-10 w-full"
                        type="email"
                        autoComplete="off"
                        value={gopayForm.email}
                        onChange={(event) => setGopayForm((current) => ({ ...current, email: event.target.value }))}
                        placeholder="merchant@email.com"
                        required
                      />
                    </label>
                    <AntaresButton type="submit" icon="mail" loading={gopayBusy === "otp-request"} fullWidth>
                      {translate("Send OTP code")}
                    </AntaresButton>
                    <p className="pay-hint">
                      {translate("We email a one-time code to the GoPay Merchant account. The password is never stored.")}
                    </p>
                  </form>
                )
              ) : (
                <form className="space-y-3" onSubmit={submitGopay}>
                  <label className="block">
                    <span className="pay-label">{translate("GoPay Merchant email")}</span>
                    <input
                      className="an-input mt-1.5 h-10 w-full"
                      type="email"
                      autoComplete="off"
                      value={gopayForm.email}
                      onChange={(event) => setGopayForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="merchant@email.com"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="pay-label">{translate("Password")}</span>
                    <input
                      className="an-input mt-1.5 h-10 w-full"
                      type="password"
                      autoComplete="new-password"
                      value={gopayForm.password}
                      onChange={(event) => setGopayForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="••••••••"
                      required
                    />
                  </label>
                  <AntaresButton type="submit" icon="login" loading={gopayBusy === "login"} fullWidth>
                    {translate("Sign in to GoPay Merchant")}
                  </AntaresButton>
                  <p className="pay-hint">
                    {translate("Credentials are used once to fetch the merchant token; the password is not stored.")}
                  </p>
                </form>
              )}
            </div>
          )}
        </AntaresPanel>
      </div>

      <AntaresPanel
        icon="receipt_long"
        title={translate("GoPay Merchant mutations")}
        subtitle={translate("QRIS, GoPay, and card transactions on the merchant account.")}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <div className="pay-range" role="group" aria-label={translate("Mutation range")}>
              {[
                { id: "today", label: translate("Today") },
                { id: "month", label: translate("This month") },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={range === option.id ? "active" : ""}
                  onClick={() => setRange(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <AntaresButton
              type="button"
              variant="ghost"
              size="sm"
              icon="refresh"
              loading={mutasiLoading}
              disabled={!gopayConnected}
              onClick={() => loadMutasi(range)}
            >
              {translate("Refresh")}
            </AntaresButton>
          </div>
        )}
        bodyClassName="!p-0"
      >
        <div className="pay-mutasi-toolbar">
          <div className="pay-mutasi-summary">
            <span><strong>{mutasi?.count ?? 0}</strong> {translate("transactions")}</span>
            <span><strong>{money(mutasi?.total || 0, locale)}</strong> {translate("total")}</span>
            {mutasi?.fetchedAt && <span className="text-[var(--t-dim)]">{translate("Updated")} {fmtDate(mutasi.fetchedAt, locale)}</span>}
            {mutasi?.refreshed && <span className="pay-chip ok">{translate("Token refreshed")}</span>}
          </div>
          <input
            className="an-input h-9 w-full max-w-[260px] text-[12px]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate("Search order, customer, issuer…")}
            aria-label={translate("Search mutations")}
          />
        </div>

        {!gopayConnected ? (
          <div className="pay-empty">
            <span className="material-symbols-outlined">link_off</span>
            <p>{translate("Connect GoPay Merchant to view mutations.")}</p>
          </div>
        ) : mutasiError ? (
          <div className="p-4">
            <AntaresNotice
              variant="danger"
              icon="error"
              action={<AntaresButton type="button" variant="ghost" size="sm" onClick={() => loadMutasi(range)}>{translate("Try again")}</AntaresButton>}
            >
              <p>{mutasiError}</p>
            </AntaresNotice>
          </div>
        ) : mutasiLoading && !mutasi ? (
          <div className="pay-empty">
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
            <p>{translate("Fetching mutations from GoPay…")}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="pay-empty">
            <span className="material-symbols-outlined">receipt_long</span>
            <p>{translate("No mutations in this range.")}</p>
          </div>
        ) : (
          <div className="an-table-wrap max-h-[520px] overflow-auto">
            <table className="an-table">
              <thead>
                <tr>
                  <th>{translate("Time")}</th>
                  <th>{translate("Order ID")}</th>
                  <th>{translate("Issuer")}</th>
                  <th>{translate("Customer")}</th>
                  <th className="text-right">{translate("Amount")}</th>
                  <th>{translate("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.id_trx}-${row.tanggal}-${row.jumlah}`}>
                    <td className="whitespace-nowrap text-[11.5px]">{row.tanggal || fmtDay(row.timestamp, locale)}</td>
                    <td><code className="pay-order">{row.id_trx}</code></td>
                    <td><span className="pay-issuer">{row.issuer || "—"}</span></td>
                    <td className="max-w-[190px] truncate">{row.nama || "—"}</td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(row.jumlah || 0, locale)}</td>
                    <td><StatusPill status={row.status} tone={statusTone(row.status_key || row.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AntaresPanel>

      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteQris}
        title={translate("Delete QRIS?")}
        message={translate("Token topups cannot generate dynamic QRIS until a static QRIS is uploaded again.")}
        confirmText={translate("Delete QRIS")}
        cancelText={translate("Cancel")}
        loading={qrisBusy}
      />
    </div>
  );
}
