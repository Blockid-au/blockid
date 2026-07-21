import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  FEATURE_GATES,
  GATED_DIRECTORIES,
  MUTATION_METHODS,
  requiredFeatureFor,
} from "./feature-gates.manifest";

const APP_ROOT = path.resolve(__dirname, "..", "app");

function walkRouteFiles(rootRelative: string): string[] {
  const abs = path.join(APP_ROOT, rootRelative);
  const out: string[] = [];
  let stack: string[];
  try {
    stack = [abs];
  } catch {
    return out;
  }
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile() && name === "route.ts") {
        out.push(path.relative(APP_ROOT, full));
      }
    }
  }
  return out;
}

function methodsInFile(absPath: string): Set<string> {
  const src = readFileSync(absPath, "utf8");
  const found = new Set<string>();
  for (const verb of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
    const direct = new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`);
    if (direct.test(src)) {
      found.add(verb);
      continue;
    }
    const reexport = new RegExp(`export\\s*\\{[^}]*\\b${verb}\\b[^}]*\\}`);
    if (reexport.test(src)) found.add(verb);
  }
  return found;
}

function collectMutationRoutes(): string[] {
  const seen = new Set<string>();
  for (const dir of GATED_DIRECTORIES) {
    for (const rel of walkRouteFiles(dir)) {
      const abs = path.join(APP_ROOT, rel);
      const methods = methodsInFile(abs);
      const isMutation = MUTATION_METHODS.some((m) => methods.has(m));
      if (isMutation) seen.add(rel.replace(/\\/g, "/"));
    }
  }
  return [...seen].sort();
}

describe("feature-gates.manifest", () => {
  it("every entry points at an existing route.ts", () => {
    const missing = FEATURE_GATES.filter((g) => {
      const abs = path.join(APP_ROOT, g.route);
      try {
        return !statSync(abs).isFile();
      } catch {
        return true;
      }
    }).map((g) => g.route);
    expect(missing).toEqual([]);
  });

  it("every mutation route in a gated directory appears in the manifest", () => {
    const mutationRoutes = collectMutationRoutes();
    const manifestSet = new Set(FEATURE_GATES.map((g) => g.route));
    const unlisted = mutationRoutes.filter((r) => !manifestSet.has(r));
    expect(unlisted).toEqual([]);
  });

  it("no manifest entry duplicates another route", () => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const g of FEATURE_GATES) {
      if (seen.has(g.route)) dups.push(g.route);
      seen.add(g.route);
    }
    expect(dups).toEqual([]);
  });

  it("requiredFeatureFor returns the mapped feature", () => {
    for (const g of FEATURE_GATES) {
      expect(requiredFeatureFor(g.route)).toBe(g.required_feature);
    }
  });

  it("requiredFeatureFor returns null for ungated routes", () => {
    expect(requiredFeatureFor("api/svi/route.ts")).toBeNull();
    expect(requiredFeatureFor("api/does/not/exist.ts")).toBeNull();
  });

  it("MUTATION_METHODS matches the four write verbs", () => {
    expect([...MUTATION_METHODS].sort()).toEqual([
      "DELETE",
      "PATCH",
      "POST",
      "PUT",
    ]);
  });
});
