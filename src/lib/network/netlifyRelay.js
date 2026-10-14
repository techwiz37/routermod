
import { createHash } from "node:crypto";

export const NETLIFY_API = "https://api.netlify.com/api/v1";
export const NETLIFY_FUNCTION_NAME = "relay";
export const NETLIFY_FUNCTION_PATH = "/.netlify/functions/relay";

export const NETLIFY_RELAY_FUNCTION_CODE = `exports.handler = async (event) => {
  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) {
    headers[k.toLowerCase()] = v;
  }

  const target = headers["x-relay-target"];
  const relayPath = headers["x-relay-path"] || "/";

  if (!target) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing x-relay-target header" }),
    };
  }

  const targetUrl = target.replace(/\\/$/, "") + relayPath;
  const forwardHeaders = { ...event.headers };
  for (const k of Object.keys(forwardHeaders)) {
    const lower = k.toLowerCase();
    if (lower === "x-relay-target" || lower === "x-relay-path" || lower === "host") {
      delete forwardHeaders[k];
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: forwardHeaders,
      body: event.httpMethod !== "GET" && event.httpMethod !== "HEAD" && event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64")
          : event.body
        : undefined,
    });
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    const contentType = upstream.headers.get("content-type") || "";
    const isText = new RegExp("^(text/|[^;]*json|[^;]*event-stream|[^;]*javascript|[^;]*xml|[^;]*urlencoded)", "i").test(contentType);
    const rawBody = await upstream.arrayBuffer();
    const responseBody = isText
      ? Buffer.from(rawBody).toString("utf8")
      : Buffer.from(rawBody).toString("base64");
    return {
      statusCode: upstream.status,
      headers: responseHeaders,
      body: responseBody,
      isBase64Encoded: !isText,
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: error.message || "Relay fetch failed" }),
    };
  }
};
`;
export const NETLIFY_INDEX_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Routermod Relay</title></head>
<body><p>Routermod relay function lives at <code>/.netlify/functions/relay</code>.</p></body></html>
`;
export function sha1Hex(bytes) {
  return createHash("sha1").update(bytes).digest("hex");
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildStoredZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = encoder.encode(name);
    const content = data instanceof Uint8Array ? data : encoder.encode(String(data ?? ""));
    const crc = crc32(content);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 filename flag
    local.setUint16(8, 0, true); // method: stored
    local.setUint32(14, crc, true);
    local.setUint32(18, content.length, true);
    local.setUint32(22, content.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(Buffer.from(local.buffer), Buffer.from(nameBytes), Buffer.from(content));

    const centralHeader = new DataView(new ArrayBuffer(46));
    centralHeader.setUint32(0, 0x02014b50, true); // central directory signature
    centralHeader.setUint16(8, 0x0800, true); // UTF-8 flag
    centralHeader.setUint16(10, 0, true); // method: stored
    centralHeader.setUint32(16, crc, true);
    centralHeader.setUint32(20, content.length, true);
    centralHeader.setUint32(24, content.length, true);
    centralHeader.setUint16(28, nameBytes.length, true);
    centralHeader.setUint32(42, offset, true); // local header offset
    central.push(Buffer.from(centralHeader.buffer), Buffer.from(nameBytes));

    offset += 30 + nameBytes.length + content.length;
  }

  const centralStart = offset;
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory signature
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralStart, true);

  return Buffer.concat([...chunks, ...central, Buffer.from(end.buffer)]);
}

export function buildRelayFunctionZip() {
  const content = new TextEncoder().encode(NETLIFY_RELAY_FUNCTION_CODE);
  const zip = buildStoredZip([{ name: `${NETLIFY_FUNCTION_NAME}.js`, data: content }]);
  return { zip, sha256: sha256Hex(zip) };
}

export function buildIndexFile() {
  const content = new TextEncoder().encode(NETLIFY_INDEX_HTML);
  return { content, sha1: sha1Hex(content) };
}

export function buildRelayUrl(siteUrl) {
  return `${String(siteUrl || "").replace(/\/$/, "")}${NETLIFY_FUNCTION_PATH}`;
}

export function netlifyHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "Routermod",
  };
}

export async function pollDeployReady(deployId, token, fetchImpl = fetch, maxMs = 120000, intervalMs = 3000) {
  const start = Date.now();
  for (;;) {
    const res = await fetchImpl(`${NETLIFY_API}/deploys/${deployId}`, {
      headers: netlifyHeaders(token),
    });
    const data = await res.json().catch(() => ({}));
    if (data.state === "ready") return data;
    if (data.state === "error") {
      throw new Error(data.error_message || "Netlify deploy failed");
    }
    if (Date.now() - start > maxMs) throw new Error("Netlify deploy timed out");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
