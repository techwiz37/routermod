import initializeApp from "./initializeApp.js";
import { startWarpAutoStart } from "@/lib/network/warpAutoStart";

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"
  || process.env.NEXT_PHASE === "phase-export"
  || process.env.NEXT_PHASE === "phase-static";

if (typeof window === "undefined" && !isBuildPhase && !global.__appBootstrapped) {
  console.log("[Bootstrap] app bootstrap starting (proxy keeper included)");
  global.__appBootstrapped = true;
  initializeApp().catch((e) => console.error("[Bootstrap] init failed:", e.message));
  startWarpAutoStart();

  // Prewarm essential signed-in routes on idle time; avoid competing with the
  // initial page/landing render on constrained self-hosted machines.
  const prewarm = async () => {
    const port = process.env.PORT || "1337";
    const base = `http://127.0.0.1:${port}`;
    const routes = ["/login", "/dashboard", "/api/auth/status", "/api/tunnel/status"];
    await Promise.all(routes.map((route) => fetch(`${base}${route}`).catch(() => {})));
  };
  const idleHandle = setTimeout(prewarm, 15_000);
  idleHandle.unref?.();
}
