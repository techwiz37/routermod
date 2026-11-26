// Transport limits are bytes of the final JSON, never model-context tokens.
// Use the conservative decimal MB for upstreams advertising a 1 MB limit.
export const UPSTREAM_BODY_LIMITS = [
  { hostname: "api.apisfreellm.com", pathname: "/v1/chat/completions", maxBytes: 1_000_000 },
];

export const BODY_LIMIT_STATUS = 413;
export const BODY_TRIMMED_HEADER = "x-routermod-trimmed-turns";
export const BODY_LIMIT_ERROR_CODE = "upstream_body_too_large";
export const BODY_TRIM_NOTICE =
  "[RouterMod omitted older complete turns to fit this provider's request-body byte limit. The retained conversation is incomplete; do not assume omitted details.]";
