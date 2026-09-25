// Colocated vitest for the free-allowance panels and copy (G25-C).
//
// The e-mail ask is the only new thing put in front of a founder's first
// run, so the tests are about honesty and compliance: the address is asked
// for ONE stated purpose (the report), the sender is named, the unsubscribe
// promise is there, the approved data-principle sentence is verbatim, the
// honeypot is invisible, and the pay panel shows the price BEFORE any
// checkout exists and never invents one for a typed idea.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FreeReportEmailPanel, localEmailError } from "./free-report-email-panel";
import { FreeReportPayPanel } from "./free-report-pay-panel";
import { fillFreeReportLine, guestInputTypeForSubmission } from "./analyze-root";
import { freeReportCopy, fillStatusLine } from "@/lib/reports/free-report-copy";
import { getMessagesSync } from "@/lib/i18n/t";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { FREE_REPORT_HONEYPOT_FIELD } from "@/lib/reports/free-grants-rules";

const EN = freeReportCopy(getMessagesSync("en"), "en");
const VI = freeReportCopy(getMessagesSync("vi"), "vi");

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("freeReportCopy — EN / VI from the catalogue", () => {
  it("fills the constants: two reports, the A$3 label from the SKU, the per-network limit", () => {
    expect(EN.email.body).toContain("first 2 business reports");
    expect(EN.pay.heading).toBe("Your two free reports are used");
    expect(EN.pay.body).toContain("A$3 inc. GST");
    expect(EN.ipLimit).toContain("Up to 3 free reports");
    expect(VI.email.body).toContain("2 báo cáo");
    expect(VI.pay.body).toContain("A$3 inc. GST");
    expect(VI.ipLimit).toContain("Tối đa 3");
  });

  it("carries the approved data-principle sentence verbatim (EN = the constant) and the Spam Act lines", () => {
    expect(EN.email.principle).toBe(DATA_PRINCIPLE_SENTENCE);
    expect(VI.email.principle).toBe(getMessagesSync("vi")["solutions.principle.data"]);
    for (const c of [EN, VI]) {
      expect(c.email.consent).toMatch(/Auschain/);
      expect(c.email.consent.length).toBeGreaterThan(40);
    }
    expect(EN.email.consent).toMatch(/unsubscribe any time/i);
    expect(VI.email.consent).toMatch(/hủy đăng ký/i);
  });

  it("never states the price as a value anchor, never says PhD, never 'coming soon'", () => {
    const all = JSON.stringify([EN, VI]);
    expect(all).not.toMatch(/A\$3, not A\$3,000/);
    expect(all).not.toMatch(/PhD/);
    expect(all).not.toMatch(/coming soon/i);
    expect(all).not.toMatch(/sign[- ]?up required/i);
  });

  it("fillStatusLine fills the run's own tokens", () => {
    expect(fillStatusLine(EN.status.sending, { n: 1, email: "f***@example.com" })).toBe("Free report 1 of 2 · e-mailed to f***@example.com as a PDF the moment it is written.");
    expect(fillStatusLine(EN.status.queued, { email: "f***@example.com" })).toContain("f***@example.com");
    expect(fillFreeReportLine("{n} of {count} → {email}", { n: 2, count: 2, email: "x@y.z" })).toBe("2 of 2 → x@y.z");
    expect(fillFreeReportLine("{missing}", {})).toBe("{missing}");
  });
});

describe("FreeReportEmailPanel", () => {
  const base = { copy: EN.email, onContinue: () => {} };

  it("asks for the address with the consent + principle lines, the CTA from the messaging map, and an invisible honeypot", () => {
    const out = html(<FreeReportEmailPanel {...base} />);
    expect(out).toContain('data-testid="analyze-free-report-email"');
    expect(out).toContain('type="email"');
    expect(out).toContain("Get your score free");
    expect(out).toContain(DATA_PRINCIPLE_SENTENCE);
    expect(out).toMatch(/unsubscribe any time/i);
    expect(out).toContain(`name="${FREE_REPORT_HONEYPOT_FIELD}"`);
    expect(out).toContain('tabindex="-1"');
    expect(out).toContain("left-[-10000px]");
    expect(out).toContain('aria-hidden="true"');
    // no account, no card, no price on the ask
    expect(out).not.toMatch(/password|credit card|A\$/i);
  });

  it("G34-BT2 EM05: offers a separate, UNTICKED, optional marketing opt-in", () => {
    const out = html(<FreeReportEmailPanel {...base} />);
    const input = /<input[^>]*data-testid="analyze-free-report-marketing-consent"[^>]*>/.exec(out)?.[0] ?? "";
    expect(input).toContain('type="checkbox"');
    expect(input).not.toMatch(/checked/);
    expect(input).not.toMatch(/required/);
    expect(out).toContain("Email me occasional tips, product news and offers from BlockID.");
  });

  it("pre-fills a remembered address and shows the server's verdict", () => {
    const out = html(<FreeReportEmailPanel {...base} initialEmail="founder@example.com" serverError="disposable" />);
    expect(out).toContain('value="founder@example.com"');
    expect(out).toContain("A disposable inbox cannot receive the report");
    expect(out).toContain('aria-invalid="true"');
  });

  it("G28 UI lane: the error is a semantic danger token with an icon (never colour alone, never an undefined utility) and every control has the navy focus ring + a 44 px hit area", () => {
    const out = html(<FreeReportEmailPanel {...base} onEdit={() => {}} serverError="invalid" />);
    // `text-danger` is not a utility in this Tailwind config — it rendered as ink on production (2026-09-21).
    expect(out).not.toContain("text-danger");
    const error = out.slice(out.indexOf('data-testid="analyze-free-report-email-error"') - 200, out.indexOf("That does not look like an e-mail address"));
    expect(error).toContain("text-bear");
    expect(error).toContain("<svg");
    // input, submit and the edit button: FOCUS_RING (2 px navy) and min-h-11.
    for (const id of ["analyze-free-report-email-input", "analyze-free-report-email-submit", "analyze-free-report-email-edit"]) {
      const tagStart = out.lastIndexOf("<", out.indexOf(`data-testid="${id}"`));
      const tag = out.slice(tagStart, out.indexOf(">", tagStart));
      expect(tag, id).toContain("focus-visible:ring-2");
      expect(tag, id).toContain("focus-visible:ring-brand-navy");
      expect(tag, id).toContain("min-h-11");
    }
  });

  it("localEmailError mirrors the server's shape check", () => {
    expect(localEmailError("")).toBe("required");
    expect(localEmailError("  ")).toBe("required");
    expect(localEmailError("nope")).toBe("invalid");
    expect(localEmailError("Founder@Example.com")).toBeNull();
  });
});

