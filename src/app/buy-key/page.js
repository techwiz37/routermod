"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StarField from "@/shared/components/StarField";
import Soft3DLogo from "@/shared/components/Soft3DLogo";
import LocaleToggle from "@/shared/components/LocaleToggle";
import AntaresFooter from "@/shared/components/AntaresFooter";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresNotice from "@/shared/components/AntaresNotice";
import AntaresPanel from "@/shared/components/AntaresPanel";
import { SOCIAL_LINKS } from "@/shared/components/SocialIcons";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { onLocaleChange } from "@/i18n/runtime";
import { TOKEN_PACKAGES, TOPUP_VALIDITY_DAYS } from "@/shared/constants/tokenPackages.js";

const COPY = {
  en: {
    brandSub: "AI Gateway",
    back: "Back to landing",
    eyebrow: "Public key purchase",
    title: "Buy an",
    titleAccent: "API key.",
    description:
      "Pick a token package, pay the exact amount with QRIS, and a new API key is issued automatically with that package's token limit. No account needed.",
    chipInstant: "Instant delivery",
    chipNoReset: "Token reset off",
    chipValidity: "Valid {days} days",

    packagesTitle: "Choose a key package",
    packagesSubtitle:
      "Your new key gets exactly the token limit of the package you pick. The quota never resets, and the key is valid for {days} days.",
    nameLabel: "Key name",
    namePlaceholder: "e.g. Production key",
    nameHelp: "Optional. This name helps you recognise the key in the dashboard later.",
    create: "Create QRIS invoice",
    creating: "Creating invoice…",
    packageHint:
      "The invoice amount comes from the package you pick. The QR code is the merchant's static QRIS.",

    invoiceTitle: "Payment invoice",
    invoiceSubtitleEmpty: "Create an invoice to see the QR code.",
    emptyInvoice:
      "No invoice selected yet. Pick a package above, then create the QRIS invoice.",
    exactAmount: "Exact amount",
    invoiceCode: "Invoice code",
    tokens: "Tokens",
    keyName: "Key name",
    created: "Created",
    expires: "Expires",
    check: "Check payment",
    checking: "Checking…",
    download: "Download QR",
    payHint:
      "Pay the exact amount shown. Your API key is issued automatically once the payment is detected within 10 minutes. Keep this browser session open until it appears.",
    expiredNote:
      "This invoice failed because payment was not detected within 10 minutes. Create a new invoice to continue.",
    preparing: "Payment received. Your API key is being prepared.",

    keyReady: "Your new API key",
    copy: "Copy key",
    copied: "Copied",
    openDashboard: "Open key dashboard",
    saveWarning:
      "Store this key now. It is shown only in this browser session — if you lose it, contact the administrator with your invoice code.",
    tokenLimit: "Token limit",
    tokenReset: "Token reset",
    resetOff: "Off",
    validUntil: "Valid until",

    historyTitle: "Invoice history",
    historySubtitle: "Your most recent key purchases in this browser.",

    whatTitle: "What you get",
    what1: "A fresh API key with the package's token limit.",
    what2: "Token reset is off, so the quota never refills.",
    what3: "The key stays valid for {days} days.",
    what4: "Works with every OpenAI-compatible client.",

    howTitle: "How it works",
    howSubtitle: "Three short steps to get your key.",
    step1: "Pick a token package and create a QRIS invoice.",
    step2: "Scan the static QRIS and pay the exact invoice amount.",
    step3:
      "The payment is detected automatically and your API key appears here, ready to copy.",

    contactTitle: "Need help?",
    contactSubtitle:
      "If the payment is not detected after a few minutes, contact us with your invoice code.",
    whatsapp: "Chat on WhatsApp",
    telegram: "Chat on Telegram",

    statusPending: "Awaiting payment",
    statusPaid: "Paid",
    statusExpired: "Failed",
    statusCancelled: "Cancelled",
    loading: "Loading…",
    loadError: "The key invoices could not be loaded. Please try again.",
    createError: "Failed to create the key invoice.",
    checkError: "Could not check the payment status.",
    invalidKeyName: "",
    notConnected:
      "Automatic payment checking is not connected. Pay the exact amount, then contact the administrator with your invoice code.",
    paidNotice: "Payment received. Your new API key is ready below.",
    reusedNotice:
      "You already have a pending invoice for this package. It is shown below.",
    createdNotice: "Invoice created. Scan the QRIS and pay the exact amount.",
  },
  id: {
    brandSub: "Gateway AI",
    back: "Kembali ke landing",
    eyebrow: "Pembelian key publik",
    title: "Beli",
    titleAccent: "API key.",
    description:
      "Pilih paket token, bayar nominal tepat lewat QRIS, dan API key baru langsung dibuat otomatis dengan limit token sesuai paket. Tidak perlu akun.",
    chipInstant: "Langsung jadi",
    chipNoReset: "Reset token off",
    chipValidity: "Berlaku {days} hari",

    packagesTitle: "Pilih paket key",
    packagesSubtitle:
      "Key baru kamu mendapat limit token persis seperti paket yang dipilih. Kuota tidak pernah di-reset, dan key berlaku {days} hari.",
    nameLabel: "Nama key",
    namePlaceholder: "mis. Key produksi",
    nameHelp: "Opsional. Nama ini memudahkan kamu mengenali key di dashboard nanti.",
    create: "Buat invoice QRIS",
    creating: "Membuat invoice…",
    packageHint:
      "Nominal invoice mengikuti paket yang dipilih. Kode QR adalah QRIS statis milik merchant.",

    invoiceTitle: "Invoice pembayaran",
    invoiceSubtitleEmpty: "Buat invoice untuk melihat kode QR.",
    emptyInvoice:
      "Belum ada invoice. Pilih paket di atas, lalu buat invoice QRIS.",
    exactAmount: "Nominal tepat",
    invoiceCode: "Kode invoice",
    tokens: "Token",
    keyName: "Nama key",
    created: "Dibuat",
    expires: "Kedaluwarsa",
    check: "Cek pembayaran",
    checking: "Mengecek…",
    download: "Unduh QR",
    payHint:
      "Bayar sesuai nominal yang tampil. API key dibuat otomatis begitu pembayaran terdeteksi dalam 10 menit. Biarkan sesi browser ini terbuka sampai key muncul.",
    expiredNote:
      "Invoice ini gagal karena pembayaran tidak terdeteksi dalam 10 menit. Buat invoice baru untuk melanjutkan.",
    preparing: "Pembayaran diterima. API key kamu sedang disiapkan.",

    keyReady: "API key baru kamu",
    copy: "Salin key",
    copied: "Tersalin",
    openDashboard: "Buka dashboard key",
    saveWarning:
      "Simpan key ini sekarang. Key hanya ditampilkan di sesi browser ini — jika hilang, hubungi admin dengan kode invoice kamu.",
    tokenLimit: "Limit token",
    tokenReset: "Reset token",
    resetOff: "Off",
    validUntil: "Berlaku sampai",

    historyTitle: "Riwayat invoice",
    historySubtitle: "Pembelian key terakhir kamu di browser ini.",

    whatTitle: "Yang kamu dapat",
    what1: "API key baru dengan limit token sesuai paket.",
    what2: "Reset token off, jadi kuota tidak pernah terisi ulang.",
    what3: "Key berlaku {days} hari.",
    what4: "Bisa dipakai di semua klien yang kompatibel OpenAI.",

    howTitle: "Cara kerja",
    howSubtitle: "Tiga langkah singkat untuk mendapatkan key.",
    step1: "Pilih paket token dan buat invoice QRIS.",
    step2: "Scan QRIS statis dan bayar sesuai nominal invoice.",
    step3:
      "Pembayaran terdeteksi otomatis dan API key muncul di sini, siap disalin.",

    contactTitle: "Butuh bantuan?",
    contactSubtitle:
      "Jika pembayaran belum terdeteksi setelah beberapa menit, hubungi kami dengan kode invoice kamu.",
    whatsapp: "Chat WhatsApp",
    telegram: "Chat Telegram",

    statusPending: "Menunggu pembayaran",
    statusPaid: "Dibayar",
    statusExpired: "Gagal",
    statusCancelled: "Dibatalkan",
    loading: "Memuat…",
    loadError: "Invoice key tidak dapat dimuat. Silakan coba lagi.",
    createError: "Gagal membuat invoice key.",
    checkError: "Status pembayaran tidak dapat dicek.",
    notConnected:
      "Pengecekan pembayaran otomatis belum terhubung. Bayar nominal tepat, lalu hubungi admin dengan kode invoice kamu.",
    paidNotice: "Pembayaran diterima. API key baru kamu sudah siap di bawah.",
    reusedNotice:
      "Kamu sudah punya invoice menunggu untuk paket ini. Invoice tersebut ditampilkan di bawah.",
    createdNotice: "Invoice dibuat. Scan QRIS dan bayar nominal tepat.",
  },
};

