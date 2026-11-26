// Registers the @/ alias resolver before any production module is imported.
import { register } from "node:module";
register("./alias-resolver.mjs", import.meta.url);

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.NO_PROXY = "*";
process.env.no_proxy = "*";

const { refreshKiroToken } = await import("../open-sse/services/tokenRefresh/providers.js");
const { PROVIDERS } = await import("../open-sse/config/providers.js");

const originalTokenUrl = PROVIDERS.kiro.tokenUrl;

function startAuthServer(handler) {
  return new Promise((resolve) => {
    const calls = [];
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        const body = Buffer.concat(chunks).toString();
        calls.push({ method: req.method, url: req.url, headers: req.headers, body });
        handler(req, res, calls);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, calls, port: server.address().port }));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

const silentLog = { warn() {}, error() {}, info() {}, debug() {} };
const psd = {
  authMethod: "imported",
  profileArn: "arn:aws:codewhisperer:us-east-1:123456789012:profile/TEST",
};

test("Kiro social refresh sends the right request and persists rotated tokens", async (t) => {
  const { server, calls, port } = await startAuthServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 3600,
    }));
  });
  t.after(async () => {
    await closeServer(server);
    PROVIDERS.kiro.tokenUrl = originalTokenUrl;
  });
  PROVIDERS.kiro.tokenUrl = `http://127.0.0.1:${port}/refreshToken`;

  const result = await refreshKiroToken("old-refresh-token", psd, silentLog);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "/refreshToken");
  assert.equal(calls[0].headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].body), { refreshToken: "old-refresh-token" });
  assert.match(calls[0].headers["user-agent"], /KiroIDE-/);
  assert.deepEqual(result, {
    accessToken: "new-access-token",
    refreshToken: "new-refresh-token",
    expiresIn: 3600,
  });
});

test("Kiro social refresh returns a typed rejection only for permanent errors", async (t) => {
  const { server, port } = await startAuthServer((req, res) => {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_grant", error_description: "grant expired" }));
  });
  t.after(async () => {
    await closeServer(server);
    PROVIDERS.kiro.tokenUrl = originalTokenUrl;
  });
  PROVIDERS.kiro.tokenUrl = `http://127.0.0.1:${port}/refreshToken`;

  const result = await refreshKiroToken("rejected-refresh-token", psd, silentLog);
  assert.equal(result.error, "unrecoverable_refresh_error");
  assert.equal(result.code, "invalid_grant");
  assert.ok(result.fingerprint);
  assert.ok(result.rejectedAt);
});

test("Kiro social refresh treats 5xx as transient so the account stays usable", async (t) => {
  const { server, port } = await startAuthServer((req, res) => {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("upstream unavailable");
  });
  t.after(async () => {
    await closeServer(server);
    PROVIDERS.kiro.tokenUrl = originalTokenUrl;
  });
  PROVIDERS.kiro.tokenUrl = `http://127.0.0.1:${port}/refreshToken`;

  const result = await refreshKiroToken("transient-refresh-token", psd, silentLog);
  assert.equal(result, null);
});

test("Kiro social refresh supplies a default lifetime when upstream omits expiresIn", async (t) => {
  const { server, port } = await startAuthServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ accessToken: "token-without-ttl" }));
  });
  t.after(async () => {
    await closeServer(server);
    PROVIDERS.kiro.tokenUrl = originalTokenUrl;
  });
  PROVIDERS.kiro.tokenUrl = `http://127.0.0.1:${port}/refreshToken`;

  const result = await refreshKiroToken("no-ttl-refresh-token", psd, silentLog);
  assert.equal(result.accessToken, "token-without-ttl");
  assert.ok(result.expiresIn > 0, "a missing expiresIn must not erase the expiry timestamp");
});
