import test from "node:test";
import assert from "node:assert/strict";

// Alias resolver register (same setup as the other integration tests)
import { register } from "node:module";
register("./alias-resolver.mjs", import.meta.url);

// Keep the hook's lock file isolated from the live server's lock.
process.env.ROUTERMOD_KIRO_REG_LOCK = "/tmp/routermod-kiro-reg-test.lock";

const { selectConnectionsNeedingRefresh, isRefreshRejectedCooldown, runBackgroundTokenRefreshTick } = await import("../src/sse/services/backgroundTokenRefresh.js");
const { isConnectionDead, isConnectionLimited, shouldRetireDeadKiroGrant, countKiroReady, shouldTopUpKiroPool } = await import("../src/sse/services/backgroundConnectionHealth.js");
const { runKiroSuspensionHook } = await import("../src/lib/kiroSuspensionHook.js");
const { getKiroRefreshRejection, kiroRefreshFingerprint } = await import("../open-sse/shared/kiroRefreshState.js");
const { isKiroSuspension } = await import("../open-sse/shared/kiroSuspension.js");
const { claimScheduler, releaseScheduler } = await import("../src/lib/singletonScheduler.js");

const now = Date.parse("2026-11-25T00:00:00.000Z");
const iso = (msOffset) => new Date(now + msOffset).toISOString();

test("scheduler guard is process-wide so two module copies cannot start one interval twice", () => {
  assert.equal(claimScheduler("test-scheduler"), true);
  assert.equal(claimScheduler("test-scheduler"), false);
  releaseScheduler("test-scheduler");
  assert.equal(claimScheduler("test-scheduler"), true);
  releaseScheduler("test-scheduler");
});

test("auto refresh skips custom / hardcoded API-key providers (nothing to refresh)", () => {
  const custom = { provider: "openai-compatible-chat-abc", authType: "apikey", isActive: true, apiKey: "sk-..." };
  const oauth = {
    provider: "kiro", authType: "oauth", isActive: true,
    refreshToken: "aorAAAAAG...", expiresAt: iso(-60_000),
  };
  assert.deepEqual(selectConnectionsNeedingRefresh([custom], now), []);
  assert.equal(selectConnectionsNeedingRefresh([oauth], now).length, 1);
});

test("auto refresh skips inactive accounts and distant expiries", () => {
  const inactive = { provider: "codex", authType: "oauth", isActive: false, refreshToken: "rt", expiresAt: iso(-1000) };
  const future = { provider: "codex", authType: "oauth", isActive: true, refreshToken: "rt", expiresAt: iso(6 * 60 * 60_000) };
  assert.deepEqual(selectConnectionsNeedingRefresh([inactive, future], now), []);
});

test("a background refresh tick refreshes only due OAuth accounts and swallows failures", async () => {
  const refreshed = [];
  const realNow = Date.now();
  const ago = (ms) => new Date(realNow - ms).toISOString();
  const kiro = {
    id: "kiro-1", provider: "kiro", authType: "oauth", isActive: true,
    refreshToken: "rt-kiro", expiresAt: ago(1000),
  };
  const codex = {
    id: "codex-1", provider: "codex", authType: "oauth", isActive: true,
    refreshToken: "rt-codex", expiresAt: ago(1000),
  };
  const custom = {
    id: "custom-1", provider: "openai-compatible-chat-x", authType: "apikey", isActive: true,
    apiKey: "sk-x",
  };
  const disabled = { ...codex, id: "codex-2", isActive: false };

  await runBackgroundTokenRefreshTick({
    loadConnections: async () => [kiro, codex, custom, disabled],
    refreshConnection: async (conn) => {
      refreshed.push(conn.id);
      if (conn.id === "kiro-1") throw new Error("transient upstream error");
    },
    sleep: async () => {},
  });

  assert.deepEqual(refreshed, ["kiro-1", "codex-1"]);
});

test("auto refresh respects rejection cooldown for Kiro and generic providers", () => {
  const fingerprint = kiroRefreshFingerprint("rt", { authMethod: "builder-id" });
  // Rejection TTL is checked against Date.now(); use a wall-clock-relative
  // timestamp so this test stays valid over time.
  const recent = new Date(Date.now() - 60_000).toISOString();
  const kiro = {
    provider: "kiro", authType: "oauth", refreshToken: "rt", expiresAt: iso(-1000),
    providerSpecificData: { authMethod: "builder-id", kiroRefreshError: {
      code: "access_denied", fingerprint, rejectedAt: recent,
    } },
  };
  assert.equal(isRefreshRejectedCooldown(kiro), true);
  assert.deepEqual(selectConnectionsNeedingRefresh([kiro]), []);
  assert.ok(getKiroRefreshRejection(kiro));

  const google = {
    provider: "antigravity", authType: "oauth", refreshToken: "rt", expiresAt: iso(-1000),
    lastError: "Refresh token ditolak: invalid_grant", lastErrorAt: recent,
  };
  assert.equal(isRefreshRejectedCooldown(google), true);
  assert.deepEqual(selectConnectionsNeedingRefresh([google]), []);
});

