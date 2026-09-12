// Spam Act 2003 (Cth) coverage walk — QA-3 commercial audit P1-6 (2026-09-12).
//
// s17 (sender identification) and s18 (functional unsubscribe) apply to
// every commercial electronic message. This test walks the source of every
// module that sends or renders customer email and asserts, per sender
// function, that the template reaches the identity line ("Auschain PTY LTD ·
// ABN 79 659 615 111 · Sydney NSW") AND an unsubscribe URL that also lands
// in the `List-Unsubscribe` header (`sendEmail({ unsubscribeUrl })`).
//
// It is a static walk on purpose: the senders live across lib/, app/api/cron
// and app/api/* routes with very different runtime harnesses, and the
// failure we want to catch is "someone added a sender and forgot the
// footer" — visible in source, cheap to check, impossible to skip.
//
// Runtime rendering is pinned separately: `email.test.ts` (unsubFooter output)
// and `digest/email-template.test.ts` (digest footer).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");

/** Top-level function blocks: `[export] [async] function name(` … next such. */
function functionBlocks(src: string): Array<{ name: string; body: string }> {
  const re = /^(?:export )?(?:async )?function (\w+)\s*\(/gm;
  const marks: Array<{ name: string; start: number }> = [];
  for (const m of src.matchAll(re)) marks.push({ name: m[1]!, start: m.index! });
  return marks.map((m, i) => ({
    name: m.name,
    body: src.slice(m.start, marks[i + 1]?.start ?? src.length),
  }));
}

const IDENTITY_MARKERS = [
  "unsubFooter(",          // lib/email.ts — carries SENDER_IDENTITY_HTML
  "complianceFooter(",     // lib/email.ts helper for senders in other modules
  "footerHtml",            // rendered complianceFooter output threaded into a template
  "Auschain PTY LTD",      // inline identity (email-drip footer, email-enhanced)
  "DIGEST_SENDER_IDENTITY",
  "footer(",               // email-drip.ts footer(email, …)
];
const UNSUB_MARKERS = ["unsubscribeUrl", "prepareUnsubscribe(", "complianceFooter(", "footer("];

const hasIdentity = (body: string): boolean =>
  IDENTITY_MARKERS.some((m) => body.includes(m)) ||
  // Inline identity written by hand (guest report / recovery / free summary):
  // "Auschain Pty Ltd trading as BlockID.au · ACN … · ABN 79 659 615 111".
  (/auschain/i.test(body) && body.includes("659 615 111"));
const hasUnsub = (body: string): boolean => UNSUB_MARKERS.some((m) => body.includes(m));

/** The argument text of every `sendEmail(` call (balanced parentheses). */
function sendEmailCalls(src: string): string[] {
  const out: string[] = [];
  let idx = src.indexOf("sendEmail(");
  while (idx !== -1) {
    let depth = 0;
    let i = idx + "sendEmail".length;
    for (; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(idx + "sendEmail(".length, i));
    idx = src.indexOf("sendEmail(", i);
  }
  return out;
}

// Transactional messages that are not "commercial electronic messages"
// under s6 of the Act (they complete a transaction the recipient initiated
// or secure the account) and deliberately carry no marketing footer. Each
// entry states the reason so the allow-list cannot grow silently.
const TRANSACTIONAL_ALLOWLIST: Record<string, string> = {
  "lib/email.ts#sendEmail": "core transport — the footer is the caller's responsibility",
  "lib/email.ts#sendPasswordReset":
    "credential reset the user requested; carries a temporary password and no commercial content, must never be suppressible by an unsubscribe",
  "lib/email.ts#sendFarewellEmail":
    "confirmation of the recipient's own unsubscribe; carries a re-subscribe link, sending a further unsubscribe link would be circular",
};

describe("Spam Act s17/s18 — lib/email.ts senders", () => {
  const src = read("lib/email.ts");
  const senders = functionBlocks(src).filter(
    (b) => /^export async function send/.test(b.body) && b.body.includes("sendEmail("),
  );

  it("finds the sender roster (guards the walk itself)", () => {
    expect(senders.length).toBeGreaterThan(40);
  });

  it("unsubFooter() carries the sender identity line and the reason for receipt", () => {
    const footer = functionBlocks(src).find((b) => b.name === "unsubFooter")!.body;
    expect(footer).toContain("SENDER_IDENTITY_HTML");
    expect(src).toContain('SENDER_IDENTITY_HTML =\n  "Auschain PTY LTD &middot; ABN 79 659 615 111 &middot; Sydney NSW"');
    expect(footer).toContain("You're receiving this because you have a BlockID account.");
    expect(footer).toContain("${unsubUrl}");
    expect(footer).toContain("${prefsUrl}");
  });

  it.each(senders.map((b) => [b.name, b] as const))(
    "%s renders the identity footer and passes unsubscribeUrl to sendEmail",
    (name, block) => {
      const key = `lib/email.ts#${name}`;
      if (TRANSACTIONAL_ALLOWLIST[key]) {
        expect(TRANSACTIONAL_ALLOWLIST[key].length).toBeGreaterThan(20);
        return;
      }
      // Legacy aliases delegate to a real sender — they inherit its footer.
      if (/^\s*\/\/ Legacy alias/m.test(block.body) && /return send\w+\(args\);/.test(block.body)) return;
      expect(hasIdentity(block.body), `${name}: identity line`).toBe(true);
      expect(hasUnsub(block.body), `${name}: unsubscribe`).toBe(true);
      expect(block.body, `${name}: List-Unsubscribe header`).toMatch(/unsubscribeUrl[,\s}]/);
    },
  );

  it("every entry in the transactional allow-list still exists (no stale exemptions)", () => {
    const names = new Set(functionBlocks(src).map((b) => b.name));
    for (const key of Object.keys(TRANSACTIONAL_ALLOWLIST)) {
      const [, fn] = key.split("#");
      expect(names.has(fn!), key).toBe(true);
    }
  });
});

