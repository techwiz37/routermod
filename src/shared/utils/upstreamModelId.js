// Only strip this provider's known local prefixes. Slashes in genuine vendor
// IDs (e.g. zai-org/GLM-5) are part of the upstream model and must survive.
export function upstreamModelId(id, prefixes = []) {
  const value = typeof id === "string" ? id.trim() : "";
  for (const prefix of prefixes) {
    if (prefix && value.startsWith(`${prefix}/`)) return value.slice(prefix.length + 1);
  }
  return value;
}
