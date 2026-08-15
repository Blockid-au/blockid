/**
 * Colocated tests for the lifecycle-email string builder (T-0414).
 *
 * `renderLifecycleEmail` is the sole write surface for BlockID's 7-day
 * trial nurture sequence (day0 → day3 → day5 → day6 → day7 → day14 →
 * winback → done). Regressions here are user-visible in the founder's
 * inbox and irreversible once sent, so this suite pins:
 *
 *   1. Every LifecycleStep produces a subject + html pair (or "" for done).
 *   2. The day5 subject variant switch — curiosity / personalised /
 *      benefit / default — with the personalised fallback when firstName
 *      is missing. A regression here silently ships the wrong A/B copy.
 *   3. Greeting shape: "Hi <name>," vs "Hi," when firstName is
 *      undefined / null / empty.
 *   4. Trial line inclusion & AU-locale date formatting (`en-AU`,
 *      day+short-month), plus plan-label fallback to "Growth" and total
 *      omission when trialEndsAt is absent.
 *   5. Unsubscribe link presence when unsubscribeUrl is provided, and
 *      absence (no orphan " · " separator) when it's null.
 *   6. APP_URL is threaded through logo, primary CTAs, and the privacy
 *      link — the fallback to https://blockid.au must never leak into a
 *      staging send (this test locks the current, module-loaded value).
 *   7. Statutory footer — Auschain PTY LTD + ACN 659 615 111 + Sydney
 *      NSW — appears in every rendered shell (au-compliance guardrail).
 *   8. Per-step CTA hrefs (onboarding / svi/run / pricing / billing /
 *      mailto / coupon) match the intended funnel destination.
 *   9. `done` returns { subject: "", html: "" } — pinning the sentinel
 *      the caller uses to skip the sender.
 *
 * Kept pure (no jsdom, no react) — matches vitest.config include of
 * `src/**\/*.test.ts` and the node-only default environment.
 */

import { describe, expect, it } from "vitest";

import { renderLifecycleEmail, type LifecycleEmailInput } from "./render";
import type { LifecycleStep } from "@/lib/conversion/lifecycle";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://blockid.au";

const ALL_STEPS: LifecycleStep[] = [
  "day0",
  "day3",
  "day5",
  "day6",
  "day7",
  "day14",
  "winback",
  "done",
];

function render(overrides: Partial<LifecycleEmailInput> & { step: LifecycleStep }) {
  return renderLifecycleEmail({ ...overrides });
}

describe("renderLifecycleEmail — per-step subject + html shape", () => {
  it.each(ALL_STEPS)("returns a { subject, html } pair for %s", (step) => {
    const out = render({ step });
    expect(out).toHaveProperty("subject");
    expect(out).toHaveProperty("html");
    expect(typeof out.subject).toBe("string");
    expect(typeof out.html).toBe("string");
  });

  it("day0 subject pins onboarding copy", () => {
    expect(render({ step: "day0" }).subject).toBe(
      "Welcome to BlockID — 3 steps to your first score",
    );
  });

  it("day3 subject pins first-score nudge copy", () => {
    expect(render({ step: "day3" }).subject).toBe(
      "Ready to run your first Investor-Ready Score?",
    );
  });

  it("day6 subject warns 'Last day'", () => {
    expect(render({ step: "day6" }).subject).toBe("Last day of your BlockID trial");
  });

  it("day7 subject confirms charge-today copy", () => {
    expect(render({ step: "day7" }).subject).toBe(
      "Your trial ends today — confirm your plan",
    );
  });

  it("day14 subject is the raise post-mortem prompt", () => {
    expect(render({ step: "day14" }).subject).toBe(
      "One week later — how did the raise go?",
    );
  });

  it("winback subject advertises the 30% coupon", () => {
    expect(render({ step: "winback" }).subject).toBe(
      "Come back to BlockID — 30% off for 3 months",
    );
  });

  it("done is the sentinel — empty subject and empty html", () => {
    expect(render({ step: "done" })).toEqual({ subject: "", html: "" });
  });
});

describe("renderLifecycleEmail — day5 subject variants (A/B experiment)", () => {
  it("default (no variant) uses the two-days-left canonical", () => {
    expect(render({ step: "day5" }).subject).toBe(
      "Keep your cap table + investor links live",
    );
  });

  it("variant=benefit matches the default (documented alias)", () => {
    expect(render({ step: "day5", variant: "benefit" }).subject).toBe(
      "Keep your cap table + investor links live",
    );
  });

  it("variant=curiosity uses the short-question hook", () => {
    expect(render({ step: "day5", variant: "curiosity" }).subject).toBe(
      "One quick question about your trial",
    );
  });

  it("variant=personalised interpolates firstName", () => {
    expect(
      render({ step: "day5", variant: "personalised", firstName: "Ada" }).subject,
    ).toBe("Ada, your BlockID trial ends in 2 days");
  });

  it("variant=personalised falls back to the canonical when firstName is missing", () => {
    // Falsy firstName must degrade cleanly — never ship "undefined, ..." to inboxes.
    expect(
      render({ step: "day5", variant: "personalised", firstName: null }).subject,
    ).toBe("Your BlockID trial ends in 2 days");
    expect(render({ step: "day5", variant: "personalised" }).subject).toBe(
      "Your BlockID trial ends in 2 days",
    );
    expect(
      render({ step: "day5", variant: "personalised", firstName: "" }).subject,
    ).toBe("Your BlockID trial ends in 2 days");
  });

  it("unknown variant collapses onto the benefit copy (fail-safe)", () => {
    expect(render({ step: "day5", variant: "totally-unknown" }).subject).toBe(
      "Keep your cap table + investor links live",
    );
  });

  it("variant on non-day5 steps is ignored (no cross-step bleed)", () => {
    expect(render({ step: "day3", variant: "curiosity" }).subject).toBe(
      "Ready to run your first Investor-Ready Score?",
    );
    expect(render({ step: "day0", variant: "personalised", firstName: "Ada" }).subject).toBe(
      "Welcome to BlockID — 3 steps to your first score",
    );
  });
});

