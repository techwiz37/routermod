import { handleEmbeddings } from "@/sse/handlers/embeddings.js";
import { trackKeyInFlightResponse } from "@/sse/services/keyInFlight.js";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}

export async function POST(request) {
  return trackKeyInFlightResponse(request, await handleEmbeddings(request));
}