describe("FreeReportPayPanel — the quote before the pay", () => {
  const quote = { sku: "sku_trust_report_5aud", amount_cents: 300, label: "A$3 inc. GST" };
  const base = { copy: EN.pay, quote, payHref: "/workspace/reports/business" };

  it("shows the price and says nothing was run or charged", () => {
    const out = html(<FreeReportPayPanel {...base} authenticated={false} guestSellable={false} />);
    expect(out).toContain('data-testid="analyze-free-report-pay"');
    expect(out).toContain('data-sku="sku_trust_report_5aud"');
    expect(out).toContain("A$3 inc. GST");
    expect(out).toContain("Nothing was run and nothing was charged");
  });

  it("AF03: signed-in without a usable credit quote → top up in a NEW tab, never the workspace (old) report", () => {
    const out = html(<FreeReportPayPanel {...base} authenticated guestSellable={false} onRecheck={() => {}} />);
    expect(out).toContain('href="/workspace/billing#credits"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('data-testid="analyze-free-report-recheck"');
    expect(out).not.toContain('href="/workspace/reports/business"');
  });

  it("guest with a deck / site → a button that opens the guest checkout; guest with a typed idea → create an account first", () => {
    const sellable = html(<FreeReportPayPanel {...base} authenticated={false} guestSellable onGuestCheckout={() => {}} />);
    expect(sellable).toContain('<button type="button"');
    expect(sellable).toContain("Get the Trusted Business Report");
    const idea = html(<FreeReportPayPanel {...base} authenticated={false} guestSellable={false} />);
    expect(idea).toContain("Create a free account to buy it");
    expect(idea).toContain("mode=register");
    expect(idea).toContain(encodeURIComponent("/workspace/reports/business"));
  });

  // 2026-09-25 — a signed-in founder past the free allowance runs THIS input
  // with credits instead of being sent to the workspace (old) report.
  it("signed-in with enough credits → a pay-with-credits button showing cost and balance, not the workspace link", () => {
    const credits = { feature: "trust_report", cost: 3, balance: 40, canAfford: true };
    const out = html(<FreeReportPayPanel {...base} authenticated guestSellable={false} credits={credits} onPayWithCredits={() => {}} />);
    expect(out).toContain('data-testid="analyze-free-report-credits-cta"');
    expect(out).toContain("Run this analysis — 3 credits");
    expect(out).toContain("your balance: 40");
    expect(out).not.toContain('data-testid="analyze-free-report-pay-cta"');
  });

  it("signed-in with a short balance → says so, offers the top-up (new tab) + re-check, never the old report", () => {
    const credits = { feature: "trust_report", cost: 3, balance: 1, canAfford: false };
    const out = html(<FreeReportPayPanel {...base} authenticated guestSellable={false} credits={credits} onRecheck={() => {}} />);
    expect(out).toContain('data-can-afford="0"');
    expect(out).toContain("your balance is 1");
    expect(out).not.toContain("analyze-free-report-credits-cta");
    expect(out).toContain('data-testid="analyze-free-report-topup-cta"');
    expect(out).not.toContain('href="/workspace/reports/business"');
  });

  it("a refused charge is announced and nothing was charged", () => {
    const credits = { feature: "trust_report", cost: 3, balance: 1, canAfford: false };
    const out = html(<FreeReportPayPanel {...base} authenticated guestSellable={false} credits={credits} creditsError />);
    expect(out).toContain('role="alert"');
    expect(out).toContain("Nothing was charged");
  });

  it("a guest never sees credits even if a quote leaks through", () => {
    const credits = { feature: "trust_report", cost: 3, balance: 40, canAfford: true };
    const out = html(<FreeReportPayPanel {...base} authenticated={false} guestSellable={false} credits={credits} onPayWithCredits={() => {}} />);
    expect(out).not.toContain("credits");
  });
});

describe("guestInputTypeForSubmission — the third run has no classified intake", () => {
  it("a file sells as pitch_file, a URL as website_url, a typed idea has no guest SKU", () => {
    const file = new File(["x"], "deck.pdf", { type: "application/pdf" });
    expect(guestInputTypeForSubmission({ variant: "deck", file } as never)).toBe("pitch_file");
    expect(guestInputTypeForSubmission({ variant: "url", url: "https://example.com" } as never)).toBe("website_url");
    expect(guestInputTypeForSubmission({ variant: "idea", text: "a marketplace" } as never)).toBeNull();
    expect(guestInputTypeForSubmission(null)).toBeNull();
  });
});
