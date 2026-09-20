// G21-P1-B — the founder-facing evidence status vocabulary, one chip per
// evidence item: Claimed · Evidence-backed · Verified · Unverified · Conflicting.
//
// Derivation today (level + verified flag + review state):
//   verified          — a reviewer signed it (is_verified / verified_at) or the
//                       rung is third_party_verified
//   conflicting       — the row says so (review rejected, or an explicit
//                       `conflicting` flag)
//   evidence-backed   — document_uploaded or better (a real artefact or a
//                       machine-read source)
//   claimed           — self_declared / public_url with no review pending
//   unverified        — a claim whose verification was requested and is still
//                       pending, or a stale / expired row
//
// TODO(P1-A): after the Claim / EvidenceRecord merge, read
// `claims.assessment_status` (claimed | evidence_backed | verified |
// unverified | conflicting) directly and keep this derivation only as the
// fallback for rows without a claim.
//
// Pure — no I/O, no React.

import { confidenceRank, isConfidenceLevel } from "@/lib/evidence/confidence-cap";

export type EvidenceStatusKey = "claimed" | "evidence_backed" | "verified" | "unverified" | "conflicting";

export interface StatusChipInput {
  /** The ladder rung (confidence_level) or an L1–L6 badge. */
  level?: string | null;
  verified?: boolean | null;
  verifiedAt?: string | null;
  /** svi_dimension_evidence.review_status: none | pending | approved | rejected. */
  reviewStatus?: string | null;
  /** Explicit contradiction flag (P1-A `contradiction_status`), when the caller has it. */
  conflicting?: boolean | null;
  /** The row expired or is stale (state machine `expired`, or a past `expires_at`). */
  stale?: boolean | null;
}

export interface StatusChip {
  status: EvidenceStatusKey;
  label: string;
  /** Theme-contract text token for the chip (no translucent grounds, no dark: overrides). */
  tone: "text-action" | "text-bull" | "text-secondary" | "text-warn" | "text-bear";
  /** Tinted border pairing for the chip surface. */
  border: string;
  /** One line the founder can act on. */
  hint: string;
}

const BADGE_TO_LEVEL: Record<string, string> = { L1: "self_declared", L2: "public_url", L3: "document_uploaded", L4: "connected_source", L5: "transaction_data", L6: "third_party_verified" };

export const STATUS_CHIP_LABELS: Readonly<Record<EvidenceStatusKey, string>> = Object.freeze({
  claimed: "Claimed",
  evidence_backed: "Evidence-backed",
  verified: "Verified",
  unverified: "Unverified",
  conflicting: "Conflicting",
});

const CHIP_META: Readonly<Record<EvidenceStatusKey, Omit<StatusChip, "status" | "label">>> = Object.freeze({
  verified: { tone: "text-bull", border: "border-emerald-300 dark:border-emerald-800", hint: "A named reviewer signed this item." },
  evidence_backed: { tone: "text-action", border: "border-sky-300 dark:border-sky-800", hint: "A document or connected source backs this item; request review to verify it." },
  claimed: { tone: "text-secondary", border: "border-line-subtle", hint: "Stated by the founder; add a document or connect the source to back it." },
  unverified: { tone: "text-warn", border: "border-amber-300 dark:border-amber-800", hint: "Verification requested or the item is stale; a reviewer has not signed it." },
  conflicting: { tone: "text-bear", border: "border-orange-300 dark:border-orange-800", hint: "Sources disagree or a reviewer rejected it; correct or replace the item." },
});

/** The status an evidence item shows the founder (pure, deterministic). */
export function statusOf(item: StatusChipInput): EvidenceStatusKey {
  const raw = item.level ?? null;
  const level = raw && BADGE_TO_LEVEL[raw] ? BADGE_TO_LEVEL[raw] : raw;
  const review = (item.reviewStatus ?? "none").toLowerCase();
  if (item.conflicting === true || review === "rejected") return "conflicting";
  const signed = item.verified === true || Boolean(item.verifiedAt) || review === "approved";
  if (signed || level === "third_party_verified") return "verified";
  if (item.stale === true || review === "pending") return "unverified";
  if (isConfidenceLevel(level) && confidenceRank(level) >= confidenceRank("document_uploaded")) return "evidence_backed";
  return "claimed";
}

export function statusChip(item: StatusChipInput): StatusChip {
  const status = statusOf(item);
  return { status, label: STATUS_CHIP_LABELS[status], ...CHIP_META[status] };
}

/** Every status in display order (for legends). */
export const STATUS_CHIP_ORDER: readonly EvidenceStatusKey[] = ["claimed", "evidence_backed", "verified", "unverified", "conflicting"];
