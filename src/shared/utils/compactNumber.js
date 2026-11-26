// Compact display for large counters: 8,266 -> 8.3K, 665,915,843 -> 665.9M.
// Always en-US so the suffix stays K / M / B regardless of the UI language.
const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("en-US");

export function formatCompact(value) {
  return compact.format(Number(value) || 0);
}

export function formatFull(value) {
  return full.format(Number(value) || 0);
}
