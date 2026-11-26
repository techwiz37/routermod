import { getAdapter } from "../driver.js";
import { getKeyInFlight } from "./keyUsageRepo.js";
import { customApiKeyError, maskApiKey } from "@/shared/utils/customApiKey.js";
import { createHash } from "node:crypto";

const RETIRED_SCOPE = "retired-api-key-secrets";
const fingerprint = (key) => createHash("sha256").update(key).digest("hex");

// A request that finished during rotation still belongs to the same key ID.
// This mapping is for accounting only; authentication never accepts old keys.
export function resolveUsageApiKey(db, key) {
  if (typeof key !== "string" || !key) return key;
  const retired = db.get("SELECT value FROM kv WHERE scope = ? AND key = ?", [RETIRED_SCOPE, fingerprint(key)]);
  return retired ? db.get("SELECT key FROM apiKeys WHERE id = ?", [retired.value])?.key || key : key;
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

// The caller supplies only the authenticated secret, never an arbitrary key ID.
// Keep the identity, policies, historical quota usage, and daily aggregates.
export async function replaceOwnApiKey(currentKey, newKey) {
  const validation = customApiKeyError(newKey);
  if (validation) fail(400, validation);
  const db = await getAdapter();
  let result;
  db.transaction(() => {
    const record = db.get("SELECT * FROM apiKeys WHERE key = ?", [currentKey]);
    if (!record?.isActive || (record.expiresAt && Date.parse(record.expiresAt) <= Date.now())) {
      fail(401, "Sesi key tidak valid. Masukkan API key kembali.");
    }
    if (record?.changeKeyEnabled === 0 || record?.changeKeyEnabled === false) {
      fail(403, "Perubahan key dinonaktifkan oleh admin.");
    }
    if (newKey === currentKey) fail(400, "API key baru harus berbeda dari key saat ini.");
    if (getKeyInFlight(currentKey) > 0) fail(409, "Masih ada request aktif. Tunggu sampai selesai sebelum mengganti key.");
    // Reject historical secrets as well, so another customer's usage can never
    // become attached to this account by choosing a previously used value.
    if (db.get("SELECT value FROM kv WHERE scope = ? AND key = ?", [RETIRED_SCOPE, fingerprint(newKey)]) ||
        db.get("SELECT id FROM apiKeys WHERE key = ?", [newKey]) ||
        db.get("SELECT id FROM usageHistory WHERE apiKey = ? LIMIT 1", [newKey])) {
      fail(409, "API key tersebut tidak tersedia. Gunakan nilai lain.");
    }
    db.run("INSERT INTO kv(scope, key, value) VALUES(?, ?, ?)", [RETIRED_SCOPE, fingerprint(currentKey), record.id]);
    db.run("UPDATE apiKeys SET key = ? WHERE id = ? AND key = ?", [newKey, record.id, currentKey]);
    db.run("UPDATE usageHistory SET apiKey = ? WHERE apiKey = ?", [newKey, currentKey]);
    const days = db.all("SELECT dateKey, data FROM usageDaily");
    for (const day of days) {
      const data = JSON.parse(day.data);
      let changed = false;
      for (const [aggregateKey, value] of Object.entries(data.byApiKey || {})) {
        if (value.apiKey !== currentKey) continue;
        const nextAggregateKey = `${newKey}${aggregateKey.slice(currentKey.length)}`;
        data.byApiKey[nextAggregateKey] = { ...value, apiKey: newKey };
        delete data.byApiKey[aggregateKey];
        changed = true;
      }
      if (changed) db.run("UPDATE usageDaily SET data = ? WHERE dateKey = ?", [JSON.stringify(data), day.dateKey]);
    }
    result = { name: record.name, masked: maskApiKey(newKey) };
  });
  return result;
}
