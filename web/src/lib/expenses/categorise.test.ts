// S28-C — categoriser: merchant key, keyword rules + sign guard, learned
// rules first, recurring detection, AI acceptance / rejection, batching.

import { describe, it, expect, vi } from "vitest";
import {
  MAX_AI_BATCH,
  MIN_AI_CONFIDENCE,
  MIN_AI_CONFIDENCE_HIGH_STAKES,
  BANK_FEE_MAX_AUD_WITHOUT_KEYWORD,
  BARE_COMPANY_CONFIDENCE,
  RECURRING_CONFIDENCE,
  LEARNED_CONFIDENCE,
  acceptAiAnswer,
  isBareCompanyNarration,
  looksLikeBankFee,
  aiSystemPrompt,
  aiUserPrompt,
  categoriseBatch,
  categoriseRows,
  categoriseWithAi,
  detectRecurringMerchants,
  matchMerchantRule,
  merchantKey,
  parseAiAnswers,
  type CategoriseInput,
} from "./categorise";
import { CATEGORY_KEYS } from "./categories";

function tx(id: string, description: string, amountAud: number, occurredOn = "2026-06-01"): CategoriseInput {
  return { id, description, amountAud, occurredOn };
}

describe("merchantKey", () => {
  it("strips bank prefixes, dates, card numbers, domains and references", () => {
    expect(merchantKey("VISA PURCHASE 14/06 AWS EMEA aws.amazon.co 4534")).toBe("aws emea");
    expect(merchantKey("Direct Debit 123456 Xero Australia Pty Ltd REF 99887")).toBe("xero");
    expect(merchantKey("EFTPOS PURCHASE BUNNINGS 123 ALEXANDRIA NSW")).toBe("bunnings alexandria");
  });
  it("is stable across the same merchant's different references", () => {
    expect(merchantKey("GOOGLE *CLOUD 1234ABC")).toBe(merchantKey("GOOGLE *CLOUD 9876XYZ"));
  });
  it("falls back to 'unknown' for bare references", () => {
    expect(merchantKey("1234567890")).toBe("unknown");
    expect(merchantKey("")).toBe("unknown");
  });
});

