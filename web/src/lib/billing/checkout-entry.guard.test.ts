// G25-D — "review before pay" entry guard (founder 2026-09-21).
//
// Founder rule (verbatim intent): clicking a plan, a price or "Start 7-day
// trial" must NEVER send the visitor to Stripe; they land on a review step,
// read it, and only an explicit Pay / Add-card click opens Stripe.
//
// This test walks every `src/**/*.tsx` (and the client `.ts` helpers) and
// finds each file that calls a Stripe-session-minting route from the
// browser:
//
//   /api/stripe/checkout   subscriptions, Startup Package
//   /api/credits           credit packs (POST)
//   /api/svi-api/checkout  Index API Team tier
//
// Every caller must be in ALLOW below with a reason. The only intended
// caller is <CheckoutReviewCard> — the review step's Pay button. Anything
// else means a surface has gone back to "click → Stripe"; fix the surface
// (link it to `checkoutReviewHref()`), do not extend the list.
//
// Server routes, the Stripe webhook, docs pages and tests are out of scope:
// they do not run on a click.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");

/** Files (relative to `src/`) allowed to call a checkout route from the browser → why. */
export const ALLOW: Readonly<Record<string, string>> = {
  "components/billing/checkout-review-card.tsx":
    "THE review step. Renders the full order (plan, included, price inc. GST + GST share, interval, trial, renewal, entity, data principle) and posts to the checkout route only from the explicit Pay / Add-card click.",
  // Review v3.26.0 P2: the one-off report / funding quote panels. Each shows
  // the price inc. GST and posts ONLY from an explicit "Pay A$X …" button.
  "components/analyze/guest-paid-checkout.tsx":
    "A$3 guest report quote panel — price inc. GST + e-mail, posts to /api/guest-analysis/create-order from the 'Pay {price} & get my report' button only.",
  "app/(marketing)/one-click-report/one-click-form.tsx":
    "The /one-click-report checkout landing — the price IS the offer (A$3 inc. GST, invoice note); the submit reads 'Pay A$3 & get my report'.",
  "components/funding/funding-paywall.tsx":
    "Money Finder A$3 paywall — price inc. GST, one-off, posts to /api/funding/checkout from the 'Pay A$3 & unlock' button only.",
  "components/paywall/ReportPaywallGate.tsx":
    "G16 quote-then-pay gate — 'Confirm & Pay A$3' after the quoted number; posts to /api/reports/checkout.",
  "components/svi/svi-entrance.tsx":
    "Quick Report option — first click opens the review block (price inc. GST, one-off, PDF by e-mail); only its 'Pay A$3 now' button posts to /api/stripe/analysis.",
};

