// Minimal resolver for the "@/" alias used by src/ modules so production code
// can be imported directly from node:test without the Next.js bundler.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("open-sse/")) {
    const openRoot = fileURLToPath(new URL("../open-sse/", import.meta.url));
    const base = join(openRoot, specifier.slice("open-sse/".length));
    const candidates = [base, `${base}.js`, `${base}.mjs`, join(base, "index.js")];
    const found = candidates.find((p) => existsSync(p) && statSync(p).isFile());
    if (found) return nextResolve(pathToFileURL(found).href, context);
  }
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
  const base = join(srcRoot, specifier.slice(2));
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.json`,
    join(base, "index.js"),
  ];
  const found = candidates.find((p) => existsSync(p) && statSync(p).isFile());
  return nextResolve(found ? pathToFileURL(found).href : specifier, context);
}
