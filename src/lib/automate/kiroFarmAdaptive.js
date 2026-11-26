import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAutomateConfig, updateAutomateConfig } from "@/lib/db/repos/automateRepo";
import { makeKv } from "@/lib/db/helpers/kvStore";
import { applyKiroFarmEnv } from "./kiroFarmConfig.js";
import { findRunningKrgPids } from "@/lib/kiroSuspensionHook";

/**
 * Adaptive Kiro farm proxy.
 *
 * AWS rejects signups from some exit IPs (ERR-837 / "Authorization page tidak
 * muncul") but the winning exit changes over time: direct is sometimes better
 * than the WARP pool and vice-versa. Rather than pinning one mode forever, the
 * background health tick reads the krg.js batch summaries and flips
 * `kiroFarmProxy` when the current mode keeps producing zero-success batches.
 *
 * Evidence source: krg.js appends one line per finished batch to
 * `$ROUTERMOD_KIRO_REG_DIR/krg_js.log`:
 *   BATCH FINISHED · RESULT: 0/4 SUCCESS
 *
 * Safety rails:
 *   - a switch needs N consecutive zero-success batches (default 3);
 *   - at least MIN_INTERVAL_MS between two switches (default 10 min);
 *   - batches written by the krg process that was already running when the
 *     switch happened are ignored. krg inherits its env at spawn time, so the
 *     new mode only takes effect after that process exits.
 *
 * Env knobs:
 *   ROUTERMOD_KIRO_ADAPTIVE            (default on; "0"/"off" disables)
 *   ROUTERMOD_KIRO_ADAPT_FAIL_BATCHES  (default 3 consecutive 0-success batches)
 *   ROUTERMOD_KIRO_ADAPT_MIN_INTERVAL_MS (default 600000 — 10 min)
 *   ROUTERMOD_KIRO_REG_LOG             (default $ROUTERMOD_KIRO_REG_DIR/krg_js.log)
 */

const KV_SCOPE = "kiroFarmAdaptive";
const KV_KEY = "state";
const MAX_TAIL_BYTES = 2 * 1024 * 1024; // only the newest batches matter
const DEFAULT_FAIL_BATCHES = 3;
const DEFAULT_MIN_INTERVAL_MS = 10 * 60 * 1000;

const adaptiveKv = makeKv(KV_SCOPE);

function adaptiveEnabled() {
  const raw = String(process.env.ROUTERMOD_KIRO_ADAPTIVE ?? "1").toLowerCase();
  return !["0", "off", "false", "no"].includes(raw);
}

function failBatches() {
  const value = Number(process.env.ROUTERMOD_KIRO_ADAPT_FAIL_BATCHES);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_FAIL_BATCHES;
}

function minIntervalMs() {
  const value = Number(process.env.ROUTERMOD_KIRO_ADAPT_MIN_INTERVAL_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MIN_INTERVAL_MS;
}

export function kiroRegistrationLogPath() {
  const dir = process.env.ROUTERMOD_KIRO_REG_DIR || path.join(os.homedir(), "reg");
  return process.env.ROUTERMOD_KIRO_REG_LOG || path.join(dir, "krg_js.log");
}

/** Parse "BATCH FINISHED · RESULT: x/y SUCCESS" lines, oldest first. */
export function parseBatchResults(text) {
  if (!text) return [];
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
  const re = /BATCH FINISHED\s*[·.]?\s*RESULT:\s*(\d+)\s*\/\s*(\d+)\s*SUCCESS/g;
  const out = [];
  for (const match of clean.matchAll(re)) {
    const successes = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(successes) || !Number.isFinite(total)) continue;
    out.push({ successes, total });
  }
  return out;
}

/** Read only the part of the log written since `offset` (bounded to MAX_TAIL). */
export function readBatchResultsSince(file, offset = 0) {
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    return { size: null, results: [] };
  }
  if (offset > size) return { size, results: [] }; // log was truncated/rotated
  let start = Math.max(0, offset);
  if (size - start > MAX_TAIL_BYTES) start = size - MAX_TAIL_BYTES;
  if (start >= size) return { size, results: [] };

  const length = size - start;
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buffer, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }

  let text = buffer.toString("utf8");
  // If the tail window starts mid-line, drop that partial line. When start is
  // exactly the mode boundary it is already line-aligned, so keep everything.
  if (start > offset) {
    const newline = text.indexOf("\n");
    text = newline >= 0 ? text.slice(newline + 1) : "";
  }
  return { size, results: parseBatchResults(text) };
}

