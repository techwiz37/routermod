import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";

export const runtime = "nodejs";

function normalizeSticky(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const providerId = String(body?.providerId || "").trim();
    if (!providerId) {
      return NextResponse.json({ error: "providerId is required" }, { status: 400 });
    }

    const settings = await getSettings();
    const strategies = { ...(settings.providerStrategies || {}) };
    const entry = { ...(strategies[providerId] || {}) };

    // Round-robin account rotation. Omit `strategy` to leave it untouched.
    if (Object.prototype.hasOwnProperty.call(body, "strategy")) {
      if (body.strategy === "round-robin") {
        entry.fallbackStrategy = "round-robin";
        entry.stickyRoundRobinLimit = normalizeSticky(body.stickyRoundRobinLimit);
      } else {
        delete entry.fallbackStrategy;
        delete entry.stickyRoundRobinLimit;
      }
    }

    // RouterMod proxy pool + pool rotation. Omit to leave untouched.
    if (Object.prototype.hasOwnProperty.call(body, "proxyPoolId")) {
      const poolId = String(body.proxyPoolId || "").trim();
      if (poolId && poolId !== "__none__") entry.proxyPoolId = poolId;
      else delete entry.proxyPoolId;
    }
    if (Object.prototype.hasOwnProperty.call(body, "rotateStrategy")) {
      const rotate = String(body.rotateStrategy || "none").trim();
      if (rotate && rotate !== "none") entry.rotateStrategy = rotate;
      else delete entry.rotateStrategy;
    }

    if (Object.keys(entry).length) strategies[providerId] = entry;
    else delete strategies[providerId];

    // updateSettings does read+merge+write inside one transaction.
    const updated = await updateSettings({ providerStrategies: strategies });
    return NextResponse.json({
      success: true,
      override: updated.providerStrategies?.[providerId] || null,
    });
  } catch (error) {
    console.error("[providers/strategy] PATCH failed:", error);
    return NextResponse.json({ error: error?.message || "Failed to save strategy" }, { status: 500 });
  }
}
