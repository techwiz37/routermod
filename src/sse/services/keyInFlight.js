import { trackKeyInFlight } from "@/lib/db/repos/keyUsageRepo.js";
import { extractClientApiKey } from "./keyAccess.js";

/**
 * Counts a request as "in flight" for its API key until the response body is
 * fully consumed (or cancelled). Streaming responses stay counted for their
 * whole lifetime, which is what the dashboard's "in flight" number means.
 *
 * Returns the original response untouched when the request carries no key.
 */
export function trackKeyInFlightResponse(request, response) {
  const apiKey = extractClientApiKey(request);
  if (!apiKey || !response) return response;

  trackKeyInFlight(apiKey, 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    trackKeyInFlight(apiKey, -1);
  };

  const body = response.body;
  if (!body) {
    release();
    return response;
  }

  const wrapped = body.pipeThrough(
    new TransformStream({
      flush: release,
      cancel: release,
    })
  );

  return new Response(wrapped, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
