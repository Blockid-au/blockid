// /checkout/review — G25-D review-before-pay page (EN + VI mirror).
//
// Pins: the summary renders plan / included / price inc. GST + GST share /
// interval / trial / renewal / seller / data principle from the catalogue;
// the ONE primary control is a Pay / Add-card BUTTON when signed in and a
// sign-up / sign-in LINK (with next=) when signed out — never a Stripe URL;
// an unknown plan / pack / sku → 404; annual on a rung without an annual
// price falls back to monthly and says so; VI strings on /vi.
import { beforeEach, describe, expect, it, vi } from "vitest";

const userState: { user: { id: string; email: string } | null } = { user: null };
const annualState: { ids: string[] } = { ids: [] };

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => userState.user }));
vi.mock("@/lib/plans/annual-available", () => ({ annualAvailablePlanIds: async () => annualState.ids }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/components/landing/nav-v2", () => ({ NavV2: () => null }));
vi.mock("@/components/marketing/footer", () => ({ Footer: () => null }));

import { renderPage, dataAttr } from "@/test/founder-page-harness";
import { PLANS_V2 } from "@/lib/plans-v2";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { TRIAL_WARNING_HOURS_BEFORE } from "@/lib/plans/trial-copy";
import { LEGAL_ENTITY, LEGAL_ENTITY_ABN_LABEL } from "@/lib/site/legal-entity";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import EnPage from "./page";
import ViPage from "../../vi/checkout/review/page";

type SP = Record<string, string | string[] | undefined>;
const en = (sp: SP) => renderPage(EnPage({ searchParams: Promise.resolve(sp) }));
const vi_ = (sp: SP) => renderPage(ViPage({ searchParams: Promise.resolve(sp) }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** href of the `<a>` carrying `data-testid="<id>"` (Next's <Link> writes href last). */
const hrefOf = (html: string, id: string): string | undefined => {
  const tag = html.match(new RegExp(`<a [^>]*data-testid="${id}"[^>]*>`))?.[0];
  return tag ? /href="([^"]+)"/.exec(tag)?.[1]?.replace(/&amp;/g, "&") : undefined;
};

beforeEach(() => {
  userState.user = null;
  annualState.ids = [];
});

describe("/checkout/review — signed out", () => {
  it("Starter monthly trial: summary from the catalogue, GST share, trial + renewal lines, seller + data principle; primary = sign-up LINK with next=", async () => {
    const html = await en({ plan: "founder_starter", trial: "1", entry: "pricing_card" });
    const t = text(html);
    expect(dataAttr(html, "order-id")).toBe("founder_starter");
    expect(dataAttr(html, "signed-in")).toBe("0");
    expect(dataAttr(html, "trial-days")).toBe("7");
    expect(t).toContain("Review your order");
    expect(t).toContain("Starter");
    expect(t).toContain("A$29 inc. GST");
    // 2900 / 11 = 263.6 → A$2.64 GST
    expect(t).toContain("includes A$2.64 GST");
    expect(t).toContain("Monthly — A$29 every month");
    expect(t).toContain("7-day free trial · card required · you can cancel before day 7 and pay nothing · then A$29 per month");
    expect(t).toContain(`We e-mail you ${TRIAL_WARNING_HOURS_BEFORE} hours before a trial converts`);
    expect(t).toContain("Stripe Billing Portal");
    expect(t).toContain(`Sold by ${LEGAL_ENTITY.operator} (${LEGAL_ENTITY_ABN_LABEL})`);
    expect(t).toContain(DATA_PRINCIPLE_SENTENCE);
    for (const f of PLANS_V2.find((p) => p.id === "founder_starter")!.features) expect(t).toContain(f);
    // No Pay button, no Stripe: a link to sign-up carrying next= back here.
    expect(html).not.toContain('data-testid="checkout-review-pay"');
    expect(html).not.toContain("stripe.com");
    const href = hrefOf(html, "checkout-review-continue");
    expect(href).toBe(`/signup?plan=founder_starter&trial=1&next=${encodeURIComponent("/checkout/review?plan=founder_starter&trial=1&entry=pricing_card")}`);
    expect(t).toContain("Continue to sign-up");
    expect(t).toContain("Back to pricing");
  });

  it("annual on a rung without an annual price → monthly figure + the fallback note (never A$290)", async () => {
    const html = await en({ plan: "founder_starter", trial: "1", interval: "annual" });
    const t = text(html);
    expect(dataAttr(html, "interval")).toBe("monthly");
    expect(html).toContain('data-testid="annual-fallback-note"');
    expect(t).toContain("Annual billing is not available for Starter yet");
    expect(t).not.toContain("A$290");
  });

  it("Scout annual when provisioned: A$790 every year, 'per year' in the trial line, evaluator sign-up with segment", async () => {
    annualState.ids = ["investor_angel"];
    const html = await en({ plan: "investor_angel", trial: "1", interval: "annual", entry: "pricing_card" });
    const t = text(html);
    expect(dataAttr(html, "interval")).toBe("annual");
    expect(t).toContain("Scout");
    expect(t).toContain("A$790 inc. GST");
    expect(t).toContain("Annual — A$790 every year");
    expect(t).toContain("then A$790 per year");
    const href = hrefOf(html, "checkout-review-continue");
    expect(href).toMatch(/^\/signup\?segment=evaluator&plan=investor_angel&trial=1&next=/);
    expect(href).toMatch(/&interval=annual$/);
  });

  it("credit pack signed out: one-off lines, no trial, 'Sign in to continue' → /auth/login?next=", async () => {
    const pack = CREDIT_PACKS.find((p) => p.credits === 10)!;
    const html = await en({ pack: "10", entry: "credits" });
    const t = text(html);
    expect(dataAttr(html, "order-kind")).toBe("pack");
    expect(t).toContain(pack.label);
    expect(t).toContain("A$9 inc. GST");
    expect(t).toContain("One-off — charged once, no subscription");
    expect(t).toContain("No trial on this item");
    expect(t).toContain("Australian Consumer Law");
    expect(t).toContain("Sign in to continue");
    const href = hrefOf(html, "checkout-review-continue");
    expect(href).toBe(`/auth/login?next=${encodeURIComponent("/checkout/review?pack=10&entry=credits")}`);
    expect(t).toContain("Back to Billing");
  });

  it("unknown plan, unknown pack, unknown sku, Free rung and no params → 404", async () => {
    await expect(en({ plan: "no_such_plan" })).rejects.toThrow("NOT_FOUND");
    await expect(en({ pack: "7" })).rejects.toThrow("NOT_FOUND");
    await expect(en({ sku: "cohort_pilot_25" })).rejects.toThrow("NOT_FOUND");
    await expect(en({ plan: "founder_free" })).rejects.toThrow("NOT_FOUND");
    await expect(en({})).rejects.toThrow("NOT_FOUND");
  });

  it("custom-priced rung: contact link, no price, no Pay", async () => {
    const html = await en({ plan: "founder_enterprise" });
    const t = text(html);
    expect(html).toContain('data-testid="checkout-review-contact"');
    expect(html).toContain('href="/contact?plan=founder_enterprise"');
    expect(html).not.toContain('data-testid="checkout-review-pay"');
    expect(t).toContain("Talk to sales");
    expect(t).not.toContain("inc. GST");
  });
});

describe("/checkout/review — signed in", () => {
  beforeEach(() => {
    userState.user = { id: "u-1", email: "founder@example.com" };
  });

  it("trial plan: the ONE primary control is a BUTTON 'Add card & start 7-day free trial' that posts to /api/stripe/checkout — no Stripe URL in the markup", async () => {
    const html = await en({ plan: "founder_growth", trial: "1", entry: "billing" });
    const t = text(html);
    expect(dataAttr(html, "signed-in")).toBe("1");
    expect(html).toContain('data-testid="checkout-review-pay"');
    expect(html).toContain('data-post-path="/api/stripe/checkout"');
    expect(html).not.toContain('data-testid="checkout-review-continue"');
    expect(t).toContain("Add card & start 7-day free trial");
    expect(t).toContain("A$69 inc. GST");
    expect(html).not.toContain("stripe.com");
    expect((html.match(/data-testid="checkout-review-pay"/g) ?? []).length).toBe(1);
  });

  it("Startup Package: 'Pay A$149 now', one-off, included list; Index API: 'Pay A$299 now' → /api/svi-api/checkout", async () => {
    const pkg = text(await en({ sku: "founder_package", entry: "startup_package" }));
    expect(pkg).toContain("Startup Package");
    expect(pkg).toContain("Pay A$149 now");
    expect(pkg).toContain("A$149 inc. GST");
    expect(pkg).toContain("25 credits included");
    expect(pkg).toContain("Back to the Startup Package");
    const api = await en({ sku: "svi_api_team", entry: "svi_api" });
    expect(text(api)).toContain("Pay A$299 now");
    expect(api).toContain('data-post-path="/api/svi-api/checkout"');
    expect(text(api)).toContain("Monthly — A$299 every month");
    expect(text(api)).toContain("No trial on this item");
  });

  it("Programs rung with the 14-day trial: the button and the trial line read 14", async () => {
    annualState.ids = ["accelerator_intake"];
    const t = text(await en({ plan: "accelerator_intake", trial: "1", interval: "annual" }));
    expect(t).toContain("Add card & start 14-day free trial");
    expect(t).toContain("14-day free trial · card required · you can cancel before day 14 and pay nothing · then A$2,490 per year");
  });
});

describe("/vi/checkout/review — the mirror", () => {
  it("renders the VI catalogue strings for the same order and links the VI pricing page", async () => {
    userState.user = { id: "u-1", email: "founder@example.com" };
    const html = await vi_({ plan: "investor_angel", trial: "1", entry: "pricing_card" });
    const t = text(html);
    expect(t).toContain("Xem lại đơn hàng");
    expect(t).toContain("Thêm thẻ & bắt đầu dùng thử 7 ngày");
    expect(t).toContain("A$79 inc. GST");
    expect(t).toContain("Dùng thử miễn phí 7 ngày · cần thẻ");
    expect(t).toContain("Quay lại bảng giá");
    expect(html).toContain('href="/vi/pricing?segment=evaluator"');
    expect(t).not.toContain("Review your order");
  });

  it("signed out on /vi: the sign-up link carries the VI review as next=", async () => {
    const html = await vi_({ pack: "5", entry: "gate" });
    const href = hrefOf(html, "checkout-review-continue");
    expect(href).toBe(`/auth/login?next=${encodeURIComponent("/vi/checkout/review?pack=5&entry=gate")}`);
  });
});