describe("matchMerchantRule — keyword table + sign guard", () => {
  it.each([
    ["AWS EMEA aws.amazon.com", -320.5, "cloud_hosting"],
    ["GOOGLE CLOUD SYDNEY", -88, "cloud_hosting"],
    ["Xero Australia Pty Ltd", -70, "software_subscriptions"],
    ["STRIPE PAYOUT ST-XYZ", 1500, "revenue"],
    ["STRIPE FEES", -12.4, "cost_of_sales"],
    ["AUSTRALIANSUPER CLEARING", -1200, "superannuation"],
    ["HOSTPLUS SUPER", -500, "superannuation"],
    ["PAYROLL RUN JUNE", -8400, "salaries_wages"],
    ["ATO PAYGW", -1900, "salaries_wages"],
    ["Bunnings Warehouse Alexandria", -145.9, "equipment"],
    ["GOOGLE ADS 12345", -600, "marketing_advertising"],
    ["UBER EATS SYDNEY", -32, "meals_entertainment"],
    ["UBER TRIP", -28, "travel"],
    ["QANTAS AIRWAYS", -540, "travel"],
    ["Transfer to savings", -5000, "transfer"],
    ["Director loan from J Smith", 20000, "owner_drawings"],
    ["MONTHLY ACCOUNT KEEPING FEE", -10, "bank_fees"],
    ["AUSINDUSTRY GRANT PAYMENT", 25000, "government_grants"],
    ["BIZCOVER INSURANCE", -95, "insurance"],
    ["LAWPATH LEGAL", -299, "professional_fees"],
    // Lane-1 F5 (live QA 2026-09-13): a consulting invoice is a contractor line, not a bank fee.
    ["BLRGH CONSULTING INV 1002", -2200, "contractors"],
    ["ACME SERVICES INVOICE 77", -900, "contractors"],
    ["NORTH ADVISORY INV 12", -1500, "professional_fees"],
  ])("%s (%s) → %s", (desc, amount, category) => {
    expect(matchMerchantRule(desc, amount)?.category).toBe(category);
  });

  it("lane-1 F5: a consulting invoice paid OUT is contractors; the same narration paid IN is revenue (invoice paid)", () => {
    expect(matchMerchantRule("BLRGH CONSULTING INV 1002", -2200)?.category).toBe("contractors");
    expect(matchMerchantRule("BLRGH CONSULTING INV 1002", 2200)?.category).toBe("revenue");
  });

  it("lane-1 F5: bank_fees rules only fire on known fee wording", () => {
    expect(matchMerchantRule("INTERNATIONAL TRANSACTION FEE", -3.2)?.category).toBe("bank_fees");
    expect(looksLikeBankFee("MONTHLY ACCOUNT KEEPING FEE")).toBe(true);
    expect(looksLikeBankFee("BLRGH CONSULTING INV 1002")).toBe(false);
    expect(looksLikeBankFee("XYZQ WIDGETS PTY LTD 4471")).toBe(false);
  });

  it("lane-1 F5: a bare company name with no other signal is recognised; a known merchant with Pty Ltd is not bare", () => {
    expect(isBareCompanyNarration("XYZQ WIDGETS PTY LTD 4471", -88)).toBe(true);
    expect(isBareCompanyNarration("ACME HOLDINGS LIMITED", -1200)).toBe(true);
    expect(isBareCompanyNarration("Xero Australia Pty Ltd", -70)).toBe(false);
    expect(isBareCompanyNarration("PAYMENT 88213 ZQ", -80)).toBe(false);
  });

  it("revenue / grants require money IN — a Stripe debit is not revenue", () => {
    expect(matchMerchantRule("STRIPE TRANSFER", -400)?.category).not.toBe("revenue");
    expect(matchMerchantRule("AUSINDUSTRY GRANT", -100)?.category).not.toBe("government_grants");
  });

  it("ATO money in is a refund / offset (grant), a generic ATO debit is flagged for review", () => {
    expect(matchMerchantRule("ATO REFUND", 5400)?.category).toBe("government_grants");
    const debit = matchMerchantRule("ATO PAYMENT BAS", -3100);
    expect(debit?.category).toBe("other");
    expect(debit?.review).toBe(true);
  });

  it("returns null for an unknown merchant", () => {
    expect(matchMerchantRule("PAYMENT 88213 ZQ", -80)).toBeNull();
  });
});

describe("categoriseRows — rules layer", () => {
  it("learned per-project rules win over the keyword table", () => {
    const rows = [tx("a", "Bunnings Warehouse", -200)];
    const { decided, remaining } = categoriseRows(rows, { learned: new Map([["bunnings warehouse", "r_and_d"]]) });
    expect(remaining).toEqual([]);
    expect(decided[0]).toMatchObject({ id: "a", category: "r_and_d", source: "rule", confidence: LEARNED_CONFIDENCE, needsReview: false, gstTreatment: "gst" });
  });

  it("accepts a plain record for learned rules too", () => {
    const { decided } = categoriseRows([tx("a", "Bunnings Warehouse", -200)], { learned: { "bunnings warehouse": "equipment" } });
    expect(decided[0].category).toBe("equipment");
  });

  it("keyword rows are decided at 0.9, unknown rows are left for the model", () => {
    const rows = [tx("a", "AWS EMEA", -100), tx("b", "PAYMENT 88213 ZQ", -80)];
    const { decided, remaining } = categoriseRows(rows);
    expect(decided.map((d) => d.id)).toEqual(["a"]);
    expect(decided[0].confidence).toBe(0.9);
    expect(remaining.map((r) => r.id)).toEqual(["b"]);
  });

  it("lane-1 F5: the two live-QA narrations — consulting invoice → contractors (rule); bare PTY LTD → other + review, never sent to the model", () => {
    const rows = [tx("a", "BLRGH CONSULTING INV 1002", -2200), tx("b", "XYZQ WIDGETS PTY LTD 4471", -88)];
    const { decided, remaining } = categoriseRows(rows);
    expect(remaining).toEqual([]);
    expect(decided.find((d) => d.id === "a")).toMatchObject({ category: "contractors", source: "rule", needsReview: false, gstTreatment: "gst" });
    expect(decided.find((d) => d.id === "b")).toMatchObject({ category: "other", source: "rule", confidence: BARE_COMPANY_CONFIDENCE, needsReview: true, gstTreatment: "unknown" });
  });

  it("lane-1 F5: a learned rule for the bare company name still wins", () => {
    const { decided } = categoriseRows([tx("b", "XYZQ WIDGETS PTY LTD 4471", -88)], { learned: { "xyzq widgets": "equipment" } });
    expect(decided[0]).toMatchObject({ category: "equipment", source: "rule", needsReview: false });
  });

  it("stamps the category's default GST treatment", () => {
    const { decided } = categoriseRows([tx("a", "AUSTRALIANSUPER", -900), tx("b", "ACCOUNT KEEPING FEE", -10)]);
    expect(decided.find((d) => d.id === "a")?.gstTreatment).toBe("gst_free");
    expect(decided.find((d) => d.id === "b")?.gstTreatment).toBe("input_taxed");
  });

  it("every input lands in exactly one list", () => {
    const rows = Array.from({ length: 30 }, (_, i) => tx(`r${i}`, i % 2 ? "AWS" : `REF ${i}`, -10 - i));
    const { decided, remaining } = categoriseRows(rows);
    expect(decided.length + remaining.length).toBe(30);
  });
});

