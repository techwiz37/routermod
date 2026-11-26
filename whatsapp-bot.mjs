import { WaClient, createStore } from "zapo-js";
import { createSqliteStore } from "@zapo-js/store-sqlite";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, lstatSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";

const BASE = process.env.ROUTERMOD_WA_DIR || "/root/.routermod/whatsapp";
const SESSION = join(BASE, "session");
const NUMBER_FILE = join(BASE, "number.json");
const SOCKET = join(BASE, "control.sock");
const DB_PATH = process.env.ROUTERMOD_WA_DB || "/root/.routermod/db/whatsapp.sqlite";
const PAIRING_INTERVAL_MS = 150 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 20 * 60 * 1000;
// After a restart, alerts queued while the bot was down are already stale.
// Drop anything older than this so reconnecting does not spam the recipient.
const STALE_NOTIFICATION_MS = 3 * 60 * 1000;

let sock = null;
let store = null;
let generation = 0;
let isSockReady = false;
let pairingReady = false;
let pairingInFlight = false;
let resetting = false;
let rateLimitedUntil = 0;
let nextPairingAt = 0;
// Rich HTML via botForwardedMessage/GenAI primitives is not reliably rendered
// by WhatsApp clients: Android shows a Download prompt and iOS refuses to
// display it at all. Keep the builder for experimentation, but use plain
// WhatsApp-formatted text by default because it works on every platform.
const USE_RICH_MESSAGES = true;
let richModelsDisabled = false;
let queueTimer = null;
let resolveControllerReady;
let controllerReadyPromise;
let resolveSocketReady;
let socketReadyPromise;

const log = {
  info: (msg) => console.log(`[WA-BOT] ${msg}`),
  error: (msg) => console.error(`[WA-BOT] ${msg}`),
  success: (msg) => console.log(`[WA-BOT] ✓ ${msg}`),
};

class ControlError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function newControllerReady() {
  controllerReadyPromise = new Promise((resolve) => { resolveControllerReady = resolve; });
}

function newSocketReady() {
  socketReadyPromise = new Promise((resolve) => { resolveSocketReady = resolve; });
}

function waitWithTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function formatNumber(value) {
  if (typeof value !== "string") return "";
  let digits = value.trim().replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : "";
}

function readNumber() {
  try {
    return formatNumber(JSON.parse(readFileSync(NUMBER_FILE, "utf8")).number);
  } catch {
    return "";
  }
}

function normalizeJid(value) {
  const jid = typeof value === "string" ? value.trim() : "";
  if (/^(?:[1-9]\d{7,14}@s\.whatsapp\.net|\d{5,24}(?:-\d{5,24})?@g\.us)$/.test(jid)) return jid;
  const phone = formatNumber(jid);
  return phone ? `${phone}@s.whatsapp.net` : "";
}

function getQueueDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jid TEXT NOT NULL,
      message TEXT NOT NULL,
      sent INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const columns = db.prepare("PRAGMA table_info(message_queue)").all();
  if (!columns.some((column) => column.name === "last_error")) {
    db.exec("ALTER TABLE message_queue ADD COLUMN last_error TEXT");
  }
  return db;
}

function discardStaleQueue(db) {
  try {
    const result = db.prepare(
      "DELETE FROM message_queue WHERE sent = 0 AND (created_at IS NULL OR created_at < datetime('now', ?))"
    ).run(`-${Math.floor(STALE_NOTIFICATION_MS / 1000)} seconds`);
    if (result.changes > 0) {
      log.info(`discarded ${result.changes} notification(s) older than 3 minutes`);
    }
  } catch (error) {
    log.error(`stale queue cleanup failed: ${error.message}`);
  }
}

function enqueue(jid, message) {
  const db = getQueueDb();
  try {
    db.prepare("INSERT INTO message_queue (jid, message) VALUES (?, ?)").run(jid, message);
  } finally {
    db.close();
  }
}

function startQueue() {
  if (queueTimer) return;
  queueTimer = setInterval(processQueue, 5000);
  log.info("message queue processor started");
}

function stopQueue() {
  if (queueTimer) clearInterval(queueTimer);
  queueTimer = null;
}

async function processQueue() {
  if (!isSockReady || !sock) return;
  const active = sock;
  const db = getQueueDb();
  try {
    discardStaleQueue(db);
    const rows = db.prepare("SELECT * FROM message_queue WHERE sent = 0 ORDER BY id ASC LIMIT 10").all();
    for (const row of rows) {
      if (sock !== active || !isSockReady) break;
      try {
        await active.message.send(row.jid, { type: "text", text: row.message });
        db.prepare("UPDATE message_queue SET sent = 1, attempts = 0 WHERE id = ?").run(row.id);
        log.success(`queue #${row.id} delivered to ${row.jid}`);
      } catch (error) {
        if (sock !== active) break;
        const attempts = (row.attempts || 0) + 1;
        // Keep failed rows so the dashboard can report a real delivery failure
        // instead of silently dropping the alert after three attempts.
        db.prepare("UPDATE message_queue SET attempts = ?, last_error = ? WHERE id = ?")
          .run(attempts, error.message, row.id);
        log.error(`send failed for queue #${row.id}: ${error.message}`);
      }
    }
  } catch (error) {
    log.error(`queue poll failed: ${error.message}`);
  } finally {
    db.close();
  }
}

function createQuietLogger() {
  const instance = {
    level: "warn",
    trace() {},
    debug() {},
    info() {},
    warn(message, context) {
      console.warn(`[zapo] ${message}${context ? ` ${JSON.stringify(context)}` : ""}`);
    },
    error(message, context) {
      console.error(`[zapo] ${message}${context ? ` ${JSON.stringify(context)}` : ""}`);
    },
    child() { return instance; },
  };
  return instance;
}

function attachShims(client) {
  client.groupInviteCode = (jid) => client.group.queryInviteCode(jid);
}

