import { describe, it, expect } from "vitest";

/**
 * REGRESSION GUARD — sample data must never render as a real verification.
 *
 * What this file is defending against
 * -----------------------------------
 * `/id/[slug]`, its VI mirror, `/api/v1/id/[slug]` and `/embed/badge` all
 * render the same `PublicBusinessProfile`. Before migration 0298 they
 * rendered it identically, which meant the seeded demo rows —
 * "BlockID Demo Co (Sample Profile)" (0297) and "Sprocketbay Demo Co
 * (Sample Profile)" (0299), both fictional companies with invented
 * attesters — appeared as fully verified BlockID customers.
 *
 * The embed badge is the sharpest edge. It is hotlinked as an `<img>`
 * onto third-party pages, where it appears with none of the surrounding
 * page context: an SVG reading "BlockID Verified — Level 4" sitting on
 * someone's website is a bare false verification claim, and no banner
 * elsewhere on blockid.au can undo it.
 *
 * So the rules live in ONE pure module and are pinned HERE. A future
 * refactor of the page or the badge that drops the disclosure has to
 * delete an assertion in this file to land — which is the point.
 *
 * Pure module, no mocks needed: no React, no Supabase, no I/O.
 */

import {
  PROFILE_KINDS,
  DEFAULT_PROFILE_KIND,
  coerceProfileKind,
  isSampleProfile,
  mayClaimVerified,
  profileChromeKeys,
  badgeChrome,
  badgeLevelLabel,
  SAMPLE_DATA_JSONLD_NOTICE,
  SAMPLE_DATA_CREDENTIAL_SUFFIX,
  type ProfileKind,
} from "./profile-disclosure";

import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";

const EN = en as Record<string, string>;
const VI = vi as Record<string, string>;

describe("PROFILE_KINDS", () => {
  it("matches the CHECK constraint in migration 0298", () => {
    expect([...PROFILE_KINDS]).toEqual(["customer", "demo"]);
  });

  it("defaults to 'customer' — the non-disclosing path", () => {
    expect(DEFAULT_PROFILE_KIND).toBe("customer");
  });
});

describe("coerceProfileKind", () => {
  it("passes through the two known kinds", () => {
    expect(coerceProfileKind("customer")).toBe("customer");
    expect(coerceProfileKind("demo")).toBe("demo");
  });

  it("falls back to 'customer' for unknown/missing values", () => {
    // Rows predating migration 0298 have no profile_kind at all. They
    // are real founders' projects, so 'customer' is correct — and a
    // sample row is ALWAYS explicitly 'demo' in its seed migration, so
    // this default can never strip a disclosure that was meant to show.
    for (const junk of [undefined, null, "", "Demo", "DEMO", "sample", 42, {}]) {
      expect(coerceProfileKind(junk)).toBe("customer");
    }
  });

  it("is case-sensitive — a typo'd kind never counts as demo", () => {
    expect(coerceProfileKind("Demo")).not.toBe("demo");
  });
});

describe("isSampleProfile / mayClaimVerified", () => {
  it("treats exactly one kind as sample data", () => {
    expect(isSampleProfile("demo")).toBe(true);
    expect(isSampleProfile("customer")).toBe(false);
  });

  it("permits an unqualified verification claim only for customers", () => {
    expect(mayClaimVerified("customer")).toBe(true);
    expect(mayClaimVerified("demo")).toBe(false);
  });

  it("keeps the two predicates strictly complementary", () => {
    // If these ever drift apart, some surface will both disclose AND
    // claim verified, or neither.
    for (const kind of PROFILE_KINDS) {
      expect(isSampleProfile(kind)).toBe(!mayClaimVerified(kind));
    }
  });
});

