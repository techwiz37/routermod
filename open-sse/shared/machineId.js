// node-machine-id ships a minified UMD bundle: its named exports are not
// statically detectable, so `import { machineIdSync }` throws
// "does not provide an export named 'machineIdSync'" under plain ESM.
// Import the namespace and pick the function at runtime instead.
import machineIdPkg from "node-machine-id";
import crypto from "node:crypto";

const { machineIdSync } = machineIdPkg || {};

let cachedRawId = null;

function loadRawMachineId() {
  if (cachedRawId) return cachedRawId;
  try {
    cachedRawId = machineIdSync();
  } catch {
    cachedRawId = crypto.randomUUID();
  }
  return cachedRawId;
}

export async function getConsistentMachineId(salt = "endpoint-proxy-salt") {
  const rawId = loadRawMachineId();
  return crypto.createHash("sha256").update(rawId + salt).digest("hex").substring(0, 16);
}
