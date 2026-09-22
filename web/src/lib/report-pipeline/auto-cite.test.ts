// auto-cite — G23-A fix (a): obvious references get the register id the owner omitted; never an invented one.
import { describe, expect, it } from "vitest";
import { autoCite, idsForClaim, itemHasNumber, itemsFromCatalogue, itemsFromEvidenceRows, numericTokens } from "./auto-cite";
import { findUncitedClaims } from "./llm-auditor";

const ID_A = "e5e0e468-23df-4bbb-8592-c0ef6d0d12ac";
const ID_B = "a1a6868b-7d42-44b2-870c-3756554e2604";
const ID_C = "0b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9";
const ROWS = itemsFromEvidenceRows([
  { evidence_id: ID_A, label: "Founder evidence: customer_size", value: "182 startups analysed and 3,302 weekly SVI snapshots (capacity audit 2026-09-13). 5 evaluator accounts, none paying yet." },
  { evidence_id: ID_B, label: "Stripe revenue (last sync)", value: "mrr_aud = 100000; prior_mrr_aud = 95700; churn_90d_pct = 2.1; active_subscriptions = 0; one_off_charges = 5" },
  { evidence_id: ID_C, label: "AU market anchor (ABS / IBISWorld)", value: "TAM A$4.2bn; SAM A$310M; CAGR 6.4 %" },
]);

describe("numericTokens", () => {
  it("reads currency, unit and magnitude; ignores single digits and NN/100 score echoes", () => {
    const t = numericTokens("MRR A$12,400 grew 8 % to 3,302 snapshots across 12 firms; scored 44/100 with 3 founders and a 3.4x LTV/CAC");
    expect(t.map((x) => [x.digits, x.currency, x.unit, x.strong])).toEqual([
      ["12400", true, "", true],
      ["8", false, "%", true],
      ["3302", false, "", true],
      ["12", false, "", false],
      ["3.4", false, "x", true],
    ]);
  });
});

describe("itemHasNumber", () => {
  const tok = (claim: string) => numericTokens(claim)[0]!;
  it("matches bounded numbers, thousands separators, k/m scaling and unit context", () => {
    expect(itemHasNumber("3,302 weekly snapshots", tok("3302 snapshots"))).toBe(true);
    expect(itemHasNumber("13,302 weekly snapshots", tok("3,302 snapshots"))).toBe(false);
    expect(itemHasNumber("mrr_aud = 100000", tok("A$100k MRR"))).toBe(true);
    expect(itemHasNumber("mrr_aud = 100000", tok("A$100 MRR"))).toBe(false);
    expect(itemHasNumber("churn_90d_pct = 2.1", tok("churn of 2.1 %"))).toBe(true);
    expect(itemHasNumber("SAM A$310M", tok("A$310 million SAM"))).toBe(true);
    expect(itemHasNumber("ltv_cac = 3.4", tok("3.4x LTV/CAC"))).toBe(true);
    expect(itemHasNumber("founded 2021", tok("2.1 %"))).toBe(false);
  });
});