/**
 * Pure decision: flip proxy when the newest `minBatches` batches under the
 * current mode all finished with zero successes.
 * @returns {boolean|null} the next proxy value, or null to keep the current one.
 */
export function shouldSwitchKiroFarmProxy({
  proxy,
  batches,
  nowMs = Date.now(),
  lastSwitchAt = 0,
  minBatches = DEFAULT_FAIL_BATCHES,
  minInterval = DEFAULT_MIN_INTERVAL_MS,
} = {}) {
  if (!Array.isArray(batches) || batches.length < minBatches) return null;
  if (nowMs - lastSwitchAt < minInterval) return null;
  const recent = batches.slice(-minBatches);
  const succeeded = recent.some((batch) => Number(batch?.successes) > 0);
  if (succeeded) return null;
  return !proxy;
}

function samePid(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return Number(a) === Number(b);
}

/**
 * Evaluate the krg.log and switch the proxy mode when it keeps failing.
 * Safe to call on every health tick; all side effects are injectable for tests.
 */
export async function maybeAdaptKiroFarmProxy(deps = {}) {
  if (!adaptiveEnabled()) return { switched: false, reason: "disabled" };

  const {
    nowMs = Date.now(),
    logFile = kiroRegistrationLogPath(),
    findPids = findRunningKrgPids,
    kv = adaptiveKv,
    getConfig = getAutomateConfig,
    persistConfig = updateAutomateConfig,
    applyEnv = applyKiroFarmEnv,
  } = deps;

  const config = await getConfig();
  const proxy = config?.kiroFarmProxy !== false;
  const livePids = (() => {
    try { return findPids() || []; } catch { return []; }
  })();
  const currentPid = livePids.length > 0 ? Number(livePids[0]) : null;

  let state = await kv.get(KV_KEY, null);
  if (!state || typeof state !== "object") {
    // First observation: start counting from the current end of the log.
    const { size } = readBatchResultsSince(logFile, 0);
    state = { proxy, switchedAt: 0, offset: size || 0, pendingPid: currentPid };
    await kv.set(KV_KEY, state);
    return { switched: false, reason: "initialized" };
  }

  // A manual toggle in the dashboard resets the evidence window too: the
  // running krg process still uses its old env until it exits.
  if (Boolean(state.proxy) !== proxy) {
    const { size } = readBatchResultsSince(logFile, 0);
    state = { proxy, switchedAt: nowMs, offset: size || 0, pendingPid: currentPid };
    await kv.set(KV_KEY, state);
    return { switched: false, reason: "manual-change" };
  }

  // The process that was alive during the switch still runs the old mode.
  // Ignore its remaining batches; start counting after it exits.
  if (state.pendingPid !== null && state.pendingPid !== undefined) {
    if (samePid(state.pendingPid, currentPid)) {
      return { switched: false, reason: "waiting-for-old-batch" };
    }
    const { size } = readBatchResultsSince(logFile, 0);
    state = { ...state, offset: size || 0, pendingPid: null };
    await kv.set(KV_KEY, state);
    return { switched: false, reason: "old-batch-exited" };
  }

  const { size, results } = readBatchResultsSince(logFile, state.offset || 0);
  if (size === null) return { switched: false, reason: "no-log" };
  if (size < (state.offset || 0)) {
    // Rotation: the previous offset no longer points at the current mode.
    await kv.set(KV_KEY, { ...state, offset: 0 });
    return { switched: false, reason: "log-rotated" };
  }

  const nextProxy = shouldSwitchKiroFarmProxy({
    proxy,
    batches: results,
    nowMs,
    lastSwitchAt: Number(state.switchedAt) || 0,
    minBatches: failBatches(),
    minInterval: minIntervalMs(),
  });
  if (nextProxy === null) return { switched: false, reason: "healthy-or-warming-up" };

  const merged = { ...config, kiroFarmProxy: nextProxy };
  await persistConfig(merged);
  applyEnv(merged);
  const nextState = {
    proxy: nextProxy,
    switchedAt: nowMs,
    offset: size,
    pendingPid: currentPid,
  };
  await kv.set(KV_KEY, nextState);

  const from = proxy ? "PROXY" : "DIRECT";
  const to = nextProxy ? "PROXY" : "DIRECT";
  console.log(`[KIRO_FARM] ${from} → ${to} (${failBatches()} batch terakhir 0 sukses)`);
  return { switched: true, proxy: nextProxy, from, to };
}
