import test from "node:test";
import assert from "node:assert/strict";

import { register } from "node:module";
register("./alias-resolver.mjs", import.meta.url);

const { PROVIDERS, PROVIDER_MODELS, PROVIDER_OAUTH } = await import("../open-sse/providers/index.js");
const REGISTRY = (await import("../open-sse/providers/registry/index.js")).default;

test("solana is a hardcoded noAuth free provider like OpenCode Free", () => {
  const entry = REGISTRY.find((p) => p?.id === "solana");
  assert.ok(entry, "solana registry entry is missing");
  assert.equal(entry.noAuth, true);
  assert.equal(entry.category, "free");
  assert.equal(entry.hasFree, true);
  assert.equal(entry.transport.noAuth, true);
  assert.equal(entry.transport.format, "openai");
  assert.match(entry.transport.baseUrl, /18620\/v1\/chat\/completions$/);
});

test("solana is reachable through the PROVIDERS/PROVIDER_MODELS registries", () => {
  assert.equal(PROVIDERS.solana?.noAuth, true);
  assert.ok(PROVIDERS.solana?.baseUrl);
  assert.ok(Array.isArray(PROVIDER_MODELS.sol));
  assert.ok(PROVIDER_MODELS.sol.some((m) => m.id === "deepseek-v4.1-flash"));
  assert.ok(PROVIDER_MODELS.sol.some((m) => m.id === "solana"));
  assert.ok(PROVIDER_MODELS.sol.some((m) => m.id === "gpt-oss-120b"));
});

test("solana needs no OAuth/refresh configuration", () => {
  assert.equal(PROVIDER_OAUTH.solana, undefined);
});