describe("autoCite", () => {
  it("cites a claim whose numbers are all in one register row, before the full stop, preferring the row it names", () => {
    const r = autoCite("The register shows 3,302 weekly snapshots across 182 startups. Stripe shows 0 active subscriptions and 5 one-off charges. Nothing numeric here.", ROWS);
    expect(r.text).toBe(`The register shows 3,302 weekly snapshots across 182 startups [ev:${ID_A}]. Stripe shows 0 active subscriptions and 5 one-off charges. Nothing numeric here.`);
    expect(r.added).toBe(1);
    expect(findUncitedClaims(r.text, [ID_A, ID_B, ID_C])).toEqual([]);
  });

  it("never attaches a row on a bare digit coincidence: money needs money context, weak numbers need the row named (review G23 P1)", () => {
    const rows = itemsFromEvidenceRows([
      { evidence_id: ID_A, label: "GA4 sessions", value: "1200 sessions, 38 signups in the last 30 days" },
      { evidence_id: ID_B, label: "Stripe revenue (last sync)", value: "mrr_aud = 0" },
    ]);
    expect(idsForClaim("TAM is estimated at A$1,200 million for the AU segment.", rows)).toBeNull();
    expect(idsForClaim("The site recorded 38 sign-ups.", rows)).toBeNull();
    expect(idsForClaim("GA4 recorded 38 signups in the period.", rows)).toEqual([ID_A]);
  });

  it("never cites when one material number is missing from every row, and never invents an id", () => {
    const r = autoCite("Revenue reached A$1.2M ARR with 3,302 snapshots.", ROWS);
    expect(r.text).toBe("Revenue reached A$1.2M ARR with 3,302 snapshots.");
    expect(r.added).toBe(0);
    expect(r.uncited).toBe(1);
    expect(findUncitedClaims(r.text, [ID_A, ID_B, ID_C])).toHaveLength(1);
  });

  it("splits the citation across two rows when the numbers live in two, and caps at two ids", () => {
    const r = autoCite("A SAM of A$310M against 3,302 snapshots.", ROWS);
    expect(r.text).toContain(`[ev:${ID_C}]`);
    expect(r.text).toContain(`[ev:${ID_A}]`);
    expect(idsForClaim("A$310M SAM, 3,302 snapshots and 2.1 % churn", ROWS, 2)).toBeNull();
    expect(idsForClaim("A$310M SAM, 3,302 snapshots and 2.1 % churn", ROWS, 3)).toEqual([ID_A, ID_B, ID_C]);
  });

  it("leaves already-cited or explicitly unevidenced claims alone; keeps list markers, table rows, comments and blank lines", () => {
    const src = ["### Traction", `- 3,302 snapshots [ev:${ID_A}].`, "- MRR A$9k (unevidenced).", "| Metric | Value |", "| Snapshots | 3,302 |", "", "<!-- SCORE: 46 -->"].join("\n");
    const r = autoCite(src, ROWS);
    const lines = r.text.split("\n");
    expect(lines[0]).toBe("### Traction");
    expect(lines[1]).toBe(`- 3,302 snapshots [ev:${ID_A}].`);
    expect(lines[2]).toBe("- MRR A$9k (unevidenced).");
    expect(lines[4]).toBe(`| Snapshots | 3,302 [ev:${ID_A}] |`);
    expect(lines[5]).toBe("");
    expect(lines[6]).toBe("<!-- SCORE: 46 -->");
    expect(r.added).toBe(1);
  });

  it("never treats a model quote as evidence merely because its source ID is allowed", () => {
    const items = itemsFromCatalogue([{ evidence_id: ID_A, label: "Startup description", content: "A founder gets a free score." }]);
    const cites = [
      { evidence_id: ID_A, quote: "Cohort 25 A$5,000/yr and Cohort 100 A$15,000/yr" },
      { evidence_id: ID_B, quote: "MRR is A$77k" },
    ];
    const r = autoCite("Cohort 25 costs A$5,000 a year. MRR is A$77k.", items, cites);
    expect(r.text).toBe("Cohort 25 costs A$5,000 a year. MRR is A$77k.");
    expect(r.added).toBe(0);
  });

  it("does not cite a plain 2-digit number against a date fragment when nothing strong anchors it", () => {
    const rows = itemsFromEvidenceRows([{ evidence_id: ID_A, label: "Capacity audit", value: "audit 2026-09-13" }]);
    expect(autoCite("MRR grew 13 last month.", rows).text).toBe("MRR grew 13 last month.");
  });
});


describe("G30 model quote provenance", () => {
  it("retains genuine excerpts while rejecting a fabricated extension", () => {
    const items = itemsFromCatalogue([{ evidence_id: ID_A, label: "Stripe revenue", content: "MRR is A$10,000.\nARR is A$120,000." }]);
    const genuine = [{ evidence_id: ID_A, quote: "MRR is A$10,000. ARR is A$120,000." }];
    expect(autoCite("MRR is A$10,000.", items, genuine).added).toBe(1);
    const forged = [{ evidence_id: ID_A, quote: "MRR is A$10,000. ARR is A$999,000." }];
    expect(autoCite("ARR is A$999,000.", items, forged).added).toBe(0);
  });

  it("cannot remove topic restrictions through a real quoted excerpt", () => {
    const items = [{ id: ID_A, label: "Tax rate", text: "Tax rate 20%.", topicRe: /tax/i }];
    const quotes = [{ evidence_id: ID_A, quote: "Tax rate 20%." }];
    expect(autoCite("Revenue growth 20%.", items, quotes).added).toBe(0);
    expect(autoCite("Tax rate 20%.", items, quotes).added).toBe(1);
  });

  it("does not accept an absent source, empty source or unknown ID", () => {
    const quote = "MRR is A$77,000.";
    expect(autoCite(quote, [], [{ evidence_id: ID_A, quote }]).added).toBe(0);
    expect(autoCite(quote, [{ id: ID_A, label: "Missing", text: "" }], [{ evidence_id: ID_A, quote }]).added).toBe(0);
    expect(autoCite(quote, [{ id: ID_A, label: "Evidence", text: "No financial information." }], [{ evidence_id: ID_B, quote }]).added).toBe(0);
  });
});