async function startBot() {
  generation += 1;
  const activeGeneration = generation;
  newSocketReady();
  isSockReady = false;
  pairingReady = false;
  stopQueue();
  if (sock) {
    try { await sock.disconnect(); } catch (e) { /* best effort */ }
    sock = null;
  }
  if (store) {
    try { await store.destroy(); } catch (e) { /* best effort */ }
    store = null;
  }
  if (generation !== activeGeneration) return;

  mkdirSync(SESSION, { recursive: true, mode: 0o700 });
  store = createStore({
    backends: { sqlite: createSqliteStore({ path: join(SESSION, "state.sqlite") }) },
    providers: {
      auth: "sqlite",
      signal: "sqlite",
      preKey: "sqlite",
      session: "sqlite",
      identity: "sqlite",
      senderKey: "sqlite",
      appState: "sqlite",
      privacyToken: "sqlite",
      messages: "none",
      threads: "none",
      contacts: "none",
    },
  });

  sock = new WaClient({ store, sessionId: "default" }, createQuietLogger());
  attachShims(sock);
  const current = sock;

  sock.on("auth_qr", () => {
    if (current !== sock) return;
    pairingReady = true;
    resolveSocketReady?.();
  });
  sock.on("auth_pairing_required", () => {
    if (current !== sock) return;
    pairingReady = true;
    resolveSocketReady?.();
  });
  sock.on("auth_paired", () => {
    if (current !== sock) return;
    pairingReady = false;
    rateLimitedUntil = 0;
    log.success("pairing succeeded");
  });
  sock.on("message", async (event) => {
    if (current !== sock || event.key?.fromMe) return;
    const parts = messageText(event.message).split(/\s+/);
    const command = parts[0]?.toLowerCase();
    if (command !== ".models" && command !== ".keys") return;
    // ".models kr" filters to models whose provider/id contains "kr".
    const query = parts.slice(1).join(" ").trim().toLowerCase();
    const chatJid = event.key?.remoteJid;
    if (!chatJid) return;
    const sender = event.key?.participant || chatJid;
    const commandKey = `${chatJid}:${sender}:${command}`;
    if (commandInFlight.has(commandKey)) return;
    commandInFlight.add(commandKey);
    try {
      if (command === ".keys") {
        const isGroup = /@g\.us$/.test(chatJid);
        let allowed;
        if (isGroup) {
          allowed = await isGroupAdmin(chatJid, sender, event.key);
        } else {
          const admins = await getAdminNumbers();
          allowed = admins.has(formatNumber(sender)) || admins.has(formatNumber(event.key?.remoteJidAlt));
        }
        if (!allowed) {
          await sendText(chatJid, isGroup
            ? "Perintah .keys hanya untuk admin grup."
            : "Perintah .keys hanya untuk nomor admin yang terdaftar.");
          return;
        }
      } else if (command === ".models") {
        // .models accessible to all group members
      }

      await sendText(chatJid, command === ".models"
        ? "*Mengecek model tersedia (realtime)…*"
        : "*Mengambil daftar API key…*");
      try {
        if (command === ".models") {
          const result = await buildModelsReport(query);
          if (!result.rows.length) {
            await sendText(chatJid, "_Tidak ada model yang merespon._");
          } else {
            await sendModelsResult(chatJid, result);
          }
        } else {
          await sendKeysResult(chatJid, await buildKeysReport());
        }
      } catch (error) {
        log.error(`${command} failed: ${error.message}`);
        // Best effort only: if the session dropped mid-command the error report
        // itself cannot be delivered, and must not become an unhandled reject.
        try { await sendText(chatJid, `Gagal mengambil data: ${error.message}`); }
        catch { /* session unavailable */ }
      }
    } finally {
      commandInFlight.delete(commandKey);
    }
  });

  sock.on("connection", (event) => {
    if (current !== sock || generation !== activeGeneration) return;
    if (event.status === "open") {
      isSockReady = true;
      pairingReady = false;
      rateLimitedUntil = 0;
      log.success("connected to WhatsApp");
      startQueue();
      return;
    }
    isSockReady = false;
    stopQueue();
    if (event.isLogout) {
      rmSync(SESSION, { recursive: true, force: true });
      mkdirSync(SESSION, { recursive: true, mode: 0o700 });
    }
    const delay = event.isLogout ? 3000 : 5000;
    setTimeout(() => {
      if (generation === activeGeneration) void startBot();
    }, delay);
  });

  resolveControllerReady?.();
  void sock.connect().catch((error) => {
    log.error(`connect failed: ${error.message}`);
    if (current === sock && generation === activeGeneration) {
      setTimeout(() => { if (generation === activeGeneration) void startBot(); }, 5000);
    }
  });
}

async function requestPairing(number, fresh) {
  if (!number) throw new ControlError(400, "Enter the bot phone number with its country code.");
  if (fresh) {
    if (resetting) throw new ControlError(409, "A session reset is already in progress.");
    resetting = true;
    newControllerReady();
    try {
      stopQueue();
      isSockReady = false;
      pairingReady = false;
      pairingInFlight = false;
      rateLimitedUntil = 0;
      nextPairingAt = 0;
      if (sock) { try { await sock.disconnect(); } catch (e) { /* best effort */ } sock = null; }
      if (store) { try { await store.destroy(); } catch (e) { /* best effort */ } store = null; }
      rmSync(SESSION, { recursive: true, force: true });
      mkdirSync(SESSION, { recursive: true, mode: 0o700 });
      mkdirSync(dirname(NUMBER_FILE), { recursive: true, mode: 0o700 });
      writeFileSync(NUMBER_FILE, JSON.stringify({ number }, null, 2));
      log.info(`fresh session requested for ${number}`);
      void startBot();
      try { await waitWithTimeout(controllerReadyPromise, 15000); }
      catch { throw new ControlError(503, "WhatsApp bot is restarting. Try again shortly."); }
    } finally {
      resetting = false;
    }
  }
  if (!sock) throw new ControlError(503, "WhatsApp bot is starting. Try again shortly.");
  if (isSockReady || sock.getState().registered) {
    throw new ControlError(409, "An existing WhatsApp session is active. Use a fresh session to replace it.");
  }
  if (!pairingReady) {
    try { await waitWithTimeout(socketReadyPromise, 15000); }
    catch { throw new ControlError(503, "WhatsApp is not ready to pair yet. Try again shortly."); }
  }
  if (pairingInFlight || Date.now() < Math.max(nextPairingAt, rateLimitedUntil)) {
    const minutes = Math.ceil((Math.max(nextPairingAt, rateLimitedUntil) - Date.now()) / 60000);
    throw new ControlError(429, `Pairing is rate limited. Try again in ${minutes} minute(s).`);
  }
  pairingInFlight = true;
  nextPairingAt = Date.now() + PAIRING_INTERVAL_MS;
  try {
    const code = await sock.auth.requestPairingCode(number, true);
    log.info(`pairing code issued for ${number}`);
    return { code, expiresAt: nextPairingAt };
  } catch (error) {
    if (/rate-overlimit|429/i.test(error.message)) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      throw new ControlError(429, "WhatsApp rate-limited pairing. Wait before trying again.");
    }
    nextPairingAt = Date.now() + 5000;
    throw new ControlError(502, "WhatsApp could not issue a pairing code. Try again shortly.");
  } finally {
    pairingInFlight = false;
  }
}

