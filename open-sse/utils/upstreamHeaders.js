import { BODY_TRIMMED_HEADER } from "../config/upstreamBodyLimits.js";

const FORWARDED = new Set(["retry-after", "x-should-retry", BODY_TRIMMED_HEADER]);
const FORWARDED_PREFIX = "anthropic-ratelimit-";

export function upstreamResponseHeaders(headers) {
  const out = {};
  if (typeof headers?.forEach !== "function") return out;
  headers.forEach((value, name) => {
    const key = name.toLowerCase();
    if (FORWARDED.has(key) || key.startsWith(FORWARDED_PREFIX)) out[key] = value;
  });
  if (out[BODY_TRIMMED_HEADER]) out["Access-Control-Expose-Headers"] = BODY_TRIMMED_HEADER;
  return out;
}
