import { makeKv } from "../helpers/kvStore.js";

const batches = makeKv("providerModelTests");

export async function getProviderModelTests() {
  return batches.getAll();
}

export async function saveCompletedProviderModelTest(provider, kind, { total, completed, success, failed }) {
  if (!provider || ![total, completed, success, failed].every(Number.isSafeInteger)
    || total <= 0 || completed !== total || success < 0 || failed < 0 || success + failed !== total) {
    throw new Error("Only a completed model test batch can be saved");
  }
  const result = { provider, kind, total, success, failed, testedAt: new Date().toISOString() };
  await batches.set(`${provider}|${kind}`, result);
  return result;
}
