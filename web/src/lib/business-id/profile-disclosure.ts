/**
 * Profile-kind disclosure rules for the public Business ID surfaces.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `/id/[slug]`, `/vi/id/[slug]`, `/embed/badge` and `/api/v1/id/[slug]`
 * all render the same profile. Two of them (the HTML page and the SVG
 * badge) make a *claim* about the business: "BlockID Verified — Level N".
 * That claim is only honest for a real, verified customer.
 *
 * `public.projects.profile_kind` (migration 0298) is the discriminator:
 *
 *   'customer' — a real business that went through BlockID verification.
 *                The verification ladder, badges and "Verified" chrome
 *                are truthful.
 *   'demo'     — SAMPLE DATA. A fictional company seeded so visitors,
 *                screenshots and the /business-id marketing preview have
 *                something to look at. Nothing here was verified against
 *                a real entity, so every surface MUST carry a visible
 *                "Sample data" disclosure and MUST NOT present itself as
 *                a plain verified customer.
 *
 * Keeping the branching in ONE pure module (rather than inline `if`s in
 * the page and again in the badge) is deliberate: the colocated test
 * `profile-disclosure.test.ts` pins the rules once, so a future edit to
 * either surface cannot quietly turn sample data into an apparent real
 * verification.
 *
 * Pure — no React, no I/O, no Supabase. Safe to import anywhere.
 */

/** The `profile_kind` values migration 0298's CHECK constraint allows. */
export const PROFILE_KINDS = ["customer", "demo"] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export const DEFAULT_PROFILE_KIND: ProfileKind = "customer";

/**
 * Coerce an unknown DB/JSON value to a `ProfileKind`.
 *
 * Fails CLOSED in the safe direction: anything unrecognised becomes
 * `'customer'`, which is the *stricter* rendering path (no disclosure
 * banner, but also no false "sample" label on a real business). A row
 * that is genuinely sample data is always explicitly marked `'demo'` by
 * its seed migration, so an unknown value can never silently strip a
 * disclosure that was supposed to be there.
 */
export function coerceProfileKind(value: unknown): ProfileKind {
  return value === "demo" ? "demo" : DEFAULT_PROFILE_KIND;
}

/**
 * Is this profile sample data that must be disclosed as such?
 */
export function isSampleProfile(kind: ProfileKind): boolean {
  return kind === "demo";
}

/**
 * May this profile's surfaces make an unqualified "BlockID Verified"
 * claim? False for sample data — the badge and the page must qualify it.
 */
export function mayClaimVerified(kind: ProfileKind): boolean {
  return kind === "customer";
}

// ─── i18n key resolution ────────────────────────────────────────────
//
// The page renders through `t(messages, key)`. Rather than have the JSX
// pick keys with inline ternaries in eight places, resolve the whole set
// once here so the test can assert the demo set never collapses back to
// the customer set.

export interface ProfileChromeKeys {
  /** Small uppercase label above the H1. */
  eyebrowKey: string;
  /** Metadata `<title>` suffix. */
  metaTitleSuffixKey: string;
  /** Metadata description template. */
  metaDescriptionKey: string;
  /** Composite score chip label. */
  scoreLabelKey: string;
  /** Composite score chip aria-label. */
  scoreAriaKey: string;
  /** Capability section heading. */
  capabilityHeadingKey: string;
  /** Capability section intro copy. */
  capabilityIntroKey: string;
  /** Attestations section heading. */
  attestationsHeadingKey: string;
  /**
   * Banner keys — non-null ONLY for kinds that require a disclosure.
   * When present the page MUST render them above the fold.
   */
  disclosure: { titleKey: string; bodyKey: string; chipKey: string } | null;
}

const CUSTOMER_CHROME: ProfileChromeKeys = {
  eyebrowKey: "businessIdPublic.eyebrow",
  metaTitleSuffixKey: "businessIdPublic.meta.title.suffix",
  metaDescriptionKey: "businessIdPublic.meta.description.template",
  scoreLabelKey: "businessIdPublic.trustScore.label",
  scoreAriaKey: "businessIdPublic.trustScore.aria",
  capabilityHeadingKey: "businessIdPublic.capability.heading",
  capabilityIntroKey: "businessIdPublic.capability.intro",
  attestationsHeadingKey: "businessIdPublic.attestations.heading",
  disclosure: null,
};

