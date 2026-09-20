// G19-S43 — the Evidence Hub converter: svi_dimension_evidence rows →
// EvidenceRow (GATHER / chapter tables) and EvidenceItem (extractSignals),
// origin-capped per S36 / D4, rejected rows dropped.

import { describe, expect, it } from "vitest";
import { hubEvidenceId, hubRowConfidence, hubRowStatus, hubRowToEvidenceItem, hubRowToEvidenceRow, hubRowsToEvidenceItems, hubRowsToEvidenceRows, isUsableHubRow } from "./hub-rows";

const AT = "2026-09-20T00:00:00.000Z";

describe("hub-rows", () => {
  it("a founder upload is capped at document_uploaded whatever the row claims; a reviewer-signed row keeps third_party_verified", () => {
    expect(hubRowConfidence({ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "third_party_verified" })).toBe("document_uploaded");
    expect(hubRowConfidence({ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "third_party_verified", is_verified: true })).toBe("third_party_verified");
    expect(hubRowConfidence({ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "public_url" })).toBe("public_url");
    // No level on the row → the catalogue default, capped.
    expect(hubRowConfidence({ dimension: "ptd", evidence_type: "github_repo", confidence_level: null })).toBe("document_uploaded");
    expect(hubRowConfidence({ dimension: "ftv", evidence_type: "founder_linkedin", confidence_level: null })).toBe("public_url");
  });

  it("status: a document or a signed row is evidenced, a URL-only / self-declared row is partial; rejected and malformed rows are unusable", () => {
    expect(hubRowStatus({ dimension: "cgh", evidence_type: "cap_table_spreadsheet", confidence_level: "document_uploaded" })).toBe("evidenced");
    expect(hubRowStatus({ dimension: "ftv", evidence_type: "founder_linkedin", confidence_level: "public_url" })).toBe("partial");
    expect(hubRowStatus({ dimension: "ftv", evidence_type: "founder_linkedin", confidence_level: "self_declared", is_verified: true })).toBe("evidenced");
    expect(isUsableHubRow({ dimension: "cgh", evidence_type: "cap_table_spreadsheet", review_status: "rejected" })).toBe(false);
    expect(isUsableHubRow({ dimension: "xxx", evidence_type: "cap_table_spreadsheet" })).toBe(false);
    expect(isUsableHubRow({ dimension: "cgh", evidence_type: null })).toBe(false);
    expect(isUsableHubRow({ dimension: "CGH", evidence_type: "cap_table_spreadsheet", review_status: "pending" })).toBe(true);
  });

  it("hubRowToEvidenceRow: deterministic id, dimension, source by rung, label with the hub / review marker, confidence, observedAt from the row", () => {
    const row = hubRowToEvidenceRow({ dimension: "TRE", evidence_type: "revenue_proof", evidence_label: "Bank statements", evidence_value_or_url: "statements-q2.pdf", confidence_level: "document_uploaded", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z", review_status: "pending" }, AT)!;
    expect(row).toMatchObject({ evidence_id: hubEvidenceId("tre", "revenue_proof"), source: "upload", label: "Bank statements — Evidence Hub, review pending", status: "evidenced", observedAt: "2026-09-02T00:00:00.000Z", value: "statements-q2.pdf", dims: ["tre"], confidence: "document_uploaded" });
    expect(row.evidence_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(hubEvidenceId("tre", "revenue_proof")).toBe(hubEvidenceId("TRE", "revenue_proof"));
    const signed = hubRowToEvidenceRow({ dimension: "lco", evidence_type: "ip_assignment", evidence_label: "", confidence_level: "third_party_verified", is_verified: true, verified_at: "2026-09-05T00:00:00.000Z" }, AT)!;
    expect(signed).toMatchObject({ label: "IP assignment agreement — Evidence Hub, reviewer-verified", confidence: "third_party_verified", observedAt: "2026-09-05T00:00:00.000Z", source: "upload" });
    const url = hubRowToEvidenceRow({ dimension: "ftv", evidence_type: "founder_linkedin", evidence_label: "LinkedIn", evidence_value_or_url: "https://linkedin.com/in/x", confidence_level: "self_declared" }, AT)!;
    expect(url).toMatchObject({ source: "url", status: "partial", confidence: "self_declared", observedAt: AT });
    expect(hubRowToEvidenceRow({ dimension: "ftv", evidence_type: "founder_linkedin", review_status: "rejected" }, AT)).toBeUndefined();
  });

  it("hubRowToEvidenceItem keeps the catalogue code as evidence_type with the capped level and the origin; the batch helpers drop unusable rows", () => {
    const rows = [
      { dimension: "cgh", evidence_type: "cap_table_spreadsheet", evidence_label: "Cap table", confidence_level: "third_party_verified" },
      { dimension: "cgh", evidence_type: "vesting_schedule", evidence_label: "Vesting deed", confidence_level: "document_uploaded", is_verified: true },
      { dimension: "cgh", evidence_type: "board_minutes", review_status: "rejected" },
    ];
    expect(hubRowToEvidenceItem(rows[0])).toEqual({ evidence_type: "cap_table_spreadsheet", confidence_level: "document_uploaded", dimension: "cgh", label: "Cap table", origin: "founder_upload" });
    expect(hubRowToEvidenceItem(rows[1])).toMatchObject({ confidence_level: "document_uploaded", origin: "reviewer" });
    expect(hubRowsToEvidenceItems(rows)).toHaveLength(2);
    expect(hubRowsToEvidenceRows(rows, AT)).toHaveLength(2);
  });
});
