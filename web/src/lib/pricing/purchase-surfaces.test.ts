// G20-F3 (2026-09-20) — buy-button ↔ SKU mapping.
//
// `stripe-map.test.ts` pins code == Stripe catalogue per SKU. This file pins
// the OTHER end: every buy surface a customer can click resolves to a plan /
// pack / SKU id that has a catalogue row, and the A$ figure that surface
// renders is that row's amount. A red test here means a button can show one
// amount and book another — treat it as a pricing incident.
//
// Surfaces covered (docs/plans/g20-ready-for-sale-2026-09-20.md § 3 F3):
//   1. /pricing matrix CTAs (founder / evaluator / programs ladders)
//   2. /signup?plan= allow-list + the signed-in redirect to the review step (G25-D)
//   3. /workspace/billing credit packs → POST /api/credits {amount}
//   4. Startup Package CTA → POST /api/stripe/checkout {plan:"founder_package"}
//   5. ReportPaywallGate → /api/reports/checkout (Trusted Business Report)
//   6. /funding paywall → /api/funding/checkout (Money Finder report)
//   7. /one-click-report → /api/guest-analysis/create-order (One-Click SKU)
// Static pins read the component source (no DOM) so a route rename or a
// hand-typed "A$3" fails here before it reaches production.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import { PricingMatrix, defaultIntervalForSegment } from "@/components/landing/pricing-matrix";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { TRUST_REPORT_RESCORE_CREDITS } from "@/lib/credits-public";
import { FOUNDER_RADAR_MONTHLY_AUD, FUNDING_REPORT_AUD, SCOUT_MONTHLY_AUD } from "@/lib/funding/radar-upsell";
import { PLANS_V2, formatAud, publicPlansForSegment, withGst } from "@/lib/plans-v2";
import { TIER_ANCHORS, pricingHrefForPlan } from "@/lib/entitlements/feature-requirement";
import { signedInSignupRedirect } from "@/lib/plans/signed-in-upgrade";
import { checkoutReviewHref, resolveCheckoutOrder } from "@/lib/billing/checkout-review";
import {
  EVALUATOR_TRIAL_PLAN_IDS,
  FOUNDER_TRIAL_PLAN_IDS,
  SIGNUP_ALLOWED_PLAN_IDS,
  isSelfServePlan,
} from "@/lib/plans/signup-plans";
import { STRIPE_PRICE_CATALOGUE, stripeMapRows } from "@/lib/pricing/stripe-map";
import { TRUST_REPORT_AMOUNT_CENTS, TRUST_REPORT_SKU_ID, trustReportPriceLabel } from "@/lib/pricing/trust-report-price";
import { FUNDING_REPORT_3AUD, ONE_CLICK_REPORT_3AUD, TRUST_REPORT_5AUD } from "@/lib/pricing/v3-skus";
import {
  STARTUP_PACKAGE_AMOUNT_CENTS,
  STARTUP_PACKAGE_CREDITS,
  STARTUP_PACKAGE_PLAN_ID,
  STARTUP_PACKAGE_PRICE_LABEL,
} from "@/lib/startup-package/price";

const WEB = resolve(__dirname, "../../..");
/** Source with line + block comments stripped (a comment may cite the old literal). */
const src = (rel: string) =>
  readFileSync(resolve(WEB, rel), "utf8")
    .replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "")
    .replace(new RegExp("(^|[\\s(])//[^\\n]*", "g"), "$1");
const ROWS = stripeMapRows();
const rowFor = (planId: string, interval: "month" | "year" | "one_off" = "month") =>
  ROWS.find((r) => r.plan_id === planId && r.interval === interval);

