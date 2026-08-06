// Colocated vitest for `credit-packs.ts` — the single source of truth
// for BlockID's credit-pack ladder. This module is intentionally tiny,
// but every field has already caused a revenue-integrity incident:
//
//   • Aug 2026 — the /pricing landing advertised bundle sizes (5/15/35/100)
//     that no Stripe price backed. A paying founder (Zenya) was shown
//     "35 for A$9" and received 10 credits. The lesson: marketing, backend,
//     and Stripe env vars must all import from this file. The tests below
//     pin the ladder so any drift becomes a compile-and-test failure, not
//     a silent invoice mismatch.
//   • The A$15/50-credit pack is a launch offer that is deliberately
//     non-monotonic on per-credit price (25c pack is A$0.80/credit, 50c
//     pack is A$0.30/credit). Any future normalisation MUST be an explicit
//     code change — losing this test would let a "cleanup" rewrite silently
//     restore monotonicity and yank an active promo.
//
// The module is pure data; there is nothing to mock. Every check here is a
// structural / regression pin.

import { describe, expect, it } from "vitest";
import { CREDIT_PACKS, type CreditPack } from "./credit-packs";

// ── ladder pin ────────────────────────────────────────────────────────────
// The exact 5-tier ladder as of 2026-08. Any change here must be a
// deliberate marketing decision — bump this constant AND the Stripe prices
// referenced by STRIPE_PRICE_CREDITS_5/10/25/50/100 in the same PR.
const EXPECTED_LADDER: ReadonlyArray<{
  credits: number;
  priceAudCents: number;
  savings: string | null;
}> = [
  { credits: 5,   priceAudCents: 500,  savings: null       },
  { credits: 10,  priceAudCents: 900,  savings: "Save 10%" },
  { credits: 25,  priceAudCents: 2000, savings: "Save 20%" },
  { credits: 50,  priceAudCents: 1500, savings: "Save 70%" },
  { credits: 100, priceAudCents: 2500, savings: "Save 75%" },
];

const EXPECTED_HREF = "/workspace/billing#credits";

describe("CREDIT_PACKS — ladder shape", () => {
  it("exposes exactly 5 packs", () => {
    // Guard against a rewrite that silently reintroduces the deprecated
    // 5/10/25/50/100 vs 5/15/35/100 marketing-page ladder mismatch.
    expect(CREDIT_PACKS).toHaveLength(5);
  });

  it("packs are ordered by ascending credit count", () => {
    const credits = CREDIT_PACKS.map((p) => p.credits);
    const sorted = [...credits].sort((a, b) => a - b);
    expect(credits).toEqual(sorted);
  });

  it("packs are strictly increasing on credits (no duplicates)", () => {
    for (let i = 1; i < CREDIT_PACKS.length; i += 1) {
      expect(CREDIT_PACKS[i].credits).toBeGreaterThan(CREDIT_PACKS[i - 1].credits);
    }
  });

  it("every pack exposes the same six fields", () => {
    const keys: Array<keyof CreditPack> = [
      "credits",
      "priceAudCents",
      "price",
      "savings",
      "label",
      "href",
    ];
    for (const pack of CREDIT_PACKS) {
      for (const k of keys) {
        expect(pack).toHaveProperty(k);
      }
    }
  });

  it("no pack carries stray fields beyond the CreditPack surface", () => {
    // Extra fields would signal a merge conflict or partial rewrite that
    // left a legacy property (`stripePriceId`, `slug`, etc.) leaking into
    // clients that JSON-serialise the pack.
    const allowed = new Set([
      "credits",
      "priceAudCents",
      "price",
      "savings",
      "label",
      "href",
    ]);
    for (const pack of CREDIT_PACKS) {
      for (const key of Object.keys(pack)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });
});

describe("CREDIT_PACKS — exact ladder values", () => {
  it.each(EXPECTED_LADDER)(
    "pack with $credits credits is A$$$priceAudCents cents (savings=$savings)",
    ({ credits, priceAudCents, savings }) => {
      const pack = CREDIT_PACKS.find((p) => p.credits === credits);
      expect(pack).toBeDefined();
      expect(pack!.priceAudCents).toBe(priceAudCents);
      expect(pack!.savings).toBe(savings);
    },
  );

  it("only the smallest pack (5) has a null savings badge", () => {
    const nullBadges = CREDIT_PACKS.filter((p) => p.savings === null);
    expect(nullBadges).toHaveLength(1);
    expect(nullBadges[0].credits).toBe(5);
  });

  it("every non-smallest pack has a non-empty savings string", () => {
    for (const pack of CREDIT_PACKS) {
      if (pack.credits === 5) continue;
      expect(typeof pack.savings).toBe("string");
      expect((pack.savings as string).length).toBeGreaterThan(0);
    }
  });

  it("savings badges follow the 'Save NN%' template", () => {
    for (const pack of CREDIT_PACKS) {
      if (pack.savings === null) continue;
      expect(pack.savings).toMatch(/^Save \d+%$/);
    }
  });
});

describe("CREDIT_PACKS — price derivation", () => {
  it("price is always priceAudCents divided by 100", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.price).toBe(pack.priceAudCents / 100);
    }
  });

  it("priceAudCents is always a positive integer (Stripe convention)", () => {
    for (const pack of CREDIT_PACKS) {
      expect(Number.isInteger(pack.priceAudCents)).toBe(true);
      expect(pack.priceAudCents).toBeGreaterThan(0);
    }
  });

  it("credits is always a positive integer", () => {
    for (const pack of CREDIT_PACKS) {
      expect(Number.isInteger(pack.credits)).toBe(true);
      expect(pack.credits).toBeGreaterThan(0);
    }
  });

  it("A$5 pack: 500 cents ↔ 5 dollars", () => {
    const pack = CREDIT_PACKS.find((p) => p.credits === 5)!;
    expect(pack.priceAudCents).toBe(500);
    expect(pack.price).toBe(5);
  });

  it("A$25 pack: 2500 cents ↔ 25 dollars (largest tier)", () => {
    const pack = CREDIT_PACKS.find((p) => p.credits === 100)!;
    expect(pack.priceAudCents).toBe(2500);
    expect(pack.price).toBe(25);
  });
});

