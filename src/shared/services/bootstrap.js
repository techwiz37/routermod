import initializeApp from "./initializeApp.js";

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"
  || process.env.NEXT_PHASE === "phase-export"
  || process.env.NEXT_PHASE === "phase-static";

if (typeof window === "undefined" && !isBuildPhase && !global.__appBootstrapped) {
  global.__appBootstrapped = true;
  initializeApp().catch((e) => console.error("[Bootstrap] init failed:", e.message));

  setTimeout(async () => {
    const port = process.env.PORT || "1337";
    const base = `http://127.0.0.1:${port}`;
    const routes = ["/login", "/dashboard", "/api/auth/status", "/api/tunnel/status"];
    for (const r of routes) {
      fetch(`${base}${r}`).catch(() => {});
    }
  }, 3000);
}
