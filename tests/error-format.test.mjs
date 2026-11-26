import test from "node:test";
import assert from "node:assert/strict";
import { formatProviderError } from "../open-sse/utils/error.js";

test("formatProviderError does not duplicate a cause already inside the message", () => {
  const duplicated = "Cannot connect to API: Client network socket disconnected before secure TLS connection was established: Client network socket disconnected before secure TLS connection was established (ECONNRESET)";
  const err = new Error(duplicated);
  err.cause = { code: "ECONNRESET", message: "Client network socket disconnected before secure TLS connection was established" };
  const out = formatProviderError(err, "openai-compatible", "x", 502);
  assert.ok(out.startsWith("[502]: "));
  assert.equal((out.match(/Client network socket disconnected/g) || []).length, 1, "cause must appear once");
  assert.ok(out.length < 240, `message too long: ${out.length}`);
});

test("formatProviderError appends genuinely new cause info", () => {
  const err = new Error("upstream failed");
  err.cause = { code: "ETIMEDOUT", message: "connect timeout" };
  const out = formatProviderError(err, "x", "y", 502);
  assert.match(out, /ETIMEDOUT/);
  assert.match(out, /connect timeout/);
});

test("formatProviderError truncates long upstream messages", () => {
  const out = formatProviderError(new Error("x".repeat(1000)), "x", "y", 500);
  assert.ok(out.length <= 250);
});
