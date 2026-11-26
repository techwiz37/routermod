import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const dynamic = "force-dynamic";

function bridgeBin() {
  return [process.env.FREEPI_BRIDGE_BIN, path.join(process.cwd(), ".bin", "freepi-bridge"), path.resolve(process.cwd(), "..", "..", ".bin", "freepi-bridge")]
    .find((p) => p && fs.existsSync(p)) || null;
}

export async function POST() {
  const bin = bridgeBin();
  if (!bin) return NextResponse.json({ error: "Bridge binary not installed" }, { status: 400 });
  const credPath = path.join(os.homedir(), ".free-pi", "agent", "credentials.json");
  if (!process.env.FREEPI_TOKEN && !fs.existsSync(credPath)) {
    return NextResponse.json({ error: "FreePi token belum ada — login dulu lewat CLI" }, { status: 400 });
  }
  try {
    const child = spawn(bin, ["start", "--port", process.env.FREEPI_BRIDGE_PORT || "8787"], {
      cwd: path.dirname(bin), stdio: "ignore", detached: true,
    });
    child.unref();
    return NextResponse.json({ success: true, pid: child.pid });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
