import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Hardcoded agent settings — no .env needed.
const AGENT_ENABLED = true;
const AGENT_ALLOW_TERMINAL = true;
const AGENT_ROOT_MODE = "projects";
const AGENT_PROJECTS_ROOT = "";
const AGENT_TERMINAL_TIMEOUT_MS = 120000;

export function isAgentEnabled() {
  return AGENT_ENABLED;
}

export function isTerminalEnabled() {
  return isAgentEnabled() && AGENT_ALLOW_TERMINAL;
}

export function getRootMode() {
  return AGENT_ROOT_MODE === "full" ? "full" : "projects";
}

export function getProjectsRoot() {
  if (AGENT_PROJECTS_ROOT) return path.resolve(AGENT_PROJECTS_ROOT);

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
  return AGENT_TERMINAL_TIMEOUT_MS;
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
