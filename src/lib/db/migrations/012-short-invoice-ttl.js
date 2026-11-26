// QRIS invoices now live for 10 minutes only. Older rows created while the
// window was 24 hours still carry a long `expiresAt`; shorten them so a stale
// pending invoice cannot be settled by a transfer that arrives much later.
const TTL_MS = 10 * 60 * 1000;

export default {
  version: 12,
  name: "short-invoice-ttl",
  up(adapter) {
    const now = Date.now();
    for (const table of ["topupInvoices", "keyPurchaseInvoices"]) {
      const rows = adapter.all(
        `SELECT id, createdAt, expiresAt FROM ${table} WHERE status = 'pending'`
      );
      for (const row of rows) {
        const createdMs = Date.parse(row.createdAt || "");
        if (!Number.isFinite(createdMs)) continue;
        const cappedMs = createdMs + TTL_MS;
        const capped = new Date(cappedMs).toISOString();
        if (cappedMs <= now) {
          adapter.run(
            `UPDATE ${table} SET status = 'expired', expiresAt = ? WHERE id = ?`,
            [capped, row.id]
          );
        } else if (!(Date.parse(row.expiresAt || "") <= cappedMs)) {
          adapter.run(`UPDATE ${table} SET expiresAt = ? WHERE id = ?`, [capped, row.id]);
        }
      }
    }
  },
};
