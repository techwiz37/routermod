import { getAdapter } from "../src/lib/db/adapter.js";
import { getProviderConnections } from "../src/lib/db/repos/connectionsRepo.js";

async function main() {
  const db = await getAdapter();
  const tables = db.all("SELECT name FROM sqlite_master WHERE type='table'");
  console.log("TABLES:", tables.map(t => t.name));

  const conns = await getProviderConnections();
  console.log("CURRENT CONNECTIONS:", conns.length);
}

main().catch(console.error);