describe("renderLifecycleEmail — greeting rendering", () => {
  it("uses 'Hi <name>,' when firstName is provided", () => {
    // Check text content — not exact tag structure (the <p> may have inline styles).
    expect(render({ step: "day0", firstName: "Ada" }).html).toContain("Hi Ada,");
  });

  it("uses 'Hi,' when firstName is missing", () => {
    expect(render({ step: "day0" }).html).toContain("Hi,");
    expect(render({ step: "day3", firstName: null }).html).toContain("Hi,");
  });

  it("empty-string firstName also degrades to 'Hi,'", () => {
    expect(render({ step: "day3", firstName: "" }).html).toContain("Hi,");
  });

  it("greeting appears in every body-carrying step", () => {
    for (const step of ["day0", "day3", "day5", "day6", "day7", "day14", "winback"] as const) {
      const html = render({ step, firstName: "Ada" }).html;
      expect(html).toContain("Hi Ada,");
    }
  });
});

describe("renderLifecycleEmail — trial-line inclusion & AU-locale formatting", () => {
  it("omits the trial line entirely when trialEndsAt is null", () => {
    const html = render({ step: "day0" }).html;
    expect(html).not.toContain("Trial ends");
  });

  it("renders the trial line with AU short-month formatting", () => {
    // 2026-08-05 formatted en-AU short-month = "5 Aug" (day numeric + short month)
    const html = render({
      step: "day0",
      trialEndsAt: "2026-08-05T12:00:00Z",
      planLabel: "Founder Growth",
    }).html;
    expect(html).toMatch(/Trial ends \d+ [A-Z][a-z]{2} · Founder Growth\./);
  });

  it("falls back to 'Growth' when planLabel is absent", () => {
    const html = render({ step: "day3", trialEndsAt: "2026-08-05T12:00:00Z" }).html;
    expect(html).toContain("· Growth.");
  });

  it("appears in the shell footer slot for day0/3/5/6/7 (charge-cycle emails)", () => {
    for (const step of ["day0", "day3", "day5", "day6", "day7"] as const) {
      const html = render({
        step,
        trialEndsAt: "2026-08-05T12:00:00Z",
        planLabel: "Growth",
      }).html;
      expect(html).toContain("Trial ends");
    }
  });

  it("day14 uses a bespoke footer instead of the trial line", () => {
    const html = render({
      step: "day14",
      trialEndsAt: "2026-08-05T12:00:00Z",
    }).html;
    expect(html).toContain("This is a one-off email");
  });

  it("winback uses a bespoke footer instead of the trial line", () => {
    const html = render({
      step: "winback",
      trialEndsAt: "2026-08-05T12:00:00Z",
    }).html;
    expect(html).toContain("This offer expires 14 days from today.");
  });
});

describe("renderLifecycleEmail — unsubscribe link plumbing", () => {
  it("emits an Unsubscribe anchor when unsubscribeUrl is provided", () => {
    const html = render({
      step: "day0",
      unsubscribeUrl: "https://blockid.au/unsub?tok=abc",
    }).html;
    expect(html).toContain('href="https://blockid.au/unsub?tok=abc"');
    expect(html).toContain(">Unsubscribe</a>");
  });

  it("omits the Unsubscribe anchor entirely when unsubscribeUrl is null", () => {
    const html = render({ step: "day0", unsubscribeUrl: null }).html;
    expect(html).not.toContain(">Unsubscribe</a>");
  });

  it("omits the Unsubscribe anchor entirely when unsubscribeUrl is undefined", () => {
    const html = render({ step: "day3" }).html;
    expect(html).not.toContain(">Unsubscribe</a>");
  });

  it("still renders the Privacy link when no unsubscribe URL is passed", () => {
    // A regression once dropped the whole footer row when unsub was null;
    // pin the privacy link separately to catch that.
    const html = render({ step: "day0" }).html;
    expect(html).toContain(`href="${APP_URL}/legal/privacy"`);
  });
});

