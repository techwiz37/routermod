import test from "node:test";
import assert from "node:assert/strict";
import { getCapabilitiesForModel } from "../open-sse/providers/capabilities.js";
import { fitBodyToContext, isContextOverflowError } from "../open-sse/translator/concerns/contextTrim.js";
import { FORMATS } from "../open-sse/translator/formats.js";

const FREEPI_OVERFLOW =
  "This conversation is too long. Run /compact or start a new session with /new.";

test("freepi publishes the bridge ceiling instead of the model's 1M window", () => {
  for (const provider of ["freepi", "fr"]) {
    const caps = getCapabilitiesForModel(provider, "deepseek-v4.1-flash");
    assert.equal(caps.contextWindow, 250000, `${provider} context window`);
    assert.equal(caps.maxOutput, 65536, `${provider} output ceiling`);
  }
  // A model whose own window is below the ceiling keeps its smaller window.
  assert.equal(getCapabilitiesForModel("freepi", "gemma-4-uncensored").contextWindow, 128000);
});

test("freepi's context_too_long 413 is treated as a context overflow", () => {
  assert.equal(isContextOverflowError(413, FREEPI_OVERFLOW), true);
  assert.equal(isContextOverflowError(400, FREEPI_OVERFLOW), true);
  assert.equal(isContextOverflowError(413, "context_too_long"), true);
  assert.equal(isContextOverflowError(500, FREEPI_OVERFLOW), false);
  assert.equal(isContextOverflowError(413, "invalid API key"), false);
});

test("a freepi transcript past the ceiling is compacted below it", () => {
  const caps = getCapabilitiesForModel("freepi", "deepseek-v4.1-flash");
  const messages = [{ role: "system", content: "You are a coding agent." }];
  for (let i = 0; i < 120; i += 1) {
    messages.push({ role: i % 2 ? "assistant" : "user", content: "x".repeat(12000) });
  }
  const body = { model: "deepseek-v4.1-flash", messages, max_tokens: 32000 };
  const result = fitBodyToContext(body, FORMATS.OPENAI, caps, { compact: true });
  assert.equal(result.trimmed, true);
  assert.equal(result.reason, "messages-compacted");
  assert.ok(result.after <= 250000, `after ${result.after} should fit the bridge ceiling`);
  assert.ok(
    String(body.messages[1]?.content || "").includes("Earlier messages were compacted"),
    "oldest turns should become a condensed transcript",
  );
});