const DEMO_CHROME: ProfileChromeKeys = {
  eyebrowKey: "businessIdPublic.demo.eyebrow",
  metaTitleSuffixKey: "businessIdPublic.demo.meta.title.suffix",
  metaDescriptionKey: "businessIdPublic.demo.meta.description.template",
  scoreLabelKey: "businessIdPublic.demo.score.label",
  scoreAriaKey: "businessIdPublic.demo.score.aria",
  capabilityHeadingKey: "businessIdPublic.demo.capability.heading",
  capabilityIntroKey: "businessIdPublic.demo.capability.intro",
  attestationsHeadingKey: "businessIdPublic.demo.attestations.heading",
  disclosure: {
    titleKey: "businessIdPublic.demo.banner.title",
    bodyKey: "businessIdPublic.demo.banner.body",
    chipKey: "businessIdPublic.demo.chip",
  },
};

export function profileChromeKeys(kind: ProfileKind): ProfileChromeKeys {
  return kind === "demo" ? DEMO_CHROME : CUSTOMER_CHROME;
}

// ─── Embed badge chrome ─────────────────────────────────────────────
//
// The badge is the highest-risk surface: it is hotlinked onto THIRD-PARTY
// pages as an <img>, stripped of all surrounding context. A sample-data
// badge that says "BlockID Verified — Level 4" on someone else's website
// is exactly the failure this module prevents.

export interface BadgeChrome {
  /** Text inside the coloured chip (e.g. "L4", "DEMO", "N/A"). */
  chipText: string;
  /** Primary line. */
  headline: string;
  /** Secondary line prefix, before the date / trailing "· blockid.au". */
  sublinePrefix: string;
  /** SVG <title> + aria-label. */
  accessibleTitle: string;
  /** Chip / accent colour. */
  accent: string;
  /** Card background colour. */
  background: string;
  /** True only when an unqualified verification claim is being made. */
  claimsVerified: boolean;
}

const BADGE_LEVEL_LABELS: Record<number, string> = {
  0: "Unverified",
  1: "Self-declared",
  2: "Evidence-checked",
  3: "Trust tier",
  4: "Attested",
  5: "Continuously monitored",
};

export function badgeLevelLabel(level: number): string {
  return BADGE_LEVEL_LABELS[level] ?? "Unverified";
}

export interface BadgeChromeInput {
  /** Null when the slug resolved to nothing (unknown / unpublished). */
  kind: ProfileKind | null;
  level: number;
}

/**
 * Resolve the badge's visual + textual chrome.
 *
 * Three cases:
 *   - null kind  → generic "Unverified" placeholder (unknown slug).
 *   - 'demo'     → "Sample data" chrome, grey, `claimsVerified: false`.
 *                  The word "Verified" never appears unqualified.
 *   - 'customer' → the real verified badge.
 */
export function badgeChrome({ kind, level }: BadgeChromeInput): BadgeChrome {
  if (kind === null) {
    return {
      chipText: "N/A",
      headline: "Unverified",
      sublinePrefix: "Not verified",
      accessibleTitle: "BlockID — Unverified",
      accent: "#999999",
      background: "#3a3a3a",
      claimsVerified: false,
    };
  }

  if (kind === "demo") {
    const label = badgeLevelLabel(level);
    return {
      chipText: "DEMO",
      headline: "Sample data",
      sublinePrefix: "Demo profile · not a real business",
      accessibleTitle: `BlockID sample data — demonstration profile at Level ${level} ${label}. Not a real business and not a real verification.`,
      // Amber, deliberately unlike the teal "verified" accent so the two
      // badges are distinguishable at a glance and in a screenshot.
      accent: "#f0b429",
      background: "#2a2113",
      claimsVerified: false,
    };
  }

  const label = badgeLevelLabel(level);
  return {
    chipText: `L${level}`,
    headline: label,
    sublinePrefix: "Verified",
    accessibleTitle: `BlockID Verified — Level ${level} ${label}`,
    accent: "#4fd1c5",
    background: "#0a1622",
    claimsVerified: true,
  };
}

// ─── JSON-LD ────────────────────────────────────────────────────────

/**
 * Sentence appended to the JSON-LD `disambiguatingDescription` (and to
 * the credential name) for sample profiles, so structured-data consumers
 * — search engines, AI crawlers, aggregators — receive the disclosure
 * too, not just human readers.
 */
export const SAMPLE_DATA_JSONLD_NOTICE =
  "SAMPLE DATA — this is a fictional demonstration business seeded by BlockID.au to illustrate the public Verified Business Profile. It is not a real trading entity, holds no ABN, and its verification level, capability scores and attestations are illustrative fixtures rather than the result of any real verification.";

/** Suffix appended to the credential name on sample profiles. */
export const SAMPLE_DATA_CREDENTIAL_SUFFIX = " (sample data — not a real credential)";
