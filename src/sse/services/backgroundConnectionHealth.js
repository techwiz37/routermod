// Background connection health checker — runs every 5 minutes.
// Tests each active provider connection with a real model ping.
// Updates testStatus in DB so the UI always shows current state.
// Fail-open: per-connection errors are swallowed.

import * as log from "../utils/logger.js";

const INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const INITIAL_DELAY_MS = 60 * 1000;  // 1 minute after boot (let token refresh go first)
const INTER_CONNECTION_DELAY_MS = 3000; // 3s between connections to avoid thundering herd

let started = false;
let intervalHandle = null;
let initialTimeoutHandle = null;
let tickRunning = false;

function isNonServerRuntime() {
  if (typeof window !== "undefined") return true;
  const phase = process.env.NEXT_PHASE || "";
  if (["phase-production-build", "phase-export", "phase-static"].includes(phase)) return true;
  if (process.env.NEXT_RUNTIME === "edge") return true;
  return false;
}

// Classify connection as invalid (bad OAuth/apikey) vs rate-limited
function classifyError(lastError = "") {
  const err = lastError.toLowerCase();
  if (err.includes("quota") || err.includes("rate") || err.includes("429") || err.includes("limit")) return "limited";
  if (err.includes("invalid") || err.includes("unauthorized") || err.includes("401") || err.includes("403") || err.includes("expired")) return "invalid";
  return "other";
}

async function runTick() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const { getProviderConnections } = await import("../../lib/db/repos/connectionsRepo.js");
    const { updateProviderConnection } = await import("../../lib/db/repos/connectionsRepo.js");
    const { pingModelByKind } = await import("../../app/api/models/test/ping.js");
    const { AI_MODELS } = await import("../../shared/constants/config.js");
    const { getProviderAlias } = await import("../../shared/constants/providers.js");

    const allConnections = await getProviderConnections({ isActive: true });
    log.info("BG_HEALTH", `Starting health check tick for ${allConnections.length} connections`);

    let checked = 0, healthy = 0, failed = 0;

    for (const conn of allConnections) {
      try {
        const provider = conn.provider;
        const alias = getProviderAlias(provider) || provider;

        // Find first LLM model for this provider
        const providerModels = AI_MODELS.filter(m => m.provider === provider || m.provider === alias);
        const firstModel = providerModels.find(m => !m.kind || m.kind === "llm");
        if (!firstModel) continue; // skip providers with no LLM model (image-only etc)

        const modelStr = `${getProviderAlias(firstModel.provider) || firstModel.provider}/${firstModel.model}`;

        const t0 = Date.now();
        let result;
        try {
          result = await pingModelByKind(modelStr, "llm");
        } catch (e) {
          result = { ok: false, error: e.message, latencyMs: Date.now() - t0 };
        }

        const update = {
          testStatus: result.ok ? "active" : "unavailable",
          lastCheckedAt: new Date().toISOString(),
        };
        if (!result.ok) {
          update.lastError = result.error || "Health check failed";
          update.lastErrorAt = new Date().toISOString();
        } else {
          update.lastError = null;
          update.lastErrorAt = null;
          update.errorCode = null;
        }

        await updateProviderConnection(conn.id, update);

        if (result.ok) healthy++;
        else failed++;
        checked++;

        log.debug("BG_HEALTH", `${result.ok ? "✓" : "✗"} ${provider} | ${conn.email || conn.name || conn.id} | ${result.latencyMs}ms${result.error ? ` | ${result.error?.slice(0, 80)}` : ""}`);

        await new Promise(r => setTimeout(r, INTER_CONNECTION_DELAY_MS));
      } catch (e) {
        log.warn("BG_HEALTH", `Error checking connection ${conn.id}: ${e.message}`);
      }
    }

    log.info("BG_HEALTH", `Health check done: ${checked} checked, ${healthy} healthy, ${failed} failed`);
  } catch (err) {
    log.warn("BG_HEALTH", `Tick failed: ${err?.message}`);
  } finally {
    tickRunning = false;
  }
}

export function startBackgroundConnectionHealth() {
  if (started) return false;
  if (isNonServerRuntime()) return false;
  if (process.env.DISABLE_BACKGROUND_CONNECTION_HEALTH === "1") return false;

  started = true;

  const safeTick = () => runTick().catch(err => {
    log.warn("BG_HEALTH", `Unhandled tick error: ${err?.message}`);
  });

  initialTimeoutHandle = setTimeout(safeTick, INITIAL_DELAY_MS);
  if (initialTimeoutHandle.unref) initialTimeoutHandle.unref();

  intervalHandle = setInterval(safeTick, INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();

  log.info("BG_HEALTH", `Background connection health checker started (interval: ${INTERVAL_MS / 1000}s, initial delay: ${INITIAL_DELAY_MS / 1000}s)`);
  return true;
}

export function stopBackgroundConnectionHealth() {
  if (initialTimeoutHandle) { clearTimeout(initialTimeoutHandle); initialTimeoutHandle = null; }
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  started = false;
}