test("health checker does not re-probe cooldown/rejected connections", () => {
  const rejected = {
    isActive: true, testStatus: "error", refreshToken: "rt",
    provider: "kiro", authType: "oauth",
    providerSpecificData: { kiroRefreshError: {
      code: "access_denied", fingerprint: kiroRefreshFingerprint("rt", {}),
      rejectedAt: new Date(Date.now() - 60_000).toISOString(),
    } },
  };
  assert.equal(isConnectionDead(rejected), false);
  assert.equal(isConnectionLimited({ rateLimitedUntil: new Date(Date.now() + 60_000).toISOString() }), true);
});

test("permanently rejected Kiro grant is retired after grace so krg can replace it", () => {
  const base = {
    provider: "kiro", refreshToken: "rt",
    providerSpecificData: { authMethod: "builder-id" },
  };
  const fingerprint = kiroRefreshFingerprint("rt", base.providerSpecificData);
  const withRejection = (rejectedAt) => ({
    ...base,
    providerSpecificData: {
      ...base.providerSpecificData,
      kiroRefreshError: { code: "access_denied", fingerprint, rejectedAt },
    },
  });
  assert.equal(shouldRetireDeadKiroGrant(withRejection(iso(-16 * 60_000)), now), true);
  assert.equal(shouldRetireDeadKiroGrant(withRejection(iso(-2 * 60_000)), now), false);
  assert.equal(shouldRetireDeadKiroGrant({ ...withRejection(iso(-16 * 60_000)), provider: "codex" }, now), false);
  assert.equal(shouldRetireDeadKiroGrant(base, now), false);
});

test("suspended Kiro detection catches the upstream reason codes used for auto-delete", () => {
  assert.equal(isKiroSuspension("TEMPORARILY_SUSPENDED_USER"), true);
  assert.equal(isKiroSuspension("Kiro User ID is suspended: 1234"), true);
  assert.equal(isKiroSuspension("Your account has been suspended"), true);
  assert.equal(isKiroSuspension("HTTP 402 You have reached the limit"), false);
  assert.equal(isKiroSuspension("invalid_grant"), false);
});

test("krg auto-trigger is singleton: repeated suspension triggers spawn once", () => {
  let spawns = 0;
  const runner = () => { spawns++; return { pid: process.pid + 100000 }; };
  const deps = { findRunningKrgPids: () => [] }; // ignore any real live batch
  // First trigger spawns, the rest are ignored by the spawn cooldown.
  assert.equal(runKiroSuspensionHook("acc-1", runner, deps), true);
  assert.equal(runKiroSuspensionHook("acc-2", runner, deps), false);
  assert.equal(runKiroSuspensionHook("acc-3", runner, deps), false);
  assert.equal(spawns, 1);
});

test("ready Kiro pool counts only credentials that can actually serve requests", () => {
  const healthy = { provider: "kiro", isActive: true, testStatus: "active" };
  const inactive = { provider: "kiro", isActive: false, testStatus: "active" };
  const quotaLocked = { provider: "kiro", isActive: true, testStatus: "active", lastError: "402 You have reached the limit" };
  const deadBadge = { provider: "kiro", isActive: true, testStatus: "unavailable" };
  const rejected = {
    provider: "kiro", isActive: true, refreshToken: "rt",
    providerSpecificData: { kiroRefreshError: {
      code: "access_denied", fingerprint: kiroRefreshFingerprint("rt", {}),
      rejectedAt: new Date(Date.now() - 60_000).toISOString(),
    } },
  };
  const otherProvider = { provider: "codex", isActive: true, testStatus: "active" };

  assert.equal(countKiroReady([healthy, inactive, quotaLocked, deadBadge, rejected, otherProvider]), 1);
  assert.equal(countKiroReady([]), 0);
  assert.equal(countKiroReady(null), 0);
});

test("empty Kiro pool asks for a replacement batch instead of staying empty", () => {
  const limited = { provider: "kiro", isActive: false, lastError: "402 You have reached the limit" };
  const healthy = { provider: "kiro", isActive: true, testStatus: "active" };
  const nowMs = Date.parse("2026-11-25T12:00:00.000Z");
  const longAgo = 0;

  // Empty / all-unusable pool → refill requested.
  assert.equal(shouldTopUpKiroPool([limited], { minReady: 1, nowMs, lastTopUpAt: longAgo }), true);
  assert.equal(shouldTopUpKiroPool([], { minReady: 1, nowMs, lastTopUpAt: longAgo }), true);
  // Pool already at the floor → nothing to do.
  assert.equal(shouldTopUpKiroPool([healthy], { minReady: 1, nowMs, lastTopUpAt: longAgo }), false);
  // Inside the top-up gap → stay quiet so batches cannot stack up.
  assert.equal(shouldTopUpKiroPool([], { minReady: 1, nowMs, lastTopUpAt: nowMs - 1000 }), false);
  // Disabled floor → watchdog off entirely.
  assert.equal(shouldTopUpKiroPool([], { minReady: 0, nowMs, lastTopUpAt: longAgo }), false);
});
