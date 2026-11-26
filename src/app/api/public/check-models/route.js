import { getApiKeyByKey } from "@/lib/localDb";
import { GET as listModels } from "@/app/api/v1/models/route";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store, private" };

export async function POST(request) {
  const token = request.headers.get("authorization");
  const key = token?.startsWith("Bearer ") ? token.slice(7).trim() : "";
  if (!key || key.length > 8192) return Response.json({ error: "invalid_key" }, { status: 401, headers: HEADERS });
  try {
    const record = await getApiKeyByKey(key);
    if (!record || record.isActive === false || (record.expiresAt && Date.parse(record.expiresAt) <= Date.now())) {
      return Response.json({ error: "invalid_key" }, { status: 401, headers: HEADERS });
    }
    // Reuse the API catalogue and its allow-list/IP rules. Do not accept a
    // caller-supplied CLI bypass marker or expose account/provider metadata.
    const headers = new Headers(request.headers);
    headers.delete("x-9r-cli-token");
    headers.set("Authorization", `Bearer ${key}`);
    const response = await listModels(new Request(new URL("/api/v1/models", request.url), { headers, signal: request.signal }));
    if (!response.ok) return Response.json({ error: response.status === 403 ? "access_denied" : "load_failed" }, { status: response.status, headers: HEADERS });
    const data = await response.json();
    const models = [...new Set((data.data || []).map((model) => model.id).filter((id) => typeof id === "string"))].sort();
    return Response.json({ models }, { headers: HEADERS });
  } catch {
    return Response.json({ error: "load_failed" }, { status: 500, headers: HEADERS });
  }
}
