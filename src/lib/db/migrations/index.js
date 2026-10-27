import m001 from "./001-initial.js";
import m002 from "./002-add-duration.js";

export const MIGRATIONS = [m001, m002].sort((a, b) => a.version - b.version);

export function latestVersion() {
  return MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;
}
