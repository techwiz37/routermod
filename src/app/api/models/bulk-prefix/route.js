import { NextResponse } from "next/server";
import {
  getModelAliases,
  setModelAlias,
  deleteModelAlias,
  getProviderNodeById,
  updateProviderNode,
} from "@/models";
import { getSettings as getSettingsDb, updateSettings as updateSettingsDb } from "@/lib/localDb";
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/shared/constants/providers";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const { providerAlias, oldPrefix, newPrefix } = body;

    if (!providerAlias || !oldPrefix || !newPrefix) {
      return NextResponse.json(
        { error: "providerAlias, oldPrefix, and newPrefix required" },
        { status: 400 },
      );
    }

    const aliases = await getModelAliases();
    const prefixWithSlash = oldPrefix + "/";
    const newPrefixWithSlash = newPrefix + "/";

    let total = 0;
    let updated = 0;

    for (const [alias, model] of Object.entries(aliases)) {
      if (!alias.startsWith(prefixWithSlash)) continue;

      total += 1;
      const suffix = alias.slice(prefixWithSlash.length);
      const newAlias = newPrefixWithSlash + suffix;

      await deleteModelAlias(alias);
      await setModelAlias(newAlias, model);
      updated += 1;
    }

    const compatible =
      isOpenAICompatibleProvider(providerAlias) ||
      isAnthropicCompatibleProvider(providerAlias);

    if (compatible) {
      try {
        const node = await getProviderNodeById(providerAlias);
        if (node) {
          await updateProviderNode(providerAlias, {
            ...node,
            prefix: newPrefix,
          });
        }
      } catch (e) {
        console.log("Bulk prefix: failed to update node prefix:", e);
      }
    } else {
      try {
        const settings = await getSettingsDb();
        const prefixes = { ...(settings.providerPrefixes || {}) };
        if (newPrefix && newPrefix !== providerAlias) {
          prefixes[providerAlias] = newPrefix;
        } else {
          delete prefixes[providerAlias];
        }
        await updateSettingsDb({ providerPrefixes: prefixes });
      } catch (e) {
        console.log("Bulk prefix: failed to update provider prefix override:", e);
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      total,
      message: `Updated ${updated} model alias(es)`,
    });
  } catch (error) {
    console.log("Error in bulk-prefix:", error);
    return NextResponse.json(
      { error: "Failed to update prefixes" },
      { status: 500 },
    );
  }
}