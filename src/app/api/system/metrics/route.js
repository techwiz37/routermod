import { NextResponse } from "next/server";
import os from "node:os";
import fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
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

async function getRoutermodProcessStats() {
  try {
    // Try PM2 first (most accurate: CPU %, RSS, status, uptime)
    const { stdout } = await execAsync(`pm2 jlist 2>/dev/null`, { timeout: 2000 }).catch(() => ({ stdout: "" }));

    if (stdout.trim()) {
      try {
        const list = JSON.parse(stdout);
        const routermod = list.find((p) => p.name === "routermod");
        if (routermod) {
          const cpu = routermod.monit?.cpu || 0;
          const memory = routermod.monit?.memory || 0;
          const status = routermod.pm2_env?.status || "unknown";
          const pmUptime = routermod.pm2_env?.pm_uptime || Date.now();
          const pid = routermod.pid || null;
          const uptime = Date.now() - pmUptime;

          return {
            cpu,
            memory,
            memoryPercent: null, // Will be calculated below with totalMem
            status,
            uptime,
            pid,
          };
        }
      } catch {}
    }

    // Fallback: ps for the Next server process
    const { stdout: psOut } = await execAsync(
      "ps -eo pid,pcpu,rss,etimes,args --sort=-pcpu | awk '/next-server|custom-server/ && !/awk/ {print $1,$2,$3,$4; exit}'",
      { timeout: 2000 }
    ).catch(() => ({ stdout: "" }));

    if (psOut.trim()) {
      const [pid, cpu, rssKb, uptimeSec] = psOut.trim().split(/\s+/);
      return {
        cpu: parseFloat(cpu) || 0,
        memory: (parseInt(rssKb) || 0) * 1024,
        memoryPercent: null,
        status: "online",
        uptime: (parseInt(uptimeSec) || 0) * 1000,
        pid: parseInt(pid) || null,
      };
    }
  } catch {}

  return { cpu: 0, memory: 0, memoryPercent: 0, status: "unknown", uptime: 0, pid: null };
}

export async function GET() {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const procMem = process.memoryUsage();

    const cpuPercent = getCpuUsage();
    const disk = getDiskStats();
    const routermod = await getRoutermodProcessStats();

    // Calculate routermod memory percentage
    if (routermod.memory && totalMem) {
      routermod.memoryPercent = (routermod.memory / totalMem) * 100;
    }

    // Get top processes (btop-style)
    let topProcesses = [];
    try {
      const { stdout: psTop } = await execAsync(
        "ps -eo pid,pcpu,pmem,rss,comm --sort=-pcpu | head -11 | tail -10",
        { timeout: 2000 }
      ).catch(() => ({ stdout: "" }));
      if (psTop.trim()) {
        topProcesses = psTop.trim().split("\n").map(line => {
          const [pid, cpu, mem, rss, ...cmdParts] = line.trim().split(/\s+/);
          return {
            pid: parseInt(pid) || 0,
            cpu: parseFloat(cpu) || 0,
            mem: parseFloat(mem) || 0,
            rss: (parseInt(rss) || 0) * 1024,
            cmd: cmdParts.join(" ").slice(0, 40),
          };
        }).filter(p => p.pid > 0);
      }
    } catch {}

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

    // Global host stats (for the grouped "Global Server" section)
    const globalStats = {
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || "Unknown CPU",
        usage: cpuPercent,
        loadAvg: os.loadavg(),
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: Math.round((usedMem / totalMem) * 100),
      },
      uptime: Math.floor(os.uptime()),
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
    };

    return NextResponse.json({
      // Legacy flat fields (kept for compatibility)
      uptime: globalStats.uptime,
      processUptime: Math.floor(process.uptime()),
      platform: `${os.type()} ${os.arch()} (${os.release()})`,
      nodeVersion: process.version,
      pid: process.pid,
      localIp,
      cpu: {
        cores: globalStats.cpu.cores,
        model: globalStats.cpu.model,
        percent: cpuPercent,
        loadAvg: globalStats.cpu.loadAvg,
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percent: globalStats.memory.usagePercent,
        processRss: procMem.rss,
        processHeapUsed: procMem.heapUsed,
        processHeapTotal: procMem.heapTotal,
      },
      disk,
      // New grouped fields for Live Server page
      timestamp: Date.now(),
      global: globalStats,
      routermod,
      topProcesses,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