describe("renderLifecycleEmail — APP_URL threading", () => {
  it("embeds the logo from APP_URL", () => {
    expect(render({ step: "day0" }).html).toContain(`src="${APP_URL}/logo.svg"`);
  });

  it("day0 CTA points to onboarding under APP_URL", () => {
    expect(render({ step: "day0" }).html).toContain(`href="${APP_URL}/onboarding"`);
  });

  it("day3 CTA points to svi/run", () => {
    expect(render({ step: "day3" }).html).toContain(`href="${APP_URL}/svi/run"`);
  });

  it("day5 CTA points to pricing with the growth plan preselected", () => {
    expect(render({ step: "day5" }).html).toContain(
      `href="${APP_URL}/pricing?plan=founder_growth"`,
    );
  });

  it("day6 CTA points to account billing (downgrade path)", () => {
    expect(render({ step: "day6" }).html).toContain(`href="${APP_URL}/account/billing"`);
  });

  it("day7 CTA also points to account billing (manage-plan path)", () => {
    expect(render({ step: "day7" }).html).toContain(`href="${APP_URL}/account/billing"`);
  });

  it("day14 CTA is a mailto: to the hello@ inbox", () => {
    const html = render({ step: "day14" }).html;
    expect(html).toContain('href="mailto:hello@blockid.au?subject=Two%20weeks%20on%20BlockID"');
  });

  it("winback CTA carries the COMEBACK30 coupon", () => {
    const html = render({ step: "winback" }).html;
    expect(html).toContain(`href="${APP_URL}/pricing?coupon=COMEBACK30"`);
    // <code> tag may carry inline styles — check text content only
    expect(html).toContain("COMEBACK30");
    expect(html.toLowerCase()).toContain("reactivate with comeback30");
  });
});

describe("renderLifecycleEmail — statutory footer (au-compliance)", () => {
  const CANARY_STEPS: LifecycleStep[] = [
    "day0",
    "day3",
    "day5",
    "day6",
    "day7",
    "day14",
    "winback",
  ];

  it.each(CANARY_STEPS)("renders the Auschain company footer for %s", (step) => {
    const html = render({ step }).html;
    expect(html).toContain("Auschain PTY LTD");
    expect(html).toContain("ACN 659 615 111");
    expect(html).toContain("Sydney NSW");
  });

  it("done skips the footer (empty shell — never sent)", () => {
    expect(render({ step: "done" }).html).toBe("");
  });
});

describe("renderLifecycleEmail — per-step body copy anchors", () => {
  it("day0 body carries the 3-step first-week list", () => {
    const html = render({ step: "day0" }).html;
    expect(html).toContain("Run your first Investor-Ready Score");
    expect(html).toContain("Upload evidence to your data room");
    expect(html).toContain("Generate a share link");
    // CTA text — case-insensitive match via lowercase check
    expect(html.toLowerCase()).toContain("start step 1");
  });

  it("day3 body pushes the ~10-minute score run", () => {
    const html = render({ step: "day3" }).html;
    expect(html).toContain("~10 minutes");
    expect(html.toLowerCase()).toContain("run my score");
  });

  it("day5 body headlines 'Two days left in your trial'", () => {
    const html = render({ step: "day5" }).html;
    expect(html).toContain("Two days left in your trial");
    expect(html.toLowerCase()).toContain("keep my access");
  });

  it("day6 body advertises the A$29 Starter downgrade", () => {
    const html = render({ step: "day6" }).html;
    expect(html).toContain("Starter (A$29/mo)");
    expect(html.toLowerCase()).toContain("manage my plan");
  });

  it("day7 body names the 09:00 AEST charge time", () => {
    const html = render({ step: "day7" }).html;
    expect(html).toContain("09:00 AEST");
    expect(html.toLowerCase()).toContain("manage my plan");
  });

  it("day14 body invites a reply", () => {
    const html = render({ step: "day14" }).html;
    expect(html.toLowerCase()).toContain("reply to us");
    expect(html.toLowerCase()).toContain("two weeks");
  });

  it("winback body promises 30% off for 3 months", () => {
    const html = render({ step: "winback" }).html;
    expect(html).toContain("30% off");
    expect(html).toContain("first 3 months");
  });
});

describe("renderLifecycleEmail — shell invariants (visual regression harness)", () => {
  it("wraps every non-done step in a full HTML document", () => {
    for (const step of ["day0", "day3", "day5", "day6", "day7", "day14", "winback"] as const) {
      const html = render({ step }).html;
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain("</body></html>");
    }
  });

  it("uses the BlockID brand navy (#0B0F2A) as the primary CTA button color", () => {
    // Intentional design upgrade (2026-08-15): indigo #4f46e5 → brand navy #0B0F2A
    // for consistency with the BlockID dark-mode brand palette.
    // Any further theme change requires an explicit update to this pin.
    expect(render({ step: "day0" }).html).toContain("background:#0B0F2A");
  });

  it("carries the 580px max-width envelope for gmail/outlook compatibility", () => {
    // Intentional width update (2026-08-15): 560px → 580px for improved readability
    // on modern email clients. Both values render correctly in Gmail/Outlook 2016+.
    expect(render({ step: "day0" }).html).toContain("max-width:580px");
  });

  it("renders a brand header with dark navy background", () => {
    expect(render({ step: "day0" }).html).toContain(`background:#0B0F2A`);
  });
});