describe("profileChromeKeys — the page must disclose sample data", () => {
  it("gives a demo profile a disclosure banner", () => {
    const chrome = profileChromeKeys("demo");
    expect(chrome.disclosure).not.toBeNull();
    expect(chrome.disclosure?.titleKey).toBeTruthy();
    expect(chrome.disclosure?.bodyKey).toBeTruthy();
    expect(chrome.disclosure?.chipKey).toBeTruthy();
  });

  it("gives a customer profile no banner", () => {
    expect(profileChromeKeys("customer").disclosure).toBeNull();
  });

  it("never reuses a customer copy key on a demo profile", () => {
    // A demo profile that silently falls back to the customer catalog is
    // the exact regression: it would print "Verified Business Identity"
    // over fictional data.
    const customer = profileChromeKeys("customer");
    const demo = profileChromeKeys("demo");
    const fields = [
      "eyebrowKey",
      "metaTitleSuffixKey",
      "metaDescriptionKey",
      "scoreLabelKey",
      "scoreAriaKey",
      "capabilityHeadingKey",
      "capabilityIntroKey",
      "attestationsHeadingKey",
    ] as const;
    for (const f of fields) {
      expect(demo[f], `demo.${f} must not equal customer.${f}`).not.toBe(
        customer[f],
      );
      expect(demo[f]).toContain("businessIdPublic.demo.");
    }
  });

  it("resolves every demo key in BOTH catalogs — no silent EN fallback", () => {
    // t() falls back to EN for a missing VI key, so a missing VI
    // translation would still render the disclosure, just in English.
    // Pin both anyway: a partially-translated disclosure on the VI mirror
    // is a disclosure a Vietnamese reader may skip.
    const chrome = profileChromeKeys("demo");
    const keys = [
      chrome.eyebrowKey,
      chrome.metaTitleSuffixKey,
      chrome.metaDescriptionKey,
      chrome.scoreLabelKey,
      chrome.scoreAriaKey,
      chrome.capabilityHeadingKey,
      chrome.capabilityIntroKey,
      chrome.attestationsHeadingKey,
      chrome.disclosure?.titleKey ?? "",
      chrome.disclosure?.bodyKey ?? "",
      chrome.disclosure?.chipKey ?? "",
      "businessIdPublic.demo.attestations.intro",
      "businessIdPublic.demo.share.heading",
      "businessIdPublic.demo.share.body",
      "businessIdPublic.demo.share.cta",
      "businessIdPublic.demo.footer",
    ];
    for (const k of keys) {
      expect(k, "key must be non-empty").toBeTruthy();
      expect(EN[k], `en.json missing ${k}`).toBeTruthy();
      expect(VI[k], `vi.json missing ${k}`).toBeTruthy();
    }
  });

  it("says 'sample' in the demo banner and metadata copy (EN)", () => {
    const chrome = profileChromeKeys("demo");
    const banner = [
      EN[chrome.disclosure?.titleKey ?? ""],
      EN[chrome.disclosure?.bodyKey ?? ""],
      EN[chrome.disclosure?.chipKey ?? ""],
    ].join(" ");
    expect(banner.toLowerCase()).toContain("sample");
    expect(banner.toLowerCase()).toContain("not a real");

    // The <title>/description are the only disclosure a SERP snippet or
    // a pasted OG card ever shows.
    expect(EN[chrome.metaTitleSuffixKey]?.toLowerCase()).toContain("sample");
    expect(EN[chrome.metaDescriptionKey]?.toLowerCase()).toContain("sample");
  });

  it("never labels a demo composite as a trust score", () => {
    const chrome = profileChromeKeys("demo");
    expect(EN[chrome.scoreLabelKey]?.toLowerCase()).not.toContain("trust");
    expect(EN[chrome.scoreLabelKey]?.toLowerCase()).toContain("sample");
  });
});

