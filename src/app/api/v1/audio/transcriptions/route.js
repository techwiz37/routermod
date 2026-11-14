import { handleStt } from "@/sse/handlers/stt.js";
import { trackKeyInFlightResponse } from "@/sse/services/keyInFlight.js";

export const maxDuration = 300;

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function POST(request) {
  return trackKeyInFlightResponse(request, await handleStt(request));
}
