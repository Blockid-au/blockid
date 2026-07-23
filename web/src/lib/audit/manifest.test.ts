import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  AUDIT_MANIFEST,
  AUDIT_MUTATION_METHODS,
  AUDIT_REQUIRED_ROUTES,
  auditEntriesFor,
  auditEntryFor,
} from "./manifest";

const APP_ROOT = path.resolve(__dirname, "..", "..", "app");

describe("audit-log manifest", () => {
  it("every entry points at an existing route.ts", () => {
    const missing = AUDIT_MANIFEST.filter((e) => {
      const abs = path.join(APP_ROOT, e.route);
      try {
        return !statSync(abs).isFile();
      } catch {
        return true;
      }
    }).map((e) => `${e.method} ${e.route}`);
    expect(missing).toEqual([]);
  });

  it("every entry's route file exports the declared HTTP method", () => {
    const unexported: string[] = [];
    for (const entry of AUDIT_MANIFEST) {
      const abs = path.join(APP_ROOT, entry.route);
      const src = readFileSync(abs, "utf8");
      const re = new RegExp(
        `export\\s+(async\\s+)?function\\s+${entry.method}\\b`,
      );
      if (!re.test(src)) unexported.push(`${entry.method} ${entry.route}`);
    }
    expect(unexported).toEqual([]);
  });

  it("no manifest entry duplicates another (route,method) pair", () => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const e of AUDIT_MANIFEST) {
      const key = `${e.method} ${e.route}`;
      if (seen.has(key)) dups.push(key);
      seen.add(key);
    }
    expect(dups).toEqual([]);
  });

  it("action strings are dot-namespaced (`<domain>.<verb>`)", () => {
    const bad = AUDIT_MANIFEST.filter((e) => !/^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(e.action));
    expect(bad.map((e) => e.action)).toEqual([]);
  });

  it("AUDIT_REQUIRED_ROUTES is the unique sorted set of manifest routes", () => {
    const derived = [...new Set(AUDIT_MANIFEST.map((e) => e.route))].sort();
    expect([...AUDIT_REQUIRED_ROUTES]).toEqual(derived);
  });

  it("AUDIT_MUTATION_METHODS matches the four write verbs", () => {
    expect([...AUDIT_MUTATION_METHODS].sort()).toEqual([
      "DELETE",
      "PATCH",
      "POST",
      "PUT",
    ]);
  });

  it("auditEntriesFor returns all rows for a given route", () => {
    const rows = auditEntriesFor("api/projects/[id]/route.ts");
    const methods = rows.map((r) => r.method).sort();
    expect(methods).toEqual(["DELETE", "PATCH"]);
  });

  it("auditEntryFor returns the mapped entry", () => {
    const e = auditEntryFor("api/projects/route.ts", "POST");
    expect(e?.action).toBe("project.create");
    expect(e?.subject_type).toBe("project");
  });

  it("auditEntryFor returns null for an unlisted pair", () => {
    expect(auditEntryFor("api/svi/route.ts", "POST")).toBeNull();
    expect(auditEntryFor("api/projects/route.ts", "DELETE")).toBeNull();
  });
});