async function joinGroup(invite) {
  if (!/^[A-Za-z0-9]{16,64}$/.test(invite)) {
    throw new ControlError(400, "Invalid WhatsApp group invite.");
  }
  if (!isSockReady || !sock) throw new ControlError(409, "Connect the WhatsApp bot first.");
  try {
    const preview = await sock.group.queryGroupInviteInfo(invite);
    const groups = await sock.group.queryAllGroups();
    if (groups.some((group) => group.jid === preview.jid)) return { jid: preview.jid };
    if (preview.hasPendingMembershipRequest) {
      throw new ControlError(409, "A group admin must approve the bot before you can save this destination.");
    }
    const result = await sock.group.joinGroupViaLink(invite);
    if (result.status === "pending") {
      throw new ControlError(409, "Join request sent. Save again after a group admin approves the bot.");
    }
    return { jid: result.groupJid };
  } catch (error) {
    if (error instanceof ControlError) throw error;
    throw new ControlError(422, "Could not join the group. Check the invite link and the bot connection.");
  }
}

const ROUTER_PORT = process.env.ROUTERMOD_PORT || "1337";
const DATA_DIR = process.env.DATA_DIR || join(os.homedir(), ".routermod");
const commandInFlight = new Set();

function routerCliToken() {
  const raw = readFileSync(join(DATA_DIR, "machine-id"), "utf8").trim();
  const secret = readFileSync(join(DATA_DIR, "auth", "cli-secret"), "utf8").trim();
  return createHash("sha256").update(raw + "9r-cli-auth" + secret).digest("hex").substring(0, 16);
}

async function routerApi(pathname) {
  const response = await fetch(`http://127.0.0.1:${ROUTER_PORT}${pathname}`, {
    headers: { "x-9r-cli-token": routerCliToken() },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`RouterMod API ${response.status}`);
  return response.json();
}

async function probeModel(id) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`http://127.0.0.1:${ROUTER_PORT}/api/models/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-9r-cli-token": routerCliToken(),
      },
      body: JSON.stringify({ model: id, kind: "llm" }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    // Only a real generated answer counts. The test endpoint also returns
    // latencyMs on HTTP 429/503/400 failures - treating those as "responding"
    // is exactly why .models listed models that fail in OpenCode CLI.
    if (data?.ok === true && response.ok && Number.isFinite(data.latencyMs)) {
      return { ms: Math.round(data.latencyMs) };
    }
    if (data?.ok === false || !response.ok) {
      return { error: `E${data?.status || response.status}` };
    }
    return { error: "err" };
  } catch {
    return { timeout: true };
  } finally {
    clearTimeout(timer);
  }
}

function formatLatency(value) {
  return Number.isFinite(value?.ms) ? `${value.ms}ms` : value?.error || "err";
}

async function buildModelsReport(query = "") {
  // Source IDs from the public OpenAI-compatible endpoint so the IDs shown in
  // .models are exactly the ones clients can actually use with /v1/models.
  const response = await fetch(`http://127.0.0.1:${ROUTER_PORT}/v1/models`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`v1/models returned ${response.status}`);
  const data = await response.json();

  const entries = [];
  for (const model of data?.data || []) {
    const id = typeof model?.id === "string" ? model.id : "";
    if (!id) continue;
    const prefix = id.includes("/") ? id.split("/")[0].toUpperCase() : id.toUpperCase();
    if (query && !id.toLowerCase().includes(query) && !prefix.toLowerCase().includes(query)) continue;
    entries.push({ prefix, id });
  }

  // Every .models call re-probes all active models. A probe that does not
  // answer within 10s is a timeout and is excluded from the report.
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= entries.length) return;
      const entry = entries[index];
      const result = await probeModel(entry.id);
      if (result.timeout) {
        entry.timeout = true;
      } else {
        entry.value = result;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(20, entries.length) }, worker));

  // Only models that produced a real generated answer (ms measured). Entries
  // with an HTTP error code (429/503/400...) must never appear as available -
  // those are exactly the ones that fail when used from OpenCode CLI.
  const reachable = entries.filter((entry) => Number.isFinite(entry.value?.ms));
  const groups = new Map();
  for (const entry of reachable) {
    if (!groups.has(entry.prefix)) groups.set(entry.prefix, []);
    groups.get(entry.prefix).push(entry);
  }
  // Keep every responding model, but sort each provider's list by latency so
  // the fastest one sits at the top. Providers are ordered by their fastest
  // entry as well.
  const latency = (entry) => (Number.isFinite(entry.value?.ms) ? entry.value.ms : Infinity);
  const ordered = [];
  for (const [prefix, list] of groups) {
    list.sort((a, b) => latency(a) - latency(b));
    ordered.push({ prefix, list, best: latency(list[0]) });
  }
  ordered.sort((a, b) => a.best - b.best);

  const chunks = [];
  let current = "*List Model Tersedia*\n> diurutkan tercepat per provider · hasil realtime\n";
  for (const { prefix, list } of ordered) {
    const block = `\n☑ ${prefix}\n${list.map((entry) =>
      `• ${entry.id} - ${formatLatency(entry.value).replace("ms", "Ms")}`
    ).join("\n")}\n`;
    if (current.length + block.length > 3000) {
      chunks.push(current);
      current = "*List Model Tersedia (lanjutan)*\n";
    }
    current += block;
  }
  chunks.push(current);
  const rows = ordered.flatMap(({ prefix, list }) =>
    list.map((entry) => [prefix, entry.id, formatLatency(entry.value).replace("ms", "Ms")])
  );
  return { chunks, rows, title: query ? `Model: ${query}` : "List Model Tersedia", query };
}

