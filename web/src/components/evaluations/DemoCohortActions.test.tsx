// LoadDemoCohortButton — RSC boundary (live-qa 33 on v3.24.0: /workspace/accelerator
// hit the error boundary, React #441 "Functions cannot be passed directly to
// Client Components", because the Server-Component journey passed `hrefFor`).
import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { COHORT_PATH, demoCohortHref, LoadDemoCohortButton, RemoveDemoCohortButton } from "./DemoCohortActions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

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

// G24 UI lane: the demo banner's first action is quiet (neutral secondary);
// only the confirm step carries the danger tone. Both buttons keep the 44 px
// hit area and a focus ring.
describe("DemoCohortActions (G24-C)", () => {
  it("Remove demo cohort opens as a neutral secondary button, not a red one", () => {
    const html = renderToStaticMarkup(<RemoveDemoCohortButton />);
    const btn = html.match(/<button[^>]*data-testid="remove-demo-cohort"[^>]*>/)?.[0] ?? "";
    expect(btn).toContain("min-h-11");
    expect(btn).toContain("focus-visible:ring-2");
    expect(btn).toContain("text-primary");
    expect(btn).not.toContain("text-bear");
  });

  it("Load a demo cohort is a 44 px secondary button with a focus ring", () => {
    const html = renderToStaticMarkup(<LoadDemoCohortButton />);
    const btn = html.match(/<button[^>]*data-testid="load-demo-cohort"[^>]*>/)?.[0] ?? "";
    expect(btn).toContain("min-h-11");
    expect(btn).toContain("focus-visible:ring-2");