describe("Spam Act s17/s18 — email-enhanced.ts", () => {
  it("sendEnhancedReport identifies Auschain and stamps List-Unsubscribe", () => {
    const src = read("lib/email-enhanced.ts");
    expect(src).toContain("Auschain PTY LTD");
    const block = functionBlocks(src).find((b) => b.name === "sendEnhancedReport")!.body;
    expect(block).toContain("sendEmail(");
    expect(sendEmailCalls(block).every((c) => c.includes("unsubscribeUrl"))).toBe(true);
  });
});

describe("Spam Act s17/s18 — email-drip.ts rendered copy", () => {
  const src = read("lib/email-drip.ts");
  const copies = functionBlocks(src).filter((b) => /Copy$/.test(b.name));

  it("finds the drip copy roster", () => {
    expect(copies.length).toBeGreaterThanOrEqual(8);
  });

  it("footer() carries the ABN identity line and an unsubscribe link", () => {
    const footer = functionBlocks(src).find((b) => b.name === "footer")!.body;
    expect(footer).toContain("Auschain PTY LTD &middot; ACN 659 615 111 &middot; ABN 79 659 615 111");
    expect(footer).toContain("Unsubscribe");
    expect(footer).toContain("unsubscribeUrl(email");
  });

  it.each(copies.map((b) => [b.name, b] as const))("%s renders footer() + footerText()", (_name, block) => {
    // radarT30/T14/T3 and radarSetup* delegate to radarCopy(), which renders
    // the footer once for all of them.
    const delegate = /return (radarCopy|radarSetupShell)\(/.exec(block.body)?.[1];
    if (delegate) {
      const shared = functionBlocks(src).find((b) => b.name === delegate)!.body;
      expect(shared, `${delegate} footer`).toContain("footer(");
      expect(shared, `${delegate} footerText`).toContain("footerText(");
      return;
    }
    expect(block.body).toContain("footer(");
    expect(block.body).toContain("footerText(");
  });
});

describe("Spam Act s17/s18 — senders outside lib/email.ts", () => {
  const SENDERS: Array<{ file: string; fn: string }> = [
    { file: "lib/svi/email-report.ts", fn: "sendReportEmail" },
    { file: "lib/funding/reports.ts", fn: "sendFundingReportReadyEmail" },
    { file: "lib/funding/reports.ts", fn: "handleFundingReportCompleted" },
    { file: "lib/evaluations.ts", fn: "createEvaluation" },
    { file: "app/api/cron/trial-end-reminder/route.ts", fn: "GET" },
    { file: "app/api/pitchdeck/email-report/route.ts", fn: "POST_handler" },
    { file: "app/api/cron/founder-digest-weekly/route.ts", fn: "POST" },
  ];

  it.each(SENDERS.map((s) => [`${s.file}#${s.fn}`, s] as const))(
    "%s threads complianceFooter/prepareUnsubscribe into the template and sendEmail",
    (_label, s) => {
      const src = read(s.file);
      const block = functionBlocks(src).find((b) => b.name === s.fn);
      expect(block, `${s.file} has ${s.fn}`).toBeDefined();
      expect(block!.body).toContain("sendEmail(");
      expect(hasIdentity(block!.body) || block!.body.includes("prepareUnsubscribe("), "identity").toBe(true);
      expect(block!.body).toMatch(/unsubscribeUrl/);
    },
  );

  it("digest template renders the identity line and the unsubscribe / preferences links", () => {
    const src = read("lib/digest/email-template.ts");
    expect(src).toContain('DIGEST_SENDER_IDENTITY = "Auschain PTY LTD · ABN 79 659 615 111 · Sydney NSW"');
    expect(src).toContain("renderComplianceFooterHtml(footer)");
    expect(src).toContain("Unsubscribe: ${footer.unsubscribeUrl}");
  });

  it("no sendEmail() call site in the walked modules omits unsubscribeUrl", () => {
    for (const file of [
      "lib/svi/email-report.ts",
      "lib/funding/reports.ts",
      "lib/evaluations.ts",
      "app/api/cron/trial-end-reminder/route.ts",
      "app/api/pitchdeck/email-report/route.ts",
      "app/api/cron/founder-digest-weekly/route.ts",
    ]) {
      const src = read(file);
      const calls = sendEmailCalls(src);
      expect(calls.length, `${file} sends`).toBeGreaterThan(0);
      for (const args of calls) {
        expect(args, `${file}: ${args.slice(0, 80)}`).toContain("unsubscribeUrl");
      }
    }
  });
});
