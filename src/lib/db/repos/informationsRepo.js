// Admin information notices for API-key owners.
//
// Read state lives in `informationReads` keyed by (informationId, keyId). It is
// deliberately server-side instead of localStorage: the owner can sign in on a
// different device and still see that a notice was acknowledged.
import { randomUUID } from "node:crypto";
import { getAdapter } from "../driver.js";

const MAX_TITLE = 160;
const MAX_BODY = 20000;

function iso() {
  return new Date().toISOString();
}

function toBool(value, fallback = true) {
  if (value === undefined) return fallback;
  return value === true || value === 1 || value === "1" || value === "true";
}

export function rowToInformation(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || "",
    body: row.body || "",
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function normalizeInput(body = {}) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!title) return { error: "Title is required" };
  if (title.length > MAX_TITLE) return { error: `Title must be ${MAX_TITLE} characters or fewer` };
  if (!text) return { error: "Body is required" };
  if (text.length > MAX_BODY) return { error: `Body must be ${MAX_BODY} characters or fewer` };
  return { title, body: text, isActive: toBool(body.isActive, true) };
}

export async function listInformations({ activeOnly = false } = {}) {
  const db = await getAdapter();
  const rows = activeOnly
    ? db.all(`SELECT * FROM informations WHERE isActive = 1 ORDER BY createdAt DESC`)
    : db.all(`SELECT * FROM informations ORDER BY createdAt DESC`);
  return rows.map(rowToInformation);
}

export async function getInformation(id) {
  const db = await getAdapter();
  return rowToInformation(db.get(`SELECT * FROM informations WHERE id = ?`, [id]));
}

export async function createInformation(body) {
  const input = normalizeInput(body);
  if (input.error) return { error: input.error };
  const db = await getAdapter();
  const now = iso();
  const id = randomUUID();
  db.run(
    `INSERT INTO informations(id, title, body, isActive, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?)`,
    [id, input.title, input.body, input.isActive ? 1 : 0, now, now]
  );
  return { information: await getInformation(id) };
}

export async function updateInformation(id, body = {}) {
  const existing = await getInformation(id);
  if (!existing) return { error: "Information not found", notFound: true };

  // PATCH-style: only the fields sent are replaced, so an activation toggle in
  // the list does not need to resend the whole notice.
  let title = existing.title;
  let text = existing.body;
  if (body.title !== undefined) {
    title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return { error: "Title is required" };
    if (title.length > MAX_TITLE) return { error: `Title must be ${MAX_TITLE} characters or fewer` };
  }
  if (body.body !== undefined) {
    text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) return { error: "Body is required" };
    if (text.length > MAX_BODY) return { error: `Body must be ${MAX_BODY} characters or fewer` };
  }
  const isActive = body.isActive === undefined ? existing.isActive : toBool(body.isActive, existing.isActive);

  const db = await getAdapter();
  db.run(
    `UPDATE informations SET title = ?, body = ?, isActive = ?, updatedAt = ? WHERE id = ?`,
    [title, text, isActive ? 1 : 0, iso(), id]
  );
  return { information: await getInformation(id) };
}

export async function deleteInformation(id) {
  const db = await getAdapter();
  db.run(`DELETE FROM informationReads WHERE informationId = ?`, [id]);
  const result = db.run(`DELETE FROM informations WHERE id = ?`, [id]);
  return { deleted: (result?.changes ?? 0) > 0 || !(await getInformation(id)) };
}

/**
 * Active notices plus this key's read flag. Read state is keyed by the key's
 * database id so a rotated secret keeps its history with the same key row.
 */
export async function listInformationsForKey(keyId) {
  if (!keyId) return [];
  const db = await getAdapter();
  const rows = db.all(
    `SELECT i.*, r.readAt AS readAt
       FROM informations i
       LEFT JOIN informationReads r
         ON r.informationId = i.id AND r.keyId = ?
      WHERE i.isActive = 1
      ORDER BY i.createdAt DESC`,
    [keyId]
  );
  return rows.map((row) => ({ ...rowToInformation(row), read: Boolean(row.readAt), readAt: row.readAt || null }));
}

export async function countUnreadInformations(keyId) {
  if (!keyId) return 0;
  const db = await getAdapter();
  const row = db.get(
    `SELECT COUNT(*) AS count
       FROM informations i
       LEFT JOIN informationReads r
         ON r.informationId = i.id AND r.keyId = ?
      WHERE i.isActive = 1 AND r.id IS NULL`,
    [keyId]
  );
  return Number(row?.count) || 0;
}

/**
 * Mark the given notices (or every currently active notice) read for a key.
 * INSERT OR IGNORE + the unique index makes repeated clicks safe.
 */
export async function markInformationsRead(keyId, ids = null) {
  if (!keyId) return { marked: 0 };
  const db = await getAdapter();
  const now = iso();
  const targets = Array.isArray(ids) && ids.length
    ? ids.filter((id) => typeof id === "string" && id)
    : (await listInformationsForKey(keyId)).filter((item) => !item.read).map((item) => item.id);
  if (!targets.length) return { marked: 0 };

  let marked = 0;
  db.transaction(() => {
    for (const id of targets) {
      const result = db.run(
        `INSERT OR IGNORE INTO informationReads(informationId, keyId, readAt) VALUES(?, ?, ?)`,
        [id, keyId, now]
      );
      marked += result?.changes ?? 0;
    }
  });
  return { marked };
}
