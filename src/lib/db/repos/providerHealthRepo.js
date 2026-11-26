import { makeKv } from "../helpers/kvStore.js";

const providerHealth = makeKv("providerHealth");
const PROVIDER_HEALTH_TTL_MS = 10 * 60 * 1000;

export async function getProviderHealth(providerId, now = Date.now()) {
  const value = await providerHealth.get(providerId);
  if (!value || !Number.isFinite(value.checkedAt) || now - value.checkedAt >= PROVIDER_HEALTH_TTL_MS) {
    if (value) await providerHealth.remove(providerId);
    return null;
  }
  return value;
}

export async function getProviderHealthSnapshot() {
  const values = await providerHealth.getAll();
  const currentTime = Date.now();
  const valid = {};
  for (const [providerId, value] of Object.entries(values)) {
    if (Number.isFinite(value?.checkedAt) && currentTime - value.checkedAt < PROVIDER_HEALTH_TTL_MS) {
      valid[providerId] = value;
    } else {
      await providerHealth.remove(providerId);
    }
  }
  return valid;
}

export async function setProviderHealth(providerId, isHealthy, now = Date.now()) {
  const value = { isHealthy: isHealthy === true, checkedAt: now };
  await providerHealth.set(providerId, value);
  return value;
}