describe("detectRecurringMerchants", () => {
  const sub = (i: number, amt = -49) => tx(`s${i}`, "ZQ TOOLS PTY", amt, `2026-0${i}-03`);

  it("flags a near-identical small charge in ≥ 3 months as a subscription", () => {
    const rows = [sub(3), sub(4), sub(5, -49.5)];
    expect(detectRecurringMerchants(rows).has("zq tools")).toBe(true);
    const { decided } = categoriseRows(rows);
    expect(decided).toHaveLength(3);
    expect(decided[0]).toMatchObject({ category: "software_subscriptions", source: "rule", confidence: RECURRING_CONFIDENCE, needsReview: false });
  });

  it("needs three distinct months, not three lines", () => {
    const rows = [sub(3), tx("x", "ZQ TOOLS PTY", -49, "2026-03-10"), tx("y", "ZQ TOOLS PTY", -49, "2026-03-20")];
    expect(detectRecurringMerchants(rows).size).toBe(0);
  });

  it("ignores varying amounts, large amounts and money in", () => {
    expect(detectRecurringMerchants([sub(3, -40), sub(4, -60), sub(5, -49)]).size).toBe(0);
    expect(detectRecurringMerchants([sub(3, -2500), sub(4, -2500), sub(5, -2500)]).size).toBe(0);
    expect(detectRecurringMerchants([sub(3, 49), sub(4, 49), sub(5, 49)]).size).toBe(0);
  });
});

describe("AI prompt + parsing", () => {
  it("system prompt lists every category key once", () => {
    const sys = aiSystemPrompt();
    for (const k of CATEGORY_KEYS) expect(sys).toContain(`- ${k}:`);
  });

  it("user prompt is a compact JSON array indexed by position", () => {
    const parsed = JSON.parse(aiUserPrompt([tx("a", "AWS", -1, "2026-06-01"), tx("b", "X", 2, "2026-06-02")]));
    expect(parsed).toEqual([
      { i: 0, date: "2026-06-01", amount: -1, description: "AWS" },
      { i: 1, date: "2026-06-02", amount: 2, description: "X" },
    ]);
  });

  it("parseAiAnswers tolerates a code fence and a leading sentence, drops junk elements", () => {
    const raw = 'Sure:\n```json\n[{"i":0,"category":"cloud_hosting","confidence":0.9},{"nope":1},{"i":"1","category":"Travel ","confidence":"0.7"}]\n```';
    expect(parseAiAnswers(raw)).toEqual([
      { i: 0, category: "cloud_hosting", confidence: 0.9, counterparty: null },
      { i: 1, category: "travel", confidence: 0.7, counterparty: null },
    ]);
    expect(parseAiAnswers("no json here")).toBeNull();
    expect(parseAiAnswers('{"i":0}')).toBeNull();
  });
});

