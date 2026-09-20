// G20-F2 page sweep (live run 2026-09-20 03:39 UTC): /workspace/advisor/notes,
// /workspace/advisor/roster, /workspace/accelerator/cohort and
// /workspace/accelerator/quarterly-report rendered with NO <h1> for the
// evaluator / accelerator seats — the whole page body (heading included) sat
// inside the client-side <FeatureGate>, which renders nothing until
// /api/entitlement/me answers and the gate card when the plan lacks the flag.
// The heading now sits outside the gate on those pages; this pins that the
// first <h1> of every workspace page precedes its first <FeatureGate>.
//
// /workspace/esop/offers followed on 2026-09-20 (G20-sweep: the founder sweep
// reported h1_count_0 on it) — no exceptions remain.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const EXCEPTIONS = new Set<string>();

function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (name === "page.tsx") out.push(full);
  }
  return out;
}

describe("workspace pages keep their h1 outside <FeatureGate>", () => {
  const root = join(process.cwd(), "src", "app", "(app)", "(founder)", "workspace");
  const gated = pages(root).filter((f) => /<FeatureGate\b/.test(readFileSync(f, "utf8")));
  it("finds the gated pages", () => {
    expect(gated.length).toBeGreaterThanOrEqual(7);
  });
  for (const file of gated) {
    const rel = file.slice(root.length + 1);
    if (EXCEPTIONS.has(rel)) continue;
    it(`${rel}: first <h1> precedes the first <FeatureGate>`, () => {
      const src = readFileSync(file, "utf8");
      const h1 = src.indexOf("<h1");
      const gate = src.indexOf("<FeatureGate");
      expect(h1, "page has an h1").toBeGreaterThan(-1);
      expect(h1, "h1 must render while the gate resolves / when the gate card shows").toBeLessThan(gate);
    });
  }
});
