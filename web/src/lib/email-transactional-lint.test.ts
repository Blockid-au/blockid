// G34-BT2 EM08 — CI lint for TRANSACTIONAL (T-class) e-mail templates.
//
// A transactional message (report ready / delivered, score updated, receipt,
// billing notice, sign-in / security, evaluation assigned) completes something
// the recipient asked for; it must not double as marketing (Spam Act 2003 s6,
// and the G34 email plan §9.1: T-class carries no price, plan or credit offer,
// no "upgrade" / "buy", no cross-sell link to /pricing or /workspace/billing).
// Promotional content belongs in a C-class flow, which passes consent + the
// global frequency cap.
//
// The lint is static: it takes each template's function body from the source
// and inlines every same-file helper it calls (transitively), so a promo
// hidden in a shared footer helper is still caught. Billing notices (payment
// failed, trial-charge warning, cancellation) may link /workspace/billing —
// that is where the recipient acts on the notice — but nothing else.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(SRC, rel), "utf8");
}

/** Top-level `[export] [async] function name(` blocks: name → body (up to the next top-level function). */
function functionBlocks(src: string): Map<string, string> {
  const re = /^(?:export )?(?:async )?function (\w+)\s*\(/gm;
  const starts: Array<{ name: string; at: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  const out = new Map<string, string>();
  starts.forEach((s, i) => out.set(s.name, src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : src.length)));
  return out;
}

/** The template body plus every same-file helper it reaches. */
function expanded(blocks: Map<string, string>, name: string, seen = new Set<string>()): string {
  if (seen.has(name)) return "";
  seen.add(name);
  const body = blocks.get(name) ?? "";
  let out = body;
  for (const call of body.matchAll(/\b(\w+)\s*\(/g)) {
    const callee = call[1];
    if (callee !== name && blocks.has(callee)) out += "\n" + expanded(blocks, callee, seen);
  }
  return out;
}

/** Drop comments so prose about the rule itself never trips it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

type Kind = "report" | "receipt" | "billing_notice" | "security" | "evaluation";

const TEMPLATES: Array<{ file: string; fn: string; kind: Kind }> = [
  // report ready / delivered / score updated
  { file: "lib/email.ts", fn: "sendScoreReady", kind: "report" },
  { file: "lib/email.ts", fn: "sendSVIReport", kind: "report" },
  { file: "lib/email.ts", fn: "sendWelcomeWithReport", kind: "report" },
  { file: "lib/email.ts", fn: "sendReportDelivery", kind: "report" },
  // The paid A$3 guest report is the deliverable AND its tax invoice.
  { file: "lib/email.ts", fn: "sendGuestReport", kind: "receipt" },
  { file: "lib/email.ts", fn: "sendFreeSummary", kind: "report" },
  { file: "lib/email.ts", fn: "sendFirstAnalysisReportEmail", kind: "report" },
  // receipts
  { file: "lib/email.ts", fn: "sendAnalysisPurchaseConfirmation", kind: "receipt" },
  { file: "lib/email.ts", fn: "sendCreditPurchaseConfirmation", kind: "receipt" },
  { file: "lib/email.ts", fn: "sendPaymentConfirmation", kind: "receipt" },
  { file: "lib/email.ts", fn: "sendPaymentReceipt", kind: "receipt" },
  // billing notices (may point at /workspace/billing to act on them)
  { file: "lib/email.ts", fn: "sendPaymentFailed", kind: "billing_notice" },
  { file: "lib/email.ts", fn: "sendTrialChargeWarning", kind: "billing_notice" },
  { file: "lib/email.ts", fn: "sendSubscriptionCancelled", kind: "billing_notice" },
  { file: "lib/email.ts", fn: "sendCancellationEmail", kind: "billing_notice" },
  // security / sign-in
  { file: "lib/email.ts", fn: "sendMagicLink", kind: "security" },
  { file: "lib/email.ts", fn: "sendPasswordReset", kind: "security" },
  { file: "lib/email.ts", fn: "sendExistingAccountNotice", kind: "security" },
  // evaluation assigned (founder invited by an evaluator)
  { file: "lib/evaluations.ts", fn: "buildFounderInviteEmail", kind: "evaluation" },
];

const RULES: Array<{ id: string; re: RegExp; allow?: Kind[] }> = [
  { id: "cross-sell link to /pricing", re: /\/#?pricing\b/ },
  { id: "one-click report offer", re: /\/one-click-report\b/ },
  { id: "credit-priced CTA", re: /\(\s*\d+(\.\d+)?\s+credits?\s*\)/i },
  // A literal selling price ("A$3.00 inc. GST", "A$29/mo") is an offer everywhere
  // but a receipt / billing notice (whose amount is the transaction itself).
  // Valuation figures ("A$5M+") are report content, not prices.
  {
    id: "price offer",
    re: /A\$\s?\d+(?:\.\d{2})?\s*(?:inc\.?\s*GST|\/mo\b|\/month|per month|one payment)/i,
    allow: ["receipt", "billing_notice"],
  },
  { id: "cross-sell link to /workspace/billing", re: /\/workspace\/billing\b/, allow: ["billing_notice"] },
  { id: '"upgrade"', re: /\bupgrad(e|es|ed|ing)\b/i },
  { id: '"buy"', re: /\bbuy(ing)?\b/i },
  { id: "credit-pack offer", re: /\bcreditPackRowsHtml\s*\(|\bCREDIT_PACKS\b|\bpackPriceLabel\s*\(|\bsviAnalysisFromPriceLabel\s*\(/ },
  { id: "plan price offer", re: /\bplanMonthlyLabel\s*\(|\bplanV2\s*\(|\bPLANS_V2\b/ },
  { id: "promo wording", re: /\bfree trial\b|\d+\s*%\s*off\b|\bdiscount\b|\bspecial offer\b|\blimited[- ]time\b/i },
];

function violations(file: string, fn: string, kind: Kind): string[] {
  const blocks = functionBlocks(read(file));
  expect(blocks.has(fn), `${file}#${fn} exists`).toBe(true);
  const body = stripComments(expanded(blocks, fn));
  return RULES.filter((r) => !(r.allow ?? []).includes(kind) && r.re.test(body)).map((r) => r.id);
}

describe("EM08 — transactional templates carry no promotion", () => {
  it.each(TEMPLATES.map((t) => [`${t.file}#${t.fn}`, t] as const))("%s", (_label, t) => {
    expect(violations(t.file, t.fn, t.kind)).toEqual([]);
  });

  it("the lint catches a promo, including one hidden in a helper", () => {
    const src = `
export async function sendReceipt(a) { return sendEmail({ html: shellX(a) }); }
function shellX(a) { return "<a href='https://blockid.au/pricing'>Upgrade now</a>"; }
`;
    const blocks = functionBlocks(src);
    const body = expanded(blocks, "sendReceipt");
    const hit = RULES.filter((r) => r.re.test(body)).map((r) => r.id);
    expect(hit).toEqual(expect.arrayContaining(["cross-sell link to /pricing", '"upgrade"']));
  });

  it("flags a selling price but not a valuation figure", () => {
    const price = RULES.find((r) => r.id === "price offer")!.re;
    expect(price.test("Get the full report — A$3.00 inc. GST, one payment")).toBe(true);
    expect(price.test("Starter A$29/mo")).toBe(true);
    expect(price.test('estVal = "A$5M+"')).toBe(false);
  });
});
