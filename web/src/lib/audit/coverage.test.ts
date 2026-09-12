import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import allowlist from "./allowlist.json";
import { AUDIT_ROUTE_CATALOGUE, catalogueActions } from "./manifest";

// S20-A — static coverage guard: every `src/app/api/**/route.ts` that
// exports a POST/PUT/PATCH/DELETE handler is either wrapped by apiRoute()
// (every mutating method, not just one) or allow-listed with a reason in
// allowlist.json. New mutating routes fail here until they pick one.

const APP_ROOT = path.resolve(__dirname, "..", "..", "app");
const API_ROOT = path.join(APP_ROOT, "api");
const METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

function walk(root: string, out: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    const abs = path.join(root, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (name === "route.ts") out.push(abs);
  }
  return out;
}

function exportedMutationMethods(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of METHODS) {
    if (new RegExp(`^export\\s+(async\\s+)?function\\s+${m}\\s*\\(`, "m").test(src)) out.add(m);
    if (new RegExp(`^export\\s+(const|let)\\s+${m}\\b`, "m").test(src)) out.add(m);
  }
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const piece of m[1].split(",")) {
      const p = piece.trim();
      const as = p.match(/^\w+\s+as\s+(\w+)$/);
      const name = as ? as[1] : p;
      if ((METHODS as readonly string[]).includes(name)) out.add(name);
    }
  }
  return out;
}

function wrappedMethods(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/^export\s+const\s+(POST|PUT|PATCH|DELETE)\s*=\s*apiRoute\s*\(/gm)) out.add(m[1]);
  return out;
}

function patternToRegex(pattern: string): RegExp {
  const esc = pattern
    .split("**")
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"))
    .join(".*");
  return new RegExp(`^${esc}$`);
}

const ALLOW = allowlist.entries as { pattern: string; reason: string }[];
const files = walk(API_ROOT).map((abs) => ({
  abs,
  rel: path.relative(APP_ROOT, abs).replace(/\\/g, "/"),
  src: readFileSync(abs, "utf8"),
}));
const mutating = files.filter((f) => exportedMutationMethods(f.src).size > 0);

describe("S20-A audit coverage guard", () => {
  it("scans a realistic route tree", () => {
    expect(files.length).toBeGreaterThan(400);
    expect(mutating.length).toBeGreaterThan(300);
  });

  it("every mutating route file is fully wrapped or allow-listed with a reason", () => {
    const problems: string[] = [];
    for (const f of mutating) {
      const allow = ALLOW.find((e) => patternToRegex(e.pattern).test(f.rel));
      if (allow) continue;
      const exported = exportedMutationMethods(f.src);
      const wrapped = wrappedMethods(f.src);
      const missing = [...exported].filter((m) => !wrapped.has(m));
      if (missing.length) problems.push(`${f.rel}: unaudited ${missing.join(",")}`);
      if (!f.src.includes('from "@/lib/audit/api-route"')) problems.push(`${f.rel}: missing apiRoute import`);
    }
    expect(problems).toEqual([]);
  });

  it("a wrapped file never re-exports a raw mutating handler under another verb", () => {
    // `export { POST_handler as GET }` would be fine (GET is not audited) but
    // `export { POST_handler as PUT }` would bypass the wrapper.
    const leaks: string[] = [];
    for (const f of mutating) {
      for (const m of f.src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const piece of m[1].split(",")) {
          const as = piece.trim().match(/^(\w+)_handler\s+as\s+(POST|PUT|PATCH|DELETE)$/);
          if (as) leaks.push(`${f.rel}: ${piece.trim()}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it("allow-list: every entry has a reason and matches at least one route file", () => {
    const bad: string[] = [];
    for (const e of ALLOW) {
      if (!e.reason || e.reason.trim().length < 20) bad.push(`${e.pattern}: reason too short`);
      const re = patternToRegex(e.pattern);
      if (!files.some((f) => re.test(f.rel))) bad.push(`${e.pattern}: matches no route file (stale)`);
    }
    expect(bad).toEqual([]);
  });

  it("allow-listed routes are not ALSO wrapped (one mechanism per route)", () => {
    const both = mutating
      .filter((f) => ALLOW.some((e) => patternToRegex(e.pattern).test(f.rel)))
      .filter((f) => wrappedMethods(f.src).size > 0)
      .map((f) => f.rel);
    expect(both).toEqual([]);
  });

  it("the generated catalogue matches the wrapped route tree (run the codemod with --write --catalogue)", () => {
    const expected = mutating
      .filter((f) => !ALLOW.some((e) => patternToRegex(e.pattern).test(f.rel)))
      .map((f) => ({
        route: f.rel,
        methods: [...wrappedMethods(f.src)].sort((a, b) => METHODS.indexOf(a as never) - METHODS.indexOf(b as never)),
      }))
      .sort((a, b) => a.route.localeCompare(b.route));
    const actual = AUDIT_ROUTE_CATALOGUE.map((r) => ({ route: r.route, methods: [...r.methods] }));
    expect(actual).toEqual(expected);
  });

  it("catalogue actions are dot-namespaced, unique and include the manifest overrides", () => {
    const actions = catalogueActions();
    expect(actions.length).toBeGreaterThan(300);
    expect(new Set(actions).size).toBe(actions.length);
    for (const a of actions) expect(a).toMatch(/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/);
    expect(actions).toContain("project.member.invited");
    expect(actions).toContain("api_key.revoked");
    expect(actions.some((a) => a.startsWith("svi.") && a.endsWith(".create"))).toBe(true);
    expect(actions.some((a) => a.startsWith("evidence."))).toBe(true);
  });

  it("GET handlers are never wrapped", () => {
    const wrongs = files.filter((f) => /^export\s+const\s+(GET|HEAD|OPTIONS)\s*=\s*apiRoute\(/m.test(f.src)).map((f) => f.rel);
    expect(wrongs).toEqual([]);
  });

  it("wrapped route meta points at its own file", () => {
    const mismatched: string[] = [];
    for (const f of mutating) {
      for (const m of f.src.matchAll(/apiRoute\(\{\s*route:\s*"([^"]+)"/g)) {
        if (m[1] !== f.rel) mismatched.push(`${f.rel} → ${m[1]}`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});
