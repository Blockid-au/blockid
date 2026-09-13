// Colocated render test for the valuation certificate panel (S22-A).
//
// Pins the show-cost-first button copy (5 credits vs included), the
// role-aware controls (editor issues + files to the data room, owner/admin
// also revokes, viewer sees links only), the list rows with verify + PDF
// links, and the revoked state.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ValuationCertificatePanel, canIssue, canRevoke, essPreviewLine, type CertificateListItem, type CertificatePanelState } from "./valuation-certificate-panel";

const CERT: CertificateListItem = {
  id: "c-1",
  certificateNo: "VC-7K3MP-Q9X2A",
  contentHash: "blockid:v1:" + "a".repeat(64),
  startupName: "Acme",
  sviScore: 138,
  valuation: { lowAud: 1_250_000, midAud: 2_400_000, highAud: 3_900_000, method: "svi+arr_multiple", methodNote: null },
  method: "svi+arr_multiple",
  creditsCharged: 5,
  issuedAt: "2026-09-12T03:00:00Z",
  revokedAt: null,
  revokedReason: null,
  verifyUrl: "https://blockid.au/verify/valuation/VC-7K3MP-Q9X2A",
  pdfUrl: "/api/valuation/certificate/c-1/pdf",
};

function state(over: Partial<CertificatePanelState> = {}): CertificatePanelState {
  return { certificates: [CERT], role: "owner", cost: 5, included: false, ...over };
}

describe("ValuationCertificatePanel", () => {
  it("owner, Starter: button shows the 5-credit cost; row has PDF, verify, data room and revoke", () => {
    const html = renderToStaticMarkup(<ValuationCertificatePanel initial={state()} />);
    expect(html).toContain("Issue valuation certificate (5 credits)");
    expect(html).toContain('data-testid="certificate-row"');
    expect(html).toContain('data-certificate="VC-7K3MP-Q9X2A"');
    expect(html).toContain('href="/api/valuation/certificate/c-1/pdf"');
    expect(html).toContain('href="https://blockid.au/verify/valuation/VC-7K3MP-Q9X2A"');
    expect(html).toContain("A$1.25M – A$3.90M");
    expect(html).toContain("SVI 138");
    expect(html).toContain("5 credits");
    expect(html).toContain('data-testid="certificate-dataroom"');
    expect(html).toContain('data-testid="certificate-revoke"');
    expect(html).toContain('data-testid="certificate-investor"');
    expect(html).toContain("Active");
    expect(html).toContain("not an independent valuation report");
    expect(html).toContain("Auschain PTY LTD");
  });

  it("Growth / Package: the button says included", () => {
    const html = renderToStaticMarkup(<ValuationCertificatePanel initial={state({ included: true })} />);
    expect(html).toContain("Issue valuation certificate (included in your plan)");
  });

  it("editor: can issue and file to the data room but not revoke", () => {
    const html = renderToStaticMarkup(<ValuationCertificatePanel initial={state({ role: "editor" })} />);
    expect(html).toContain('data-testid="issue-certificate"');
    expect(html).toContain('data-testid="certificate-dataroom"');
    expect(html).not.toContain('data-testid="certificate-revoke"');
    expect(canIssue("editor")).toBe(true);
    expect(canRevoke("editor")).toBe(false);
    expect(canRevoke("admin")).toBe(true);
  });

  it("viewer: read-only note, links only", () => {
    const html = renderToStaticMarkup(<ValuationCertificatePanel initial={state({ role: "viewer" })} />);
    expect(html).toContain('data-testid="certificate-readonly"');
    expect(html).not.toContain('data-testid="issue-certificate"');
    expect(html).not.toContain('data-testid="certificate-dataroom"');
    expect(html).not.toContain('data-testid="certificate-revoke"');
    expect(html).toContain('data-testid="certificate-pdf"');
    expect(html).toContain('data-testid="certificate-verify"');
    expect(canIssue("viewer")).toBe(false);
  });

  it("revoked row: badge + reason, no data-room / revoke controls", () => {
    const html = renderToStaticMarkup(
      <ValuationCertificatePanel initial={state({ certificates: [{ ...CERT, revokedAt: "2026-10-01T00:00:00Z", revokedReason: "re-scored" }] })} />,
    );
    expect(html).toContain('data-revoked="1"');
    expect(html).toContain("Revoked");
    expect(html).toContain("revoked: re-scored");
    expect(html).not.toContain('data-testid="certificate-dataroom"');
    expect(html).not.toContain('data-testid="certificate-revoke"');
  });

  it("empty list shows the empty line and no investor field", () => {
    const html = renderToStaticMarkup(<ValuationCertificatePanel initial={state({ certificates: [] })} />);
    expect(html).toContain('data-testid="certificate-empty"');
    expect(html).not.toContain('data-testid="certificate-investor"');
  });

  it("S27-A: issuers get the ESS annex checkbox (0 extra credits, not a safe harbour); viewers do not; a row issued with it says so", () => {
    const owner = renderToStaticMarkup(<ValuationCertificatePanel initial={state({ certificates: [{ ...CERT, annexes: { ess: true } }] })} />);
    expect(owner).toContain('data-testid="certificate-ess-annex"');
    expect(owner).toContain("Div 83A start-up concession checklist");
    expect(owner).toContain("0 extra credits; not a safe-harbour valuation");
    expect(owner).toContain("· ESS annex");
    const viewer = renderToStaticMarkup(<ValuationCertificatePanel initial={state({ role: "viewer" })} />);
    expect(viewer).not.toContain('data-testid="certificate-ess-annex"');
    expect(viewer).not.toContain("· ESS annex");
  });

  it("S27-A: essPreviewLine says what the annex adds before the click, or nothing when it is not included", () => {
    expect(essPreviewLine(undefined)).toBeNull();
    expect(essPreviewLine({ ess: { included: false, extraCost: 0 } })).toBeNull();
    expect(essPreviewLine({ ess: { included: true, extraCost: 0, checklist: { met: 3, notMet: 0, notConfirmed: 4, total: 7 }, perShare: true } })).toBe(
      "ESS annex included (0 extra credits) — 3 of 7 Div 83A conditions confirmed from your project profile, 4 not confirmed.",
    );
    expect(essPreviewLine({ ess: { included: true, extraCost: 0, checklist: { met: 0, notMet: 1, notConfirmed: 6, total: 7 }, perShare: false } })).toBe(
      "ESS annex included (0 extra credits) — 0 of 7 Div 83A conditions confirmed from your project profile, 6 not confirmed, 1 not met; no share count on file, so no per-share comparison.",
    );
  });
});
