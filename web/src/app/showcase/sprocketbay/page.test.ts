/**
 * Structural guard for the walkthrough route.
 *
 * There is no jsdom in this project's vitest config (`src/**\/*.test.ts`,
 * no `environment`), so the page cannot be rendered and asserted on.
 * What CAN be pinned — and what actually matters — is that the page still
 * gets its disclosure from the shared module and still puts the banner
 * before anything that looks like a verification claim.
 *
 * Same technique as `src/components/showcase/atlassian-benchmark.test.ts`
 * and `src/lib/reseller/typed-wrapper-audit.test.ts`: read the source and
 * assert the contract that a reviewer would otherwise have to remember.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { profileChromeKeys } from "@/lib/business-id/profile-disclosure";

const PAGE = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("/showcase/sprocketbay page source", () => {
  it("renders the sample-data disclosure", () => {
    expect(PAGE).toContain('data-testid="sample-data-disclosure"');
    expect(PAGE).toContain("{disclosure.chip}");
    expect(PAGE).toContain("{disclosure.title}");
    expect(PAGE).toContain("{disclosure.body}");
  });

  it("puts the disclosure above the fold, before the company name", () => {
    const banner = PAGE.indexOf('data-testid="sample-data-disclosure"');
    const heading = PAGE.indexOf("<h1");
    const scores = PAGE.indexOf("Verification ladder");
    expect(banner).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(-1);
    expect(scores).toBeGreaterThan(-1);
    expect(banner).toBeLessThan(heading);
    expect(banner).toBeLessThan(scores);
  });

  it("sources the disclosure from profile-disclosure, not inline copy", () => {
    // Directly or through the sprocketbay disclosure wrapper — either is
    // fine, an inlined string is not.
    expect(PAGE).toMatch(
      /from "@\/lib\/showcase\/sprocketbay\/disclosure"|from "@\/lib\/business-id\/profile-disclosure"/,
    );
    expect(PAGE).toContain("walkthroughDisclosure");
    expect(PAGE).toContain("walkthroughLevelChrome");

    // The i18n keys must not be hard-coded in the JSX — that is exactly
    // the drift `profile-disclosure.ts` exists to prevent.
    const keys = profileChromeKeys("demo").disclosure;
    expect(keys).not.toBeNull();
    for (const key of Object.values(keys as Record<string, string>)) {
      expect(PAGE).not.toContain(key);
    }
  });

  it("carries the disclosure into the structured data too", () => {
    expect(PAGE).toContain("application/ld+json");
    expect(PAGE).toContain("jsonLdNotice");
  });

  it("computes its numbers instead of typing them in", () => {
    expect(PAGE).toContain("computeWalkthrough()");
    // A literal trust score in the JSX would defeat the whole exercise.
    expect(PAGE).not.toMatch(/>\s*81\.3\s*</);
  });

  it("renders a panel per stage and links back to the public profile", () => {
    expect(PAGE).toContain("data-testid={`stage-${s.stage.stage}`}");
    expect(PAGE).toContain("SPROCKETBAY_PROFILE_SLUG");
  });

  it("shows the reconciliation notes rather than hiding the caveat", () => {
    expect(PAGE).toContain("SPROCKETBAY_RECONCILIATION");
    expect(PAGE).toContain("caveat");
  });

  it("stays out of the search index — it is sample data", () => {
    expect(PAGE).toContain("index: false");
  });
});
