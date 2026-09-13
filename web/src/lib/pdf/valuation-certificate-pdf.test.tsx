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
//     clean pages otherwise; the revoked banner when revokedAt is set;
//   - S27-A Annex A (ESS): pages 4–5 when the payload carries `ess` — the
//     approval instrument named, every s 83A-33 checklist row, the
//     not-a-safe-harbour sentence, the per-share comparison; `annex: "none"`
//     drops it; `annex: "ess"` on a payload without one prints it with every
//     row "Not confirmed" and no per-share line.

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
  ESS_APPROVAL_INSTRUMENT,
  ESS_NOT_SAFE_HARBOUR_SENTENCE,
  type ValuationCertificateData,
} from "@/lib/valuation-certificate/types";
import { SAMPLE_CERTIFICATE as SAMPLE, SAMPLE_CERTIFICATE_ESS } from "@/lib/valuation-certificate/fixtures";

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

  it("S27-A: Annex A prints the instrument, the s 83A-33 checklist rows and the not-a-safe-harbour sentence on pages 4–5", async () => {
    const buf = await renderValuationCertificatePdf({ data: SAMPLE_CERTIFICATE_ESS, contentHash: certificateContentHash(SAMPLE_CERTIFICATE_ESS), watermark: null });
    expect(pdfPageCount(buf)).toBe(5);
    const pages = await pageTexts(buf);
    const annex = `${pages[3]} ${pages[4]}`;
    expect(pages[3]).toContain("Start-up concession conditions (s 83A-33 ITAA 1997)");
    expect(pages[4]).toContain("ATO-approved valuation methods for unlisted start-up shares");
    expect(pages[4]).toContain(ESS_NOT_SAFE_HARBOUR_SENTENCE);
    expect(annex).toContain("Annex A — Market value of an ordinary share for ESS purposes");
    expect(annex).toContain(ESS_APPROVAL_INSTRUMENT);
    expect(annex).toContain("Start-up concession conditions (s 83A-33 ITAA 1997)");
    // The checklist rows + their references.
    expect(annex).toContain("listed on an approved stock exchange");
    expect(annex).toContain("s 83A-33(2)");
    expect(annex).toContain("incorporated less than 10 years before the end of the most recent income year");
    expect(annex).toContain("s 83A-33(3)");
    expect(annex).toContain("Aggregated turnover for the most recent income year before the ESS interest is acquired does not exceed A$50 million");
    expect(annex).toContain("s 83A-33(4)");
    expect(annex).toContain("Australian resident taxpayer");
    expect(annex).toContain("s 83A-33(6)");
    expect(annex).toContain("discount of no more than 15 % of market value");
    expect(annex).toContain("exercise price at least equal to the market value of an ordinary share");
    expect(annex).toContain("s 83A-33(5)");
    expect(annex).toContain("held for at least 3 years");
    expect(annex).toContain("s 83A-45(4)–(5)");
    expect(annex).toContain("no more than 10 % of the shares");
    expect(annex).toContain("s 83A-45(6)");
    // Statuses come from the stored facts — met for age / listed / turnover, not confirmed elsewhere, never assumed.
    expect(annex).toContain("Met (on the facts recorded)");
    expect(annex).toContain("Not confirmed");
    expect(annex).not.toContain("Not met");
    expect(annex).toContain("Incorporated 2022-03-15 — 4 years at the issue date");
    expect(annex).toContain("Facts on file at issue: incorporated 2022-03-15 · listed no · turnover A$420,000");
    // Approved methods.
    expect(annex).toContain("Net tangible assets (NTA) method");
    expect(annex).toContain("signed off by a director or the chief financial officer");
    expect(annex).toContain("Valuation by a qualified valuer within 12 months");
    expect(annex).toContain("Recent arm's-length sale or issue");
    // The certificate's own figure — indicative only, per share on the shares on file.
    expect(annex).toContain("indicative comparison only");
    expect(annex).toContain("10,000,000 ordinary shares on issue");
    expect(annex).toContain("A$0.125 – A$0.39 per share (midpoint A$0.24)");
    expect(annex).toContain(ESS_NOT_SAFE_HARBOUR_SENTENCE);
    expect(annex).toContain("not tax, legal or financial advice");
    expect(annex).not.toMatch(/PhD/);
    // The cover points at the annex; pages 1–3 are unchanged in substance.
    expect(pages[0]).toContain("Annex A sets out the Div 83A start-up concession conditions");
    expect(pages[2]).toContain(DOCTORAL_SENTENCE);
  });

  it("S27-A: annex:none drops Annex A; annex:ess on a payload issued without one prints every row Not confirmed and no per-share line", async () => {
    const none = await renderValuationCertificatePdf({ data: SAMPLE_CERTIFICATE_ESS, contentHash: HASH, watermark: null, annex: "none" });
    expect(pdfPageCount(none)).toBe(3);
    expect((await pageTexts(none)).join(" ")).not.toContain(ESS_APPROVAL_INSTRUMENT);

    const forced = await renderValuationCertificatePdf({ data: SAMPLE, contentHash: HASH, watermark: null, annex: "ess" });
    expect(pdfPageCount(forced)).toBe(5);
    const annex = (await pageTexts(forced)).slice(3).join(" ");
    expect(annex).toContain(ESS_APPROVAL_INSTRUMENT);
    expect(annex).not.toContain("Met (on the facts recorded)");
    expect(annex).toContain("Incorporation date not recorded");
    expect(annex).toContain("No share count was on file at issue, so no per-share figure is shown");
    expect(annex).toContain(ESS_NOT_SAFE_HARBOUR_SENTENCE);
    // Default (auto) on a payload without the annex → still 3 pages.
    expect(pdfPageCount(await renderValuationCertificatePdf({ data: SAMPLE, contentHash: HASH, watermark: null }))).toBe(3);
    // The watermark reaches the annex page too.
    const wm = await renderValuationCertificatePdf({ data: SAMPLE_CERTIFICATE_ESS, contentHash: HASH, watermark: watermarkLabel({ recipient: "jane@blackbird.vc", date: "2026-09-12T00:00:00Z" }) });
    for (const p of await pageTexts(wm)) expect(p).toContain("Prepared for jane@blackbird.vc");
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
