// Colocated guard for /developers (QA-3 commercial audit, 2026-09-12).
//
// The page used to sell API keys on a "Growth plan ($499/mo)" — wrong plan
// (Growth is A$69 with no api.access), wrong price, wrong currency symbol.
// API access is an entitlement of Program (A$349/mo inc. GST) and the
// Enterprise plans per src/config/pricing/plans.csv. This pins the truth and
// the endpoints the audit found undocumented (batch scoring, LP report
// export, outbound webhooks).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ApiDocs } from "./api-docs";

function html(): string {
  return renderToStaticMarkup(<ApiDocs />);
}

function plansWithApiAccess(): string[] {
  const csv = readFileSync(
    path.join(process.cwd(), "src/config/pricing/plans.csv"),
    "utf8",
  );
  return csv
    .split("\n")
    .filter((line) => line.includes('""api.access""'))
    .map((line) => line.split(",")[2]!);
}

describe("/developers — API pricing truth", () => {
  it("never mentions the retired Growth $499 pitch", () => {
    const out = html();
    expect(out).not.toMatch(/\$499/);
    expect(out).not.toMatch(/Growth plan \(/i);
    expect(out).not.toMatch(/Growth Plan<\/p>/);
  });

  it("sells API access on Program (A$349/mo inc. GST) and Enterprise, linking evaluator pricing", () => {
    const out = html();
    expect(out).toMatch(/API access is included with/);
    expect(out).toMatch(/Program \(A\$349\/mo inc\. GST\)/);
    expect(out).toMatch(/Enterprise/);
    expect((out.match(/href="\/pricing\?segment=evaluator"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(out).toContain("A$349/mo inc. GST");
  });

  it("matches plans.csv: api.access lives on Program and the Enterprise tiers only", () => {
    const names = plansWithApiAccess();
    expect(names).toContain("Program");
    expect(names.every((n) => n === "Program" || /Enterprise/.test(n))).toBe(true);
    expect(names).not.toContain("Growth");
  });

  it("documents batch scoring, the LP report export and outbound webhooks", () => {
    const out = html();
    expect(out).toContain("/api/evaluations/batch");
    expect(out).toContain("/api/evaluations/batch/{id}/export.csv");
    expect(out).toContain("/api/reports/quarterly?batch={id}");
    expect(out).toContain("/api/webhooks");
    expect(out).toContain("X-BlockID-Signature");
    expect(out).toContain("/docs#webhooks");
    expect(out).toMatch(/rubric_weights/);
  });
});
