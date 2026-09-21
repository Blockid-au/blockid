// LoadDemoCohortButton — RSC boundary (live-qa 33 on v3.24.0: /workspace/accelerator
// hit the error boundary, React #441 "Functions cannot be passed directly to
// Client Components", because the Server-Component journey passed `hrefFor`).
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COHORT_PATH, demoCohortHref } from "./DemoCohortActions";

describe("LoadDemoCohortButton — RSC boundary", () => {
  it("demoCohortHref fills the {batchId} slot encoded, or appends when the template has no slot", () => {
    expect(demoCohortHref("/workspace/accelerator?stage=assessment&batch={batchId}", "a b")).toBe("/workspace/accelerator?stage=assessment&batch=a%20b");
    expect(COHORT_PATH("x/y")).toBe("/workspace/evaluations/cohort/x%2Fy");
  });

  it("no component passes a function prop (hrefFor) to the button", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) && /<LoadDemoCohortButton[^>]*hrefFor=\{/.test(readFileSync(p, "utf8"))) offenders.push(p);
      }
    };
    ["src/components", "src/app"].forEach(walk);
    expect(offenders).toEqual([]);
  });
});
