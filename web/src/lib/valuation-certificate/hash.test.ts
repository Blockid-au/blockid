// Colocated suite for the certificate number + content hash (S22-A) and the
// migration ↔ code shape contract for `valuation_certificates` (0341).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CERTIFICATE_NO_RE,
  canonicalCertificateJson,
  certificateContentHash,
  certificateHashMatches,
  certificateNumber,
  isCertificateNo,
  shortFingerprint,
} from "./hash";
import {
  CERTIFICATE_DISCLAIMER,
  DOCTORAL_SENTENCE,
  LEGAL_ENTITY_LINE,
  certificateCostLabel,
  formatAbn,
  formatAudCompact,
  verifyPathFor,
  type ValuationCertificateData,
} from "./types";

const BASE: ValuationCertificateData = {
  version: "vc-1",
  certificateNo: "VC-AAAAA-BBBBB",
  issuedAt: "2026-09-12T00:00:00.000Z",
  startupName: "Acme",
  abn: null,
  stageLabel: null,
  sviScore: 120,
  sviVersion: null,
  valuation: { lowAud: 1, midAud: 2, highAud: 3, method: "svi", methodNote: null },
  connectedRevenue: null,
  sectorMultiple: { sector: "default", low: 4, mid: 5, high: 6, source: "Generalist VC" },
  dimensions: [],
  evidence: { total: 0, verified: 0, byCategory: [], byDimension: [], lastVerifiedAt: null },
  verifyUrl: "https://blockid.au/verify/valuation/VC-AAAAA-BBBBB",
  scoreHistoryId: null,
};

describe("certificateNumber", () => {
  it("produces VC-XXXXX-XXXXX from a seed + entropy, without the ambiguous I/L/O", () => {
    const no = certificateNumber("proj-1|2026-09-12", Buffer.alloc(16, 7));
    expect(no).toMatch(CERTIFICATE_NO_RE);
    expect(no).not.toMatch(/[ILO]/);
    expect(isCertificateNo(no)).toBe(true);
  });

  it("is deterministic for the same seed + entropy and differs otherwise", () => {
    const a = certificateNumber("seed", Buffer.alloc(16, 1));
    const b = certificateNumber("seed", Buffer.alloc(16, 1));
    const c = certificateNumber("seed", Buffer.alloc(16, 2));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(certificateNumber("seed")).not.toBe(certificateNumber("seed"));
  });

  it("rejects malformed numbers", () => {
    for (const bad of ["VC-AAAAA-BBBB", "vc-aaaaa-bbbbb", "VC-AAAAA-BBBBO", "", null, 12]) {
      expect(isCertificateNo(bad)).toBe(false);
    }
  });
});

describe("certificateContentHash", () => {
  it("hashes the sorted-key canonical JSON with the blockid:v1 prefix", () => {
    const h = certificateContentHash(BASE);
    expect(h).toMatch(/^blockid:v1:[0-9a-f]{64}$/);
    // key order must not matter
    const reordered = JSON.parse(JSON.stringify({ ...BASE, evidence: BASE.evidence, version: BASE.version }));
    expect(certificateContentHash(reordered)).toBe(h);
    expect(canonicalCertificateJson(BASE)).toBe(canonicalCertificateJson(reordered));
    expect(certificateHashMatches(BASE, h)).toBe(true);
    expect(certificateHashMatches({ ...BASE, sviScore: 121 }, h)).toBe(false);
    expect(shortFingerprint(h)).toHaveLength(12);
    expect(shortFingerprint(h)).toBe(h.slice("blockid:v1:".length, "blockid:v1:".length + 12).toUpperCase());
  });
});

describe("approved copy + helpers", () => {
  it("keeps the doctoral sentence verbatim and never says PhD", () => {
    expect(DOCTORAL_SENTENCE).toContain("grounded in the founder's doctoral research (DBA) on startup valuation");
    expect(DOCTORAL_SENTENCE).not.toMatch(/PhD/);
    expect(CERTIFICATE_DISCLAIMER).not.toMatch(/PhD/);
  });

  it("uses the billing / legal entity, never the marketing brand", () => {
    expect(LEGAL_ENTITY_LINE).toBe("Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111)");
    expect(CERTIFICATE_DISCLAIMER).toContain("Auschain PTY LTD, ACN 659 615 111, ABN 79 659 615 111");
    expect(CERTIFICATE_DISCLAIMER).not.toContain("PPL Food");
    expect(CERTIFICATE_DISCLAIMER).toContain("APES 225");
    expect(CERTIFICATE_DISCLAIMER).toContain("not an independent valuation report");
    expect(CERTIFICATE_DISCLAIMER).toContain("Australian Financial Services Licence (AFSL)");
  });

  it("formats ABN, AUD and the cost label", () => {
    expect(formatAbn("79659615111")).toBe("79 659 615 111");
    expect(formatAbn("79 659 615 111")).toBe("79 659 615 111");
    expect(formatAbn("123")).toBeNull();
    expect(formatAbn(null)).toBeNull();
    expect(formatAudCompact(2_400_000)).toBe("A$2.40M");
    expect(formatAudCompact(8_200)).toBe("A$8K");
    expect(certificateCostLabel(5, false)).toBe("5 credits");
    expect(certificateCostLabel(1, false)).toBe("1 credit");
    expect(certificateCostLabel(5, true)).toBe("included in your plan");
    expect(verifyPathFor("VC-AAAAA-BBBBB")).toBe("/verify/valuation/VC-AAAAA-BBBBB");
  });
});

describe("migration 0341 ↔ code shape", () => {
  const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0341_valuation_certificates.sql"), "utf8");

  it("creates valuation_certificates with every column the routes read or write", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.valuation_certificates/);
    for (const col of [
      "project_id",
      "user_id",
      "score_history_id",
      "certificate_no",
      "content_hash",
      "payload",
      "startup_name",
      "svi_score",
      "credits_charged",
      "issued_at",
      "revoked_at",
      "revoked_reason",
    ]) {
      expect(sql, col).toMatch(new RegExp(`^\\s*${col}\\s`, "m"));
    }
    expect(sql).toMatch(/certificate_no\s+TEXT\s+NOT NULL UNIQUE/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/);
  });

  it("the DB check on certificate_no is the same regex the code validates with", () => {
    const m = sql.match(/certificate_no ~ '([^']+)'/);
    expect(m).not.toBeNull();
    expect(new RegExp(m![1]).source).toBe(CERTIFICATE_NO_RE.source);
    expect(certificateNumber("x", Buffer.alloc(16, 3))).toMatch(new RegExp(m![1]));
  });

  it("the DB check on content_hash accepts what certificateContentHash produces", () => {
    const m = sql.match(/content_hash ~ '([^']+)'/);
    expect(m).not.toBeNull();
    expect(certificateContentHash(BASE)).toMatch(new RegExp(m![1]));
  });
});
