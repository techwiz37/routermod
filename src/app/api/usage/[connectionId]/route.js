import "open-sse/index.js";

import { getProviderConnectionById } from "@/lib/localDb";
import { getUsageForProvider } from "open-sse/services/usage.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { USAGE_APIKEY_PROVIDERS } from "@/shared/constants/providers";
import { refreshAndUpdateCredentials } from "@/shared/services/refreshCredentials.js";
import { getRequestLocale } from "@/lib/i18n/requestLocale";

// Re-exported for backwards compatibility: the implementation now lives in
// shared/services so runtime schedulers can use it without a Next route import.
export { refreshAndUpdateCredentials };

const AUTH_EXPIRED_PATTERNS = ["expired", "authentication", "unauthorized", "401", "re-authorize"];
function isAuthExpiredMessage(usage) {
  if (!usage?.message) return false;
  const msg = usage.message.toLowerCase();
  return AUTH_EXPIRED_PATTERNS.some((p) => msg.includes(p));
}


export async function GET(request, { params }) {
  let connection;
  const locale = getRequestLocale(request);
  const msg = (en, id) => locale === "id" ? id : en;
  try {
    const { connectionId } = await params;
    const force = new URL(request.url).searchParams.get("force") === "1";


    connection = await getProviderConnectionById(connectionId);
    if (!connection) {
       return Response.json({ error: msg("Connection not found", "Koneksi tidak ditemukan") }, { status: 404 });
    }

    const isOAuth = connection.authType === "oauth";
    const isApikeyAuth =
      connection.authType === "apikey" || connection.authType === "api_key";
    const isApikeyEligible =
      isApikeyAuth && USAGE_APIKEY_PROVIDERS.includes(connection.provider);

    if (!isOAuth && !isApikeyEligible) {
       return Response.json({ message: msg("Usage not available for this connection", "Penggunaan tidak tersedia untuk koneksi ini") });
    }

    const proxyConfig = await resolveConnectionProxyConfig(connection.providerSpecificData);
    const proxyOptions = {
      connectionProxyEnabled: proxyConfig.connectionProxyEnabled === true,
      connectionProxyUrl: proxyConfig.connectionProxyUrl || "",
      connectionNoProxy: proxyConfig.connectionNoProxy || "",
      vercelRelayUrl: proxyConfig.vercelRelayUrl || "",
      strictProxy: false,
    };

    if (isOAuth) {
      try {
        const result = await refreshAndUpdateCredentials(connection, false, proxyOptions);
        connection = result.connection;
      } catch (refreshError) {
        console.error("[Usage API] Credential refresh failed:", refreshError);
        return Response.json({
           error: `${msg("Credential refresh failed", "Pembaruan kredensial gagal")}: ${refreshError.message}`
        }, { status: 401 });
      }
    }

    let usage = await getUsageForProvider(connection, proxyOptions, { force });

    if (isOAuth && isAuthExpiredMessage(usage) && connection.refreshToken) {
      try {
        const retryResult = await refreshAndUpdateCredentials(connection, true, proxyOptions);
        connection = retryResult.connection;
        usage = await getUsageForProvider(connection, proxyOptions, { force });
      } catch (retryError) {
        console.warn(`[Usage] ${connection.provider}: force refresh failed: ${retryError.message}`);
      }
    }

    return Response.json(usage);
  } catch (error) {
    const provider = connection?.provider ?? "unknown";
    console.warn(`[Usage] ${provider}: ${error.message}`);
     return Response.json({ error: error.message || msg("Failed to fetch quota", "Gagal mengambil kuota") }, { status: 500 });
  }
}