function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (char) => entities[char]);
}

// Builds a compact, RouterMod-themed HTML card from the probed model rows.
// WhatsApp renders a safe subset of HTML inline in an AI-rich response.
function buildModelsHtml(rows) {
  const groups = new Map();
  for (const [prefix, id, latency] of rows) {
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push({ id, latency });
  }

  // All behaviour is inline: WhatsApp's renderer may strip <script> tags but
  // keeps inline event handlers, so the search and Copy buttons stay useful.
  const copyHandler =
    "var t=this.getAttribute('data-id');try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t);}else{var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a);}var s=this;s.textContent='Copied';setTimeout(function(){s.textContent='Copy';},1200);}catch(e){}";
  const filterHandler =
    "var q=this.value.toLowerCase().replace(/^\\s+|\\s+$/g,'');var rs=document.querySelectorAll('.rm-row');for(var i=0;i<rs.length;i++){rs[i].style.display=(!q||rs[i].getAttribute('data-id').toLowerCase().indexOf(q)>=0)?'':'none';}var gs=document.querySelectorAll('.rm-group');for(var g=0;g<gs.length;g++){var any=false;var xs=gs[g].querySelectorAll('.rm-row');for(var j=0;j<xs.length;j++){if(xs[j].style.display!=='none')any=true;}gs[g].style.display=any?'':'none';}var h=document.getElementById('rmCount');if(h)h.textContent=q?('Hasil: '+this.value):'" + rows.length + " model aktif';";

  const sections = [];
  for (const [prefix, list] of groups) {
    const items = list.map(({ id, latency }) =>
      `<div class="rm-row" data-id="${escapeHtml(id)}" style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #3b4a54;">` +
        `<span style="flex:1;min-width:0;color:#e9edef;font-size:12px;overflow-wrap:anywhere;">${escapeHtml(id)}</span>` +
        `<span style="color:#00a884;font-size:11px;white-space:nowrap;">${escapeHtml(latency)}</span>` +
        `<button type="button" data-id="${escapeHtml(id)}" onclick="${copyHandler}" style="flex:none;background:#2a3942;color:#00a884;border:1px solid #3b4a54;border-radius:6px;padding:3px 7px;font-size:10px;cursor:pointer;">Copy</button>` +
      `</div>`
    ).join("");
    sections.push(
      `<div class="rm-group" style="margin-top:10px;">` +
        `<div style="color:#8696a0;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(prefix)}</div>` +
        items +
      `</div>`
    );
  }

  return (
    `<div style="box-sizing:border-box;width:100%;background:#1f2c34;border:1px solid #3b4a54;border-radius:8px;padding:8px 10px;font-family:Roboto,sans-serif;">` +
      `<div style="display:flex;align-items:center;gap:8px;border-bottom:1px solid #3b4a54;padding-bottom:8px;">` +
        `<div style="width:28px;height:28px;border-radius:7px;background:#2a3942;display:flex;align-items:center;justify-content:center;color:#00a884;font-size:16px;">&#9636;</div>` +
        `<div style="min-width:0;">` +
          `<div style="color:#e9edef;font-size:13px;font-weight:600;">List Model Tersedia</div>` +
          `<div id="rmCount" style="color:#8696a0;font-size:10px;margin-top:1px;">${rows.length} model aktif &middot; realtime probe</div>` +
        `</div>` +
      `</div>` +
      `<input type="text" placeholder="Cari model, misal: kr" oninput="${filterHandler}" style="box-sizing:border-box;width:100%;margin-top:8px;background:#2a3942;color:#e9edef;border:1px solid #3b4a54;border-radius:7px;padding:8px 10px;font-size:12px;outline:none;" />` +
      `<div style="margin-top:6px;">` +
        sections.join("") +
      `</div>` +
      `<div style="color:#8696a0;font-size:9px;margin-top:8px;text-align:center;">RouterMod &middot; model gateway</div>` +
    `</div>`
  );
}

// Rich HTML payload. The HTML itself lives inside a GenAIaeacdsnwHtmlPrimitive
// in the unifiedResponse - a bare `primitive.text` section makes WhatsApp show
// an empty forwarded message with a Download button instead of rendering it.
function buildHtmlApp(html, title) {
  const plainText = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#9636;/g, "▦")
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  const unifiedResponse = {
    __typename: "GenAIUnifiedResponse",
    response_id: randomUUID(),
    sections: [
      {
        __typename: "GenAIUnifiedResponseSection",
        view_model: {
          __typename: "GenAISingleLayoutViewModel",
          primitive: {
            __typename: "GenAIaeacdsnwHtmlPrimitive",
            payload: html,
            trusted_sources: [],
          },
        },
      },
    ],
  };
  // Escape non-ASCII exactly like the known-good builders. Raw UTF-8 in this
  // JSON makes some clients treat the payload as unverifiable media.
  const encoded = JSON.stringify(unifiedResponse).replace(
    /[\u007f-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
  const signatureMaterial = Buffer.from("ROUTERMOD.MSG.V4.VERIFICATIONSIGNATURE.METADATA");
  const certificateMaterial = Buffer.from("ROUTERMOD.MSG.V4.CERTIFICATECHAIN.METADATA");
  const pad = (material, size) =>
    Buffer.concat([material, randomBytes(Math.max(0, size - material.length))]).toString("base64");
  return {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        // Required for the client to recognise this as an AI rich response.
        // Removing it makes WhatsApp show "versi Anda tidak mendukungnya".
        messageDisclaimerText: title,
        botResponseId: randomUUID(),
        richResponseSourcesMetadata: { sources: [] },
        verificationMetadata: {
          proofs: [
            {
              version: 1,
              useCase: 1,
              signature: pad(signatureMaterial, 64),
              certificateChain: [pad(certificateMaterial, 684), pad(certificateMaterial, 892)],
            },
          ],
        },
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          // A submessage is REQUIRED: an empty array makes the server ack the
          // send but silently drop it on the client. Keep it short so it does
          // not duplicate the card header.
          submessages: [{ messageType: 2, messageText: "Model tersedia · realtime probe" }],
          unifiedResponse: {
            data: Buffer.from(encoded).toString("base64"),
          },
          contextInfo: {
            // All four fields are required for the rich renderer. Dropping the
            // forwarding flags makes WhatsApp reject the message as unsupported.
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: "0@bot" },
            forwardOrigin: 4,
          },
        },
      },
    },
  };
}

