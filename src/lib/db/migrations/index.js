import m001 from "./001-initial.js";
import m002 from "./002-add-duration.js";
import m003 from "./003-api-key-policy.js";
import m004 from "./004-api-key-rate-limits.js";
import m007 from "./007-api-key-token-quota.js";
import m008 from "./008-add-automate-tables.js";
import m009 from "./009-api-key-token-reset.js";
import m010 from "./010-topup-invoices.js";
import m011 from "./011-buy-key-invoices.js";
import m012 from "./012-short-invoice-ttl.js";
import m013 from "./013-api-key-change-key-toggle.js";
import m014 from "./014-api-key-manage-ip-toggle.js";

export const MIGRATIONS = [m001, m002, m003, m004, m007, m008, m009, m010, m011, m012, m013, m014].sort((a, b) => a.version - b.version);

export function latestVersion() {
  return MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;
}
