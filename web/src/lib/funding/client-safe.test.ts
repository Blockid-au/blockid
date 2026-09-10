// Regression guard for the 2026-09-10 S3 build failure: modules imported by
// "use client" funding components must never (transitively) reach
// ai-client.ts / supabase.ts ("server-only"). We walk the import graph
// statically from the client entry points.
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const CLIENT_ENTRIES = [
  "components/funding/funding-intake.tsx",
  "components/funding/funding-paywall.tsx",
  "components/funding/funding-report-tracker.tsx",
];
const FORBIDDEN = ["lib/ai-client.ts", "lib/supabase.ts", "lib/agents/grant-advisor-narrative.ts"];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = resolve(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (existsSync(p) && !p.endsWith("/")) {
      try { readFileSync(p); return p; } catch { /* dir */ }
    }
  }
  return null;
}

function runtimeImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(?!type\s)[^'"]*?from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

describe("funding client components never import server-only modules", () => {
  for (const entry of CLIENT_ENTRIES) {
    it(entry, () => {
      const seen = new Set<string>();
      const stack = [resolve(ROOT, entry)];
      const path: string[] = [];
      while (stack.length) {
        const f = stack.pop()!;
        if (seen.has(f)) continue;
        seen.add(f);
        for (const bad of FORBIDDEN) {
          expect(f.endsWith(bad), `${entry} reaches ${bad}`).toBe(false);
        }
        for (const spec of runtimeImports(f)) {
          const r = resolveImport(f, spec);
          if (r) { stack.push(r); path.push(`${f} -> ${r}`); }
        }
      }
      expect(seen.size).toBeGreaterThan(1);
    });
  }
});