describe("acceptAiAnswer", () => {
  const row = tx("a", "PAYMENT 123", -80);

  it("accepts an enum category at confidence ≥ 0.5", () => {
    const d = acceptAiAnswer(row, { i: 0, category: "contractors", confidence: MIN_AI_CONFIDENCE, counterparty: "Jane" });
    expect(d).toMatchObject({ category: "contractors", source: "ai", confidence: 0.5, needsReview: false, gstTreatment: "gst" });
    // the deterministic merchant key is kept, not the model's free text
    expect(d.counterparty).toBe(merchantKey(row.description));
  });

  it("rejects a key outside the enum → other + review", () => {
    expect(acceptAiAnswer(row, { i: 0, category: "office_snacks", confidence: 0.95, counterparty: null })).toMatchObject({ category: "other", needsReview: true, source: "ai" });
  });

  it("rejects confidence < 0.5, > 1 or NaN → other + review", () => {
    expect(acceptAiAnswer(row, { i: 0, category: "travel", confidence: 0.49, counterparty: null })).toMatchObject({ category: "other", needsReview: true });
    expect(acceptAiAnswer(row, { i: 0, category: "travel", confidence: 1.2, counterparty: null })).toMatchObject({ category: "other", needsReview: true });
    expect(acceptAiAnswer(row, { i: 0, category: "travel", confidence: Number.NaN, counterparty: null })).toMatchObject({ category: "other", needsReview: true });
  });

  it("rejects an income category on money out", () => {
    expect(acceptAiAnswer(row, { i: 0, category: "revenue", confidence: 0.9, counterparty: null })).toMatchObject({ category: "other", needsReview: true });
    expect(acceptAiAnswer(tx("b", "X", 80), { i: 0, category: "revenue", confidence: 0.9, counterparty: null })).toMatchObject({ category: "revenue", needsReview: false });
  });

  it("a missing answer is other + review", () => {
    expect(acceptAiAnswer(row, undefined)).toMatchObject({ category: "other", needsReview: true, confidence: 0 });
  });

  it("lane-1 F5: high-stakes categories (salaries_wages, bank_fees, owner_drawings, transfer) need confidence ≥ 0.7", () => {
    expect(MIN_AI_CONFIDENCE_HIGH_STAKES).toBe(0.7);
    for (const cat of ["salaries_wages", "bank_fees", "owner_drawings", "transfer"]) {
      expect(acceptAiAnswer(row, { i: 0, category: cat, confidence: 0.69, counterparty: null })).toMatchObject({ category: "other", needsReview: true, confidence: 0.69 });
    }
    expect(acceptAiAnswer(row, { i: 0, category: "salaries_wages", confidence: 0.7, counterparty: null })).toMatchObject({ category: "salaries_wages", needsReview: false });
    expect(acceptAiAnswer(row, { i: 0, category: "transfer", confidence: 0.9, counterparty: null })).toMatchObject({ category: "transfer", needsReview: false });
    // An ordinary category still accepts at 0.5.
    expect(acceptAiAnswer(row, { i: 0, category: "software_subscriptions", confidence: 0.55, counterparty: null })).toMatchObject({ category: "software_subscriptions", needsReview: false });
  });

  it("lane-1 F5: bank_fees above A$500 without a fee keyword is refused (the −A$2,200 consulting invoice); small or keyworded fees pass", () => {
    expect(BANK_FEE_MAX_AUD_WITHOUT_KEYWORD).toBe(500);
    const inv = tx("c", "BLRGH CONSULTING INV 1002", -2200);
    expect(acceptAiAnswer(inv, { i: 0, category: "bank_fees", confidence: 0.8, counterparty: null })).toMatchObject({ category: "other", needsReview: true, gstTreatment: "unknown" });
    expect(acceptAiAnswer(tx("d", "PAYMENT 55 ZQ", -12.5), { i: 0, category: "bank_fees", confidence: 0.8, counterparty: null })).toMatchObject({ category: "bank_fees", needsReview: false });
    expect(acceptAiAnswer(tx("e", "MERCHANT SERVICE FEE JUNE", -640), { i: 0, category: "bank_fees", confidence: 0.8, counterparty: null })).toMatchObject({ category: "bank_fees", needsReview: false });
  });
});

