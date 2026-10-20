import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function envFlag(name) {
  const v = process.env[name];
  if (v == null || v === "") return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export function isAgentEnabled() {
  return envFlag("AGENT_ENABLED");
}

export function isTerminalEnabled() {
  return isAgentEnabled() && envFlag("AGENT_ALLOW_TERMINAL");
}

export function getRootMode() {
  const m = String(process.env.AGENT_ROOT_MODE || "projects").trim().toLowerCase();
  return m === "full" ? "full" : "projects";
}

export function getProjectsRoot() {
  const configured = process.env.AGENT_PROJECTS_ROOT;
  if (configured && configured.trim()) {
    return path.resolve(configured.trim());
  }

  const home = os.homedir();

  if (process.platform === "win32") {
    const desktop = path.join(home, "Desktop");
    try {
      if (fs.existsSync(desktop)) return desktop;
    } catch (_e) {
      /* eslint-disable-next-line no-empty */
    }
    return home;
  }

  const candidates = [path.join(home, "projects"), path.join(home, "apps"), home];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (_e) {
      /* eslint-disable-next-line no-empty */
    }
  }
  return "/root";
}

export function getTerminalTimeoutMs() {
  const n = Number(process.env.AGENT_TERMINAL_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 120000;
}

export function listProjects() {
  const root = getProjectsRoot();
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (_e) {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".")) continue;
    out.push({ name: e.name, path: path.join(root, e.name) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveInsideRoot(targetPath, { projectPath, mode = getRootMode() } = {}) {
  const root = getProjectsRoot();
  const base = mode === "full" ? path.parse(process.cwd()).root : projectPath || root;
  if (!base) throw new Error("No agent root configured");

  // The project folder itself must live inside the projects root — otherwise a
  // caller could point "project" at any path on the disk and read/write it.
  if (mode !== "full" && !isInside(root, base)) {
    throw new Error("Project is outside the allowed root");
  }

  const raw = String(targetPath || ".");
  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(base, raw);

  let realBase = base;
  let realAbs = abs;
  try {
    realBase = fs.realpathSync.native(base);
  } catch (_e) {
    realBase = path.resolve(base);
  }
  try {
    realAbs = fs.realpathSync.native(abs);
  } catch (_e) {
    realAbs = abs;
  }

  const rel = path.relative(realBase, realAbs);
  const escapes = rel.startsWith("..") || path.isAbsolute(rel);
  if (escapes && mode !== "full") {
    throw new Error("Path is outside the allowed project root");
  }
  return abs;
}

export function isInside(root, abs) {
  try {
    const realRoot = fs.realpathSync.native(root);
    const realAbs = fs.realpathSync.native(abs);
    const rel = path.relative(realRoot, realAbs);
    return !(rel.startsWith("..") || path.isAbsolute(rel));
  } catch (_e) {
    const rel = path.relative(root, abs);
    return !(rel.startsWith("..") || path.isAbsolute(rel));
  }
}

export function getAgentStatus() {
  return {
    enabled: isAgentEnabled(),
    terminalEnabled: isTerminalEnabled(),
    rootMode: getRootMode(),
    projectsRoot: getProjectsRoot(),
    terminalTimeoutMs: getTerminalTimeoutMs(),
  };
}
