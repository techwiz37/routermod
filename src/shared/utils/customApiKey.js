// Custom secrets use header/cookie-safe characters without requiring a prefix.
// Short values are allowed for convenience, so the UI warns users to pick
// something hard to guess instead of hard-blocking them.
const INVALID_CHARACTERS = /[^A-Za-z0-9_-]/;
export const CUSTOM_API_KEY_MIN_LENGTH = 5;
export const CUSTOM_API_KEY_MAX_LENGTH = 128;
export const CUSTOM_API_KEY_HELP = "Use 5–128 characters: letters, numbers, hyphens (-), or underscores (_). The rmod- prefix is optional. Avoid easily guessed words.";
export const CUSTOM_API_KEY_ERROR = "The API key must be 5–128 characters and contain only letters, numbers, hyphens (-), or underscores (_).";

export function customApiKeyError(value) {
  return typeof value === "string"
    && value.length >= CUSTOM_API_KEY_MIN_LENGTH
    && value.length <= CUSTOM_API_KEY_MAX_LENGTH
    && !INVALID_CHARACTERS.test(value)
    ? ""
    : CUSTOM_API_KEY_ERROR;
}

// Never render the whole secret, even when it is short. Full-length keys keep
// the familiar 8+4 preview; short ones expose only a couple of leading chars.
export function maskApiKey(key) {
  if (typeof key !== "string" || !key) return "";
  if (key.length <= 8) return `${key.slice(0, 2)}••••`;
  if (key.length <= 16) return `${key.slice(0, 4)}••••${key.slice(-2)}`;
  return `${key.slice(0, 8)}••••${key.slice(-4)}`;
}