async function sendHtmlApp(jid, html, title) {
  if (!sock || !isSockReady) throw new Error("WhatsApp is not connected.");
  // The <biz><interactive native_flow> companion node is what tells WhatsApp
  // to render this as an inline AI-rich response. Without it the client shows
  // a blank forwarded card with a Download button.
  const nativeFlowNode = {
    tag: "biz",
    attrs: {},
    content: [
      {
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
      },
    ],
  };
  const content = buildHtmlApp(html, title);
  const sent = await sock.message.send(jid, content, {
    customNodes: [nativeFlowNode],
  });
  // Bypass the Download prompt: resend the identical payload as an edit after
  // 300ms. WhatsApp then renders the card inline instead of as an attachment.
  // Failure is non-fatal - the original card is already delivered.
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await sock.message.send(jid, content, {
      editKey: { id: sent.id },
      customNodes: [nativeFlowNode],
    });
  } catch (error) {
    log.error(`HTML bypass edit failed: ${error.message}`);
  }
}

// Rich first, plain text always as a safety net. If the rich payload is ever
// rejected we switch to plain text permanently for this process and never
// retry, so a bad payload cannot loop into reconnect/unlink behaviour.
async function sendModelsResult(jid, result) {
  if (USE_RICH_MESSAGES && !richModelsDisabled) {
    try {
      await sendHtmlApp(jid, buildModelsHtml(result.rows), result.title);
      return;
    } catch (error) {
      richModelsDisabled = true;
      log.error(`rich .models send failed; using plain text: ${error.message}`);
    }
  }
  for (const chunk of result.chunks) await sendText(jid, chunk);
}

