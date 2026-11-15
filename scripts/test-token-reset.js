#!/usr/bin/env node

/**
 * Test script untuk memverifikasi sistem token reset cycle
 * Usage: node scripts/test-token-reset.js
 */

import { tokenWindowMs } from "../src/shared/constants/keyQuota.js";

/**
 * Calculate the start and end of the current quota cycle.
 * Replicated from keyUsageRepo.js untuk testing
 */
function getQuotaCycle(window) {
  const now = Date.now();
  const windowMs = tokenWindowMs(window);
  
  let cycleStart, cycleEnd;
  
  if (window === "1m") {
    const nowDate = new Date(now);
    cycleStart = new Date(Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate(),
      nowDate.getUTCHours(),
      nowDate.getUTCMinutes(),
      0, 0
    ));
    cycleEnd = new Date(cycleStart.getTime() + windowMs);
  } else if (window === "24h") {
    const nowDate = new Date(now);
    cycleStart = new Date(Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate(),
      0, 0, 0, 0
    ));
    cycleEnd = new Date(cycleStart.getTime() + windowMs);
  } else if (window === "7d") {
    const nowDate = new Date(now);
    const dayOfWeek = nowDate.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    cycleStart = new Date(Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate() - daysToMonday,
      0, 0, 0, 0
    ));
    cycleEnd = new Date(cycleStart.getTime() + windowMs);
  } else if (window === "30d") {
    const nowDate = new Date(now);
    cycleStart = new Date(Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      1,
      0, 0, 0, 0
    ));
    cycleEnd = new Date(Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth() + 1,
      1,
      0, 0, 0, 0
    ));
  } else {
    cycleStart = new Date(Math.floor(now / windowMs) * windowMs);
    cycleEnd = new Date(cycleStart.getTime() + windowMs);
  }
  
  return {
    start: cycleStart.toISOString(),
    end: cycleEnd.toISOString(),
    resetAt: cycleEnd.toISOString()
  };
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

console.log("=".repeat(80));
console.log("Token Reset Cycle Test");
console.log("=".repeat(80));
console.log(`Current time: ${new Date().toISOString()}\n`);

const windows = ["1m", "1h", "24h", "7d", "30d"];

for (const window of windows) {
  const cycle = getQuotaCycle(window);
  const now = Date.now();
  const timeUntilReset = new Date(cycle.resetAt).getTime() - now;
  
  console.log(`Window: ${window}`);
  console.log(`  Cycle Start:  ${cycle.start}`);
  console.log(`  Cycle End:    ${cycle.end}`);
  console.log(`  Reset At:     ${cycle.resetAt}`);
  console.log(`  Time to Reset: ${formatDuration(timeUntilReset)}`);
  console.log();
}

console.log("=".repeat(80));
console.log("Test: Verifikasi bahwa cycle start/end konsisten");
console.log("=".repeat(80));

// Test 1: Cycle start harus di awal periode yang tepat
const cycle1m = getQuotaCycle("1m");
const start1m = new Date(cycle1m.start);
console.log(`✓ 1m cycle starts at second 0: ${start1m.getUTCSeconds() === 0}`);

const cycle1h = getQuotaCycle("1h");
const start1h = new Date(cycle1h.start);
console.log(`✓ 1h cycle starts at minute 0: ${start1h.getUTCMinutes() === 0 && start1h.getUTCSeconds() === 0}`);

const cycle24h = getQuotaCycle("24h");
const start24h = new Date(cycle24h.start);
console.log(`✓ 24h cycle starts at midnight: ${start24h.getUTCHours() === 0 && start24h.getUTCMinutes() === 0}`);

const cycle7d = getQuotaCycle("7d");
const start7d = new Date(cycle7d.start);
console.log(`✓ 7d cycle starts on Monday: ${start7d.getUTCDay() === 1}`);

const cycle30d = getQuotaCycle("30d");
const start30d = new Date(cycle30d.start);
console.log(`✓ 30d cycle starts on 1st: ${start30d.getUTCDate() === 1}`);

// Test 2: Reset time harus di masa depan
const now = Date.now();
console.log(`\n✓ All reset times in future: ${
  windows.every(w => new Date(getQuotaCycle(w).resetAt).getTime() > now)
}`);

// Test 3: Duration antara start dan end harus sesuai window
console.log("\n✓ Cycle durations correct:");
for (const window of windows) {
  const cycle = getQuotaCycle(window);
  const duration = new Date(cycle.end).getTime() - new Date(cycle.start).getTime();
  const expected = tokenWindowMs(window);
  const correct = Math.abs(duration - expected) < 1000; // Allow 1s tolerance for 30d
  console.log(`  ${window}: ${correct ? "✓" : "✗"} (${formatDuration(duration)})`);
}

console.log("\n" + "=".repeat(80));
console.log("Test Complete!");
console.log("=".repeat(80));
