// Repo-wide regression guard for the two production build failures caused by
// client bundles reaching `server-only` modules (S3 2026-09-10 via a static
// import chain; S7-A 2026-09-11 via a *dynamic* `import()` — webpack bundles
// those too). Every "use client" file under src/ is walked through both static
// and dynamic import specifiers; reaching any file that imports "server-only"
// fails with the path that got there.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walkFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

const srcCache = new Map<string, string>();
function read(file: string): string {
  let s = srcCache.get(file);
  if (s == null) { s = readFileSync(file, "utf8"); srcCache.set(file, s); }
  return s;
}

function isClientEntry(file: string): boolean {
  const head = read(file).slice(0, 400);
  return /^\s*["']use client["']/m.test(head);
}
function isServerOnly(file: string): boolean {
  return /^\s*import\s+["']server-only["']/m.test(read(file));
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = resolve(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (existsSync(p)) {
      try { if (statSync(p).isFile()) return p; } catch { /* ignore */ }
    }
  }
  return null;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function imports(file: string): string[] {
  const src = stripComments(read(file));
  const out: string[] = [];
  const staticRe = /^\s*(?:import|export)\s+(?!type\s)[^'"]*?from\s+["']([^"']+)["']/gm;
  const bareRe = /^\s*import\s+["']([^"']+)["']/gm;
  // Runtime dynamic imports only — `foo?: import("x").Type` is a TS type
  // position and is erased, so it is deliberately not matched here.
  // Any `import("x")` that is not a `typeof import(...)` / `import("x").Type`
  // type position — covers `await`, `void`, `Promise.all([import(...)`,
  // `dynamic(() => import(...))`, `.then(() => import(...))`. Plus `require()`.
  const dynRe = /(?<!typeof\s{0,4})\bimport\(\s*["'`]([^"'`$]+)["'`]\s*\)(?!\s*\.[A-Za-z])/g;
  const reqRe = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = staticRe.exec(src))) out.push(m[1]);
  while ((m = bareRe.exec(src))) out.push(m[1]);
  while ((m = dynRe.exec(src))) out.push(m[1]);
  while ((m = reqRe.exec(src))) out.push(m[1]);
  return out;
}

const ALL = walkFiles(ROOT);
const CLIENT_ENTRIES = ALL.filter(isClientEntry);

describe("no \"use client\" file reaches a server-only module (static or dynamic import)", () => {
  it("finds client entries", () => {
    expect(CLIENT_ENTRIES.length).toBeGreaterThan(50);
  });

  it("walks every client entry", () => {
    const offenders: string[] = [];
    for (const entry of CLIENT_ENTRIES) {
      const seen = new Map<string, string | null>(); // file -> parent
      const stack: Array<[string, string | null]> = [[entry, null]];
      while (stack.length) {
        const [f, parent] = stack.pop()!;
        if (seen.has(f)) continue;
        seen.set(f, parent);
        if (f !== entry && isServerOnly(f)) {
          const chain: string[] = [];
          let cur: string | null = f;
          while (cur) { chain.unshift(relative(ROOT, cur)); cur = seen.get(cur) ?? null; }
          offenders.push(chain.join(" -> "));
          break;
        }
        for (const spec of imports(f)) {
          const r = resolveImport(f, spec);
          if (r) stack.push([r, f]);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