async function getAdminNumbers() {
  try {
    const config = await routerApi("/api/automate/config");
    const raw = config.whatsappAdminNumbers || "";
    return new Set(String(raw).split(/[\s,;]+/).map(formatNumber).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function isGroupAdmin(chatJid, sender, key) {
  const candidates = [sender, key?.participantAlt].filter(Boolean);
  try {
    const meta = await sock.group.queryGroupMetadata(chatJid);
    const participant = (meta?.participants || []).find((p) =>
      candidates.some((candidate) =>
        p.jid === candidate || p.phoneNumber === candidate || p.lid === candidate
        || String(p.jid || "").split("@")[0] === String(candidate).split("@")[0]
      )
    );
    return !!(participant?.isAdmin || participant?.isSuperAdmin);
  } catch {
    return false;
  }
}

function maskKey(key) {
  const value = String(key || "");
  if (value.length <= 12) return `${value.slice(0, 4)}••••`;
  return `${value.slice(0, 8)}••••${value.slice(-4)}`;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function formatCompact(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return formatCount(number);
}

function formatExpiry(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function buildKeysReport() {
  const [{ keys }, { totals }] = await Promise.all([
    routerApi("/api/keys"),
    routerApi("/api/automate/key-usage"),
  ]);
  const title = "API Keys RouterMod";
  if (!Array.isArray(keys) || keys.length === 0) {
    return { chunks: ["*API KEYS ROBOTMOD*\n\n_Belum ada API key._"], items: [], title };
  }

  const usage = totals || {};
  const items = keys.map((key, index) => {
    const total = usage[key.key] || { requests: 0, tokens: 0 };
    const limits = [];
    if (key.dailyLimit) limits.push(`${formatCount(key.dailyLimit)}/hari`);
    if (key.hourLimit) limits.push(`${formatCount(key.hourLimit)}/jam`);
    if (key.minuteLimit) limits.push(`${formatCount(key.minuteLimit)}/menit`);
    if (key.monthLimit) limits.push(`${formatCount(key.monthLimit)}/bulan`);
    if (key.tokensPerMinuteLimit) limits.push(`${formatCount(key.tokensPerMinuteLimit)} token/menit`);
    return {
      index: index + 1,
      name: key.name || "Tanpa nama",
      masked: maskKey(key.key),
      status: key.isActive ? "Aktif" : "Nonaktif",
      active: !!key.isActive,
      limits: limits.length ? limits.join(" · ") : "tidak ada",
      tokenLimit: key.tokenLimit ? formatCompact(key.tokenLimit) : "-",
      expiry: formatExpiry(key.expiresAt),
      tokens: `${formatCompact(total.tokens)}/${key.tokenLimit ? formatCompact(key.tokenLimit) : "∞"}`,
      requests: formatCount(total.requests),
    };
  });

  const lines = ["*API KEYS ROUTERMOD*", `_Total ${keys.length} key_`, ""];
  for (const item of items) {
    lines.push(`${item.index}. *${item.name}*`);
    lines.push(`> ${item.masked} · ${item.status}`);
    lines.push(`> Limit: ${item.limits}`);
    lines.push(`> Token Limit: ${item.tokenLimit}`);
    lines.push(`> Expired: ${item.expiry}`);
    lines.push("");
    lines.push("*TOTAL USAGE & REQ*");
    lines.push(`• Token Usage: ${item.tokens}`);
    lines.push(`• Request: ${item.requests} req`);
    lines.push("");
  }

  const chunks = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length + 1 > 3000) {
      chunks.push(current);
      current = "";
    }
    current += `${line}\n`;
  }
  if (current) chunks.push(current);
  return { chunks, items, title };
}

function buildKeysHtml(items) {
  const cards = items.map((item) => (
    `<div style="margin-top:10px;border:1px solid #3b4a54;border-radius:8px;padding:8px 10px;">` +
      `<div style="display:flex;align-items:center;gap:8px;">` +
        `<span style="flex:none;color:#00a884;font:600 11px/1 monospace;">${item.index}.</span>` +
        `<span style="flex:1;min-width:0;color:#e9edef;font-size:13px;font-weight:600;overflow-wrap:anywhere;">${escapeHtml(item.name)}</span>` +
        `<span style="flex:none;color:${item.active ? "#00a884" : "#ff6a75"};font-size:10px;">${item.active ? "AKTIF" : "NONAKTIF"}</span>` +
      `</div>` +
      `<div style="margin-top:6px;color:#8696a0;font:11px/1.6 monospace;">` +
        `${escapeHtml(item.masked)}<br>` +
        `Limit: ${escapeHtml(item.limits)}<br>` +
        `Token Limit: ${escapeHtml(item.tokenLimit)} · Expired: ${escapeHtml(item.expiry)}` +
      `</div>` +
      `<div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px;border-top:1px solid #3b4a54;padding-top:6px;">` +
        `<span style="color:#8696a0;font-size:10px;">Token <b style="color:#e9edef;">${escapeHtml(item.tokens)}</b></span>` +
        `<span style="color:#8696a0;font-size:10px;">Req <b style="color:#e9edef;">${escapeHtml(item.requests)}</b></span>` +
      `</div>` +
    `</div>`
  )).join("");

  return (
    `<script>` +
      `function rmCopy(b,t){try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t);}else{var a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a);}var o=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=o;},1200);}catch(e){}}` +
    `</script>` +
    `<div style="box-sizing:border-box;width:100%;background:#1f2c34;border:1px solid #3b4a54;border-radius:8px;padding:8px 10px;font-family:Roboto,sans-serif;">` +
      `<div style="display:flex;align-items:center;gap:8px;border-bottom:1px solid #3b4a54;padding-bottom:8px;">` +
        `<div style="width:28px;height:28px;border-radius:7px;background:#2a3942;display:flex;align-items:center;justify-content:center;color:#00a884;font-size:16px;">&#9673;</div>` +
        `<div style="min-width:0;">` +
          `<div style="color:#e9edef;font-size:13px;font-weight:600;">API Keys RouterMod</div>` +
          `<div style="color:#8696a0;font-size:10px;margin-top:1px;">${items.length} key &middot; usage &amp; limit</div>` +
        `</div>` +
      `</div>` +
      cards +
      `<div style="color:#8696a0;font-size:9px;margin-top:8px;text-align:center;">RouterMod &middot; key management</div>` +
    `</div>`
  );
}

function svgText(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return String(value ?? "").replace(/[&<>"']/g, (char) => entities[char]);
}

// Card images are the only rich presentation that renders on both Android and
// iOS. A plain text message follows it so every ID stays copyable.
function buildModelsSvg(rows) {
  const groups = new Map();
  for (const [prefix, id, latency] of rows) {
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push({ id, latency });
  }
  const W = 760, PAD = 22, ROW_H = 28, PROV_H = 36;
  let y = 84;
  for (const list of groups.values()) y += PROV_H + list.length * ROW_H;
  y += 30;
  const H = Math.max(170, y);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="#1f2c34"/>`;
  svg += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="none" stroke="#3b4a54"/>`;
  svg += `<rect x="${PAD}" y="18" width="34" height="34" rx="8" fill="#2a3942"/>`;
  svg += `<text x="${PAD + 17}" y="40" fill="#00a884" font-family="sans-serif" font-size="16" font-weight="600" text-anchor="middle">R</text>`;
  svg += `<text x="${PAD + 46}" y="34" fill="#e9edef" font-family="sans-serif" font-size="17" font-weight="600">List Model Tersedia</text>`;
  svg += `<text x="${PAD + 46}" y="52" fill="#8696a0" font-family="monospace" font-size="11">${rows.length} model aktif · realtime probe</text>`;
  svg += `<line x1="${PAD}" y1="68" x2="${W - PAD}" y2="68" stroke="#3b4a54"/>`;
  let cy = 84;
  for (const [prefix, list] of groups) {
    svg += `<text x="${PAD}" y="${cy + 16}" fill="#8696a0" font-family="monospace" font-size="11" font-weight="600">${svgText(prefix)}</text>`;
    cy += PROV_H;
    for (const { id, latency } of list) {
      svg += `<text x="${PAD}" y="${cy + 18}" fill="#e9edef" font-family="monospace" font-size="12.5">${svgText(id)}</text>`;
      svg += `<text x="${W - PAD}" y="${cy + 18}" fill="#00a884" font-family="monospace" font-size="12" text-anchor="end">${svgText(latency)}</text>`;
      svg += `<line x1="${PAD}" y1="${cy + ROW_H - 2}" x2="${W - PAD}" y2="${cy + ROW_H - 2}" stroke="#2f3b43"/>`;
      cy += ROW_H;
    }
  }
  svg += `<text x="${W / 2}" y="${H - 9}" fill="#8696a0" font-family="sans-serif" font-size="10" text-anchor="middle">RouterMod · model gateway</text>`;
  svg += `</svg>`;
  return svg;
}

function buildKeysSvg(items) {
  const W = 760, PAD = 22, CARD_H = 104, GAP = 10;
  const H = 84 + items.length * (CARD_H + GAP) + 26;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="#1f2c34"/>`;
  svg += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="none" stroke="#3b4a54"/>`;
  svg += `<rect x="${PAD}" y="18" width="34" height="34" rx="8" fill="#2a3942"/>`;
  svg += `<text x="${PAD + 17}" y="40" fill="#00a884" font-family="sans-serif" font-size="16" font-weight="600" text-anchor="middle">K</text>`;
  svg += `<text x="${PAD + 46}" y="34" fill="#e9edef" font-family="sans-serif" font-size="17" font-weight="600">API Keys RouterMod</text>`;
  svg += `<text x="${PAD + 46}" y="52" fill="#8696a0" font-family="monospace" font-size="11">${items.length} key · usage &amp; limit</text>`;
  svg += `<line x1="${PAD}" y1="68" x2="${W - PAD}" y2="68" stroke="#3b4a54"/>`;
  let cy = 78;
  for (const item of items) {
    svg += `<rect x="${PAD}" y="${cy}" width="${W - PAD * 2}" height="${CARD_H}" rx="8" fill="#2a3942" stroke="#3b4a54"/>`;
    svg += `<text x="${PAD + 12}" y="${cy + 24}" fill="#00a884" font-family="monospace" font-size="12" font-weight="600">${item.index}.</text>`;
    svg += `<text x="${PAD + 38}" y="${cy + 24}" fill="#e9edef" font-family="sans-serif" font-size="14" font-weight="600">${svgText(item.name)}</text>`;
    const status = item.active ? "AKTIF" : "NONAKTIF";
    const statusColor = item.active ? "#00a884" : "#ff6a75";
    svg += `<text x="${W - PAD - 12}" y="${cy + 24}" fill="${statusColor}" font-family="monospace" font-size="11" text-anchor="end">${status}</text>`;
    svg += `<text x="${PAD + 12}" y="${cy + 46}" fill="#8696a0" font-family="monospace" font-size="11">${svgText(item.masked)}</text>`;
    svg += `<text x="${PAD + 12}" y="${cy + 64}" fill="#8696a0" font-family="monospace" font-size="11">Limit: ${svgText(item.limits)}</text>`;
    svg += `<text x="${PAD + 12}" y="${cy + 82}" fill="#8696a0" font-family="monospace" font-size="11">Token Limit: ${svgText(item.tokenLimit)} · Expired: ${svgText(item.expiry)}</text>`;
    svg += `<line x1="${PAD + 12}" y1="${cy + 90}" x2="${W - PAD - 12}" y2="${cy + 90}" stroke="#3b4a54"/>`;
    svg += `<text x="${PAD + 12}" y="${cy + 100}" fill="#8696a0" font-family="monospace" font-size="10">Token <tspan fill="#e9edef">${svgText(item.tokens)}</tspan></text>`;
    svg += `<text x="${W - PAD - 12}" y="${cy + 100}" fill="#8696a0" font-family="monospace" font-size="10" text-anchor="end">Req <tspan fill="#e9edef">${svgText(item.requests)}</tspan></text>`;
    cy += CARD_H + GAP;
  }
  svg += `<text x="${W / 2}" y="${H - 9}" fill="#8696a0" font-family="sans-serif" font-size="10" text-anchor="middle">RouterMod · key management</text>`;
  svg += `</svg>`;
  return svg;
}

// Native WhatsApp interactive buttons. zapo automatically adds the required
// <biz><interactive native_flow> companion node for interactiveMessage - adding
// our own would duplicate it and the server rejects the stanza with error 479.
async function sendInteractive(jid, content) {
  await sock.message.send(jid, content);
}

async function sendModelsButtons(jid, rows) {
  const allIds = rows.map((row) => row[1]).join("\n");
  const sections = [];
  const groups = new Map();
  for (const [prefix, id, latency] of rows) {
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push({ id, latency });
  }
  for (const [prefix, list] of groups) {
    sections.push({
      title: prefix,
      rows: list.slice(0, 30).map(({ id, latency }) => ({
        id,
        title: id.length > 40 ? `${id.slice(0, 37)}…` : id,
        description: latency,
      })),
    });
  }
  await sendInteractive(jid, {
    interactiveMessage: {
      body: { text: `${rows.length} model aktif · pilih provider atau salin semua ID` },
      footer: { text: "RouterMod · model gateway" },
      nativeFlowMessage: {
        messageVersion: 1,
        buttons: [
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "Copy Semua ID",
              copy_code: allIds,
            }),
          },
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Pilih Model",
              sections,
            }),
          },
        ],
      },
    },
  });
}

