// Colocated suite for the valuation certificate renderer (S22-A).
//
// Reads the text back out of the produced bytes with pdf-parse and pins:
//   - the doctoral sentence verbatim (and never "PhD");
//   - the not-a-valuation-report / general-advice disclaimer (APES 225, AFSL);
//   - the legal entity line (Auschain PTY LTD, ACN, ABN) — and never the
//     marketing brand;
//   - the A$ figures, certificate number, verify URL and fingerprint;
//   - the data principle sentence;
//   - 3 pages, watermark on EVERY page when an investor recipient is given,
//     clean pages otherwise; the revoked banner when revokedAt is set.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";

import { pdfPageCount } from "./page-count";
import { renderValuationCertificatePdf } from "./valuation-certificate-pdf";
import { watermarkLabel } from "./watermark";
import { certificateContentHash, shortFingerprint } from "@/lib/valuation-certificate/hash";
import {
  CERTIFICATE_DISCLAIMER,
  DATA_PRINCIPLE_SENTENCE,
  DOCTORAL_SENTENCE,
  type ValuationCertificateData,
} from "@/lib/valuation-certificate/types";
import { SAMPLE_CERTIFICATE as SAMPLE } from "@/lib/valuation-certificate/fixtures";

async function pageTexts(buffer: Buffer): Promise<string[]> {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text.replace(/\s+/g, " "));
  } finally {
    await parser.destroy();
  }
}


const HASH = certificateContentHash(SAMPLE);

describe("renderValuationCertificatePdf", () => {
  it("renders 3 A4 pages with the approved sentences, figures and entity line", async () => {
    const buf = await renderValuationCertificatePdf({ data: SAMPLE, contentHash: HASH, watermark: null });
    expect(pdfPageCount(buf)).toBe(3);
    const pages = await pageTexts(buf);
    const all = pages.join(" ");

    // Approved copy, verbatim.
    expect(all).toContain(DOCTORAL_SENTENCE);
    expect(all).toContain("grounded in the founder's doctoral research (DBA) on startup valuation");
    expect(all).not.toMatch(/PhD/);
    expect(all).toContain(DATA_PRINCIPLE_SENTENCE);

    // Disclaimer — general advice + not a valuation report.
    expect(all).toContain(CERTIFICATE_DISCLAIMER);
    expect(all).toContain("not a valuation engagement under APES 225");
    expect(all).toContain("does not constitute financial product advice under the Corporations Act 2001 (Cth)");
    expect(all).toContain("does not hold an Australian Financial Services Licence (AFSL)");

    // Legal / billing entity, never the marketing brand.
    expect(all).toContain("Auschain PTY LTD");
    expect(all).toContain("ACN 659 615 111");
    expect(all).toContain("ABN 79 659 615 111");
    expect(all).not.toContain("PPL Food");

    // Figures and identifiers.
    expect(all).toContain("A$2.40M");
    expect(all).toContain("A$1,250,000");
    expect(all).toContain("A$3,900,000");
    expect(all).toContain("VC-7K3MP-Q9X2A");
    expect(all).toContain("https://blockid.au/verify/valuation/VC-7K3MP-Q9X2A");
    expect(all).toContain(shortFingerprint(HASH));
    expect(all).toContain(HASH);
    expect(all).toContain("SVI composite cross-checked with ARR");
    expect(all).toContain("Includes connected revenue (A$8.2K MRR from Stripe)");
    expect(all).toContain("6.0× – 7.5× ARR");
    expect(all).toContain("Bessemer Venture Partners");
    expect(all).toContain("79 659 615 111");

    // Page split: cover / dimensions / methodology.
    expect(pages[0]).toContain("Midpoint · full range");
    expect(pages[1]).toContain("Eight SVI dimensions");
    expect(pages[1]).toContain("Founder & Team Value");
    expect(pages[1]).toContain("Evidence base");
    expect(pages[1]).toContain("Assumptions & limitations");
    expect(pages[2]).toContain("Methodology");
    expect(pages[2]).toContain("Automated issuance — sealed by content hash");

    // Clean pages — no watermark, no revoked banner.
    expect(all).not.toContain("Prepared for");
    expect(all).not.toContain("REVOKED");
  });

  it("burns the investor watermark on every page when a recipient is given", async () => {
    const label = watermarkLabel({ recipient: "jane@blackbird.vc", date: "2026-09-12T00:00:00Z" });
    const buf = await renderValuationCertificatePdf({ data: SAMPLE, contentHash: HASH, watermark: label });
    const pages = await pageTexts(buf);
    expect(pages.length).toBe(3);
    for (const p of pages) expect(p).toContain("Prepared for jane@blackbird.vc");
  });

  it("prints the revoked banner on every page when revokedAt is set", async () => {
    const buf = await renderValuationCertificatePdf({
      data: SAMPLE,
      contentHash: HASH,
      watermark: null,
      revokedAt: "2026-10-01T00:00:00Z",
    });
    const pages = await pageTexts(buf);
    for (const p of pages) expect(p).toContain("REVOKED");
  });

  it("handles a certificate with no ABN, no connected revenue and no evidence", async () => {
    const bare: ValuationCertificateData = {
      ...SAMPLE,
      abn: null,
      stageLabel: null,
      connectedRevenue: null,
      valuation: { ...SAMPLE.valuation, method: "svi", methodNote: "connected revenue disagrees with SVI-implied range" },
      evidence: { total: 0, verified: 0, byCategory: [], byDimension: [], lastVerifiedAt: null },
    };
    const buf = await renderValuationCertificatePdf({ data: bare, contentHash: certificateContentHash(bare), watermark: null });
    const all = (await pageTexts(buf)).join(" ");
    expect(all).toContain("Not supplied");
    expect(all).toContain("No evidence items were on file at issue");
    expect(all).toContain("None verified");
    expect(all).toContain("Method note: connected revenue disagrees");
    expect(all).not.toContain("Includes connected revenue");
  });
});
