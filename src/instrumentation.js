export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Server-startup hook (also present in the standalone build). The layout
    // import alone is lazy — an API-first deploy could serve chat requests
    // before any page renders, leaving the RouterMod WARP proxy off. The
    // bootstrap module is idempotent via global.__appBootstrapped.
    await import("@/shared/services/bootstrap");

    // Explicit, unconditional keeper start. The bootstrap module's global flag
    // can already be set by another bundle copy, which used to skip the proxy
    // keeper entirely on a fresh deploy (chat API worked, proxy stayed off).
    const { startWarpAutoStart } = await import("@/lib/network/warpAutoStart");
    startWarpAutoStart();

    // WhatsApp worker is supervised here too — one app start brings up the
    // proxy, the bot and RouterMod itself. Telegram needs no worker (Bot API).
    const { startBotSupervisor } = await import("@/lib/automate/botSupervisor");
    startBotSupervisor();

    // Kiro farming options (proxy on/off, human-like on/off) are stored in the
    // automate config and pushed into env for the krg.js child process.
    const { initKiroFarmEnv } = await import("@/lib/automate/kiroFarmConfig");
    await initKiroFarmEnv();

    const { initConsoleLogCapture } = await import("@/lib/consoleLogBuffer");
    initConsoleLogCapture();

    const { installCatalogSource } = await import("open-sse/providers/catalogOverride.js");
    await installCatalogSource();

    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();
  }
}
