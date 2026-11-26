import test from "node:test";
import assert from "node:assert/strict";
import {
  kiroRefreshFingerprint,
  getKiroRefreshRejection,
  isKiroRefreshRejectionExpired,
  kiroRefreshRejectedError,
} from "../open-sse/shared/kiroRefreshState.js";

const refToken = "aorAAAAAG-test-refresh-token";
const meta = { authMethod: "builder-id", clientId: "client-1", clientSecret: "secret-1", region: "us-east-1" };
const now = Date.parse("2026-11-24T14:00:00.000Z");

function credentials({ refreshToken = refToken, providerSpecificData = {} } = {}) {
  return { refreshToken, providerSpecificData };
}

function rejection(overrides = {}) {
  return {
    error: "unrecoverable_refresh_error",
    code: "access_denied",
    description: "Kiro authorization was rejected. Please sign in to Kiro again.",
    fingerprint: kiroRefreshFingerprint(refToken, meta),
    rejectedAt: new Date(now - 60_000).toISOString(),
    ...overrides,
  };
}

test("fingerprint binds the grant to its client metadata", () => {
  assert.equal(kiroRefreshFingerprint(refToken, meta), kiroRefreshFingerprint(refToken, meta));
  assert.notEqual(kiroRefreshFingerprint(refToken, meta), kiroRefreshFingerprint("aorAAAAAG-other", meta));
  assert.notEqual(kiroRefreshFingerprint(refToken, meta), kiroRefreshFingerprint(refToken, { ...meta, region: "eu-central-1" }));
});

test("matching rejection is surfaced as a 401 with the kiro_refresh_rejected code", () => {
  const creds = credentials({ providerSpecificData: { ...meta, kiroRefreshError: rejection() } });
  const active = getKiroRefreshRejection(creds, now);
  assert.ok(active);
  const error = kiroRefreshRejectedError(active);
  assert.equal(error.code, "kiro_refresh_rejected");
  assert.equal(error.status, 401);
});

test("a newly added account (different grant) is never treated as rejected", () => {
  const creds = credentials({
    refreshToken: "aorAAAAAG-brand-new-account",
    providerSpecificData: { ...meta, kiroRefreshError: rejection() },
  });
  assert.equal(getKiroRefreshRejection(creds, now), null);
});

test("rejection expires so a stale marker cannot permanently block an account", () => {
  const sixHours = 6 * 60 * 60 * 1000;
  const creds = credentials({
    providerSpecificData: { ...meta, kiroRefreshError: rejection({ rejectedAt: new Date(now).toISOString() }) },
  });
  assert.ok(getKiroRefreshRejection(creds, now + sixHours - 1000));
  assert.equal(getKiroRefreshRejection(creds, now + sixHours), null);
});

test("legacy rejection without rejectedAt is ignored", () => {
  const creds = credentials({
    providerSpecificData: { ...meta, kiroRefreshError: rejection({ rejectedAt: undefined }) },
  });
  assert.equal(getKiroRefreshRejection(creds, now), null);
  assert.equal(isKiroRefreshRejectionExpired(null), true);
});

test("rejection requires a refresh token on the credentials", () => {
  const creds = credentials({ refreshToken: null, providerSpecificData: { ...meta, kiroRefreshError: rejection() } });
  assert.equal(getKiroRefreshRejection(creds, now), null);
});