const STATUS_META = {
  pending: { label: "statusPending", tone: "warn", icon: "schedule" },
  paid: { label: "statusPaid", tone: "ok", icon: "check_circle" },
  expired: { label: "statusExpired", tone: "muted", icon: "event_busy" },
  cancelled: { label: "statusCancelled", tone: "muted", icon: "block" },
};

function getLocaleFromPreference() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage?.getItem("app_locale");
    if (stored) return normalizeLocale(stored);
  } catch {}
  const cookie = document.cookie
    .split(";")
    .find((part) => part.trim().startsWith(`${LOCALE_COOKIE}=`));
  return normalizeLocale(cookie ? decodeURIComponent(cookie.split("=")[1]) : DEFAULT_LOCALE);
}

function compact(value, locale) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function displayDate(value, locale, dateOnly = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateOnly
    ? date.toLocaleDateString(locale === "id" ? "id-ID" : locale, { timeZone: "Asia/Jakarta" })
    : date.toLocaleString(locale === "id" ? "id-ID" : locale, { timeZone: "Asia/Jakarta" });
}

export default function BuyKeyPage() {
  const router = useRouter();
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [selected, setSelected] = useState("");
  const [keyName, setKeyName] = useState("");
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [qris, setQris] = useState(null);
  const [notice, setNotice] = useState(null);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const restored = useRef(false);
  const syncedOnce = useRef(false);
  const nameRef = useRef("");
  const t = COPY[locale === "id" ? "id" : "en"];
  const fill = (text) => text.replaceAll("{days}", String(TOPUP_VALIDITY_DAYS));

  useEffect(() => {
    const timer = window.setTimeout(() => setLocale(getLocaleFromPreference()), 0);
    const unsubscribe = onLocaleChange(() => setLocale(getLocaleFromPreference()));
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    nameRef.current = keyName;
  }, [keyName]);

  const rupiah = useCallback((value) => new Intl.NumberFormat(locale === "id" ? "id-ID" : locale, {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0), [locale]);

  const createInvoice = useCallback(async (packageId, { silent = false } = {}) => {
    if (!packageId) return null;
    setCreating(true);
    if (!silent) setNotice(null);
    try {
      const response = await fetch("/api/public/buy-key/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, name: nameRef.current }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || t.createError);
      setActiveInvoice(result.invoice);
      setQris(result.qris || null);
      if (!silent) {
        setNotice({
          variant: "info",
          text: result.reused ? t.reusedNotice : t.createdNotice,
        });
      }
      const listResponse = await fetch("/api/public/buy-key/invoices", { cache: "no-store" });
      const list = await listResponse.json().catch(() => null);
      if (list?.invoices) setInvoices(list.invoices);
      return result.invoice;
    } catch (createError) {
      if (!silent) setNotice({ variant: "danger", text: createError.message || t.createError });
      return null;
    } finally {
      setCreating(false);
    }
  }, [t]);

  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/public/buy-key/invoices", { cache: "no-store", signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || t.loadError);
      const list = Array.isArray(result.invoices) ? result.invoices : [];
      setInvoices(list);
      const preferred = list.find((invoice) => invoice.status === "pending") || list[0] || null;
      if (preferred) {
        setActiveInvoice(preferred);
        setSelected(preferred.packageId || "");
        if (preferred.status === "pending" && !restored.current) {
          restored.current = true;
          // Re-create silently: the server reuses the live pending invoice and
          // returns the merchant QR again instead of duplicating it.
          createInvoice(preferred.packageId, { silent: true });
        }
      }
    } catch (loadError) {
      if (loadError.name !== "AbortError") {
        setNotice({ variant: "danger", text: loadError.message || t.loadError });
      }
    } finally {
      setLoading(false);
    }
  }, [createInvoice, t]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const syncNow = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setChecking(true);
    try {
      const response = await fetch("/api/public/buy-key/sync", { method: "POST", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || t.checkError);
      if (Array.isArray(result.invoices)) {
        setInvoices(result.invoices);
        setActiveInvoice((current) => {
          if (!current) return current;
          const fresh = result.invoices.find((invoice) => invoice.id === current.id);
          return fresh ? { ...current, ...fresh } : current;
        });
        // A newly delivered key is the whole point of the page, so bring that
        // invoice to the front even when the user was looking at an old one.
        const delivered = result.invoices.find((invoice) => invoice.status === "paid" && invoice.apiKey);
        if (delivered) setActiveInvoice(delivered);
      }
      if (result.settled > 0) {
        setNotice({ variant: "info", text: t.paidNotice });
      } else if (result.reason === "not_connected" && !silent) {
        setNotice({ variant: "warn", text: t.notConnected });
      }
      return result;
    } catch (syncError) {
      if (!silent) setNotice({ variant: "danger", text: syncError.message || t.checkError });
      return null;
    } finally {
      if (!silent) setChecking(false);
    }
  }, [t]);

  const hasPending = invoices.some((invoice) => invoice.status === "pending");
  useEffect(() => {
    if (loading || !hasPending) return undefined;
    const timer = window.setInterval(() => { syncNow({ silent: true }); }, 20_000);
    return () => window.clearInterval(timer);
  }, [hasPending, loading, syncNow]);

  // One-shot sync after the first load so a payment made while the page was
  // closed is delivered without waiting for the poll.
  useEffect(() => {
    if (loading || syncedOnce.current) return;
    syncedOnce.current = true;
    syncNow({ silent: true });
  }, [loading, syncNow]);

  const copyKey = async () => {
    if (!activeInvoice?.apiKey) return;
    try {
      await navigator.clipboard.writeText(activeInvoice.apiKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const openDashboard = async () => {
    if (!activeInvoice?.apiKey) return;
    try {
      const response = await fetch("/api/public/key-dashboard", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeInvoice.apiKey}` },
        cache: "no-store",
      });
      if (response.ok) {
        router.push("/dashboard-keys");
        return;
      }
    } catch {}
    router.push("/login-key");
  };

  const activeMeta = activeInvoice ? (STATUS_META[activeInvoice.status] || STATUS_META.pending) : null;
  const validity = fill(t.chipValidity);

  return (
    <div className="buy-key-page login-key-page an-scope login-skin lf-root min-h-screen" data-i18n-skip="true">
      <div className="login-bg"><StarField /><div className="login-fade" /></div>
      <div className="fixed top-0 left-0 right-0 z-50 h-[2px] bg-gradient-to-r from-transparent via-[var(--t-accent)] to-transparent" />

      <div className="lf-shell">
        <header className="lf-header">
          <a href="/landing" className="lf-brand rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--t-accent)]" aria-label={`RouterMod, ${t.back}`}>
            <Soft3DLogo className="size-11" />
            <span>
              <span className="lf-brand-name block">RouterMod</span>
              <span className="lf-brand-sub block">{t.brandSub}</span>
            </span>
          </a>
          <div className="lf-header-right">
            <a href="/landing" className="buy-key-back an-btn an-ghost h-8 px-3 text-[12px] gap-1.5">
              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">arrow_back</span>
              <span className="hidden sm:inline">{t.back}</span>
            </a>
            <LocaleToggle />
          </div>
        </header>

        <main className="buy-key-main">
          <section className="buy-key-hero" aria-labelledby="buy-key-title">
            <p className="lf-hero-eyebrow">{t.eyebrow}</p>
            <h1 id="buy-key-title" className="buy-key-title">
              {t.title} <span className="lf-hero-accent">{t.titleAccent}</span>
            </h1>
            <p className="lf-hero-desc">{t.description}</p>
            <div className="lf-features">
              <span className="lf-feature-chip"><span className="material-symbols-outlined lf-feature-icon" aria-hidden="true">bolt</span>{t.chipInstant}</span>
              <span className="lf-feature-chip"><span className="material-symbols-outlined lf-feature-icon" aria-hidden="true">lock_clock</span>{t.chipNoReset}</span>
              <span className="lf-feature-chip"><span className="material-symbols-outlined lf-feature-icon" aria-hidden="true">event</span>{validity}</span>
            </div>
          </section>

          {notice && (
            <AntaresNotice
              variant={notice.variant}
              icon={notice.variant === "danger" ? "error" : notice.variant === "warn" ? "warning" : "check_circle"}
              className="buy-key-notice"
            >
              <p>{notice.text}</p>
            </AntaresNotice>
          )}

          <div className="buy-key-grid">
            <div className="buy-key-col">
              <AntaresPanel
                icon="sell"
                title={t.packagesTitle}
                subtitle={fill(t.packagesSubtitle)}
              >
                <div className="topup-packs" role="radiogroup" aria-label={t.packagesTitle}>
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
                        <span className="topup-pack-tokens">{compact(pkg.tokens, locale)}<small> {t.tokens}</small></span>
                        <span className="topup-pack-price">{rupiah(pkg.price)}</span>
                        <span className="topup-pack-note">{validity}</span>
                        <span className="material-symbols-outlined topup-pack-check" aria-hidden="true">
                          {isSelected ? "check_circle" : "radio_button_unchecked"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="buy-key-name">
                  <label htmlFor="buy-key-name" className="an-label">{t.nameLabel}</label>
                  <input
                    id="buy-key-name"
                    className="an-input"
                    type="text"
                    value={keyName}
                    onChange={(event) => setKeyName(event.target.value)}
                    placeholder={t.namePlaceholder}
                    maxLength={60}
                    autoComplete="off"
                  />
                  <p className="buy-key-name-help">{t.nameHelp}</p>
                </div>

                <div className="topup-pack-actions">
                  <AntaresButton
                    type="button"
                    icon="qr_code_2"
                    loading={creating}
                    disabled={!selected}
                    onClick={() => createInvoice(selected)}
                  >
                    {creating ? t.creating : t.create}
                  </AntaresButton>
                  <p className="topup-pack-hint">{t.packageHint}</p>
                </div>
              </AntaresPanel>

              <AntaresPanel
                className="buy-key-invoice-panel"
                icon="qr_code_2"
                title={t.invoiceTitle}
                subtitle={activeInvoice
                  ? `${activeInvoice.code} · ${displayDate(activeInvoice.createdAt, locale)}`
                  : t.invoiceSubtitleEmpty}
                action={activeMeta ? (
                  <span className={`topup-status ${activeMeta.tone}`}>
                    <span className="material-symbols-outlined" aria-hidden="true">{activeMeta.icon}</span>
                    {t[activeMeta.label]}
                  </span>
                ) : null}
              >
                {!activeInvoice && (
                  <div className="topup-empty">
                    <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
                    <p>{loading ? t.loading : t.emptyInvoice}</p>
                  </div>
                )}

                {activeInvoice && (
                  <div className={`topup-invoice${activeInvoice.status !== "pending" ? " is-settled" : ""}`}>
                    {activeInvoice.status === "pending" && qris?.dataUrl && (
                      <div className="topup-invoice-qr">
                        <img src={qris.dataUrl} alt="QRIS" />
                      </div>
                    )}
                    <div className="topup-invoice-info">
                      <p className="pay-label">{t.exactAmount}</p>
                      <p className="topup-invoice-total">{rupiah(activeInvoice.amount)}</p>
                      {qris?.merchant && <p className="topup-invoice-merchant">{qris.merchant}</p>}

                      <dl className="topup-invoice-meta">
                        <div><dt>{t.invoiceCode}</dt><dd>{activeInvoice.code}</dd></div>
                        <div><dt>{t.tokens}</dt><dd>{compact(activeInvoice.tokens, locale)}</dd></div>
                        <div><dt>{t.keyName}</dt><dd>{activeInvoice.name || "—"}</dd></div>
                        <div><dt>{t.expires}</dt><dd>{displayDate(activeInvoice.expiresAt, locale)}</dd></div>
                      </dl>

                      {activeInvoice.status === "pending" && (
                        <>
                          <div className="topup-invoice-actions">
                            <AntaresButton type="button" icon="sync" loading={checking} onClick={() => syncNow()}>
                              {checking ? t.checking : t.check}
                            </AntaresButton>
                            {qris?.dataUrl && (
                              <a
                                className="an-btn an-ghost inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[13px] font-medium"
                                href={qris.dataUrl}
                                download={`QRIS-${activeInvoice.code}.png`}
                              >
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">download</span>
                                {t.download}
                              </a>
                            )}
                          </div>
                          <p className="pay-hint">{t.payHint}</p>
                        </>
                      )}

                      {activeInvoice.status === "paid" && activeInvoice.apiKey && (
                        <div className="buy-key-reveal">
                          <div className="buy-key-reveal-head">
                            <span className="material-symbols-outlined" aria-hidden="true">key</span>
                            <strong>{t.keyReady}</strong>
                          </div>
                          <code className="buy-key-secret">{activeInvoice.apiKey}</code>
                          <div className="buy-key-reveal-actions">
                            <AntaresButton type="button" icon={copied ? "check" : "content_copy"} onClick={copyKey}>
                              {copied ? t.copied : t.copy}
                            </AntaresButton>
                            <AntaresButton type="button" variant="ghost" icon="dashboard" onClick={openDashboard}>
                              {t.openDashboard}
                            </AntaresButton>
                          </div>
                          <dl className="buy-key-keymeta">
                            <div><dt>{t.tokenLimit}</dt><dd>{compact(activeInvoice.tokens, locale)}</dd></div>
                            <div><dt>{t.tokenReset}</dt><dd>{t.resetOff}</dd></div>
                            <div><dt>{t.validUntil}</dt><dd>{displayDate(activeInvoice.deliveredAt ? new Date(Date.parse(activeInvoice.deliveredAt) + TOPUP_VALIDITY_DAYS * 86400000).toISOString() : null, locale, true)}</dd></div>
                          </dl>
                          <p className="buy-key-warning">{t.saveWarning}</p>
                        </div>
                      )}

                      {activeInvoice.status === "paid" && !activeInvoice.apiKey && (
                        <AntaresNotice variant="info" icon="hourglass_top" className="mt-3">
                          <p>{t.preparing}</p>
                        </AntaresNotice>
                      )}

                      {activeInvoice.status === "expired" && (
                        <AntaresNotice variant="warn" icon="event_busy" className="mt-3">
                          <p>{t.expiredNote}</p>
                        </AntaresNotice>
                      )}
                    </div>
                  </div>
                )}
              </AntaresPanel>

              {invoices.length > 1 && (
                <AntaresPanel icon="history" title={t.historyTitle} subtitle={t.historySubtitle}>
                  <ul className="topup-history">
                    {invoices.map((invoice) => {
                      const meta = STATUS_META[invoice.status] || STATUS_META.pending;
                      return (
                        <li key={invoice.id} className={activeInvoice?.id === invoice.id ? "is-active" : ""}>
                          <div className="topup-history-main">
                            <span className="topup-history-code">{invoice.code}</span>
                            <span className="topup-history-tokens">{compact(invoice.tokens, locale)} {t.tokens} · {invoice.name || "—"}</span>
                          </div>
                          <div className="topup-history-side">
                            <span className="topup-history-amount">{rupiah(invoice.amount)}</span>
                            <span className={`topup-status ${meta.tone}`}>
                              <span className="material-symbols-outlined" aria-hidden="true">{meta.icon}</span>
                              {t[meta.label]}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </AntaresPanel>
              )}
            </div>

            <aside className="buy-key-col buy-key-side">
              <AntaresPanel icon="verified" title={t.whatTitle}>
                <ul className="topup-auto">
                  <li><span className="material-symbols-outlined" aria-hidden="true">key</span><p>{t.what1}</p></li>
                  <li><span className="material-symbols-outlined" aria-hidden="true">lock_clock</span><p>{t.what2}</p></li>
                  <li><span className="material-symbols-outlined" aria-hidden="true">event_available</span><p>{fill(t.what3)}</p></li>
                  <li><span className="material-symbols-outlined" aria-hidden="true">hub</span><p>{t.what4}</p></li>
                </ul>
              </AntaresPanel>

              <AntaresPanel icon="list_alt" title={t.howTitle} subtitle={t.howSubtitle}>
                <ol className="topup-steps">
                  <li><span>1</span><p>{t.step1}</p></li>
                  <li><span>2</span><p>{t.step2}</p></li>
                  <li><span>3</span><p>{t.step3}</p></li>
                </ol>
              </AntaresPanel>

              <AntaresPanel icon="chat" title={t.contactTitle} subtitle={t.contactSubtitle}>
                <div className="topup-contact-actions">
                  <a
                    className="an-btn an-primary inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] px-4 text-[13px] font-medium"
                    href={SOCIAL_LINKS.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chat</span>
                    {t.whatsapp}
                  </a>
                  <a
                    className="an-btn an-ghost inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] px-4 text-[13px] font-medium"
                    href={SOCIAL_LINKS.telegram}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">send</span>
                    {t.telegram}
                  </a>
                </div>
              </AntaresPanel>
            </aside>
          </div>
        </main>

        <footer className="lf-footer">
          <AntaresFooter />
        </footer>
      </div>
    </div>
  );
}