describe("badgeChrome — the hotlinked SVG must not claim verification", () => {
  it("claims verified ONLY for a customer profile", () => {
    expect(badgeChrome({ kind: "customer", level: 3 }).claimsVerified).toBe(
      true,
    );
    expect(badgeChrome({ kind: "demo", level: 4 }).claimsVerified).toBe(false);
    expect(badgeChrome({ kind: null, level: 0 }).claimsVerified).toBe(false);
  });

  it("never emits a bare 'Verified' claim on a demo badge, at any level", () => {
    // Every rung of the ladder, because a future migration could bump the
    // demo row's level and the badge must stay honest at all of them.
    for (let level = 0; level <= 5; level++) {
      const c = badgeChrome({ kind: "demo", level });
      const visible = `${c.chipText} ${c.headline} ${c.sublinePrefix}`;
      expect(visible.toLowerCase(), `level ${level}`).not.toContain("verified");
      expect(c.accessibleTitle.toLowerCase()).toContain("sample data");
      expect(c.accessibleTitle.toLowerCase()).toContain("not a real");
    }
  });

  it("marks the demo chip DEMO rather than the level rung", () => {
    const c = badgeChrome({ kind: "demo", level: 4 });
    expect(c.chipText).toBe("DEMO");
    expect(c.chipText).not.toBe("L4");
    expect(c.headline.toLowerCase()).toContain("sample");
  });

  it("uses a visually distinct accent so the two badges never look alike", () => {
    const verified = badgeChrome({ kind: "customer", level: 4 });
    const demo = badgeChrome({ kind: "demo", level: 4 });
    expect(demo.accent).not.toBe(verified.accent);
    expect(demo.background).not.toBe(verified.background);
  });

  it("still renders the real verified badge for a customer", () => {
    const c = badgeChrome({ kind: "customer", level: 4 });
    expect(c.chipText).toBe("L4");
    expect(c.headline).toBe("Attested");
    expect(c.sublinePrefix).toBe("Verified");
    expect(c.accessibleTitle).toBe("BlockID Verified — Level 4 Attested");
  });

  it("falls back to a neutral Unverified placeholder for an unknown slug", () => {
    const c = badgeChrome({ kind: null, level: 0 });
    expect(c.chipText).toBe("N/A");
    expect(c.headline).toBe("Unverified");
  });
});

describe("badgeLevelLabel", () => {
  it("labels the full 0..5 ladder", () => {
    expect(badgeLevelLabel(0)).toBe("Unverified");
    expect(badgeLevelLabel(1)).toBe("Self-declared");
    expect(badgeLevelLabel(2)).toBe("Evidence-checked");
    expect(badgeLevelLabel(3)).toBe("Trust tier");
    expect(badgeLevelLabel(4)).toBe("Attested");
    expect(badgeLevelLabel(5)).toBe("Continuously monitored");
  });

  it("falls back to Unverified for an out-of-range level", () => {
    expect(badgeLevelLabel(-1)).toBe("Unverified");
    expect(badgeLevelLabel(99)).toBe("Unverified");
  });
});

describe("JSON-LD disclosure", () => {
  it("carries the sample-data notice for structured-data consumers", () => {
    // Crawlers and aggregators never see the visual banner.
    const n = SAMPLE_DATA_JSONLD_NOTICE.toLowerCase();
    expect(n).toContain("sample data");
    expect(n).toContain("fictional");
    expect(n).toContain("not a real trading entity");
    expect(n).toContain("no abn");
  });

  it("qualifies the credential name so it cannot read as a real credential", () => {
    expect(SAMPLE_DATA_CREDENTIAL_SUFFIX.toLowerCase()).toContain("sample data");
    expect(SAMPLE_DATA_CREDENTIAL_SUFFIX.toLowerCase()).toContain(
      "not a real credential",
    );
  });
});

describe("exhaustiveness", () => {
  it("every declared kind has chrome and badge chrome", () => {
    // Adding a third kind to PROFILE_KINDS without wiring its chrome
    // would silently inherit the customer path here.
    for (const kind of PROFILE_KINDS as readonly ProfileKind[]) {
      const chrome = profileChromeKeys(kind);
      expect(chrome.eyebrowKey).toBeTruthy();
      expect(EN[chrome.eyebrowKey]).toBeTruthy();
      const badge = badgeChrome({ kind, level: 3 });
      expect(badge.chipText).toBeTruthy();
      expect(badge.headline).toBeTruthy();
      // Only a kind explicitly allowed to may claim verification.
      expect(badge.claimsVerified).toBe(mayClaimVerified(kind));
    }
  });
});