/** Decode the few entities renderToStaticMarkup emits inside text. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("1. /pricing matrix — every CTA names a plan whose catalogue amount is the price on the card", () => {
  const ladders = [
    { segment: "founder", ids: ["founder_free", "founder_starter", "founder_growth"] },
    { segment: "investor", ids: ["investor_angel", "investor_advisor", "investor_vc_small", "investor_fund"] },
    { segment: "accelerator", ids: ["accelerator_intake", "accelerator_starter", "accelerator_growth"] },
  ] as const;

  for (const ladder of ladders) {
    const html = renderToStaticMarkup(createElement(PricingMatrix, { segment: ladder.segment }));
    const cards = [...html.matchAll(/<article id="(tier-[a-z0-9-]+)"[\s\S]*?<\/article>/g)];
    // The Programs ladder is annual-first (pricing v4); the CTA carries the
    // cadence so signup / Billing bill what the card showed.
    const annual = defaultIntervalForSegment(ladder.segment) === "annual";

    it(`${ladder.segment}: renders exactly the public ladder`, () => {
      const publicIds = publicPlansForSegment(ladder.segment).map((p) => p.id);
      expect(publicIds).toEqual([...ladder.ids]);
      expect(cards.map((c) => c[1])).toEqual(publicIds.map((id) => TIER_ANCHORS[id]!.slice(1)));
    });

    for (const id of ladder.ids) {
      const plan = PLANS_V2.find((p) => p.id === id)!;
      const card = cards.find((c) => c[1] === TIER_ANCHORS[id]!.slice(1))?.[0] ?? "";
      const href = /<a [^>]*href="([^"]+)"/.exec(card)?.[1]?.replace(/&amp;/g, "&") ?? "";

      it(`${id}: CTA → ${href || "(missing)"}`, () => {
        expect(card, `card for ${id}`).not.toBe("");
        expect(href).not.toBe("");
        if (plan.monthly_aud === null || plan.cta_kind === "contact") {
          expect(href).toBe(`/contact?plan=${id}`);
          return;
        }
        // G25-D: every priced rung lands on the review step first (the Free
        // rung is a sign-up, not an order — it keeps the wizard hand-off).
        const cadence = annual ? "&interval=annual" : "";
        if (plan.monthly_aud === 0) {
          expect(href).toBe(`/onboarding?trial=1&plan=${id}`);
          return; // Free: no Stripe row by design
        }
        expect(href).toBe(`/checkout/review?plan=${id}&trial=1&entry=pricing_card${cadence}`);
        const shown = annual ? plan.annual_aud! : plan.monthly_aud;
        const row = rowFor(id, annual ? "year" : "month");
        expect(row, `${id} has no stripe-map row for the shown cadence`).toBeDefined();
        expect(STRIPE_PRICE_CATALOGUE[row!.env_var]!.amount_cents).toBe(shown * 100);
        // The figure on the card is the catalogue figure.
        expect(card).toContain(`tabular-nums">${formatAud(shown)}<`);
        expect(text(card)).toContain(`${plan.trial_days}-day free trial`);
      });
    }
  }

  it("pricingHrefForPlan() deep-links to a fragment the matrix actually renders", () => {
    for (const [id, anchor] of Object.entries(TIER_ANCHORS)) {
      const plan = PLANS_V2.find((p) => p.id === id)!;
      const html = renderToStaticMarkup(createElement(PricingMatrix, { segment: plan.segment }));
      expect(html, `${id} → ${anchor}`).toContain(`<article id="${anchor.slice(1)}"`);
      expect(pricingHrefForPlan(id, plan.segment)).toBe(`/pricing?segment=${plan.segment}${anchor}`);
    }
  });
});

describe("2. /signup?plan= — every allow-listed plan is a catalogue row (or contact-sales) and a signed-in click lands on the review step with the plan", () => {
  it("the allow-list is exactly the founder + evaluator trial ids", () => {
    expect([...SIGNUP_ALLOWED_PLAN_IDS].sort()).toEqual(
      [...FOUNDER_TRIAL_PLAN_IDS, ...EVALUATOR_TRIAL_PLAN_IDS, "growth", "growth_annual"].sort(),
    );
  });

  for (const id of [...FOUNDER_TRIAL_PLAN_IDS, ...EVALUATOR_TRIAL_PLAN_IDS]) {
    it(`${id}: plans.csv row, catalogue amount, Billing redirect`, () => {
      const g = GENERATED_PLANS_BY_ID[id];
      expect(g, `${id} missing from plans.csv`).toBeDefined();
      if (!isSelfServePlan(g!)) {
        // founder_enterprise: contact-sales — the signup picker drops it and
        // the signed-in redirect goes to plain Billing.
        expect(g!.interval).toBe("custom");
        expect(rowFor(id)).toBeUndefined();
        expect(signedInSignupRedirect(id)).toBe("/workspace/billing");
        return;
      }
      const row = rowFor(id);
      expect(row, `${id} has no stripe-map row`).toBeDefined();
      expect(STRIPE_PRICE_CATALOGUE[row!.env_var]!.amount_cents).toBe(g!.price_aud_cents);
      // G25-D: the signed-in bounce lands on the review step, never an auto-checkout.
      expect(signedInSignupRedirect(id)).toBe(`/checkout/review?plan=${id}&trial=1&entry=signup`);
      // Annual rides along only as a query param; the review (and checkout)
      // fall back to monthly when the rung has no annual price.
      expect(signedInSignupRedirect(id, "annual")).toBe(`/checkout/review?plan=${id}&trial=1&entry=signup&interval=annual`);
    });
  }
});

describe("3. /workspace/billing credit packs — Buy links to the review step for the pack (G25-D) and shows the catalogue amount", () => {
  const client = src("src/app/(app)/(founder)/workspace/billing/billing-client.tsx");

  it("the grid iterates CREDIT_PACKS and links each Buy to /checkout/review?pack=<credits>; only the review's Pay button posts to /api/credits", () => {
    expect(client).toContain("CREDIT_PACKS.map((pack)");
    expect(client).not.toContain('fetch("/api/credits", {');
    expect(client).toContain('href={checkoutReviewHref({ pack: pack.credits, entry: "credits" })}');
    expect(client).toContain('data-testid="credit-pack-buy"');
    for (const pack of CREDIT_PACKS) {
      expect(checkoutReviewHref({ pack: pack.credits, entry: "credits" })).toBe(`/checkout/review?pack=${pack.credits}&entry=credits`);
      const order = resolveCheckoutOrder({ kind: "pack", credits: pack.credits, entry: "credits" });
      expect(order?.postPath).toBe("/api/credits");
      expect(order?.postBody).toEqual({ amount: pack.credits });
      expect(order?.amountCents).toBe(pack.priceAudCents);
    }
    // The label is derived, never typed: withGst(formatAud(pack.price)).
    expect(client).toContain("withGst(formatAud(pack.price))");
    expect(client).not.toMatch(/A\$\$\{priceDollars\}/);
  });

  for (const pack of CREDIT_PACKS) {
    it(`${pack.credits} credits → STRIPE_PRICE_CREDITS_${pack.credits} = ${withGst(formatAud(pack.price))}`, () => {
      const row = rowFor(`credits_${pack.credits}`, "one_off");
      expect(row).toBeDefined();
      expect(row!.env_var).toBe(`STRIPE_PRICE_CREDITS_${pack.credits}`);
      expect(STRIPE_PRICE_CATALOGUE[row!.env_var]!.amount_cents).toBe(pack.priceAudCents);
      expect(pack.href).toBe("/workspace/billing#credits");
    });
  }

  it("POST /api/credits accepts exactly the CREDIT_PACKS sizes and books STRIPE_PRICE_MAP.credits_<n>", () => {
    const route = src("src/app/api/credits/route.ts");
    expect(route).toContain("CREDIT_PACKS.find((p) => p.credits === amount)");
    expect(route).toContain("STRIPE_PRICE_MAP[`credits_${amount}`]");
    const stripe = src("src/lib/stripe.ts");
    for (const pack of CREDIT_PACKS) {
      expect(stripe).toContain(`credits_${pack.credits}: process.env.STRIPE_PRICE_CREDITS_${pack.credits}`);
    }
  });
});

describe("4. Startup Package — CTA links to the review step for founder_package (G25-D) and every A$ on the page is the plans.csv figure", () => {
  it("founder_package → STRIPE_PRICE_STARTUP_PACKAGE, one-off, 14900 cents, 25 credits", () => {
    const row = rowFor(STARTUP_PACKAGE_PLAN_ID, "one_off");
    expect(row).toBeDefined();
    expect(row!.env_var).toBe("STRIPE_PRICE_STARTUP_PACKAGE");
    expect(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_STARTUP_PACKAGE!.amount_cents).toBe(STARTUP_PACKAGE_AMOUNT_CENTS);
    expect(STARTUP_PACKAGE_AMOUNT_CENTS).toBe(14900);
    expect(STARTUP_PACKAGE_PRICE_LABEL).toBe("A$149");
    expect(STARTUP_PACKAGE_CREDITS).toBe(25);
    expect(src("src/lib/stripe.ts")).toContain("founder_package: process.env.STRIPE_PRICE_STARTUP_PACKAGE");
  });

  it("the landing page and the nav tooltip read the price module — no literal A$149", () => {
    const page = src("src/app/startup-package/page.tsx");
    expect(page).toContain("planId={STARTUP_PACKAGE_PLAN_ID}");
    expect(page).toContain("label={`Unlock full Package · ${STARTUP_PACKAGE_PRICE_LABEL}`}");
    expect(page).toContain("quote={`${startupPackagePriceLabelLong()}");
    expect(page).not.toMatch(/A\$149/);
    const button = src("src/app/startup-package/checkout-button.tsx");
    expect(button).not.toContain("/api/stripe/checkout");
    expect(button).toContain('checkoutReviewHref({ sku: planId, entry: "startup_package" })');
    expect(button).toContain('data-testid="startup-package-checkout"');
    const order = resolveCheckoutOrder({ kind: "sku", sku: STARTUP_PACKAGE_PLAN_ID, entry: "startup_package" });
    expect(order?.postPath).toBe("/api/stripe/checkout");
    expect(order?.postBody).toEqual({ plan: STARTUP_PACKAGE_PLAN_ID });
    expect(order?.amountCents).toBe(STARTUP_PACKAGE_AMOUNT_CENTS);
    const nav = src("src/components/workspace/nav-groups.ts");
    expect(nav).toContain("${STARTUP_PACKAGE_PRICE_LABEL}");
    expect(nav).not.toMatch(/A\$149/);
  });

  it("/api/stripe/checkout resolves founder_package to STRIPE_PRICE_MAP.founder_package (IS_STARTUP_PACKAGE branch)", () => {
    const route = src("src/app/api/stripe/checkout/route.ts");
    expect(route).toMatch(/founder_package/);
    expect(route).toContain("STRIPE_PRICE_MAP");
    expect(route).toContain("price: STARTUP_PACKAGE_AMOUNT_CENTS");
    expect(route).not.toMatch(/price: 14900/);
  });
});

describe("5. Trusted Business Report — ReportPaywallGate + unlock rail read trustReportPriceLabel() and post to /api/reports/checkout", () => {
  it("SKU, amount and route agree", () => {
    expect(TRUST_REPORT_SKU_ID).toBe(TRUST_REPORT_5AUD.id);
    expect(TRUST_REPORT_AMOUNT_CENTS).toBe(300);
    expect(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_TRUST_REPORT_5AUD!.amount_cents).toBe(TRUST_REPORT_AMOUNT_CENTS);
    expect(trustReportPriceLabel()).toBe("A$3");
    const route = src("src/app/api/reports/checkout/route.ts");
    expect(route).toContain("process.env.STRIPE_PRICE_TRUST_REPORT_5AUD");
    expect(route).toContain("TRUST_REPORT_5AUD.id");
  });

  it("the paywall gate imports the label and posts to /api/reports/checkout — no literal A$3", () => {
    const gate = src("src/components/paywall/ReportPaywallGate.tsx");
    expect(gate).toContain('import { trustReportPriceLabel } from "@/lib/pricing/trust-report-price";');
    expect(gate).toContain('await fetch("/api/reports/checkout", {');
    expect(gate).not.toMatch(/"A\$3/);
  });

  it("evaluator surfaces (list, dialog, dossier actions) read the TBR + re-score labels from constants", () => {
    for (const rel of [
      "src/app/(app)/(founder)/workspace/evaluations/evaluations-client.tsx",
      "src/app/(app)/(founder)/workspace/evaluations/report-dialog.tsx",
      "src/app/(app)/(founder)/workspace/evaluations/[evaluationId]/dossier/assessment/actions-block.tsx",
    ]) {
      const s = src(rel);
      expect(s, rel).toContain("trustReportPriceLabel");
      expect(s, rel).not.toMatch(/A\$[13]\b/);
    }
    expect(TRUST_REPORT_RESCORE_CREDITS).toBe(1);
  });
});

describe("6. Money Finder report — /funding paywall + workspace hint read FUNDING_REPORT_AUD and post to /api/funding/checkout", () => {
  it("FUNDING_REPORT_AUD × 100 is the catalogue amount for STRIPE_PRICE_FUNDING_REPORT", () => {
    expect(FUNDING_REPORT_AUD * 100).toBe(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_FUNDING_REPORT!.amount_cents);
    expect(FUNDING_REPORT_3AUD.unit_amount_incl_gst_cents).toBe(FUNDING_REPORT_AUD * 100);
    const route = src("src/app/api/funding/checkout/route.ts");
    expect(route).toContain("STRIPE_PRICE_MAP.funding_report");
    expect(src("src/lib/stripe.ts")).toContain("funding_report: process.env.STRIPE_PRICE_FUNDING_REPORT");
  });

  it("the radar-upsell plan figures equal plans-v2 (Starter A$29 / Scout A$79)", () => {
    expect(FOUNDER_RADAR_MONTHLY_AUD).toBe(PLANS_V2.find((p) => p.id === "founder_starter")!.monthly_aud);
    expect(SCOUT_MONTHLY_AUD).toBe(PLANS_V2.find((p) => p.id === "investor_angel")!.monthly_aud);
  });

  it("the paywall posts to /api/funding/checkout and the workspace hint reads the constants", () => {
    const paywall = src("src/components/funding/funding-paywall.tsx");
    expect(paywall).toContain('await fetch("/api/funding/checkout", {');
    expect(paywall).toContain("FUNDING_REPORT_AUD");
    const page = src("src/app/(app)/(founder)/workspace/funding/page.tsx");
    expect(page).toContain("formatAud(FUNDING_REPORT_AUD)");
    expect(page).toContain("formatAud(FOUNDER_RADAR_MONTHLY_AUD)");
    expect(page).not.toMatch(/A\$(3|29)\b/);
  });
});

describe("7. One-Click Report (guest) — /one-click-report posts to /api/guest-analysis/create-order which books STRIPE_PRICE_ONE_CLICK_REPORT", () => {
  it("SKU amount equals the catalogue", () => {
    expect(ONE_CLICK_REPORT_3AUD.unit_amount_incl_gst_cents).toBe(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_ONE_CLICK_REPORT!.amount_cents);
    const route = src("src/app/api/guest-analysis/create-order/route.ts");
    expect(route).toContain("STRIPE_PRICE_MAP.one_click_report");
    expect(route).toContain("ONE_CLICK_REPORT_3AUD.id");
    const form = src("src/app/(marketing)/one-click-report/one-click-form.tsx");
    expect(form).toContain('await fetch("/api/guest-analysis/create-order", {');
  });
});
