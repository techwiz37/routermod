
import { getApiKeys } from "@/lib/db";

export async function resolveCliApiKey(callerKey) {
  if (callerKey && callerKey.trim() && callerKey.trim() !== "sk_routermod") {
    return callerKey.trim();
  }
  try {
    const keys = await getApiKeys();
    const active = keys.find((k) => k.isActive);
    return active?.key || "";
  } catch {
    return "";
  }
}