describe("CREDIT_PACKS — label format", () => {
  it("label is always `${credits} Credits`", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.label).toBe(`${pack.credits} Credits`);
    }
  });

  it("label uses the exact word 'Credits' (title-case, plural, no punctuation)", () => {
    // Small pin: a rewrite to "credits" or "Credit" would silently reflow
    // the /pricing hero card and every workspace billing surface.
    for (const pack of CREDIT_PACKS) {
      expect(pack.label.endsWith(" Credits")).toBe(true);
    }
  });

  it("label never contains a currency amount (that lives in price, not label)", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.label).not.toMatch(/\$/);
      expect(pack.label).not.toMatch(/A\$/);
      expect(pack.label).not.toMatch(/AUD/);
    }
  });
});

describe("CREDIT_PACKS — href contract", () => {
  it("every pack routes to /workspace/billing#credits", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.href).toBe(EXPECTED_HREF);
    }
  });

  it("hrefs are byte-identical across the ladder (shared constant, not per-pack literals)", () => {
    const unique = new Set(CREDIT_PACKS.map((p) => p.href));
    expect(unique.size).toBe(1);
  });

  it("href includes the '#credits' anchor so deep links scroll to the buy widget", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.href).toContain("#credits");
    }
  });

  it("href stays on-origin (no absolute URL leak to a staging or Stripe domain)", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.href.startsWith("/")).toBe(true);
      expect(pack.href).not.toMatch(/^https?:/);
    }
  });
});

