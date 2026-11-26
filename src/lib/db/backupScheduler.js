import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BACKUPS_DIR, DATA_FILE, ensureDirs } from "./paths.js";
import { getAdapter } from "./driver.js";

const BACKUP_INTERVAL_MS = 10 * 60 * 1000;
const MAX_BACKUPS = 2; // keep latest + previous; older ones are auto-replaced
const MIN_VALID_SIZE = 1024;
const BACKUP_PREFIX = "auto-backup";

let backupTimer = null;
let isBackupInProgress = false;

function getAutoBackupDir() {
  ensureDirs();
  return path.join(BACKUPS_DIR, "auto");
}

function getAutoBackups() {
  const autoDir = getAutoBackupDir();
  if (!fs.existsSync(autoDir)) return [];

  return fs
    .readdirSync(autoDir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(".sqlite"))
    .map((f) => {
      const full = path.join(autoDir, f);
      let size = 0;
      let time = 0;
      try {
        size = fs.statSync(full).size;
        time = parseInt(f.match(/(\d+)\.sqlite$/)?.[1] || "0");
      } catch {}
      return { name: f, path: full, size, time };
    })
    .sort((a, b) => b.time - a.time);
}

function deleteBackup(backup) {
  try {
    fs.unlinkSync(backup.path);
  } catch (err) {
    console.error(`[BackupScheduler] Failed to delete ${backup.name}:`, err.message);
  }
}

// A backup is only usable if it is a complete file AND passes SQLite integrity check.
function isIntegrityOk(filePath) {
  try {
    const db = new DatabaseSync(filePath, { readOnly: true });
    try {
      const row = db.prepare("PRAGMA integrity_check").get();
      return row?.integrity_check === "ok";
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

// Remove corrupt (malformed) and excess backups so the folder never grows.
function pruneAutoBackups() {
  const all = getAutoBackups();
  const good = [];

  for (const b of all) {
    if (b.size < MIN_VALID_SIZE || !isIntegrityOk(b.path)) deleteBackup(b);
    else good.push(b);
  }

  for (const old of good.slice(MAX_BACKUPS)) deleteBackup(old);
}

async function performBackup() {
  if (isBackupInProgress) return;

  isBackupInProgress = true;

  try {
    const autoDir = getAutoBackupDir();
    fs.mkdirSync(autoDir, { recursive: true });

    // Never propagate corruption: check the live DB before snapshotting it.
    const adapter = await getAdapter();
    const live = adapter.get("PRAGMA integrity_check");
    if (live?.integrity_check !== "ok") {
      console.error(`[BackupScheduler] Skipped backup: live database is corrupted (${live?.integrity_check || "unknown"})`);
      pruneAutoBackups();
      return;
    }

    pruneAutoBackups();

    const timestamp = Date.now();
    const backupName = `${BACKUP_PREFIX}-${timestamp}.sqlite`;
    const backupPath = path.join(autoDir, backupName);

    // VACUUM INTO writes a consistent snapshot even while the DB is being written.
    const escaped = backupPath.replace(/'/g, "''");
    adapter.exec(`VACUUM INTO '${escaped}'`);

    const size = fs.existsSync(backupPath) ? fs.statSync(backupPath).size : 0;
    if (size < MIN_VALID_SIZE || !isIntegrityOk(backupPath)) {
      deleteBackup({ name: backupName, path: backupPath });
      console.error("[BackupScheduler] Skipped invalid backup (failed integrity check)");
      return;
    }

    pruneAutoBackups();

    const count = getAutoBackups().length;
    console.log(`[BackupScheduler] Backup verified: ${backupName} (${(size / 1024 / 1024).toFixed(1)}MB, ${count}/${MAX_BACKUPS} backups)`);
  } catch (err) {
    console.error("[BackupScheduler] Backup failed:", err.message);
  } finally {
    isBackupInProgress = false;
  }
}

export function startBackupScheduler() {
  if (backupTimer) return;

  console.log(`[BackupScheduler] Started (interval: ${BACKUP_INTERVAL_MS / 60000} min, keep: ${MAX_BACKUPS})`);
  performBackup();

  backupTimer = setInterval(() => {
    performBackup();
  }, BACKUP_INTERVAL_MS);
}

export function stopBackupScheduler() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
    console.log("[BackupScheduler] Stopped");
  }
}

export function getBackupList() {
  return getAutoBackups()
    .filter((b) => b.size >= MIN_VALID_SIZE && isIntegrityOk(b.path))
    .map((b) => ({
      name: b.name,
      size: b.size,
      createdAt: new Date(b.time).toISOString(),
    }));
}

export async function restoreBackup(backupName) {
  const autoDir = getAutoBackupDir();
  const backupPath = path.join(autoDir, backupName);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${backupName}`);
  }
  if (!isIntegrityOk(backupPath)) {
    throw new Error(`Backup is corrupted: ${backupName}`);
  }

  try {
    const timestamp = Date.now();
    const restoreDir = path.join(BACKUPS_DIR, "restored");
    fs.mkdirSync(restoreDir, { recursive: true });

    const restoredPath = path.join(restoreDir, `restored-${timestamp}.sqlite`);
    fs.copyFileSync(DATA_FILE, restoredPath);
    fs.copyFileSync(backupPath, DATA_FILE);

    // Stale WAL/SHM from the previous DB would corrupt the restored file.
    for (const suffix of ["-wal", "-shm"]) {
      try { fs.unlinkSync(`${DATA_FILE}${suffix}`); } catch {}
    }

    console.log(`[BackupScheduler] Restored from ${backupName} (previous DB: ${restoredPath})`);
    return { success: true, restored: DATA_FILE, previous: restoredPath };
  } catch (err) {
    throw new Error(`Restore failed: ${err.message}`);
  }
}
