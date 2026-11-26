const tokenNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function tokenPeriodLabel(window) {
  return ({ "1m": "Minutes", "1h": "Hours", "24h": "Days", "7d": "7 days", "30d": "30 days" })[window] || "Days";
}

export function formatTokens(input) {
  const value = Number(input);
  if (!Number.isFinite(value)) return "0";

  for (const [size, suffix] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]]) {
    if (Math.abs(value) >= size) return `${tokenNumber.format(value / size)} ${suffix}`;
  }
  return tokenNumber.format(value);
}
