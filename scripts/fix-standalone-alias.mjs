// Post-build fixups for the Next.js standalone output.
//
// The standalone server is executed directly by Node (not through the Next
// bundler), so two things that Next normally rewrites at build time must be
// patched here:
//
//   1. The "@/*" path alias — Node has no idea what "@" means, so we expose it
//      as a scoped-package directory (`node_modules/@/<dir>` → `src/<dir>`) and
//      append the missing ".js" extension to every bare "@/..." import.
//   2. The "open-sse" bare specifier — expose the project's `open-sse/` folder
//      under `node_modules/open-sse` so `import "open-sse/..."` resolves.
//
// This mirrors the manual fixes that used to be re-applied by hand on every
// deployment, on both Windows and Linux (junctions on Windows, symlinks on
// Unix; both created via fs.symlinkSync with a graceful fallback to copy).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALIAS_DIRS = ["lib", "shared", "models", "sse", "mitm", "bot", "i18n", "store"];

// ESM marker: Node treats a ".js" file as CommonJS unless the nearest
// package.json says "type":"module". The traced source trees are ESM-only, so
// without this Node re-parses every file (MODULE_TYPELESS_PACKAGE_JSON warning)
// and — worse — a stray CJS require() throws "require is not defined".
const ESM_PACKAGE_JSON = JSON.stringify({ type: "module" }, null, 2) + "\n";

function markAsEsm(dir) {
  if (!fs.existsSync(dir)) return false;
  const pkg = path.join(dir, "package.json");
  try {
    if (fs.existsSync(pkg)) {
      const current = JSON.parse(fs.readFileSync(pkg, "utf8"));
      if (current.type === "module") return false;
      current.type = "module";
      fs.writeFileSync(pkg, JSON.stringify(current, null, 2) + "\n");
      return true;
    }
    fs.writeFileSync(pkg, ESM_PACKAGE_JSON);
    return true;
  } catch {
    return false;
  }
}

function linkDir(target, linkPath) {
  try {
    if (fs.existsSync(linkPath) || fs.lstatSync(linkPath, { throwIfNoEntry: false })) {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }
  } catch {}
  try {
    // "junction" is Windows-only; on Unix this falls back to a normal symlink.
    const type = process.platform === "win32" ? "junction" : "dir";
    fs.symlinkSync(target, linkPath, type);
    return "link";
  } catch {
    try {
      fs.cpSync(target, linkPath, { recursive: true });
      return "copy";
    } catch {
      return null;
    }
  }
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && full.endsWith(".js")) out.push(full);
  }
  return out;
}

function resolveAlias(standaloneDir, spec) {
  const rel = spec.slice(2); // strip "@/"
  const base = path.join(standaloneDir, "src", rel);
  for (const cand of [base, base + ".js", path.join(base, "index.js")]) {
    try {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
    } catch {}
  }
  return null;
}

const specRe =
  /(from\s+["'])(@\/[^"']+|\.[^"']*)(["'])|(import\(\s*["'])(@\/[^"']+|\.[^"']*)(["'])|(require\(\s*["'])(@\/[^"']+)(["'])/g;

export function fixStandaloneAlias({ projectRoot = process.cwd(), distDir = process.env.NEXT_DIST_DIR || ".next" } = {}) {
  if (process.env.NEXT_TRACING_ROOT_MODE === "workspace") return;

  const standaloneDir = path.resolve(projectRoot, distDir, "standalone");
  if (!fs.existsSync(standaloneDir)) {
    console.log(`[standalone-alias] No standalone build at ${standaloneDir}`);
    return;
  }

  const srcDir = path.join(standaloneDir, "src");
  const nmDir = path.join(standaloneDir, "node_modules");

  // 1a. Scoped "@" package dirs.
  if (fs.existsSync(srcDir)) {
    const atDir = path.join(nmDir, "@");
    fs.mkdirSync(atDir, { recursive: true });
    for (const name of ALIAS_DIRS) {
      const target = path.join(srcDir, name);
      if (!fs.existsSync(target)) continue;
      const res = linkDir(target, path.join(atDir, name));
      if (res) console.log(`[standalone-alias] @/${name} → src/${name} (${res})`);
    }
  }

  // 1b. "open-sse" bare specifier.
  // Prefer the standalone's own traced copy: it ships the post-build alias
  // rewrites and stays inside the standalone tree, so its "@/..." imports
  // resolve through standalone/node_modules/@. Pointing at the project folder
  // instead makes Node load the raw sources, whose "@/..." specifiers then
  // resolve against the project root (no node_modules/@ there) and fail with
  // "Cannot find package '@/lib'".
  const tracedOpenSse = path.join(standaloneDir, "open-sse");
  const openSseSrc = fs.existsSync(tracedOpenSse) ? tracedOpenSse : path.join(projectRoot, "open-sse");
  if (fs.existsSync(openSseSrc)) {
    markAsEsm(openSseSrc);
    const res = linkDir(openSseSrc, path.join(nmDir, "open-sse"));
    if (res) console.log(`[standalone-alias] open-sse → ${openSseSrc} (${res})`);
  }

  // 1c. The traced source tree is ESM-only — mark it so Node stops
  // re-parsing every module as CommonJS.
  // Only the ESM-safe subtrees: src/mitm, src/bot and the two CJS files in
  // src/lib are CommonJS and must keep the default (CJS) interpretation.
  for (const esmDir of ["sse", "shared", "models", "store", "i18n", "lib", "app"]) {
    const dir = path.join(srcDir, esmDir);
    if (fs.existsSync(dir)) markAsEsm(dir);
  }

  // 2. Rewrite bare/relative ESM imports missing a file extension.
  let changed = 0;
  for (const file of walk(standaloneDir)) {
    let src = fs.readFileSync(file, "utf8");
    const orig = src;

    src = src.replace(specRe, (m, p1, spec1, p3, p4, spec2, p6, p7, spec3, p9) => {
      const spec = spec1 || spec2 || spec3;
      void p1; void p3; void p4; void p6; void p7; void p9;
      if (!spec) return m;
      if (/\.(js|mjs|cjs|json|node)$/.test(spec)) return m;

      if (spec.startsWith("@/")) {
        const abs = resolveAlias(standaloneDir, spec);
        if (!abs) return m;
        const isIndex = abs.endsWith(path.sep + "index.js");
        return m.replace(spec, isIndex ? spec + "/index.js" : spec + ".js");
      }

      if (spec.startsWith(".")) {
        const abs = path.resolve(path.dirname(file), spec);
        for (const cand of [abs + ".js", path.join(abs, "index.js")]) {
          if (fs.existsSync(cand)) {
            const newSpec = cand.endsWith(path.sep + "index.js") ? spec + "/index.js" : spec + ".js";
            return m.replace(spec, newSpec);
          }
        }
        return m;
      }

      return m;
    });

    if (src !== orig) {
      fs.writeFileSync(file, src);
      changed++;
    }
  }
  console.log(`[standalone-alias] rewrote imports in ${changed} file(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fix-standalone-alias.mjs")) {
  fixStandaloneAlias();
}
