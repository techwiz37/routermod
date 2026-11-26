// QRIS (EMVCo QR) helpers — ported from the pitopupbot implementation so the
// dashboard can turn an uploaded static merchant QRIS into a dynamic one with
// the exact top-up amount embedded (tag 54), then render it as a QR image.

const COMPOSITE_TAGS = new Set([
  "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39",
  "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "62", "64",
]);

export function crc16Ccitt(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc ^ (data.charCodeAt(i) & 0xff)) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function readTlv(payload) {
  const nodes = [];
  let cursor = 0;
  while (cursor + 4 <= payload.length) {
    const tag = payload.slice(cursor, cursor + 2);
    if (!/^[0-9]{2}$/.test(tag)) break;
    const len = parseInt(payload.slice(cursor + 2, cursor + 4), 10);
    if (!Number.isFinite(len) || len < 0) break;
    const start = cursor + 4;
    const end = start + len;
    if (end > payload.length) break;
    const value = payload.slice(start, end);
    const node = { id: tag, length: len, value, start: cursor, end };
    if (COMPOSITE_TAGS.has(tag)) {
      try { node.children = readTlv(value); } catch { /* keep raw value */ }
    }
    nodes.push(node);
    cursor = end;
  }
  return nodes;
}

function writeTlv(nodes) {
  return nodes
    .map((node) => {
      const value = node.children ? writeTlv(node.children) : node.value;
      return `${node.id}${String(value.length).padStart(2, "0")}${value}`;
    })
    .join("");
}

function deleteNodes(nodes, ids) {
  const remove = new Set(ids);
  return nodes.filter((n) => !remove.has(n.id));
}

function insertTagBefore(nodes, tagId, node) {
  const idx = nodes.findIndex((n) => n.id > tagId);
  if (idx === -1) return [...nodes, node];
  return [...nodes.slice(0, idx), node, ...nodes.slice(idx)];
}

function formatAmountTag54(amount) {
  const digits = String(amount || "").replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return "";
  const normalized = digits.replace(/^0+/, "") || "0";
  if (normalized.length > 13) return "";
  return normalized;
}

export function parseQrisPayload(qrisString) {
  const raw = String(qrisString || "").trim();
  if (!raw) return null;
  const nodes = readTlv(raw);
  if (!nodes.length) return null;
  // Use the parsed tag 63 rather than searching for "6304": the CRC value
  // itself may contain that substring, and merchant QRIS templates are often
  // saved with a missing or stale checksum even though the TLV body is valid.
  const crcNode = nodes.find((n) => n.id === "63");
  const body = crcNode ? raw.slice(0, crcNode.start + 4) : raw;
  const crc = crcNode ? String(crcNode.value).toUpperCase() : "";
  const crcValid = crcNode ? crc16Ccitt(body) === crc : false;
  return { nodes, payload: raw, crc, crcValid };
}

export function serializeQris(nodes) {
  const body = writeTlv(deleteNodes(nodes, ["63"]));
  const payload = `${body}6304`;
  return payload + crc16Ccitt(payload);
}

export function setQrisAmount(qrisString, amountRupiah) {
  const parsed = parseQrisPayload(qrisString);
  if (!parsed) return "";
  const initiation = parsed.nodes.find((n) => n.id === "01")?.value;
  if (initiation !== "11" && initiation !== "12") return "";
  const amountStr = formatAmountTag54(amountRupiah);
  if (!amountStr) return "";

  let next = [];
  for (const node of deleteNodes(parsed.nodes, ["54", "55", "56", "57", "63"])) {
    next.push(node.id === "01" && node.value === "11" ? { id: "01", length: 2, value: "12" } : node);
  }
  next = insertTagBefore(next, "54", { id: "54", length: amountStr.length, value: amountStr });
  return serializeQris(next);
}

export function pickMerchantName(qris) {
  const parsed = parseQrisPayload(qris);
  if (!parsed) return "";
  const node59 = parsed.nodes.find((n) => n.id === "59");
  return node59 ? String(node59.value).trim() : "";
}

export function validateQrisTemplate(qris) {
  const parsed = parseQrisPayload(qris);
  if (!parsed) return { ok: false, error: "Invalid QRIS or broken CRC checksum." };
  const initiation = parsed.nodes.find((n) => n.id === "01")?.value;
  if (initiation !== "11" && initiation !== "12") {
    return { ok: false, error: "This is not a static merchant QRIS (tag 01 is not 11/12)." };
  }
  // Like idol-nexaio, accept a well-formed TLV body even when the stored CRC
  // is missing/stale. setQrisAmount() re-serializes the payload and writes a
  // freshly computed CRC, so the dynamic QRIS itself is always valid.
  return { ok: true, merchant: pickMerchantName(qris), crcValid: parsed.crcValid };
}
