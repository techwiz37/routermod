export function consoleProviderId(parsed, providers = []) {
  const candidate = parsed.provider || "";
  const match = providers.find((provider) => provider.keys.includes(candidate));
  return match?.id || candidate;
}

export function activeConsoleProviders(providers, connections = []) {
  const activeIds = new Set(connections.filter((c) => c.isActive !== false)
    .map((c) => String(c.provider || "").toLowerCase()));
  // No-auth lanes (FreePi, OpenCode Free, Solana, …) have no DB connection
  // row, so an active-connection check alone would hide them even though
  // they are the busiest providers in the log.
  return providers.filter((p) => p.noAuth || p.keys.some((key) => activeIds.has(key)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function consoleLogMatches(parsed, { provider = "", outcome = "all", providers = [] } = {}) {
  if (provider && consoleProviderId(parsed, providers) !== provider) return false;
  if (outcome === "success" && parsed.level !== "✓") return false;
  if (outcome === "failed" && parsed.level !== "E") return false;
  return true;
}
