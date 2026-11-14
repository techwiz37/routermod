import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, updateApiKey } from "@/lib/localDb";
import { validateKeyAccessInput } from "@/shared/utils/keyAccess.js";
import { TOKEN_WINDOWS } from "@/shared/constants/keyQuota.js";
import { parseIpBlacklistInput, IP_BLACKLIST_MAX_ENTRIES } from "@/shared/utils/ipBlacklist.js";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isActive, access, dailyLimit, minuteLimit, hourLimit, monthLimit, tokenLimit, tokenLimitWindow, spendLimit, tokensPerMinuteLimit, maxConcurrentLimit, maintenanceEnabled, maintenanceMessage, expiresInDays, ipBlacklist } = body;

    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (access !== undefined) {
      const checked = validateKeyAccessInput(access);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      updateData.access = checked.value;
    }
    if (dailyLimit !== undefined) {
      const limit = Number(dailyLimit);
      if (!Number.isInteger(limit) || limit < 0) return NextResponse.json({ error: "dailyLimit must be a non-negative integer" }, { status: 400 });
      updateData.dailyLimit = limit;
    }
    for (const [field, value] of [["minuteLimit", minuteLimit], ["hourLimit", hourLimit], ["monthLimit", monthLimit], ["tokenLimit", tokenLimit], ["tokensPerMinuteLimit", tokensPerMinuteLimit], ["maxConcurrentLimit", maxConcurrentLimit]]) {
      if (value === undefined) continue;
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 0) return NextResponse.json({ error: `${field} must be a non-negative integer` }, { status: 400 });
      updateData[field] = limit;
    }
    if (tokenLimitWindow !== undefined) {
      if (!TOKEN_WINDOWS[tokenLimitWindow]) return NextResponse.json({ error: "tokenLimitWindow must be one of 1h, 24h, 7d, 30d" }, { status: 400 });
      updateData.tokenLimitWindow = tokenLimitWindow;
    }
    if (spendLimit !== undefined) {
      const limit = Number(spendLimit);
      if (!Number.isFinite(limit) || limit < 0) return NextResponse.json({ error: "spendLimit must be a non-negative number" }, { status: 400 });
      updateData.spendLimit = limit;
    }
    if (maintenanceEnabled !== undefined) updateData.maintenanceEnabled = Boolean(maintenanceEnabled);
    if (maintenanceMessage !== undefined) updateData.maintenanceMessage = String(maintenanceMessage).trim().slice(0, 500);
    if (expiresInDays !== undefined) {
      const days = Number(expiresInDays);
      if (!Number.isInteger(days) || days < 0) return NextResponse.json({ error: "expiresInDays must be a non-negative integer" }, { status: 400 });
      updateData.expiresAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
    }

    if (ipBlacklist !== undefined) {
      const { valid, invalid } = parseIpBlacklistInput(ipBlacklist);
      if (invalid.length) {
        return NextResponse.json({ error: `Invalid IP: ${invalid.slice(0, 10).join(", ")}`, invalid }, { status: 400 });
      }
      if (valid.length > IP_BLACKLIST_MAX_ENTRIES) {
        return NextResponse.json({ error: `Maximum ${IP_BLACKLIST_MAX_ENTRIES} IPs per API key` }, { status: 400 });
      }
      updateData.ipBlacklist = valid;
    }

    const updated = await updateApiKey(id, updateData);

    return NextResponse.json({ key: updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const deleted = await deleteApiKey(id);
    if (!deleted) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Key deleted successfully" });
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
