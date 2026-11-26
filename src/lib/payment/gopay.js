// GoPay Merchant (GoBiz) client — ported from pitopupbot/gopayMerchant.js.
// The dashboard needs four things: exchange credentials (password or email
// OTP) for a merchant session, refresh that session, and read mutations.

import crypto from "node:crypto";

const PORTAL_ORIGIN = "https://portal.gofoodmerchant.co.id";
const GOBIZ_LOGIN_REQUEST_URL = "https://api.gobiz.co.id/goid/login/request";
const GOBIZ_TOKEN_API = "https://api.gobiz.co.id/goid/token";
const GOBIZ_PROFILE_API = "https://api.gobiz.co.id/v1/users/me";
const MERCHANT_TX_API = "https://api.gojekapi.com/merchant-analytics/v2/merchants/transactions";
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const MERCHANT_TX_FULL_SIZE = 50;
const MERCHANT_TX_MAX_PAGES = 12;
const CLIENT_ID = "go-biz-web-new";
// The GoBiz gateway rejects stale builds with a generic "update your app"
// error, so follow the version the portal currently serves.
const APP_VERSION = "platform-v3.131.0-93e290ae";

export const PAID_STATUSES = new Set(["settlement", "success", "paid", "capture"]);

function portalHeaders(extra, deviceId) {
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "id",
    "Authentication-Type": "go-id",
    Authorization: "Bearer",
    "Content-Type": "application/json",
    "Gojek-Country-Code": "ID",
    "Gojek-Timezone": "Asia/Jakarta",
    Origin: PORTAL_ORIGIN,
    Referer: `${PORTAL_ORIGIN}/`,
    "User-Agent": DEFAULT_UA,
    "x-appId": "go-biz-web-dashboard",
    "X-AppVersion": APP_VERSION,
    "x-DeviceOS": "Web",
    "X-Platform": "Web",
    "X-User-Type": "merchant",
    "x-uniqueid": deviceId || crypto.randomUUID(),
    "X-PhoneMake": "Windows 10 64-bit",
    "X-PhoneModel": "Chrome 148.0.0.0 on Windows 10 64-bit",
    "X-User-Locale": "en-US",
    ...(extra || {}),
  };
}

function apiHeaders(token, deviceId) {
  return portalHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    Authorization: `Bearer ${token}`,
  }, deviceId);
}

// GoBiz returns errors as `{ errors: [{ code, message }] }`, not as a single
// string. Without this the UI only ever showed "(403)" with no explanation.
// Upstream messages are Indonesian; normalise the common ones to English so
// the dashboard can translate them for the active locale.
function translateUpstream(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("otp") && (text.includes("tidak berlaku") || text.includes("invalid") || text.includes("kedaluwarsa") || text.includes("expired"))) {
    return "The OTP code is no longer valid. Request a new code.";
  }
  if (text.includes("terlalu banyak") || text.includes("too many")) {
    return "Too many attempts. Try again in a few minutes.";
  }
  if (text.includes("belum diverifikasi") || text.includes("not verified")) {
    return "This email is not verified yet. Verify it in the GoPay portal first.";
  }
  if (text.includes("perbarui versi") || text.includes("akses terbatas") || text.includes("update your")) {
    return "GoPay rejected this session. Sign in again.";
  }
  return message;
}

function upstreamError(body, status, fallback) {
  const list = Array.isArray(body?.errors) ? body.errors : [];
  const messages = list.map((item) => translateUpstream(String(item?.message || "").trim())).filter(Boolean);
  if (messages.length) return messages.join(" ");
  if (body?.error?.message) return translateUpstream(String(body.error.message));
  if (typeof body?.message === "string" && body.message.trim()) return translateUpstream(body.message.trim());
  if (typeof body?.error === "string" && body.error.trim()) return translateUpstream(body.error.trim());
  return fallback ? `${fallback} (${status}).` : `GoPay request failed (${status}).`;
}

function jakartaNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 7 * 3600000);
}

function toUtcIso(date) {
  return date.toISOString().replace("+00:00", "Z");
}

function buildTimeRange(range) {
  const now = jakartaNow();
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return [
      toUtcIso(new Date(start.getTime() - 7 * 3600000)),
      toUtcIso(new Date(end.getTime() - 7 * 3600000)),
    ];
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const nextMonth = now.getMonth() === 11
    ? new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0)
    : new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
  const end = new Date(nextMonth.getTime() - 1);
  return [
    toUtcIso(new Date(start.getTime() - 7 * 3600000)),
    toUtcIso(new Date(end.getTime() - 7 * 3600000)),
  ];
}

function grossAmountToRupiah(raw) {
  let n;
  try { n = parseInt(String(raw || "0"), 10); } catch { return 0; }
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1000000) return Math.floor(n / 100);
  return n;
}

