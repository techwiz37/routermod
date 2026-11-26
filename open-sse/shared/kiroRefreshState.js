import { createHash } from "node:crypto";
import { PROVIDER_OAUTH } from "../config/providers.js";

// A rejection must not be a life sentence. Its lifetime matches the in-process
// refresh dedup TTL, so once the cached result expires the account is allowed
// to try the grant again. Rejections written by older builds (no rejectedAt)
// are ignored so an upgrade cannot strand accounts on a stale marker.
const REJECTION_TTL_MS = PROVIDER_OAUTH?.kiro?.refreshRejectedCacheMs ?? 6 * 60 * 60 * 1000;

// Bind rejection to the grant AND client metadata. Reauthorizing or repairing
// the stored region/client must make the connection eligible again.
export function kiroRefreshFingerprint(refreshToken, data = {}) {
  return createHash("sha256").update(JSON.stringify([
    refreshToken, data.authMethod || "", data.clientId || "",
    data.clientSecret || "", data.region || "", data.tokenEndpoint || "",
  ])).digest("hex");
}

export function isKiroRefreshRejectionExpired(rejection, nowMs = Date.now()) {
  if (!rejection) return true;
  const rejectedAt = Date.parse(rejection.rejectedAt || "");
  if (!Number.isFinite(rejectedAt)) return true;
  return nowMs - rejectedAt >= REJECTION_TTL_MS;
}

export function getKiroRefreshRejection(credentials, nowMs = Date.now()) {
  const data = credentials?.providerSpecificData || {};
  const rejection = data.kiroRefreshError;
  if (!rejection || !credentials?.refreshToken) return null;
  if (isKiroRefreshRejectionExpired(rejection, nowMs)) return null;
  return rejection.fingerprint === kiroRefreshFingerprint(credentials.refreshToken, data)
    ? rejection : null;
}

export function kiroRefreshRejectedError(rejection) {
  const error = new Error(rejection?.description || "Kiro authorization was rejected. Please sign in to Kiro again.");
  error.code = "kiro_refresh_rejected";
  error.status = 401;
  return error;
}
