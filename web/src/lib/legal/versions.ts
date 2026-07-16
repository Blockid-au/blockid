// Legal disclaimer version registry.
//
// Every disclaimer surface has a pinned version string. Bumping a version
// forces re-consent because consent_events.disclaimer_version is part of the
// row and the DisclaimerBlock UI compares stored ack version to current.
//
// Keep in sync with the disclaimer_registry table (migration 0076_compliance_and_equity.sql)
// and the on-disk MDX bodies under web/content/legal/disclaimers/. When
// changing a body_md, always mint a NEW version string here — never edit an
// existing version's copy in place, or the hash chain in consent_events will
// silently drift from what users actually saw.
//
// Format: `v<major>.<minor>-<YYYY-MM-DD>`.

export type DisclaimerKind =
  | "tos"
  | "privacy"
  | "general_advice_warning"
  | "wholesale_certification"
  | "equity_offer_disclaimer"
  | "not_financial_advice"
  | "marketing";

export const DISCLAIMER_VERSIONS: Record<DisclaimerKind, string> = {
  tos: "v2.0-2026-07-16",
  privacy: "v2.0-2026-07-16",
  general_advice_warning: "v1.0-2026-07-16",
  wholesale_certification: "v1.0-2026-07-16",
  equity_offer_disclaimer: "v1.0-2026-07-16",
  not_financial_advice: "v1.0-2026-07-16",
  marketing: "v1.0-2026-07-16",
};

export function getCurrentVersion(kind: string): string {
  const v = (DISCLAIMER_VERSIONS as Record<string, string | undefined>)[kind];
  if (!v) {
    throw new Error(`getCurrentVersion: unknown disclaimer kind '${kind}'`);
  }
  return v;
}

export function isKnownDisclaimerKind(kind: string): kind is DisclaimerKind {
  return kind in DISCLAIMER_VERSIONS;
}
