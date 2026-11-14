import { NextResponse } from "next/server";
import { getCustomModels, addCustomModel, deleteCustomModel, getModelAliases, deleteModelAlias, deleteModelName } from "@/models";
import { getDisabledModels, enableModels } from "@/lib/disabledModelsDb";
import { getDeletedModels, markModelsDeleted, clearDeletedModels } from "@/lib/deletedModelsDb";
import { CAPACITY_META, isSttTransport } from "@/shared/constants/models";

export const dynamic = "force-dynamic";

function sanitizeCaps(caps) {
  if (!caps || typeof caps !== "object") return null;
  const clean = {};
  for (const key of Object.keys(CAPACITY_META)) {
    if (typeof caps[key] === "boolean") clean[key] = caps[key];
  }
  return Object.keys(clean).length ? clean : null;
}

// Merge a caps patch into the existing caps for a model. Boolean values set a
// flag, `null` removes it (returning to the catalog default), and keys the
// patch does not mention are left untouched so one flag can be edited without
// wiping the others.
function mergeCaps(existing, update) {
  if (!update || typeof update !== "object") return existing || null;
  const out = { ...(existing || {}) };
  for (const key of Object.keys(CAPACITY_META)) {
    if (typeof update[key] === "boolean") out[key] = update[key];
    else if (update[key] === null) delete out[key];
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeTransport(transport, type) {
  if (type !== "stt" || !isSttTransport(transport)) return null;
  return transport.trim();
}

export async function GET(request) {
  try {
    const models = await getCustomModels();
    const providerAlias = new URL(request.url).searchParams.get("providerAlias");
    const deleted = await getDeletedModels();
    return NextResponse.json(
      { models, deleted: providerAlias ? (deleted[providerAlias] || []) : deleted },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    console.log("Error fetching custom models:", error);
    return NextResponse.json({ error: "Failed to fetch custom models" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { providerAlias, id, type, name, caps, transport, models } = await request.json();

    // Bulk mode — used by "Auto-detect Models" to register a whole catalog in
    // a single request instead of one round-trip per model.
    if (Array.isArray(models)) {
      if (!providerAlias) {
        return NextResponse.json({ error: "providerAlias required" }, { status: 400 });
      }
      const seen = new Set();
      const disabledByAlias = await getDisabledModels();
      const disabledIds = new Set(disabledByAlias[providerAlias] || []);
      let added = 0;
      for (const entry of models) {
        const raw = typeof entry === "string" ? entry : entry?.id;
        const modelId = typeof raw === "string" ? raw.trim() : "";
        if (!modelId || seen.has(modelId)) continue;
        seen.add(modelId);
        if (disabledIds.has(modelId)) await enableModels(providerAlias, [modelId]);
        await clearDeletedModels(providerAlias, [modelId]);
        const modelType = (typeof entry === "object" && entry?.type) || "llm";
        const cleanCaps = sanitizeCaps(typeof entry === "object" ? entry?.caps : null);
        const cleanTransport = sanitizeTransport(typeof entry === "object" ? entry?.transport : null, modelType);
        const freeFlag = typeof entry === "object" && typeof entry?.free === "boolean" ? entry.free : undefined;
        const wasAdded = await addCustomModel({
          providerAlias,
          id: modelId,
          type: modelType,
          name: (typeof entry === "object" && entry?.name) || undefined,
          ...(cleanCaps ? { caps: cleanCaps } : {}),
          ...(cleanTransport ? { transport: cleanTransport } : {}),
          ...(typeof freeFlag === "boolean" ? { isFree: freeFlag } : {}),
        });
        if (wasAdded) added += 1;
      }
      return NextResponse.json({ success: true, added, total: seen.size });
    }

    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    const cleanCaps = sanitizeCaps(caps);
    const cleanTransport = sanitizeTransport(transport, type || "llm");
    // Re-adding a previously deleted model must make it visible again.
    await enableModels(providerAlias, [id]);
    await clearDeletedModels(providerAlias, [id]);
    const added = await addCustomModel({ providerAlias, id, type: type || "llm", name, ...(cleanCaps ? { caps: cleanCaps } : {}), ...(cleanTransport ? { transport: cleanTransport } : {}) });
    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.log("Error adding custom model:", error);
    return NextResponse.json({ error: "Failed to add custom model" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { providerAlias, id, newId, type, name, caps } = await request.json();
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    const resolvedType = type || "llm";
    const oldModels = await getCustomModels();
    const old = oldModels.find((m) => m.providerAlias === providerAlias && m.id === id && m.type === resolvedType);
    // Partial caps patch merged over the existing flags (null removes a flag).
    const mergedCaps = mergeCaps(old?.caps, caps);

    if (newId && newId.trim() && newId.trim() !== id) {
      await deleteCustomModel({ providerAlias, id, type: resolvedType });
      await addCustomModel({
        providerAlias,
        id: newId.trim(),
        type: resolvedType,
        name: (name?.trim() || old?.name || newId.trim()),
        caps: mergedCaps,
        ...(old?.transport ? { transport: old.transport } : {}),
        ...(typeof old?.isFree === "boolean" ? { isFree: old.isFree } : {}),
      });
    } else if (name?.trim() || caps !== undefined) {
      await addCustomModel({
        providerAlias,
        id,
        type: resolvedType,
        ...(name?.trim() ? { name: name.trim() } : {}),
        caps: mergedCaps,
      });
    } else {
      return NextResponse.json({ error: "name or newId required" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error updating custom model:", error);
    return NextResponse.json({ error: "Failed to update model" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "llm";
    const all = searchParams.get("all") === "true";
    const builtin = searchParams.get("builtin") === "true";
    if (!providerAlias || (!id && !all)) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }

    if (all) {
      const customModels = await getCustomModels();
      const ids = customModels
        .filter((model) => model.providerAlias === providerAlias && (model.type || model.kind || "llm") === type)
        .map((model) => model.id)
        .filter(Boolean);
      for (const modelId of ids) {
        await deleteCustomModel({ providerAlias, id: modelId, type });
      }

      const aliases = await getModelAliases();
      for (const [alias, fullModel] of Object.entries(aliases || {})) {
        if (!fullModel.startsWith(`${providerAlias}/`)) continue;
        await deleteModelAlias(alias);
        await deleteModelName(providerAlias, fullModel.slice(providerAlias.length + 1));
      }
      if (ids.length) await markModelsDeleted(providerAlias, ids);
      return NextResponse.json({ success: true, deleted: ids.length });
    }

    if (!builtin) await deleteCustomModel({ providerAlias, id, type });

    // Drop any alias/display-name rows that still point at the deleted model,
    // otherwise /v1/models keeps listing it through the alias merge.
    const aliases = await getModelAliases();
    const targets = new Set([`${providerAlias}/${id}`]);
    for (const [alias, fullModel] of Object.entries(aliases || {})) {
      if (targets.has(fullModel) || fullModel === `${providerAlias}/${id}`) {
        await deleteModelAlias(alias);
        targets.add(alias);
      }
    }
    for (const target of targets) {
      const [alias, ...rest] = target.split("/");
      if (rest.length) await deleteModelName(alias, rest.join("/"));
    }

    // Remember the deletion so a live upstream /models fetch cannot bring the
    // model back. Re-adding it through POST clears this flag.
    await markModelsDeleted(providerAlias, [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting custom model:", error);
    return NextResponse.json({ error: "Failed to delete custom model" }, { status: 500 });
  }
}
