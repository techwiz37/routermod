import crypto from "crypto";

const CHARS = "abcdefghijklmnpqrstuvwxyz23456789";

function randomStr(len) {
  let s = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += CHARS[bytes[i] % CHARS.length];
  return s;
}

export function generateApiKeyWithMachine(_machineId) {
  const key = `rmod-${randomStr(8)}`;
  return { key, keyId: key };
}

export function parseApiKey(apiKey) {
  if (!apiKey) return null;
  if (apiKey.startsWith("rmod-")) return { machineId: null, keyId: apiKey, isNewFormat: false };
  if (!apiKey.startsWith("sk-")) return null;
  const parts = apiKey.split("-");
  if (parts.length === 4) return { machineId: parts[1], keyId: parts[2], isNewFormat: true };
  if (parts.length === 2) return { machineId: null, keyId: parts[1], isNewFormat: false };
  return null;
}

export function verifyApiKeyCrc(_apiKey) { return true; }
export function isNewFormatKey(_apiKey) { return false; }

