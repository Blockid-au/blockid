// Release QA-2 F11 — a viewer on a shared project sees "Add Evidence"
// DISABLED with the reason in a tooltip (not hidden, not enabled), and the
// evidence-gap shortcuts + connector "Connect" buttons are disabled too.
// The server still 403s a write; this is the UX half.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: () => {} }));

import { EvidenceVaultClient } from "./evidence-vault-client";
import { ConnectorStatus, EVIDENCE_READ_ONLY_HINT } from "./connector-status";

const GAPS = [
  { evidenceType: "linkedin", label: "Team LinkedIn profiles", action: "Connect LinkedIn", priority: "P1", dimension: "ftv", potentialGain: 4 },
] as unknown as NonNullable<Parameters<typeof EvidenceVaultClient>[0]["evidenceGaps"]>;

describe("EvidenceVaultClient — viewer read-only affordances", () => {
  it("viewer: Add Evidence rendered but disabled, with the view-only tooltip", () => {
    const out = renderToStaticMarkup(
      <EvidenceVaultClient initialEvidence={[]} evidenceGaps={GAPS} currentSVI={40} readOnly />,
    );
    expect(out).toContain('data-testid="add-evidence-button"');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="add-evidence-button"/);
    expect(out).toMatch(/data-testid="add-evidence-button" data-readonly="true"/);
    expect(out).toContain(`title="${EVIDENCE_READ_ONLY_HINT}"`);
    // Gap shortcut is disabled too.
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*aria-disabled="true"[^>]*title="View-only access/);
    // No connect buttons / wizard for a viewer.
    expect(out).not.toContain("Add Evidence → Update SVI");
  });

  it("editor: Add Evidence enabled, no tooltip", () => {
    const out = renderToStaticMarkup(
      <EvidenceVaultClient initialEvidence={[]} evidenceGaps={GAPS} currentSVI={40} readOnly={false} />,
    );
    expect(out).toContain('data-testid="add-evidence-button"');
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="add-evidence-button"/);
    expect(out).not.toContain(EVIDENCE_READ_ONLY_HINT);
  });
});

describe("ConnectorStatus — readOnly", () => {
  it("accepts readOnly and exposes the shared hint", () => {
    // Initial render is the loading state (probe + evidence fetch happen in
    // effects), so only the contract is pinned here.
    const out = renderToStaticMarkup(<ConnectorStatus readOnly />);
    expect(out).toContain("Loading connectors");
    expect(EVIDENCE_READ_ONLY_HINT).toMatch(/^View-only access/);
  });
});
