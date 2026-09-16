// G14-S36 D4 — origin caps on evidence confidence.

import { describe, expect, it } from "vitest";
import {
  CAP_RULES_PLAIN,
  CONFIDENCE_LEVELS,
  EVIDENCE_ORIGINS,
  capConfidence,
  cappedLevel,
  confidenceRank,
  isConfidenceLevel,
  originCeiling,
  textHasUrl,
  type ConfidenceLevel,
  type EvidenceOrigin,
} from "./confidence-cap";

const rank = (l: ConfidenceLevel) => confidenceRank(l);

describe("capConfidence — origin × requested matrix", () => {
  const expected: Record<EvidenceOrigin, Record<ConfidenceLevel, ConfidenceLevel>> = {
    founder_text: {
      self_declared: "self_declared",
      public_url: "self_declared",
      document_uploaded: "self_declared",
      connected_source: "self_declared",
      transaction_data: "self_declared",
      third_party_verified: "self_declared",
    },
    founder_upload: {
      self_declared: "self_declared",
      public_url: "public_url",
      document_uploaded: "document_uploaded",
      connected_source: "document_uploaded",
      transaction_data: "document_uploaded",
      third_party_verified: "document_uploaded",
    },
    connector: {
      self_declared: "connected_source",
      public_url: "connected_source",
      document_uploaded: "connected_source",
      connected_source: "connected_source",
      transaction_data: "transaction_data",
      third_party_verified: "transaction_data",
    },
    reviewer: {
      self_declared: "self_declared",
      public_url: "public_url",
      document_uploaded: "document_uploaded",
      connected_source: "connected_source",
      transaction_data: "transaction_data",
      third_party_verified: "third_party_verified",
    },
    admin: {
      self_declared: "self_declared",
      public_url: "public_url",
      document_uploaded: "document_uploaded",
      connected_source: "connected_source",
      transaction_data: "transaction_data",
      third_party_verified: "third_party_verified",
    },
  };

  for (const origin of EVIDENCE_ORIGINS) {
    for (const requested of CONFIDENCE_LEVELS) {
      it(`${origin} × ${requested} → ${expected[origin][requested]}`, () => {
        const r = capConfidence({ requested, origin });
        expect(r.level).toBe(expected[origin][requested]);
        expect(r.requested).toBe(requested);
        expect(r.capped).toBe(rank(r.level) < rank(requested));
      });
    }
  }

  it("founder_text with a URL may reach public_url, never higher", () => {
    expect(capConfidence({ requested: "public_url", origin: "founder_text", hasUrl: true }).level).toBe("public_url");
    expect(capConfidence({ requested: "third_party_verified", origin: "founder_text", hasUrl: true }).level).toBe("public_url");
    expect(capConfidence({ requested: "self_declared", origin: "founder_text", hasUrl: true }).level).toBe("self_declared");
  });

  it("hasUrl is ignored for every origin but founder_text", () => {
    expect(capConfidence({ requested: "third_party_verified", origin: "founder_upload", hasUrl: true }).level).toBe("document_uploaded");
    expect(capConfidence({ requested: "third_party_verified", origin: "connector", hasUrl: true }).level).toBe("transaction_data");
  });

  it("unknown / missing requested levels count as self_declared", () => {
    expect(capConfidence({ requested: "verified_by_god", origin: "admin" }).level).toBe("self_declared");
    expect(capConfidence({ requested: null, origin: "reviewer" }).level).toBe("self_declared");
    expect(capConfidence({ requested: undefined, origin: "founder_upload" }).requested).toBe("self_declared");
    // the connector floor still applies to a junk request
    expect(capConfidence({ requested: "", origin: "connector" }).level).toBe("connected_source");
  });

  it("founder text containing 'ASIC audit' stays self_declared (the keyword ladder is gone)", () => {
    const text = "Our accounts were audited by a third party and we are ASIC registered. Board signed the ASIC audit.";
    expect(cappedLevel({ requested: "third_party_verified", origin: "founder_text", hasUrl: textHasUrl(text) })).toBe("self_declared");
  });

  it("a founder POST of third_party_verified through the upload route is stored as document_uploaded", () => {
    expect(cappedLevel({ requested: "third_party_verified", origin: "founder_upload" })).toBe("document_uploaded");
  });
});

describe("originCeiling / helpers", () => {
  it("ceilings are monotonic founder_text ≤ founder_upload ≤ connector ≤ reviewer = admin", () => {
    expect(rank(originCeiling("founder_text"))).toBeLessThan(rank(originCeiling("founder_upload")));
    expect(rank(originCeiling("founder_upload"))).toBeLessThan(rank(originCeiling("connector")));
    expect(rank(originCeiling("connector"))).toBeLessThan(rank(originCeiling("reviewer")));
    expect(originCeiling("reviewer")).toBe(originCeiling("admin"));
    expect(originCeiling("founder_text", true)).toBe("public_url");
  });

  it("isConfidenceLevel accepts the six ladder rungs only", () => {
    for (const l of CONFIDENCE_LEVELS) expect(isConfidenceLevel(l)).toBe(true);
    expect(isConfidenceLevel("verified")).toBe(false);
    expect(isConfidenceLevel(3)).toBe(false);
  });

  it("textHasUrl finds http(s) URLs and nothing else", () => {
    expect(textHasUrl("see https://example.com/deck for details")).toBe(true);
    expect(textHasUrl("http://blockid.au")).toBe(true);
    expect(textHasUrl("our website is blockid.au")).toBe(false);
    expect(textHasUrl(null)).toBe(false);
  });

  it("the plain-English rules cover each origin a founder-facing page needs, with the same ceilings", () => {
    const byOrigin = new Map(CAP_RULES_PLAIN.map((r) => [r.origin, r]));
    expect(byOrigin.get("founder_text")?.ceiling).toBe(originCeiling("founder_text", true));
    expect(byOrigin.get("founder_upload")?.ceiling).toBe(originCeiling("founder_upload"));
    expect(byOrigin.get("connector")?.ceiling).toBe(originCeiling("connector"));
    expect(byOrigin.get("reviewer")?.ceiling).toBe(originCeiling("reviewer"));
    for (const r of CAP_RULES_PLAIN) expect(r.rule.length).toBeGreaterThan(20);
  });
});
