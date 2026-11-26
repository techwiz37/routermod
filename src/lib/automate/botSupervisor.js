import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * One-command startup: RouterMod supervises its own WhatsApp bot worker.
 *
 * The bot stays a child process (zapo-js / sharp need the full node_modules
 * tree) but it is spawned and auto-restarted from the app itself, so running
 * only the RouterMod app is enough. Telegram is notification-only — it uses
 * the Bot API directly and needs no worker.
 */
let started = false;
let child = null;
let restartTimer = null;
let stopping = false;

function resolveBotScript() {
  const roots = [
    process.env.ROUTERMOD_ROOT,
    process.cwd(),
    // Standalone server.js chdir's into .next/standalone.
    path.resolve(process.cwd(), "..", ".."),
  ].filter(Boolean);
  for (const root of roots) {
    const script = path.join(root, "whatsapp-bot.mjs");
    if (fs.existsSync(script) && fs.existsSync(path.join(root, "node_modules", "zapo-js"))) {
      return { root, script };
    }
  }
  return null;
}

export function startBotSupervisor() {
  if (started) return;
  started = true;

  const launch = () => {
    if (stopping || process.env.ROUTERMOD_WA_DISABLE === "1") return;
    const resolved = resolveBotScript();
    if (!resolved) {
      console.error("[BotSupervisor] whatsapp-bot.mjs or its dependencies not found; bot disabled");
      return;
    }
    try {
      child = spawn(process.execPath, [resolved.script], {
        cwd: resolved.root,
        env: process.env,
        stdio: "inherit",
      });
      console.log(`[BotSupervisor] WhatsApp bot started (pid=${child.pid})`);
      child.on("exit", (code, signal) => {
        child = null;
        if (stopping) return;
        console.warn(`[BotSupervisor] WhatsApp bot exited (${signal || code}) — restarting in 3s`);
        restartTimer = setTimeout(launch, 3000);
        restartTimer.unref?.();
      });
      child.on("error", (error) => {
        console.error(`[BotSupervisor] WhatsApp bot spawn failed: ${error.message}`);
      });
    } catch (error) {
      console.error(`[BotSupervisor] cannot start WhatsApp bot: ${error.message}`);
      restartTimer = setTimeout(launch, 10_000);
      restartTimer.unref?.();
    }
  };

  launch();

  const stop = () => {
    stopping = true;
    if (restartTimer) clearTimeout(restartTimer);
    if (child && !child.killed) child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.once("beforeExit", stop);
}