async function sendKeysButtons(jid, items) {
  const allIds = items.map((item) => item.masked).join("\n");
  const rows = items.map((item) => ({
    id: `key-${item.index}`,
    title: item.name.length > 38 ? `${item.name.slice(0, 35)}…` : item.name,
    description: `${item.masked} · ${item.status}`,
  }));
  await sendInteractive(jid, {
    interactiveMessage: {
      body: { text: `${items.length} API key · pilih key atau salin semua` },
      footer: { text: "RouterMod · key management" },
      nativeFlowMessage: {
        messageVersion: 1,
        buttons: [
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "Copy Semua Key",
              copy_code: allIds,
            }),
          },
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Pilih Key",
              sections: [{ title: "API Keys", rows: rows.slice(0, 30) }],
            }),
          },
        ],
      },
    },
  });
}

async function sendCardImage(jid, svg, caption) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await sock.message.send(jid, {
    type: "image",
    media: png,
    mimetype: "image/png",
    caption,
  });
}

async function sendKeysResult(jid, result) {
  if (USE_RICH_MESSAGES && !richModelsDisabled && result.items.length) {
    try {
      await sendHtmlApp(jid, buildKeysHtml(result.items), result.title);
      return;
    } catch (error) {
      richModelsDisabled = true;
      log.error(`rich .keys send failed; using plain text: ${error.message}`);
    }
  }
  for (const chunk of result.chunks) await sendText(jid, chunk);
}

function messageText(message) {
  if (!message) return "";
  const text = message.conversation || message.extendedTextMessage?.text || "";
  return typeof text === "string" ? text.trim() : "";
}

