import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createProxyPool, getProxyPools } from "@/models";
import { testProxyUrl, probeUpstreamThroughProxy } from "@/lib/network/proxyTest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proxies are checked in parallel, the same way the health check does it.
const CONCURRENCY = 10;
const JOB_TTL_MS = 10 * 60 * 1000;

// The import runs in the background so the dashboard can show a real
// percentage instead of a spinner that looks stuck.
if (!global._proxyImportJobs) global._proxyImportJobs = new Map();
const jobs = global._proxyImportJobs;

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.startedAt > JOB_TTL_MS) jobs.delete(id);
  }
}

function normalizeEntries(body = {}) {
  const list = Array.isArray(body?.entries) ? body.entries : [];
  const entries = [];
  const invalid = [];

  list.forEach((item, index) => {
    const proxyUrl = typeof item?.proxyUrl === "string" ? item.proxyUrl.trim() : "";
    if (!proxyUrl) {
      invalid.push({ index, reason: "proxyUrl kosong" });
      return;
    }
    entries.push({
      name: (typeof item?.name === "string" && item.name.trim()) || proxyUrl,
      proxyUrl,
      noProxy: typeof item?.noProxy === "string" ? item.noProxy.trim() : "",
      strictProxy: item?.strictProxy === true,
    });
  });

  return { entries, invalid };
}

// "http://host:999" and "http://host:999/" are the same proxy - compare them
// with one key so a duplicate is not created by accident.
function dedupeKey(proxyUrl, noProxy) {
  let url = String(proxyUrl || "").trim();
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.toLowerCase();
    url = parsed.toString().replace(/\/+$/, "");
  } catch {
    url = url.replace(/\/+$/, "");
  }
  return `${url}|||${String(noProxy || "").trim()}`;
}

async function runImport(job, entries) {
  try {
    // Skip proxies that are already in the pool.
    const existing = await getProxyPools();
    const known = new Set(existing.map((p) => dedupeKey(p.proxyUrl, p.noProxy)));
    const seen = new Set();
    const toTest = [];

    for (const entry of entries) {
      const key = dedupeKey(entry.proxyUrl, entry.noProxy);
      if (known.has(key) || seen.has(key)) {
        job.skipped += 1;
        job.skippedList.push({
          proxyUrl: entry.proxyUrl,
          name: entry.name,
          reason: "sudah ada di pool",
        });
        job.done += 1;
        continue;
      }
      seen.add(key);
      toTest.push(entry);
    }

    job.total = entries.length;
    job.testable = toTest.length;

    const queue = [...toTest];
    const worker = async () => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) return;
        let result;
        try {
          // A shorter timeout than the manual health check: an import can
          // hold a lot of proxies, and dead ones should fail fast.
          result = await testProxyUrl({ proxyUrl: entry.proxyUrl, timeoutMs: 7000 });
        } catch (error) {
          result = { ok: false, status: 500, error: error?.message || String(error) };
        }

        job.done += 1;
        if (!result?.ok) {
          job.failed += 1;
          job.failures.push({
            proxyUrl: entry.proxyUrl,
            name: entry.name,
            error: result?.error || `Proxy test gagal (HTTP ${result?.status ?? "?"})`,
          });
          continue;
        }

        // Second gate: the exit IP must be accepted by the upstream too.
        // Cloudflare blocks the datacenter ranges free proxies leave from —
        // storing those only fills the pool with proxies that look healthy
        // and then fail every request with a 403.
        const upstream = await probeUpstreamThroughProxy({
          proxyUrl: entry.proxyUrl,
          timeoutMs: 7000,
          attempts: 2,
        });
        if (!upstream?.ok) {
          job.failed += 1;
          job.failures.push({
            proxyUrl: entry.proxyUrl,
            name: entry.name,
            error: upstream?.error || `Uji upstream gagal (HTTP ${upstream?.status ?? "?"})`,
          });
          continue;
        }

        try {
          const pool = await createProxyPool({
            name: entry.name,
            proxyUrl: entry.proxyUrl,
            noProxy: entry.noProxy,
            type: "http",
            isActive: true,
            strictProxy: entry.strictProxy,
            testStatus: "active",
            lastTestedAt: new Date().toISOString(),
            lastError: null,
            exitIp: result.exitIp || null,
            exitCountry: result.exitCountry || null,
          });
          job.ok += 1;
          job.created.push({
            id: pool.id,
            name: pool.name,
            proxyUrl: pool.proxyUrl,
            exitIp: result.exitIp || null,
            exitCountry: result.exitCountry || null,
          });
        } catch (error) {
          job.failed += 1;
          job.failures.push({
            proxyUrl: entry.proxyUrl,
            name: entry.name,
            error: `Gagal menyimpan: ${error?.message || String(error)}`,
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, Math.max(queue.length, 1)) }, () => worker())
    );
    job.status = "done";
  } catch (error) {
    job.status = "error";
    job.error = error?.message || String(error);
  } finally {
    job.finishedAt = Date.now();
  }
}

/**
 * Add proxies with an automatic test.
 *
 * Every proxy is checked first; only the ones that answer are written to the
 * database. That way the pool never fills up with dead entries and nobody has
 * to press "Cek Semua" afterwards.
 *
 * POST starts the job and returns its id, GET (with ?jobId=) reports the
 * progress so the UI can show a real percentage.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { entries, invalid } = normalizeEntries(body);

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada proxy yang bisa diimpor", invalid },
        { status: 400 }
      );
    }

    pruneJobs();

    const job = {
      id: crypto.randomUUID(),
      total: entries.length,
      testable: entries.length,
      done: 0,
      ok: 0,
      failed: 0,
      skipped: 0,
      status: "running",
      created: [],
      failures: [],
      skippedList: [],
      invalid,
      startedAt: Date.now(),
      finishedAt: null,
    };
    jobs.set(job.id, job);

    // Fire and forget - the client polls GET for the progress.
    runImport(job, entries);

    return NextResponse.json({ jobId: job.id, total: job.total });
  } catch (error) {
    console.log("Error importing proxy pools:", error);
    return NextResponse.json({ error: "Gagal mengimpor proxy pool" }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId wajib diisi" }, { status: 400 });
  }
  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job tidak ditemukan atau sudah kedaluwarsa" }, { status: 404 });
  }
  const percent = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  return NextResponse.json({
    jobId: job.id,
    total: job.total,
    testable: job.testable,
    done: job.done,
    ok: job.ok,
    failed: job.failed,
    skipped: job.skipped,
    percent: job.status === "done" ? 100 : Math.min(percent, 99),
    status: job.status,
    error: job.error || null,
    created: job.created,
    failures: job.failures,
    skippedList: job.skippedList,
    elapsedMs: (job.finishedAt || Date.now()) - job.startedAt,
  });
}
