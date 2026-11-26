// Payment settings live in the generic `kv` table under the `payment` scope.
// Keeping them out of the main settings blob means GoPay access/refresh tokens
// never leak through GET /api/settings, which only redacts the dashboard
// password and OIDC secret.
import { getAdapter } from "../driver.js";

const SCOPE = "payment";
const CONFIG_KEY = "config";
const GOPAY_KEY = "gopaySession";

export const DEFAULT_PAYMENT_CONFIG = {
  qrisTemplate: "",
  qrisMerchant: "",
  qrisUpdatedAt: "",
  topupMin: 10000,
  topupMax: 10000000,
};

function parse(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function readKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, key]);
  return row?.value || null;
}

async function writeKey(key, value) {
  const db = await getAdapter();
  if (value === null) {
    db.run(`DELETE FROM kv WHERE scope = ? AND key = ?`, [SCOPE, key]);
    return;
  }
  db.run(
    `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [SCOPE, key, JSON.stringify(value)],
  );
}

export async function getPaymentConfig() {
  const raw = parse(await readKey(CONFIG_KEY), {});
  return {
    ...DEFAULT_PAYMENT_CONFIG,
    ...raw,
    topupMin: Number(raw.topupMin) || DEFAULT_PAYMENT_CONFIG.topupMin,
    topupMax: Number(raw.topupMax) || DEFAULT_PAYMENT_CONFIG.topupMax,
  };
}

export async function updatePaymentConfig(patch = {}) {
  const current = await getPaymentConfig();
  const next = { ...current, ...patch };
  await writeKey(CONFIG_KEY, next);
  return next;
}

export async function clearQrisTemplate() {
  return updatePaymentConfig({ qrisTemplate: "", qrisMerchant: "", qrisUpdatedAt: "" });
}

export async function getGopaySession() {
  return parse(await readKey(GOPAY_KEY), { authorized: false });
}

export async function saveGopaySession(session) {
  const next = { ...session, updatedAt: new Date().toISOString() };
  await writeKey(GOPAY_KEY, next);
  return next;
}

export async function clearGopaySession() {
  await writeKey(GOPAY_KEY, null);
}

export function publicGopayStatus(session) {
  return {
    authorized: !!session?.authorized,
    email: session?.email || "",
    merchantId: session?.merchant_id || "",
    merchantName: session?.merchant_name || "",
    updatedAt: session?.updatedAt || "",
  };
}
