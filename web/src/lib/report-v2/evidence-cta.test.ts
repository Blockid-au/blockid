// G19-S43 — CTA rows: every href is a live workspace route (the deploy's
// gate-8 link check fails on a dead internal link), the labels come from
// the catalogue, the lift from the one lift model.

import { existsSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { CRITERIA } from "@/lib/evaluation-criteria";
import { catalogueLift } from "@/lib/svi-lift";
import { bestMissingCta, CTA_HREFS, ctaForCode, ctaForCriterion, ctaForSource, ctaLiftLabel, EVIDENCE_SOURCE_LABELS, evidenceGapRows, evidencedSources, GATHER_MISSING_CTAS, hrefForCode, hrefForSource, withCta } from "./evidence-cta";
import type { EvidenceRow } from "./schema";

const WORKSPACE = join(process.cwd(), "src/app/(app)/(founder)/workspace");

describe("evidence-cta — hrefs", () => {
  it("every CTA href resolves to a real page under app/(app)/(founder)/workspace/**", () => {
    for (const [key, href] of Object.entries(CTA_HREFS)) {
      expect(href.startsWith("/workspace/"), key).toBe(true);
      const rel = href.replace(/^\/workspace\/?/, "");
      expect(existsSync(join(WORKSPACE, rel, "page.tsx")), `${key} → ${href}`).toBe(true);
    }
    // The S42 constant was corrected on master — the settings path never existed.
    expect(CTA_HREFS.connectors).toBe("/workspace/evidence/connectors");
  });

  it("hrefForSource / hrefForCode route connectors, founder, ABN, register and hub inputs to their pages", () => {
    expect(hrefForSource("stripe")).toBe(CTA_HREFS.connectors);
    expect(hrefForSource("linkedin")).toBe(CTA_HREFS.founder);
    expect(hrefForSource("external")).toBe(CTA_HREFS.project);
    expect(hrefForSource("upload")).toBe(CTA_HREFS.evidence);
    expect(hrefForCode("github_repo")).toBe(CTA_HREFS.connectors);
    expect(hrefForCode("cap_table_spreadsheet")).toBe(CTA_HREFS.equity);
    expect(hrefForCode("abn_registration")).toBe(CTA_HREFS.project);
    expect(hrefForCode("founder_bio")).toBe(CTA_HREFS.founder);
    expect(hrefForCode("moat_analysis")).toBe(CTA_HREFS.evidence);
  });
});

describe("evidence-cta — builders", () => {
  it("ctaForSource: connect verbs for connectors, catalogue label + lift for uploads, no lift when the catalogue has no item", () => {
    expect(ctaForSource("tre", "stripe")).toEqual({ label: "Connect Stripe", href: CTA_HREFS.connectors, lift: catalogueLift("mrr_dashboard") });
    expect(ctaForSource("cgh", "upload")).toEqual({ label: "Add cap table (current equity register)", href: CTA_HREFS.equity, lift: catalogueLift("cap_table_spreadsheet") });
    expect(ctaForSource("cgh", "stripe")).toEqual({ label: "Connect Stripe", href: CTA_HREFS.connectors });
    expect(ctaForSource("ptd", "github", { label: "Custom" })).toMatchObject({ label: "Custom", lift: catalogueLift("github_repo") });
  });

  it("ctaForCode / ctaForCriterion / GATHER_MISSING_CTAS carry catalogue lifts and live hrefs", () => {
    expect(ctaForCode("pitch_deck")).toEqual({ label: "Add pitch deck (pdf/powerpoint)", href: CTA_HREFS.evidence, lift: catalogueLift("pitch_deck") });
    expect(ctaForCode("nope")).toBeUndefined();
    const team = CRITERIA.find((c) => c.key === "team")!;
    expect(ctaForCriterion("team")).toEqual({ label: `Fill in ${team.title}`, href: CTA_HREFS.criteria, lift: expect.any(Number) });
    expect(GATHER_MISSING_CTAS.repo_audit).toMatchObject({ href: CTA_HREFS.connectors, lift: catalogueLift("github_repo") });
    expect(GATHER_MISSING_CTAS.cap_table).toMatchObject({ href: CTA_HREFS.equity, lift: catalogueLift("cap_table_spreadsheet") });
    expect(GATHER_MISSING_CTAS.abn).toMatchObject({ href: CTA_HREFS.project, lift: catalogueLift("abn_registration") });
    expect(GATHER_MISSING_CTAS.grants).toEqual({ label: "Complete your grant profile", href: CTA_HREFS.funding });
    for (const v of Object.values(GATHER_MISSING_CTAS)) expect(Object.values(CTA_HREFS)).toContain(v.href);
  });

  it("withCta only decorates missing rows; bestMissingCta ranks by lift; evidencedSources lists present sources; ctaLiftLabel formats +N SVI", () => {
    const base: EvidenceRow = { evidence_id: "a", source: "github", label: "GitHub", status: "evidenced", dims: ["ptd"] };
    expect(withCta(base, GATHER_MISSING_CTAS.repo_audit).cta).toBeUndefined();
    const m1 = withCta({ ...base, evidence_id: "m1", status: "missing" }, GATHER_MISSING_CTAS.repo_audit);
    const m2 = withCta({ ...base, evidence_id: "m2", source: "linkedin", status: "missing", dims: ["ftv"] }, GATHER_MISSING_CTAS.founder_signals);
    expect(bestMissingCta([m2, m1, base])?.evidence_id).toBe("m1");
    expect([...evidencedSources([base, m1, m2])]).toEqual(["github"]);
    expect(ctaLiftLabel(m1.cta)).toBe(`+${catalogueLift("github_repo")} SVI`);
    expect(ctaLiftLabel(GATHER_MISSING_CTAS.grants)).toBe("");
    expect(EVIDENCE_SOURCE_LABELS.stripe).toBe("Stripe (revenue)");
  });

  it("evidenceGapRows: P0 / P1 engine gaps become missing rows with a deterministic id, the catalogue page + lift when coded, else the Evidence Hub + the gap's own impact", () => {
    const rows = evidenceGapRows(
      [
        { priority: "P0", label: "Create cap table", action: "Build a cap table", impact: 8, evidenceType: "document_uploaded", code: "cap_table_spreadsheet" },
        { priority: "P0", label: "Upgrade evidence level", action: "Add a URL", impact: 8, evidenceType: "public_url" },
        { priority: "P2", label: "Add named advisors", action: "x", impact: 4, evidenceType: "self_declared", code: "advisor_bios" },
      ],
      "2026-09-20T00:00:00.000Z",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ status: "missing", label: "P0: Create cap table", source: "upload", dims: ["cgh"], value: "Build a cap table", cta: { label: "Create cap table", href: CTA_HREFS.equity, lift: catalogueLift("cap_table_spreadsheet") } });
    expect(rows[1]).toMatchObject({ dims: [], source: "url", cta: { href: CTA_HREFS.evidence, lift: 8 } });
    expect(rows[0].evidence_id).toMatch(/^gap-[0-9a-f]{8}$/);
    expect(evidenceGapRows([{ priority: "P0", label: "Create cap table", action: "", impact: 8, evidenceType: "document_uploaded" }], "x")[0].evidence_id).toBe(rows[0].evidence_id);
  });
});
