const cache = new Map();
const TTL_MS = 30 * 60 * 1000;

export function fetchProviderFavicon(baseUrl) {
  if (!baseUrl) return Promise.resolve(null);
  const cached = cache.get(baseUrl);
  if (cached && Date.now() < cached.expiresAt) return cached.promise;
  const promise = fetch(`/api/providers/favicon?url=${encodeURIComponent(baseUrl)}`)
    .then(async (res) => res.ok ? (await res.json()).faviconUrl || null : null)
    .catch(() => null);
  cache.set(baseUrl, { promise, expiresAt: Date.now() + TTL_MS });
  return promise;
}