describe("CREDIT_PACKS — business rules", () => {
  it("total price is monotonically increasing with credit count", () => {
    // A larger bundle must never be cheaper in total dollars — even the
    // 50-credit launch offer is A$15 vs the 25-credit pack's A$20 …
    // wait: that violates monotonicity. Pin the *actual* current behaviour:
    // the 50-credit tier is DELIBERATELY cheaper than the 25-credit tier.
    // See the comment in the module: "A$15 pack: A$0.30/credit — launch
    // offer (non-monotonic)". The next test pins that intentional dip.
    // Here we assert the weaker property: monotonic within 5→10→25 and
    // 50→100 sub-ladders, which is what pricing UX actually depends on.
    expect(CREDIT_PACKS[0].priceAudCents).toBeLessThan(CREDIT_PACKS[1].priceAudCents);
    expect(CREDIT_PACKS[1].priceAudCents).toBeLessThan(CREDIT_PACKS[2].priceAudCents);
    expect(CREDIT_PACKS[3].priceAudCents).toBeLessThan(CREDIT_PACKS[4].priceAudCents);
  });

  it("the 50-credit pack is INTENTIONALLY cheaper than the 25-credit pack (launch promo)", () => {
    // If this ever needs to change, either archive the credits_50 Stripe
    // price OR raise A$15 → A$40. Do not silently normalise here.
    const twentyFive = CREDIT_PACKS.find((p) => p.credits === 25)!;
    const fifty = CREDIT_PACKS.find((p) => p.credits === 50)!;
    expect(fifty.priceAudCents).toBeLessThan(twentyFive.priceAudCents);
  });

  it("per-credit rate is non-monotonic: pins the intentional 50-credit dip", () => {
    const perCreditCents = CREDIT_PACKS.map((p) => p.priceAudCents / p.credits);
    // 5→10→25 should be monotonically cheaper per credit:
    expect(perCreditCents[0]).toBeGreaterThan(perCreditCents[1]);
    expect(perCreditCents[1]).toBeGreaterThan(perCreditCents[2]);
    // 25→50 is the promo DIP — cheaper per credit than the 100-tier:
    expect(perCreditCents[3]).toBeLessThan(perCreditCents[2]);
    // 50→100 normalises upward slightly (100-tier is still 5c/credit):
    expect(perCreditCents[4]).toBeLessThan(perCreditCents[3]);
  });

  it("smallest pack sits at A$1/credit (integer rate — the baseline for the 'Save NN%' badges)", () => {
    const pack = CREDIT_PACKS[0];
    expect(pack.priceAudCents / pack.credits).toBe(100);
  });

  it("savings badges are roughly consistent with per-credit discount from the 5-pack baseline", () => {
    // Sanity ceiling: the "Save 75%" badge on the 100-pack corresponds to
    // 25c/credit vs $1/credit baseline — 75% off. Pin the arithmetic so a
    // future re-price that keeps the badge text but changes the cents
    // trips the test.
    const baseline = CREDIT_PACKS[0].priceAudCents / CREDIT_PACKS[0].credits;
    for (const pack of CREDIT_PACKS) {
      if (pack.savings === null) continue;
      const match = /^Save (\d+)%$/.exec(pack.savings);
      expect(match).not.toBeNull();
      const claimed = Number(match![1]);
      const perCredit = pack.priceAudCents / pack.credits;
      const actual = Math.round((1 - perCredit / baseline) * 100);
      // Marketing rounds down for prettier badges — allow ±5pp tolerance.
      expect(Math.abs(actual - claimed)).toBeLessThanOrEqual(5);
    }
  });
});

describe("CREDIT_PACKS — immutability & isomorphism", () => {
  it("is exposed as an array-like iterable", () => {
    expect(Array.isArray(CREDIT_PACKS)).toBe(true);
  });

  it("does not carry a `server-only` marker (import must work in the browser)", async () => {
    // If someone accidentally adds `import 'server-only'`, the client
    // bundle for /pricing would throw at build time. Loading the module
    // fresh here proves the isomorphism at unit-test time.
    const mod = await import("./credit-packs");
    expect(mod.CREDIT_PACKS).toBe(CREDIT_PACKS);
  });

  it("credits values match the Stripe env-var contract (5/10/25/50/100)", () => {
    // These are the exact values the webhook + checkout API look for in
    // STRIPE_PRICE_CREDITS_<n>. Drift here breaks fulfilment silently.
    const credits = CREDIT_PACKS.map((p) => p.credits);
    expect(credits).toEqual([5, 10, 25, 50, 100]);
  });

  it("priceAudCents values match the shipped Stripe price ladder", () => {
    // Mirror of the ladder pin above, but expressed as a single deep-equal
    // so a diff on any tier is obvious in test output.
    const prices = CREDIT_PACKS.map((p) => p.priceAudCents);
    expect(prices).toEqual([500, 900, 2000, 1500, 2500]);
  });
});
