import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

const TIME_WINDOW_UNITS = ["minutes", "hours", "days"];

const DEFAULT_CONFIG = {
  enabled: false,
  failureThreshold: 4,
  // Stored as the user typed it plus its unit; `timeWindowHours` stays the
  // canonical value used by the failure tracker and older callers.
  timeWindowValue: 1,
  timeWindowUnit: "hours",
  timeWindowHours: 1,
  telegramBotToken: "",
  telegramChatId: "",
  whatsappRecipient: "",
  whatsappAdminNumbers: "",
  notifyOnDisable: true,
  notifyOnReEnable: true,
};

function normalizeUnit(unit) {
  return TIME_WINDOW_UNITS.includes(unit) ? unit : "hours";
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function windowToHours(value, unit) {
  const number = positiveNumber(value) ?? 1;
  if (unit === "minutes") return number / 60;
  if (unit === "days") return number * 24;
  return number;
}

/** Best-effort value in `unit` when only the legacy hours column exists. */
function valueFromHours(hours, unit) {
  const number = positiveNumber(hours) ?? 1;
  if (unit === "minutes") return Math.max(1, Math.round(number * 60));
  if (unit === "days") return Math.max(1, Math.round(number / 24));
  return number;
}

export async function getAutomateConfig() {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM automateConfig WHERE id = 1`);
  if (!row) return { ...DEFAULT_CONFIG };
  const data = parseJson(row.data, {});
  const timeWindowUnit = normalizeUnit(data.timeWindowUnit);
  const timeWindowValue =
    positiveNumber(data.timeWindowValue) ?? valueFromHours(row.timeWindowHours, timeWindowUnit);
  return {
    enabled: row.enabled === 1,
    failureThreshold: row.failureThreshold || 4,
    telegramBotToken: row.telegramBotToken || "",
    telegramChatId: row.telegramChatId || "",
    whatsappRecipient: row.whatsappRecipient || "",
    ...data,
    timeWindowUnit,
    timeWindowValue,
    timeWindowHours: windowToHours(timeWindowValue, timeWindowUnit),
  };
}

export async function updateAutomateConfig(config = {}) {
  const db = await getAdapter();
  const {
    enabled = false,
    failureThreshold = 4,
    timeWindowHours,
    timeWindowValue,
    timeWindowUnit,
    telegramBotToken = "",
    telegramChatId = "",
    whatsappRecipient = "",
    ...rest
  } = config;

  const unit = normalizeUnit(timeWindowUnit);
  const value =
    positiveNumber(timeWindowValue) ?? valueFromHours(timeWindowHours ?? rest.timeWindowHours, unit);
  const hours = windowToHours(value, unit);

  db.run(
    `INSERT INTO automateConfig (id, enabled, failureThreshold, timeWindowHours, telegramBotToken, telegramChatId, whatsappRecipient, data)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       enabled = excluded.enabled,
       failureThreshold = excluded.failureThreshold,
       timeWindowHours = excluded.timeWindowHours,
       telegramBotToken = excluded.telegramBotToken,
       telegramChatId = excluded.telegramChatId,
       whatsappRecipient = excluded.whatsappRecipient,
       data = excluded.data`,
    [
      enabled ? 1 : 0,
      Number(failureThreshold) || 4,
      hours,
      telegramBotToken || "",
      telegramChatId || "",
      whatsappRecipient || "",
      stringifyJson({ ...rest, timeWindowValue: value, timeWindowUnit: unit }),
    ]
  );
}

export async function recordFailure(provider, model, connectionId, error) {
  const db = await getAdapter();
  db.run(
    `INSERT INTO automateFailures (provider, model, connectionId, timestamp, error)
     VALUES (?, ?, ?, ?, ?)`,
    [provider, model, connectionId || null, new Date().toISOString(), error || null]
  );
}

export async function getRecentFailures(provider, model, hoursAgo = 1) {
  const db = await getAdapter();
  const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  return db.all(
    `SELECT * FROM automateFailures
     WHERE provider = ? AND model = ? AND timestamp >= ?
     ORDER BY timestamp DESC`,
    [provider, model, cutoff]
  );
}

export async function getFailureStats(hoursAgo = 24) {
  const db = await getAdapter();
  const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  return db.all(
    `SELECT provider, model, COUNT(*) as count
     FROM automateFailures
     WHERE timestamp >= ?
     GROUP BY provider, model
     ORDER BY count DESC`,
    [cutoff]
  );
}

export async function clearOldFailures(daysAgo = 7) {
  const db = await getAdapter();
  const cutoff = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM automateFailures WHERE timestamp < ?`, [cutoff]);
}
