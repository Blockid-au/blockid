/**
 * Sample-data disclosure for `/showcase/sprocketbay`.
 *
 * The walkthrough page shows the same company as `/id/sprocketbay-demo`
 * and quotes the same verification level and trust score. If the two
 * surfaces disclosed differently — or if one of them stopped disclosing
 * at all — a visitor could reasonably read the walkthrough as a record
 * of a real verification.
 *
 * So the branching is not re-implemented here. This module resolves the
 * disclosure through `@/lib/business-id/profile-disclosure`, exactly as
 * `/id/[slug]` does: `profileChromeKeys('demo')` decides *which* keys,
 * `t()` resolves them out of the same i18n catalogue, and
 * `badgeChrome()` decides whether the level chip is allowed to say
 * "Verified" (it is not).
 *
 * Pure — no React, no I/O. The page renders what this returns.
 */

import {
  badgeChrome,
  badgeLevelLabel,
  coerceProfileKind,
  isSampleProfile,
  mayClaimVerified,
  profileChromeKeys,
  SAMPLE_DATA_JSONLD_NOTICE,
  type BadgeChrome,
  type ProfileKind,
} from "@/lib/business-id/profile-disclosure";
import { t, type Messages } from "@/lib/i18n/t";

/**
 * The walkthrough narrates a seeded demo profile, so its kind is fixed
 * at the source rather than passed in — but it is still routed through
 * `coerceProfileKind` so the value can only ever be one the disclosure
 * module recognises.
 */
export const SPROCKETBAY_PROFILE_KIND: ProfileKind = coerceProfileKind("demo");

export interface WalkthroughDisclosure {
  /** Small uppercase chip, e.g. "Sample data". */
  chip: string;
  /** Banner heading. */
  title: string;
  /** Banner body. */
  body: string;
  /** Machine-readable notice, mirrored into the page's JSON-LD. */
  jsonLdNotice: string;
  /** False for demo profiles — the page must not claim verification. */
  claimsVerified: boolean;
  /** True whenever the disclosure banner is mandatory. */
  isSample: boolean;
}

/**
 * Resolve the disclosure banner for the walkthrough.
 *
 * Returns `null` only for a profile kind that requires no disclosure —
 * which cannot happen for this page, but is kept as the honest return
 * type so a future caller passing `'customer'` does not get a
 * sample-data banner bolted onto a real business.
 */
export function walkthroughDisclosure(
  messages: Messages,
  kind: ProfileKind = SPROCKETBAY_PROFILE_KIND,
): WalkthroughDisclosure | null {
  const chrome = profileChromeKeys(kind);
  if (!chrome.disclosure) return null;
  return {
    chip: t(messages, chrome.disclosure.chipKey),
    title: t(messages, chrome.disclosure.titleKey),
    body: t(messages, chrome.disclosure.bodyKey),
    jsonLdNotice: SAMPLE_DATA_JSONLD_NOTICE,
    claimsVerified: mayClaimVerified(kind),
    isSample: isSampleProfile(kind),
  };
}

/**
 * Chrome for the verification-level chip the walkthrough renders next to
 * the ladder. Delegates entirely to `badgeChrome()` so the walkthrough
 * cannot drift from the embed badge — the surface with the highest
 * misrepresentation risk.
 */
export function walkthroughLevelChrome(
  level: number,
  kind: ProfileKind = SPROCKETBAY_PROFILE_KIND,
): BadgeChrome & { levelLabel: string } {
  return { ...badgeChrome({ kind, level }), levelLabel: badgeLevelLabel(level) };
}
