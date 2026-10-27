import { getProxyPoolById } from "@/models";

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

const rotateState = new Map(); // providerId → { groupIndex, bucketIndex, ip }

const idOf = (pool) => (typeof pool === "string" ? pool : pool?.id);
const exitIpOf = (pool) => (typeof pool === "string" ? "" : pool?.exitIp || "");

/**
 * Pick the proxy pool for a provider.
 *
 * `pools` may be a list of ids or a list of pool objects. For the
 * round-robin strategy the pools are grouped by their exit IP: rotating
 * between ports of the same proxy server keeps one egress IP and would
 * not help against an IP based limit, so the rotation walks over the
 * distinct IPs first.
 */
export function pickProxyPoolId(pools, strategy, providerId) {
  const list = (Array.isArray(pools) ? pools : []).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return idOf(list[0]);

  if (strategy === "round-robin") {
    const groups = new Map();
    for (const pool of list) {
      const key = exitIpOf(pool) || `pool:${idOf(pool)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(pool);
    }
    const keys = [...groups.keys()];
    const state = rotateState.get(providerId) || { groupIndex: -1, bucketIndex: 0, ip: "" };
    let groupIndex = (state.groupIndex + 1) % keys.length;
    // Prefer another IP than the previous request.
    if (keys.length > 1 && keys[groupIndex] === state.ip) {
      groupIndex = (groupIndex + 1) % keys.length;
    }
    const key = keys[groupIndex];
    const bucket = groups.get(key);
    const pick = bucket[state.bucketIndex % bucket.length];
    state.groupIndex = groupIndex;
    state.bucketIndex = (state.bucketIndex + 1) % bucket.length;
    state.ip = key;
    rotateState.set(providerId, state);
    return idOf(pick);
  }

  if (strategy === "random") {
    return idOf(list[Math.floor(Math.random() * list.length)]);
  }

  return idOf(list[0]); // "none" or unknown
}

function normalizeLegacyProxy(providerSpecificData = {}) {
  const connectionProxyEnabled =
    providerSpecificData?.connectionProxyEnabled === true;

  const connectionProxyUrl = normalizeString(
    providerSpecificData?.connectionProxyUrl
  );

  const connectionNoProxy = normalizeString(
    providerSpecificData?.connectionNoProxy
  );

  return {
    connectionProxyEnabled,
    connectionProxyUrl,
    connectionNoProxy,
  };
}

export async function resolveConnectionProxyConfig(
  providerSpecificData = {}
) {
  try {
    const proxyPoolIdRaw = normalizeString(
      providerSpecificData?.proxyPoolId
    );

    const proxyPoolId =
      proxyPoolIdRaw === "__none__" ? "" : proxyPoolIdRaw;

    const legacy = normalizeLegacyProxy(providerSpecificData);

    let poolStrictProxy = false;

    if (proxyPoolId) {
      const proxyPool = await getProxyPoolById(proxyPoolId);

      const proxyUrl = normalizeString(proxyPool?.proxyUrl);
      const noProxy = normalizeString(proxyPool?.noProxy);

      const isValidPool =
        proxyPool &&
        proxyPool.isActive === true &&
        proxyUrl;

      poolStrictProxy = proxyPool?.strictProxy === true;

      if (isValidPool) {
        if (proxyPool.type === "vercel" || proxyPool.type === "cloudflare" || proxyPool.type === "deno" || proxyPool.type === "netlify") {
          return {
            source: proxyPool.type,

            proxyPoolId,
            proxyPool,

            connectionProxyEnabled: false,
            connectionProxyUrl: "",
            connectionNoProxy: noProxy,

            strictProxy: proxyPool.strictProxy === true,

            vercelRelayUrl: proxyUrl, // Still mapped to vercelRelayUrl in the unified payload since they use the exact same header spec
          };
        }

        return {
          source: "pool",

          proxyPoolId,
          proxyPool,

          connectionProxyEnabled: true,
          connectionProxyUrl: proxyUrl,
          connectionNoProxy: noProxy,

          strictProxy: proxyPool.strictProxy === true,
        };
      }
    }

    if (
      legacy.connectionProxyEnabled &&
      legacy.connectionProxyUrl
    ) {
      return {
        source: "legacy",

        proxyPoolId: proxyPoolId || null,
        proxyPool: null,

        strictProxy: poolStrictProxy,

        ...legacy,
      };
    }

    return {
      source: "none",

      proxyPoolId: proxyPoolId || null,
      proxyPool: null,

      strictProxy: poolStrictProxy,

      ...legacy,
    };
  } catch (error) {
    console.error(
      "[resolveConnectionProxyConfig] Failed to resolve proxy config:",
      error
    );

    return {
      source: "error",

      proxyPoolId: null,
      proxyPool: null,

      connectionProxyEnabled: false,
      connectionProxyUrl: "",
      connectionNoProxy: "",

      strictProxy: false,
    };
  }
}
