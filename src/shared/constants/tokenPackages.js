// Token topup catalogue. The server is the source of truth: the client only
// sends a package id, never a price or token amount, so a tampered request
// cannot buy 100M tokens for IDR 5.000.
export const TOPUP_VALIDITY_DAYS = 30;

// A QRIS invoice is only valid for a short window. If the payment is not
// detected within this period the invoice is marked failed, so an old pending
// invoice can never be settled by a later transfer of the same nominal.
export const INVOICE_TTL_MINUTES = 10;
export const INVOICE_TTL_MS = INVOICE_TTL_MINUTES * 60 * 1000;

export const TOKEN_PACKAGES = [
  { id: "t5m", tokens: 5_000_000, price: 5_000, label: "5M" },
  { id: "t15m", tokens: 15_000_000, price: 10_000, label: "15M" },
  { id: "t50m", tokens: 50_000_000, price: 15_000, label: "50M" },
  { id: "t100m", tokens: 100_000_000, price: 25_000, label: "100M" },
];

export function findTokenPackage(id) {
  return TOKEN_PACKAGES.find((pkg) => pkg.id === id) || null;
}

export function topupValidityMs() {
  return TOPUP_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
}
