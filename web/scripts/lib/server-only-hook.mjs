// Module-customization hooks that let a plain node script load `src/lib/**`
// (G19-S46 self-report). Registered SYNCHRONOUSLY (`module.registerHooks`,
// Node ≥ 22.15) so they apply to `require()` and `import()` alike; the lib
// graph itself is loaded through tsx's CommonJS hook (require tolerates the
// graph's import cycles, require(esm) does not).
//
//   resolve  `server-only` / `client-only` (Next.js build-time sentinels, not
//            installed packages) → scripts/lib/empty-module.cjs;
//            `@/lib/x` and extension-less relative specifiers coming from a
//            dynamic `import()` inside src/ → the .ts/.tsx file (tsconfig
//            paths, which Node's own ESM resolver does not know).
//   load     a src/ .ts/.tsx file reached through `import()` is bridged to
//            the CJS instance: the file is `require()`d (tsx compiles it) and
//            re-exported as an ES module with every named export — Node's
//            cjs-module-lexer cannot see names in tsx-transpiled output, so
//            `const { buildVcValuationReport } = await import("@/lib/agents/
//            cfo-valuation")` would otherwise resolve to `undefined`. One
//            instance per module (shared singletons, caches, semaphores).

import { createRequire } from "node:module";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolvePath(HERE, "..", "..");
const SRC_DIR = join(WEB_DIR, "src");
export const EMPTY_MODULE_PATH = join(HERE, "empty-module.cjs");
const EMPTY_MODULE_URL = pathToFileURL(EMPTY_MODULE_PATH).href;
const SENTINELS = new Set(["server-only", "client-only"]);
const TS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const BRIDGE_KEY = "__blockidSelfReportRequire";

const require = createRequire(import.meta.url);
globalThis[BRIDGE_KEY] = require;

function isFile(p) {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

/** `<base>` → `<base>.ts` | `<base>.tsx` | `<base>/index.ts(x)` | itself when it is a file. */
export function resolveTsPath(base) {
  if (isFile(base)) return base;
  for (const ext of TS_EXTENSIONS) if (isFile(base + ext)) return base + ext;
  for (const ext of TS_EXTENSIONS) if (isFile(join(base, "index" + ext))) return join(base, "index" + ext);
  return null;
}

function isSrcTsUrl(url) {
  if (!url.startsWith("file:")) return false;
  const p = fileURLToPath(url);
  return p.startsWith(SRC_DIR + "/") && TS_EXTENSIONS.some((ext) => p.endsWith(ext));
}

export const hooks = {
  resolve(specifier, context, nextResolve) {
    if (SENTINELS.has(specifier)) return { url: EMPTY_MODULE_URL, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const hit = resolveTsPath(join(SRC_DIR, specifier.slice(2)));
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL && isSrcTsUrl(context.parentURL)) {
      const hit = resolveTsPath(resolvePath(dirname(fileURLToPath(context.parentURL)), specifier));
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!isSrcTsUrl(url)) return nextLoad(url, context);
    const path = fileURLToPath(url);
    // The bridge is the createRequire above; tests swap it for a stub.
    const mod = (globalThis[BRIDGE_KEY] ?? require)(path);
    const names = Object.keys(mod).filter((k) => k !== "default" && /^[A-Za-z_$][\w$]*$/.test(k));
    const source = [
      `const m = globalThis[${JSON.stringify(BRIDGE_KEY)}](${JSON.stringify(path)});`,
      `export default m.default ?? m;`,
      ...names.map((n) => `export const ${n} = m[${JSON.stringify(n)}];`),
    ].join("\n");
    return { format: "module", source, shortCircuit: true };
  },
};

export const resolve = hooks.resolve;
export const load = hooks.load;
