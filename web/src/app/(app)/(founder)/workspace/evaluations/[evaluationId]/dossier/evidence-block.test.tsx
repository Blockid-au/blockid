// Render test for block 3 — evidence & data-room access (G13-W5-D3, E3.4).
// Pins per tier: attributed_only → counts + masked note + "Invite the
// founder" CTA listing what reports_shared unlocks; reports_shared → items
// grouped by dimension with the source-kind ladder label + freshness,
// public URLs linked, document links absent, "Request data-room access";
// full_mentor → document links + data-room index, no CTA; founder → no CTA,
// the "what your evaluator sees" line; the allow-list legend on every tier;
// the data-principle sentence once.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MentorAccessTier } from "@/lib/mentor/access-tiers";
import { projectEvidenceByTier } from "@/lib/evaluations/dossier";
import type { DossierView } from "@/lib/evaluations/dossier";
import { fakeView } from "@/lib/evaluations/ic-reports.fixture";
import { EvidenceBlock, freshnessLabel, groupByDimension } from "./evidence-block";

vi.mock("./request-access-button", () => ({ RequestAccessButton: (p: { nextTier: string; founderClaimed: boolean }) => <button data-testid="request-access-button" data-next={p.nextTier} data-claimed={String(p.founderClaimed)} /> }));

const ROWS = [
  { dimension: "tre", evidence_type: "customer_contracts", evidence_label: "Customer contracts", confidence_level: "document_uploaded", evidence_value_or_url: "drive://contracts.pdf", created_at: "2026-09-02T00:00:00Z" },
  { dimension: "tre", evidence_type: "stripe", evidence_label: "Stripe MRR", confidence_level: "connected_source", evidence_value_or_url: null, created_at: "2026-09-03T00:00:00Z" },
  { dimension: "mpc", evidence_type: "landing", evidence_label: "Landing page", confidence_level: "public_url", evidence_value_or_url: "https://acme.io", created_at: "2026-09-04T00:00:00Z" },
];

function view(tier: MentorAccessTier, role: "assessor" | "founder" = "assessor", founderClaimed = true): DossierView {
  const v = fakeView();
  v.viewer = { role, userId: role === "founder" ? "u-f" : "u-eval" };
  v.header.consentTier = tier;
  v.header.founderClaimed = founderClaimed;
  v.evidence = projectEvidenceByTier(tier, ROWS, ["stripe"]);
  return v;
}

describe("EvidenceBlock", () => {
  it("helpers: freshness buckets and grouping in DIM_ORDER", () => {
    const now = new Date("2026-09-16T00:00:00Z");
    expect(freshnessLabel(null, now)).toBe("undated");
    expect(freshnessLabel("2026-09-16T00:00:00Z", now)).toBe("today");
    expect(freshnessLabel("2026-09-02T00:00:00Z", now)).toBe("14 d ago");
    expect(freshnessLabel("2026-06-01T00:00:00Z", now)).toBe("3 mo ago");
    expect(freshnessLabel("2024-01-01T00:00:00Z", now)).toBe("2 y ago");
    const groups = groupByDimension(projectEvidenceByTier("reports_shared", ROWS, []).items!);
    expect(groups.map((g) => [g.dim, g.items.length])).toEqual([["tre", 2], ["mpc", 1]]);
  });

  it("attributed_only: counts only, masked note, invite CTA naming what reports_shared unlocks", () => {
    const out = renderToStaticMarkup(<EvidenceBlock view={view("attributed_only", "assessor", false)} />);
    expect(out).toContain('data-testid="evidence-counts"');
    expect(out).toContain('data-testid="evidence-masked-note"');
    expect(out).not.toContain('data-testid="evidence-items"');
    expect(out).toContain('data-testid="evidence-upgrade-cta"');
    expect(out).toContain("Invite the founder to share reports");
    expect(out).toContain("Reports shared unlocks: Full Trusted Business Report · Evidence items");
    expect(out).toMatch(/data-testid="request-access-button" data-next="reports_shared" data-claimed="false"/);
    expect(out).toContain('data-testid="evidence-legend"');
    expect(out).toMatch(/data-field="evidence_items" data-visible="0"/);
    expect(out).toMatch(/data-field="evidence_counts" data-visible="1"/);
    expect((out.match(/Founder-consented access tiers control who sees what/g) ?? []).length).toBe(1);
  });

  it("reports_shared: items by dimension with source kind + freshness, public URL linked, document link withheld, data-room CTA", () => {
    const out = renderToStaticMarkup(<EvidenceBlock view={view("reports_shared")} />);
    expect(out).toContain('data-testid="evidence-items"');
    expect((out.match(/data-testid="evidence-item"/g) ?? []).length).toBe(3);
    expect(out).toContain("Document uploaded");
    expect(out).toContain("Connected source");
    expect(out).toContain("Public URL");
    expect(out).toContain('href="https://acme.io"');
    expect(out).not.toContain("drive://contracts.pdf");
    expect(out).toContain("Connected sources: stripe");
    expect(out).toContain("Request data-room access");
    expect(out).toContain("Full mentor unlocks: Uploaded document links · Data-room index");
    expect(out).not.toContain('data-testid="evidence-dataroom"');
  });

  it("full_mentor: document links + the data-room index link, no CTA; founder preview: no CTA, the 'your evaluator sees' line", () => {
    const full = renderToStaticMarkup(<EvidenceBlock view={view("full_mentor")} />);
    expect(full).toContain('href="drive://contracts.pdf"');
    expect(full).toContain('data-testid="evidence-dataroom"');
    expect(full).not.toContain('data-testid="evidence-upgrade-cta"');
    const founder = renderToStaticMarkup(<EvidenceBlock view={view("reports_shared", "founder")} />);
    expect(founder).not.toContain('data-testid="evidence-upgrade-cta"');
    expect(founder).toContain("this is what your evaluator sees at the tier you granted");
    expect(founder).toContain('href="/workspace/investors/access"');
  });
});