/** The browser-side callers this guard looks for. */
const ROUTE_PATTERNS: ReadonlyArray<{ label: string; re: RegExp }> = [
  // The review card posts to `order.postPath` (typed to the three routes in lib/billing/checkout-review.ts).
  { label: "order.postPath (review step)", re: /fetch\(\s*order\.postPath\b/ },
  { label: "/api/stripe/checkout", re: /["'`]\/api\/stripe\/checkout["'`]/ },
  // `fetch("/api/credits")` GET reads the balance — only the POST mints a session.
  { label: "POST /api/credits", re: /fetch\(\s*["'`]\/api\/credits["'`]\s*,\s*\{[^}]*method:\s*["']POST["']/s },
  { label: "/api/svi-api/checkout", re: /["'`]\/api\/svi-api\/checkout["'`]/ },
  // Review v3.26.0 P2: the other session-minting routes a browser can call.
  { label: "/api/guest-analysis/create-order", re: /["'`]\/api\/guest-analysis\/create-order["'`]/ },
  { label: "/api/funding/checkout", re: /["'`]\/api\/funding\/checkout["'`]/ },
  { label: "/api/reports/checkout", re: /["'`]\/api\/reports\/checkout["'`]/ },
  { label: "/api/stripe/analysis", re: /["'`]\/api\/stripe\/analysis["'`]/ },
];

const SKIP_DIRS = new Set(["node_modules", ".next", "__snapshots__"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Strip block + line comments so a comment may cite the route (a string may not). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Client code = a `"use client"` module, or any .tsx under components/ (rendered in the browser). */
function isBrowserModule(rel: string, src: string): boolean {
  if (/^\s*["']use client["']/.test(src)) return true;
  return rel.endsWith(".tsx") && !rel.startsWith("app/api/");
}

/** Route handlers, server libs, the webhook and generated audit catalogues never run on a click. */
function isServerOnly(rel: string): boolean {
  return (
    rel.startsWith("app/api/") ||
    rel.startsWith("lib/audit/") ||
    rel.startsWith("lib/stripe") ||
    rel.endsWith("/route.ts") ||
    rel.endsWith(".server.ts")
  );
}

describe("G25-D review-before-pay — only the review step may call a checkout route from a click", () => {
  const files = walk(SRC);
  const callers: Array<{ rel: string; routes: string[] }> = [];
  for (const full of files) {
    const rel = relative(SRC, full).replace(/\\/g, "/");
    if (isServerOnly(rel)) continue;
    const raw = readFileSync(full, "utf8");
    if (!isBrowserModule(rel, raw)) continue;
    const src = stripComments(raw);
    const routes = ROUTE_PATTERNS.filter((p) => p.re.test(src)).map((p) => p.label);
    if (routes.length) callers.push({ rel, routes });
  }

  it("finds the review step itself (the scan is live, not vacuous)", () => {
    expect(callers.map((c) => c.rel)).toContain("components/billing/checkout-review-card.tsx");
    expect(callers.find((c) => c.rel === "components/billing/checkout-review-card.tsx")?.routes).toEqual(["order.postPath (review step)"]);
    // The typed union behind `order.postPath` is the exhaustive route list.
    const lib = readFileSync(join(SRC, "lib/billing/checkout-review.ts"), "utf8");
    expect(lib).toContain('postPath: "/api/stripe/checkout" | "/api/credits" | "/api/svi-api/checkout";');
  });

  it("every browser-side caller of a checkout route is allow-listed with a reason", () => {
    const rogue = callers.filter((c) => !(c.rel in ALLOW));
    expect(
      rogue,
      `A surface posts to a checkout route from the browser without a review step:\n${rogue
        .map((c) => `  ${c.rel} → ${c.routes.join(", ")}`)
        .join("\n")}\nLink it to checkoutReviewHref() instead (docs/ops/pricing-truth.md § 12).`,
    ).toEqual([]);
  });

  it("every allow-list row still exists and still calls a route (no stale exemptions)", () => {
    for (const rel of Object.keys(ALLOW)) {
      expect(ALLOW[rel]!.length, `${rel} needs a reason`).toBeGreaterThan(20);
      const hit = callers.find((c) => c.rel === rel);
      if (!hit) {
        // A deleted file (lane A's pilot removal) is fine; an existing file
        // that no longer calls a route means the row is stale.
        let exists = true;
        try {
          statSync(join(SRC, rel));
        } catch {
          exists = false;
        }
        expect(exists, `${rel} is allow-listed but no longer calls a checkout route — drop the row`).toBe(false);
      }
    }
  });

  it("the retired auto-redirect surfaces no longer post on mount or on the first click", () => {
    const read = (rel: string) => stripComments(readFileSync(join(SRC, rel), "utf8"));
    // Legacy onboarding payment step used to fetch on mount.
    expect(read("components/onboarding/step-payment.tsx")).not.toMatch(/fetch\(/);
    // Billing used to auto-checkout `?plan=` on mount and post from Upgrade / Buy.
    const billing = read("app/(app)/(founder)/workspace/billing/billing-client.tsx");
    expect(billing).not.toMatch(/\/api\/stripe\/checkout/);
    expect(billing).toContain('entry: "billing_deeplink"');
    // Upgrade modal, Startup Package CTA and the Index API section are links now.
    expect(read("components/upsell/upgrade-modal.tsx")).not.toMatch(/fetch\(/);
    expect(read("app/startup-package/checkout-button.tsx")).not.toMatch(/fetch\(/);
    expect(read("app/(app)/(founder)/workspace/settings/enterprise/svi-api-section.tsx")).not.toMatch(/svi-api\/checkout/);
    // The sign-up card form sits under the review block and names the card step.
    const signup = read("app/signup/signup-form.tsx");
    expect(signup).toContain('data-testid="signup-review"');
    expect(signup).toContain("TRIAL_COPY.cta_card(");
  });
});
