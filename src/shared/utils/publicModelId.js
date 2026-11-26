// Original upstream IDs may themselves contain slashes (e.g. zai-org/GLM-5).
// Only an explicitly changed custom ID can replace the provider prefix.
export function publicModelId(prefix, originalId, customId) {
  const value = typeof customId === "string" ? customId.trim() : "";
  if (!value || value === originalId) return `${prefix}/${originalId}`;
  return value.includes("/") ? value : `${prefix}/${value}`;
}

export function usageModelParts(provider, model, publicProvider, knownPrefixes = []) {
  const raw = String(model || "");
  const owner = String(provider || "");
  const prefix = publicProvider(owner);
  // Strip any known prefix for this provider — including the static registry
  // alias (e.g. `oc`) left on older usage rows from before a custom prefix was
  // changed to `rmod`. Otherwise display code prepends the new prefix and the
  // row appears as `rmod/oc/model`. A slash can also belong to an upstream ID,
  // so only explicit, known prefixes are removed.
  const keys = [...new Set([owner, prefix, ...knownPrefixes].filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (raw.startsWith(`${key}/`)) {
      return { providerKey: owner, modelId: raw.slice(key.length + 1) };
    }
  }
  return { providerKey: owner, modelId: raw };
}

export function usageModelAlias(provider, model, aliases, canonicalProvider = (value) => value) {
  const raw = String(model || "");
  // History can store either the requested public ID or the routing target.
  if (Object.hasOwn(aliases, raw)) return raw;
  const owner = canonicalProvider(provider);
  for (const [alias, target] of Object.entries(aliases)) {
    if (typeof target !== "string") continue;
    const slash = target.indexOf("/");
    if (slash < 1 || canonicalProvider(target.slice(0, slash)) !== owner) continue;
    const original = target.slice(slash + 1);
    if (raw === target || raw === original || raw === `${provider}/${original}`) return alias;
  }
  return null;
}
