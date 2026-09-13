// Static guard: a server component (page.tsx / layout.tsx without "use
// client") must not CALL a function exported from a "use client" module.
//
// Next.js turns every export of a client module into a client reference;
// rendering `<Component/>` is fine, but calling `isFundingTab(x)` on the
// server throws "Attempted to call isFundingTab() from the server but
// isFundingTab is on the client" — /workspace/funding did exactly that for
// every Starter+ founder (live-qa S30-B P1, 2026-09-13; digest 1907948635)
// while the free branch, which never reached the call, passed every test.
//
// Heuristic: for each server page/layout, take its relative imports from
// files that start with "use client"; any imported identifier that is not
// PascalCase (i.e. not a component) and appears in a call position `name(`
// in the server file is an offender. Type-only imports are ignored.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP = resolve(__dirname, "..", "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/^(page|layout|template|default)\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

function isClientModule(file: string): boolean {
  const src = readFileSync(file, "utf8");
  return /^\s*["']use client["']/.test(src);
}

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

describe("server pages never call functions exported from 'use client' modules", () => {
  it("finds no call-site of a client-module non-component export", () => {
    const offenders: string[] = [];
    for (const file of walk(APP)) {
      const src = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(src)) continue;
      const importRe = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
      // Body without import statements, computed ONCE with a fresh regex —
      // calling src.replace(importRe) inside the exec loop resets the global
      // regex's lastIndex and never terminates (first version OOMed).
      const body = src.replace(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g, "");
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(src))) {
        const target = resolveImport(file, m[2]);
        if (!target || !isClientModule(target)) continue;
        const names = m[1]
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("type "))
          .map((s) => s.split(/\s+as\s+/).pop()!.trim())
          .filter((n) => n && !/^[A-Z]/.test(n));
        for (const n of names) {
          const callRe = new RegExp(`(?<![\\w.])${n}\\s*\\(`);
          if (callRe.test(body)) offenders.push(`${relative(APP, file)} calls ${n}() from client module ${relative(APP, target)}`);
        }
      }
    }
    expect(offenders, "move the function to a directive-free module (see funding-tabs.ts)").toEqual([]);
  });
});