describe("categoriseWithAi — batching", () => {
  it("splits into batches of ≤ 40 and maps answers by index", async () => {
    const rows = Array.from({ length: 95 }, (_, i) => tx(`r${i}`, `MERCHANT ${i}`, -10));
    const calls: number[] = [];
    const ai = vi.fn(async ({ user }: { system: string; user: string }) => {
      const batch = JSON.parse(user) as Array<{ i: number }>;
      calls.push(batch.length);
      return { text: JSON.stringify(batch.map((b) => ({ i: b.i, category: "contractors", confidence: 0.8 }))) };
    });
    const res = await categoriseWithAi(rows, { ai });
    expect(calls).toEqual([MAX_AI_BATCH, MAX_AI_BATCH, 15]);
    expect(res.batches).toBe(3);
    expect(res.failedBatches).toBe(0);
    expect(res.decisions).toHaveLength(95);
    expect(res.decisions.every((d) => d.category === "contractors" && d.source === "ai")).toBe(true);
  });

  it("a throwing or unparseable batch never throws — its rows stay UNDECIDED (source null, review) and are counted in failedRows", async () => {
    const rows = [tx("a", "X", -1), tx("b", "Y", -2)];
    const ai = vi.fn(async () => {
      throw new Error("model down");
    });
    const res = await categoriseWithAi(rows, { ai });
    expect(res.failedBatches).toBe(1);
    expect(res.failedRows).toBe(2);
    expect(res.decisions.map((d) => d.needsReview)).toEqual([true, true]);
    // S29-hardening: the model never looked at them — not "ai" decisions.
    expect(res.decisions.map((d) => d.source)).toEqual([null, null]);
  });

  it("S29-hardening: a partial failure keeps the answered batches' decisions and leaves only the failed batch undecided", async () => {
    const rows = Array.from({ length: 95 }, (_, i) => tx(`r${i}`, `MERCHANT ${i}`, -10));
    let call = 0;
    const ai = vi.fn(async ({ user }: { system: string; user: string }) => {
      call++;
      if (call === 2) return { text: "I cannot help with that." };
      const batch = JSON.parse(user) as Array<{ i: number }>;
      return { text: JSON.stringify(batch.map((b) => ({ i: b.i, category: "contractors", confidence: 0.8 }))) };
    });
    const res = await categoriseWithAi(rows, { ai });
    expect(res).toMatchObject({ batches: 3, failedBatches: 1, failedRows: MAX_AI_BATCH });
    expect(res.decisions).toHaveLength(95);
    const undecidedIds = res.decisions.filter((d) => d.source === null).map((d) => d.id);
    expect(undecidedIds).toEqual(rows.slice(MAX_AI_BATCH, 2 * MAX_AI_BATCH).map((r) => r.id));
    expect(res.decisions.filter((d) => d.source === "ai")).toHaveLength(55);
  });
});

describe("categoriseBatch", () => {
  it("runs rules first and only sends the remainder to the model", async () => {
    const rows = [tx("a", "AWS", -100), tx("b", "PAYMENT 88213", -80)];
    const ai = vi.fn(async () => ({ text: '[{"i":0,"category":"contractors","confidence":0.7}]' }));
    const res = await categoriseBatch(rows, { ai });
    expect(ai).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ai.mock.calls[0][0].user)).toHaveLength(1);
    expect(res.ruleCount).toBe(1);
    expect(res.aiCount).toBe(1);
    expect(res.decisions.find((d) => d.id === "b")).toMatchObject({ category: "contractors", source: "ai" });
  });

  it("without an ai function the remainder stays undecided (source null, review)", async () => {
    const res = await categoriseBatch([tx("b", "PAYMENT 88213", -80)]);
    expect(res.decisions[0]).toMatchObject({ category: "other", source: null, needsReview: true });
  });
});
