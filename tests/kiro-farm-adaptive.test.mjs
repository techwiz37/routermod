import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { register } from "node:module";
register("./alias-resolver.mjs", import.meta.url);

const {
  parseBatchResults,
  readBatchResultsSince,
  shouldSwitchKiroFarmProxy,
  maybeAdaptKiroFarmProxy,
} = await import("../src/lib/automate/kiroFarmAdaptive.js");

const BATCH = (ok, total = 4) => `BATCH FINISHED · RESULT: ${ok}/${total} SUCCESS\n`;

function memoryKv(initial = null) {
  let value = initial;
  return {
    async get() { return value; },
    async set(_key, next) { value = next; },
    read() { return value; },
  };
}

test("parses only batch summary lines and ignores ANSI colours", () => {
  const text = [
    "\x1b[36m  KIRO AUTO REGISTRATION · TOTAL TARGET: 4\x1b[0m",
    BATCH(0),
    "some unrelated log line",
    BATCH(3),
    BATCH(1, 2),
  ].join("");
  assert.deepEqual(parseBatchResults(text), [
    { successes: 0, total: 4 },
    { successes: 3, total: 4 },
    { successes: 1, total: 2 },
  ]);
  assert.deepEqual(parseBatchResults(""), []);
});

test("switches proxy only after N consecutive zero-success batches", () => {
  const now = Date.parse("2026-11-26T10:00:00.000Z");
  const zeros = [{ successes: 0, total: 4 }, { successes: 0, total: 4 }, { successes: 0, total: 4 }];

  // Not enough evidence yet.
  assert.equal(shouldSwitchKiroFarmProxy({ proxy: true, batches: zeros.slice(0, 2), nowMs: now }), null);
  // One success in the window means the mode is still working.
  assert.equal(
    shouldSwitchKiroFarmProxy({ proxy: true, batches: [...zeros.slice(0, 2), { successes: 1, total: 4 }], nowMs: now }),
    null,
  );
  // Three failed batches flip the mode in both directions.
  assert.equal(shouldSwitchKiroFarmProxy({ proxy: true, batches: zeros, nowMs: now }), false);
  assert.equal(shouldSwitchKiroFarmProxy({ proxy: false, batches: zeros, nowMs: now }), true);
  // Cooldown stops rapid flip-flopping.
  assert.equal(shouldSwitchKiroFarmProxy({ proxy: true, batches: zeros, nowMs: now, lastSwitchAt: now - 1000 }), null);
});

test("reads only the log region written after the last switch", () => {
  const file = path.join(os.tmpdir(), `krg-adapt-${process.pid}.log`);
  fs.writeFileSync(file, BATCH(0) + BATCH(0) + BATCH(0));
  const first = readBatchResultsSince(file, 0);
  assert.equal(first.results.length, 3);
  const firstLength = first.size;

  fs.appendFileSync(file, BATCH(2));
  const after = readBatchResultsSince(file, firstLength);
  assert.deepEqual(after.results, [{ successes: 2, total: 4 }]);

  fs.rmSync(file, { force: true });
});

test("adaptive switch persists config and applies the new env", async () => {
  const file = path.join(os.tmpdir(), `krg-adapt-orch-${process.pid}.log`);
  fs.writeFileSync(file, BATCH(0) + BATCH(0) + BATCH(0));

  const kv = memoryKv({ proxy: true, switchedAt: 0, offset: 0, pendingPid: null });
  const persisted = [];
  const applied = [];
  const result = await maybeAdaptKiroFarmProxy({
    nowMs: Date.parse("2026-11-26T10:00:00.000Z"),
    logFile: file,
    findPids: () => [],
    kv,
    getConfig: async () => ({ enabled: true, kiroFarmProxy: true, kiroFarmHuman: true }),
    persistConfig: async (cfg) => persisted.push(cfg),
    applyEnv: (cfg) => applied.push(cfg),
  });

  assert.equal(result.switched, true);
  assert.equal(result.to, "DIRECT");
  assert.equal(persisted[0].kiroFarmProxy, false);
  assert.equal(applied[0].kiroFarmProxy, false);
  assert.equal(kv.read().proxy, false);

  fs.rmSync(file, { force: true });
});

test("adaptive switch waits for the old krg process to exit before counting", async () => {
  const file = path.join(os.tmpdir(), `krg-adapt-pid-${process.pid}.log`);
  fs.writeFileSync(file, BATCH(0) + BATCH(0) + BATCH(0));

  const kv = memoryKv({ proxy: true, switchedAt: 0, offset: 0, pendingPid: 4242 });
  const persisted = [];
  const deps = {
    nowMs: Date.parse("2026-11-26T10:00:00.000Z"),
    logFile: file,
    findPids: () => [4242],
    kv,
    getConfig: async () => ({ kiroFarmProxy: true }),
    persistConfig: async (cfg) => persisted.push(cfg),
    applyEnv: () => {},
  };

  const waiting = await maybeAdaptKiroFarmProxy(deps);
  assert.equal(waiting.switched, false);
  assert.equal(waiting.reason, "waiting-for-old-batch");

  // Old process is gone: baseline resets, nothing flips on this tick.
  const exited = await maybeAdaptKiroFarmProxy({ ...deps, findPids: () => [] });
  assert.equal(exited.reason, "old-batch-exited");
  assert.equal(persisted.length, 0);

  fs.rmSync(file, { force: true });
});

test("manual proxy toggle resets the evidence window instead of fighting the operator", async () => {
  const file = path.join(os.tmpdir(), `krg-adapt-manual-${process.pid}.log`);
  fs.writeFileSync(file, BATCH(0) + BATCH(0) + BATCH(0));

  const kv = memoryKv({ proxy: true, switchedAt: 0, offset: 0, pendingPid: null });
  const persisted = [];
  const result = await maybeAdaptKiroFarmProxy({
    logFile: file,
    findPids: () => [],
    kv,
    getConfig: async () => ({ kiroFarmProxy: false }),
    persistConfig: async (cfg) => persisted.push(cfg),
    applyEnv: () => {},
  });

  assert.equal(result.reason, "manual-change");
  assert.equal(persisted.length, 0);
  assert.equal(kv.read().proxy, false);

  fs.rmSync(file, { force: true });
});