function formatRupiah(amount) {
  const n = Math.floor(Number(amount) || 0);
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function normalizeTx(tx) {
  const orderId = String(tx.order_id || tx.wallstreet_transaction_id || "").trim();
  if (!orderId) return null;
  const amountRp = grossAmountToRupiah(tx.gross_amount || tx.real_gross_amount);
  const first = String(tx.customer_first_name || "").trim();
  const last = String(tx.customer_last_name || "").trim();
  const customer = [first, last].filter(Boolean).join(" ").trim();
  const rawStatus = String(tx.transaction_status || "").trim();
  const status = rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase() : "";
  let formatted = String(tx.transaction_time || "");
  try {
    const parsed = new Date(tx.transaction_time);
    if (!Number.isNaN(parsed.getTime())) {
      const utcMs = parsed.getTime() + parsed.getTimezoneOffset() * 60000;
      const wib = new Date(utcMs + 7 * 3600000);
      const dd = String(wib.getDate()).padStart(2, "0");
      const mm = String(wib.getMonth() + 1).padStart(2, "0");
      const yyyy = wib.getFullYear();
      const hh = String(wib.getHours()).padStart(2, "0");
      const mi = String(wib.getMinutes()).padStart(2, "0");
      const ss = String(wib.getSeconds()).padStart(2, "0");
      formatted = `${dd}/${mm}/${yyyy}, ${hh}.${mi}.${ss}`;
    }
  } catch { /* keep the raw timestamp */ }
  const issuer = String(tx.qris_provider_aspi_issuer || tx.qris_provider_aspi_acquirer || "").trim()
    || String(tx.payment_type || "").toUpperCase();
  return {
    id_trx: orderId,
    tanggal: formatted,
    timestamp: tx.transaction_time || null,
    issuer,
    jumlah: amountRp,
    nominal: formatRupiah(amountRp),
    nama: customer,
    status,
    status_key: rawStatus.toLowerCase(),
    type: "IN",
  };
}

function safeError(body) {
  const text = typeof body === "string" ? body : JSON.stringify(body || {});
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

async function fetchTransactionsPage(accessToken, merchantId, range, nextFromId, deviceId) {
  if (!accessToken || !merchantId) return { rows: [], status: 0, nextFrom: null };
  const [startIso, endIso] = buildTimeRange(range);
  const params = new URLSearchParams({
    size: String(MERCHANT_TX_FULL_SIZE),
    statuses: "SETTLEMENT,CAPTURE,REFUND,PARTIAL_REFUND",
    payment_types: "QRIS,GOPAY,OFFLINE_CREDIT_CARD,OFFLINE_DEBIT_CARD,CREDIT_CARD",
    start_time: startIso,
    end_time: endIso,
    merchant_ids: merchantId,
  });
  if (nextFromId) params.set("next_from_id", String(nextFromId));
  else params.set("from", "0");
  try {
    const response = await fetch(`${MERCHANT_TX_API}?${params.toString()}`, {
      method: "GET",
      headers: apiHeaders(accessToken, deviceId),
      signal: AbortSignal.timeout(16000),
    });
    if (response.status !== 200) return { rows: [], status: response.status, nextFrom: null };
    const payload = await response.json().catch(() => ({}));
    const txs = payload.transactions;
    if (!Array.isArray(txs)) return { rows: [], status: response.status, nextFrom: null };
    return {
      rows: txs.map(normalizeTx).filter(Boolean),
      status: response.status,
      nextFrom: payload.next_from_id || null,
      total: payload.total || txs.length,
    };
  } catch {
    return { rows: [], status: 0, nextFrom: null };
  }
}

export async function refreshGopaySession(session) {
  const refreshToken = String(session?.refresh_token || "");
  if (!refreshToken) return { session, refreshed: false };
  try {
    const response = await fetch(GOBIZ_TOKEN_API, {
      method: "POST",
      headers: portalHeaders(null, session?.device_id),
      body: JSON.stringify({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        // GoBiz nests the token inside `data`; sending it top-level is what
        // made session refresh fail with a generic 401.
        data: { refresh_token: refreshToken },
      }),
      signal: AbortSignal.timeout(16000),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status >= 400 || !body.access_token) return { session, refreshed: false };
    return {
      session: {
        ...session,
        access_token: body.access_token,
        refresh_token: body.refresh_token || refreshToken,
        authorized: true,
        updatedAt: new Date().toISOString(),
      },
      refreshed: true,
    };
  } catch {
    return { session, refreshed: false };
  }
}

export async function fetchGopayMutations(session, range = "month") {
  if (!session?.authorized || !session?.access_token) {
    return { rows: [], session, error: "not_connected" };
  }
  let access = session.access_token;
  let merchantId = session.merchant_id || "";
  let current = session;

  if (!merchantId) {
    try {
      const response = await fetch(GOBIZ_PROFILE_API, {
        method: "GET",
        headers: apiHeaders(access, session?.device_id),
        signal: AbortSignal.timeout(16000),
      });
      if (response.status === 200) {
        const data = await response.json().catch(() => ({}));
        merchantId = String(data?.user?.merchant_id || "");
      }
    } catch { /* mutations below will report the real failure */ }
  }
  if (!access || !merchantId) return { rows: [], session: current, error: "no_merchant" };

  const allRows = [];
  let nextFrom = null;
  let refreshed = false;
  for (let page = 0; page < MERCHANT_TX_MAX_PAGES; page += 1) {
    let batch = await fetchTransactionsPage(access, merchantId, range, nextFrom, current?.device_id);
    if (batch.status !== 200 && !allRows.length && (batch.status === 401 || batch.status === 403)) {
      const result = await refreshGopaySession(current);
      if (result.refreshed) {
        current = result.session;
        access = current.access_token;
        refreshed = true;
        batch = await fetchTransactionsPage(access, merchantId, range, nextFrom, current?.device_id);
      }
    }
    if (batch.status !== 200) {
      if (!allRows.length) {
        return {
          rows: [],
          session: current,
          refreshed,
          error: batch.status ? `upstream_${batch.status}` : "upstream_unreachable",
        };
      }
      break;
    }
    if (batch.rows.length) allRows.push(...batch.rows);
    if (!batch.nextFrom || batch.rows.length < MERCHANT_TX_FULL_SIZE) break;
    nextFrom = batch.nextFrom;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const seen = new Set();
  const rows = allRows.filter((row) => {
    const key = `${row.id_trx}|${row.tanggal}|${row.status}|${row.jumlah}|${row.issuer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    rows,
    session: { ...current, merchant_id: merchantId, updatedAt: new Date().toISOString() },
    refreshed,
  };
}

async function buildSession(email, tokenBody, deviceId) {
  let merchantId = "";
  let merchantName = "";
  try {
    const profileResponse = await fetch(GOBIZ_PROFILE_API, {
      method: "GET",
      headers: apiHeaders(tokenBody.access_token, deviceId),
      signal: AbortSignal.timeout(16000),
    });
    const profileBody = await profileResponse.json().catch(() => ({}));
    merchantId = String(profileBody?.user?.merchant_id || "");
    merchantName = String(profileBody?.user?.name || profileBody?.user?.merchant_name || "");
  } catch { /* profile is optional for mutations */ }

  return {
    email,
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token || "",
    merchant_id: merchantId,
    merchant_name: merchantName,
    device_id: deviceId,
    authorized: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function loginGopayMerchant(email, password) {
  const deviceId = crypto.randomUUID();
  const loginResponse = await fetch(GOBIZ_LOGIN_REQUEST_URL, {
    method: "POST",
    headers: portalHeaders(null, deviceId),
    body: JSON.stringify({ email, login_type: "password", client_id: CLIENT_ID }),
    signal: AbortSignal.timeout(20000),
  });
  const loginBody = await loginResponse.json().catch(() => ({}));
  if (loginResponse.status >= 400 || loginBody.success === false) {
    throw new Error(upstreamError(loginBody, loginResponse.status, "GoPay Merchant email could not be verified"));
  }

  const tokenResponse = await fetch(GOBIZ_TOKEN_API, {
    method: "POST",
    headers: portalHeaders(null, deviceId),
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: "password",
      data: { email, password },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (tokenResponse.status >= 400 || !tokenBody.access_token) {
    throw new Error(upstreamError(tokenBody, tokenResponse.status, "The email or password is incorrect, or this account must sign in with an OTP code"));
  }

  return buildSession(email, tokenBody, deviceId);
}

// Request a one-time code by email. The portal offers this as the primary
// sign-in path, and it is the only one that works for accounts that never set
// a password (or that GoBiz now challenges with 403 on password login).
export async function requestGopayOtp(email) {
  const deviceId = crypto.randomUUID();
  const response = await fetch(GOBIZ_LOGIN_REQUEST_URL, {
    method: "POST",
    headers: portalHeaders(null, deviceId),
    body: JSON.stringify({ email, client_id: CLIENT_ID }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status >= 400 || body.success === false) {
    throw new Error(upstreamError(body, response.status, "Failed to send the GoPay OTP code"));
  }
  return {
    deviceId,
    otpToken: String(body?.data?.otp_token || ""),
    expiresIn: Number(body?.data?.otp_expires_in) || 0,
    otpLength: Number(body?.data?.otp_length) || 0,
  };
}

export async function loginGopayMerchantWithOtp(email, otp, otpToken, deviceId) {
  const device = deviceId || crypto.randomUUID();
  const tokenResponse = await fetch(GOBIZ_TOKEN_API, {
    method: "POST",
    headers: portalHeaders(null, device),
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: "otp",
      data: { otp: String(otp), otp_token: otpToken },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (tokenResponse.status >= 400 || !tokenBody.access_token) {
    throw new Error(upstreamError(tokenBody, tokenResponse.status, "The GoPay OTP code is invalid or has expired"));
  }
  return buildSession(email, tokenBody, device);
}

export { formatRupiah, safeError };
