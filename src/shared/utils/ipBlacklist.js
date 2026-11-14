export const IP_BLACKLIST_MAX_ENTRIES = 1000;

// Strip IPv4-mapped IPv6 prefixes and surrounding whitespace so "::ffff:1.2.3.4"
// and "1.2.3.4" are treated as the same address.
export function normalizeIp(ip) {
  let value = String(ip || "").trim().toLowerCase();
  if (!value) return "";
  if (value.startsWith("[") && value.includes("]")) value = value.slice(1, value.indexOf("]"));
  if (value.startsWith("::ffff:") && value.includes(".")) value = value.slice(7);
  return value;
}

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

function isValidIpv6(ip) {
  return ip.includes(":") && /^[0-9a-f:.]+$/.test(ip) && ip.split("::").length <= 2;
}

export function isValidBlacklistEntry(entry) {
  const value = normalizeIp(entry);
  if (!value) return false;
  const [addr, bits, extra] = value.split("/");
  if (extra !== undefined) return false;
  if (ipv4ToInt(addr) !== null) {
    if (bits === undefined) return true;
    return /^\d{1,2}$/.test(bits) && Number(bits) <= 32;
  }
  if (isValidIpv6(addr)) return bits === undefined;
  return false;
}

// Accepts a raw textarea value (comma / newline / whitespace separated) or an
// array and returns { valid, invalid } with duplicates removed.
export function parseIpBlacklistInput(input) {
  const raw = Array.isArray(input) ? input : String(input || "").split(/[\s,;]+/);
  const seen = new Set();
  const valid = [];
  const invalid = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = normalizeIp(item);
    if (!value) continue;
    if (!isValidBlacklistEntry(value)) {
      invalid.push(item.trim());
      continue;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    valid.push(value);
  }
  return { valid, invalid };
}

export function isIpBlacklisted(ip, list) {
  const target = normalizeIp(ip);
  if (!target || !Array.isArray(list) || list.length === 0) return false;
  const targetInt = ipv4ToInt(target);
  for (const entry of list) {
    const value = normalizeIp(entry);
    if (!value) continue;
    if (value === target) return true;
    const [addr, bits] = value.split("/");
    if (bits === undefined || targetInt === null) continue;
    const base = ipv4ToInt(addr);
    if (base === null) continue;
    const prefix = Number(bits);
    if (prefix === 0) return true;
    const size = 2 ** (32 - prefix);
    if (Math.floor(base / size) === Math.floor(targetInt / size)) return true;
  }
  return false;
}
