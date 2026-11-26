import { NextResponse } from "next/server";
import { getFailureStats } from "@/lib/db/repos/automateRepo";
import { getProviderNodes } from "@/lib/db/repos/nodesRepo";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";

/** Map a stored provider id (connection/node id) to the name people see. */
function resolveProviderLabel(providerId, nodeByName) {
  const node = nodeByName.get(providerId);
  if (node?.name) return { name: node.name, prefix: node.prefix || null };
  const meta = getProviderByAlias(providerId) || AI_PROVIDERS[providerId];
  return { name: meta?.name || providerId, prefix: meta?.alias || null };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const hours = parseInt(searchParams.get("hours") || "24", 10);
    const stats = await getFailureStats(hours);

    // Custom providers are stored under an internal node id
    // (`openai-compatible-chat-<uuid>`); the readable name lives in
    // providerNodes. Built-in providers resolve through AI_PROVIDERS.
    const nodeByName = new Map();
    try {
      for (const node of await getProviderNodes()) {
        if (node?.id) nodeByName.set(node.id, node);
      }
    } catch (error) {
      console.error("[AUTOMATE] provider node lookup failed:", error.message);
    }

    const enriched = stats.map((stat) => {
      const label = resolveProviderLabel(stat.provider, nodeByName);
      return {
        ...stat,
        providerName: label.name,
        providerPrefix: label.prefix,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
