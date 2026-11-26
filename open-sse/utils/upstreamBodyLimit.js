import { UPSTREAM_BODY_LIMITS, BODY_LIMIT_STATUS, BODY_LIMIT_ERROR_CODE } from "../config/upstreamBodyLimits.js";
import { fitChatBodyToBytes } from "../translator/concerns/contextTrim.js";

export function prepareUpstreamBody(url, body) {
  let rule;
  try {
    const target = new URL(url);
    rule = UPSTREAM_BODY_LIMITS.find(entry => entry.hostname === target.hostname && entry.pathname === target.pathname.replace(/\/$/, ""));
  } catch { /* Unknown endpoints keep their normal transport behavior. */ }
  if (!rule) return { body, removedGroups: 0 };

  const fit = fitChatBodyToBytes(body, rule.maxBytes);
  if (fit.fits) return fit;
  return { ...fit, errorResponse: Response.json({ error: {
    message: `Request body is ${fit.beforeBytes} UTF-8 bytes; this upstream accepts at most ${rule.maxBytes} bytes. The latest turn, instructions, media or tool schemas cannot fit without cutting content. Reduce the request or use a provider with a larger body limit. No partial body was sent.`,
    type: "invalid_request_error",
    code: BODY_LIMIT_ERROR_CODE,
  } }, { status: BODY_LIMIT_STATUS }) };
}