async function sendText(jid, text) {
  if (!sock) return;
  await sock.message.send(jid, { type: "text", text });
}

function createControlServer() {
  mkdirSync(BASE, { recursive: true, mode: 0o700 });
  const info = lstatSync(BASE);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077)) {
    throw new Error("WhatsApp control directory must be private and owned by the service");
  }
  try {
    if (!lstatSync(SOCKET).isSocket()) throw new Error("control path is not a socket");
    unlinkSync(SOCKET);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const server = createServer(async (req, res) => {
    const reply = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === "GET" && req.url === "/status") {
        return reply(200, {
          state: isSockReady ? "connected" : sock?.getState?.().registered ? "reconnecting" : "disconnected",
        });
      }
      if (req.method === "GET" && req.url === "/keys") {
        const result = await buildKeysReport();
        return reply(200, {
          chunks: result.chunks,
          items: result.items,
          html: result.items.length ? buildKeysHtml(result.items) : "",
          svg: result.items.length ? buildKeysSvg(result.items) : "",
          admins: [...(await getAdminNumbers())],
        });
      }
      if (req.method === "GET" && (req.url === "/models" || req.url.startsWith("/models?"))) {
        const q = new URL(req.url, "http://localhost").searchParams.get("q") || "";
        const result = await buildModelsReport(q);
        const html = buildModelsHtml(result.rows);
        return reply(200, {
          ...result,
          html,
          svg: buildModelsSvg(result.rows),
          app: buildHtmlApp(html, result.title),
        });
      }
      if (req.method === "GET" && req.url === "/queue") {
        const db = getQueueDb();
        try {
          const counts = db.prepare(`
            SELECT
              SUM(CASE WHEN sent = 1 THEN 1 ELSE 0 END) AS sent,
              SUM(CASE WHEN sent = 0 AND attempts = 0 THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN sent = 0 AND attempts > 0 THEN 1 ELSE 0 END) AS failed
            FROM message_queue
          `).get();
          return reply(200, {
            sent: counts?.sent || 0,
            pending: counts?.pending || 0,
            failed: counts?.failed || 0,
          });
        } finally { db.close(); }
      }
      if (req.method !== "POST" || !["/pair", "/group", "/send", "/test-rich", "/test-card", "/test-buttons"].includes(req.url)) return reply(404, {});
      let text = "";
      for await (const chunk of req) {
        if (text.length + chunk.length > 1024) return reply(413, { error: "Request too large." });
        text += chunk;
      }
      let body;
      try { body = JSON.parse(text); } catch { return reply(400, { error: "Invalid JSON." }); }
      if (req.url === "/pair") {
        return reply(200, await requestPairing(formatNumber(body?.number), body?.fresh === true));
      }
      if (req.url === "/group") return reply(200, await joinGroup(body?.invite));
      if (req.url === "/test-rich") {
        const jid = normalizeJid(body?.jid);
        if (!jid) return reply(400, { error: "Invalid JID." });
        const result = await buildModelsReport();
        await sendHtmlApp(jid, buildModelsHtml(result.rows), result.title);
        return reply(200, { jid, rows: result.rows.length });
      }
      if (req.url === "/test-buttons") {
        const jid = normalizeJid(body?.jid);
        if (!jid) return reply(400, { error: "Invalid JID." });
        if (body?.variant === "copy") {
          await sendInteractive(jid, {
            interactiveMessage: {
              body: { text: "Tombol copy uji" },
              nativeFlowMessage: {
                messageVersion: 1,
                buttons: [{ name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: "Copy Ini", copy_code: "cx/gpt-6-luna" }) }],
              },
            },
          });
          return reply(200, { jid, variant: "copy" });
        }
        if (body?.variant === "select") {
          await sendInteractive(jid, {
            interactiveMessage: {
              body: { text: "Tombol pilih uji" },
              nativeFlowMessage: {
                messageVersion: 1,
                buttons: [{ name: "single_select", buttonParamsJson: JSON.stringify({ title: "Pilih", sections: [{ title: "CX", rows: [{ id: "cx/gpt-6-luna", title: "cx/gpt-6-luna" }] }] }) }],
              },
            },
          });
          return reply(200, { jid, variant: "select" });
        }
        if (body?.kind === "keys") {
          const result = await buildKeysReport();
          await sendKeysButtons(jid, result.items);
          return reply(200, { jid, kind: "keys", items: result.items.length });
        }
        const result = await buildModelsReport();
        await sendModelsButtons(jid, result.rows);
        return reply(200, { jid, kind: "models", rows: result.rows.length });
      }
      if (req.url === "/test-card") {
        const jid = normalizeJid(body?.jid);
        if (!jid) return reply(400, { error: "Invalid JID." });
        if (body?.kind === "keys") {
          const result = await buildKeysReport();
          await sendCardImage(jid, buildKeysSvg(result.items), "API Keys RouterMod · kartu ringkas");
          return reply(200, { jid, kind: "keys", items: result.items.length });
        }
        const result = await buildModelsReport();
        await sendCardImage(jid, buildModelsSvg(result.rows), "List Model Tersedia · kartu ringkas");
        return reply(200, { jid, kind: "models", rows: result.rows.length });
      }
      const jid = normalizeJid(body?.jid);
      if (!jid || typeof body?.message !== "string" || !body.message.trim()) {
        return reply(400, { error: "Invalid message destination." });
      }
      enqueue(jid, body.message);
      return reply(200, { jid });
    } catch (error) {
      if (!(error instanceof ControlError)) log.error(`control error: ${error.message}`);
      return reply(error.status || 503, {
        error: error.status ? error.message : "WhatsApp operation failed.",
      });
    }
  });
  server.requestTimeout = 30_000;
  server.on("error", (error) => log.error(`control socket error: ${error.message}`));
  server.listen(SOCKET);
  return server;
}

newControllerReady();
createControlServer();
// Startup cleanup: a fresh process must not replay alerts that accumulated
// while the previous one was down.
{
  const db = getQueueDb();
  try { discardStaleQueue(db); } finally { db.close(); }
}
void startBot();
