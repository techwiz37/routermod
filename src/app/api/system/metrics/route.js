import { NextResponse } from "next/server";
import os from "node:os";
import fs from "node:fs";

export const dynamic = "force-dynamic";

let lastCpuInfo = null;

function getCpuUsage() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }

  if (!lastCpuInfo) {
    lastCpuInfo = { idle, total };
    return 0;
  }

  const idleDiff = idle - lastCpuInfo.idle;
  const totalDiff = total - lastCpuInfo.total;
  lastCpuInfo = { idle, total };

  if (totalDiff <= 0) return 0;
  const usage = 100 - (100 * idleDiff) / totalDiff;
  return Math.max(0, Math.min(100, Math.round(usage * 10) / 10));
}

function getDiskStats() {
  try {
    const rootPath = process.platform === "win32" ? process.cwd().slice(0, 3) : "/";
    if (fs.statfsSync) {
      const stats = fs.statfsSync(rootPath);
      const total = stats.bsize * stats.blocks;
      const free = stats.bsize * stats.bfree;
      const used = total - free;
      const percent = total > 0 ? Math.round((used / total) * 100) : 0;
      return { total, free, used, percent };
    }
  } catch {}
  return { total: 0, free: 0, used: 0, percent: 0 };
}

export async function GET() {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const procMem = process.memoryUsage();

    const cpuPercent = getCpuUsage();
    const disk = getDiskStats();

    const netInterfaces = os.networkInterfaces();
    let localIp = "127.0.0.1";
    for (const devName in netInterfaces) {
      const iface = netInterfaces[devName];
      for (const alias of iface || []) {
        if (alias.family === "IPv4" && !alias.internal) {
          localIp = alias.address;
          break;
        }
      }
    }

    return NextResponse.json({
      uptime: Math.floor(os.uptime()),
      processUptime: Math.floor(process.uptime()),
      platform: `${os.type()} ${os.arch()} (${os.release()})`,
      nodeVersion: process.version,
      pid: process.pid,
      localIp,
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || "Unknown CPU",
        percent: cpuPercent,
        loadAvg: os.loadavg(),
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percent: Math.round((usedMem / totalMem) * 100),
        processRss: procMem.rss,
        processHeapUsed: procMem.heapUsed,
        processHeapTotal: procMem.heapTotal,
      },
      disk,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
