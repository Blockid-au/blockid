// G14-S36 F-6 leftover — "why my score changed" line for the founder
// weekly digest's SVI Δ block.
//
// S36 (2026-09-17) made evidence confidence source-capped (self-declared ≤
// document, connector, reviewer) and added an L0–L5 ABN verification
// multiplier (`meta.verification` on the stored `svi_snapshots.analysis_json`,
// SVI_VERSION 2.1.0 → 2.2.0 — see lib/svi-analysis.ts, lib/verification/
// confidence-multiplier.ts). A founder whose SVI moved purely because of
// that change, with no evidence added, needs one plain sentence saying so —
// otherwise the move looks arbitrary.
//
// Pure: no I/O, no Supabase, no fetch. Compares the two snapshots'
// `version` and `meta.verification` fields only.

import { t, type Messages } from "@/lib/i18n/t";
import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";
import type { Locale } from "@/lib/i18n/locales";

const CATALOG: Readonly<Record<Locale, Messages>> = {
  en: en as Messages,
  vi: vi as Messages,
};

export interface ScoreVerificationMeta {
  level: number;
  multiplier: number;
}

/** The subset of a stored `svi_snapshots.analysis_json` this helper reads. */
export interface ScoreVersionSnapshot {
  version?: string | null;
  meta?: { verification?: ScoreVerificationMeta | null } | null;
}

/**
 * Returns the "Why it moved" sentence when the move is explained by S36
 * (a SVI_VERSION bump, or the founder's own verification level/multiplier
 * changing since the previous snapshot), or `null` when neither applies —
 * including when there is no previous snapshot to compare against, or the
 * current snapshot carries no verification meta at all (pre-S36 rows).
 */
export function whyScoreMoved(
  prev: ScoreVersionSnapshot | null | undefined,
  next: ScoreVersionSnapshot | null | undefined,
  locale: Locale = "en",
): string | null {
  if (!next) return null;

  const nextVerification = next.meta?.verification ?? null;
  if (!nextVerification) return null;

  const prevVersion = prev?.version ?? null;
  const nextVersion = next.version ?? null;
  const versionBumped =
    prevVersion !== null && nextVersion !== null && prevVersion !== nextVersion;

  const prevVerification = prev?.meta?.verification ?? null;
  const levelChanged =
    prevVerification !== null &&
    (prevVerification.level !== nextVerification.level ||
      prevVerification.multiplier !== nextVerification.multiplier);

  if (!versionBumped && !levelChanged) return null;

  const messages = CATALOG[locale] ?? CATALOG.en;
  const template = t(messages, "digest.why_moved.sentence");
  return template.replace("{level}", String(nextVerification.level));
}
