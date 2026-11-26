import { getProviderConnectionById } from "@/lib/localDb";
import { PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { getDefaultModel } from "open-sse/config/providerModels.js";
import { pingModelByKind } from "@/app/api/models/test/ping.js";
import { UPDATER_CONFIG } from "@/shared/constants/config";

const HEALTH_PROBE_TIMEOUT_MS = 12_000;
const activeChecks = new Map();

export async function checkProviderConnectionHealth(connectionId) {
  const connection = await getProviderConnectionById(connectionId);
  if (!connection || connection.isActive === false) return false;

  const staticAlias = PROVIDER_ID_TO_ALIAS[connection.provider] || connection.provider;
  const alias = connection.providerSpecificData?.customAlias
    || connection.providerSpecificData?.prefix
    || staticAlias;
  const modelId = getDefaultModel(staticAlias);
  if (!modelId) return false;

  const publicModel = `${alias}/${modelId}`;
  const baseUrl = `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`;
  try {
    const result = await pingModelByKind(
      publicModel,
      "llm",
      baseUrl,
      publicModel,
      AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
      { internalProbe: true, bypassAccessPolicy: true },
    );
    return result?.ok === true;
  } catch {
    return false;
  }
}

export function refreshProviderHealthInBackground(providerId, connections, persist) {
  if (activeChecks.has(providerId)) return;
  const check = (async () => {
    let healthy = false;
    for (const connection of connections) {
      if (await checkProviderConnectionHealth(connection.id)) {
        healthy = true;
        break;
      }
    }
    await persist(providerId, healthy);
  })().catch((error) => {
    console.warn(`[ProviderHealth] check failed for ${providerId}:`, error?.message || error);
  }).finally(() => activeChecks.delete(providerId));
  activeChecks.set(providerId, check);
}
