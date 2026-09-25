// G34-BT2 EM05 (D24-e, 25/09/2026) — the one marketing-consent wording.
//
// Isomorphic (no server-only): the signup, register and /analyze guest
// forms render MARKETING_CONSENT_LABEL next to an UNTICKED checkbox kept
// separate from the terms of service, and lib/consent.ts records
// MARKETING_CONSENT_VERSION + sha256(label) with the grant. Change the words
// → bump the version, so every stored consent still names the exact text the
// person saw.

export const MARKETING_CONSENT_VERSION = "2026-09-25.v1";

export const MARKETING_CONSENT_LABEL =
  "Email me occasional tips, product news and offers from BlockID. Optional — unsubscribe any time.";

/** Where the consent was given (stored with it). */
export type MarketingConsentMethod = "signup_card" | "register_password" | "analyze_guest_email";
