// Account suspension is distinct from quota exhaustion and token expiration.
export function isKiroSuspension(error) {
  const text = typeof error === "string"
    ? error
    : [error?.message, error?.reason, error?.code, error?.error?.message, error?.error?.code]
      .filter(Boolean)
      .join(" ");
  if (!text) return false;
  // AWS reason code that accompanies a suspended Kiro User ID.
  if (/TEMPORARILY_SUSPENDED|SUSPENDED_USER/i.test(text)) return true;
  return /\b(?:user\s*id|account)(?:\s*\(?[a-f\d-]{36}\)?)?\s*(?:(?:is|was|has been|temporarily|currently)\s+)*suspended\b/i.test(text)
    || /\bsuspension (?:of|for) (?:your |the )?(?:user\s*id|account)\b/i.test(text)
    || /\blocked (?:it|your account|your user id) as a security precaution\b/i.test(text);
}

export function kiroSuspensionError(message) {
  return Object.assign(new Error(/^Kiro User ID is suspended:/i.test(message) ? message : `Kiro User ID is suspended: ${message}`), {
    status: 403,
    code: "kiro_user_suspended",
    retryable: false,
  });
}
