// Single source of truth for mentor access tiers + gating helpers.
//
// See docs/plans/mentor-consent-model.md — three-tier model built on top of
// existing reseller_attributions:
//   attributed_only  — auto once attribution exists; masked KPIs + phase only
//   reports_shared   — founder-approved 12-month grant; per-report toggles
//   full_mentor      — SVI evidence + cap-table + exit-readiness + notes
//
// Every read from a mentor surface MUST pass through the helpers here — no
// route or drawer field is served from a reseller-scoped query without first
// calling `tierAtLeast(grant.tier, requiredTier)`. This mirrors the pattern
// in lib/reseller/scope.ts and keeps the RLS surface small.
//
// NOTE: The mentor_access_grants table is created in a separate migration
// (CTO agent). This module is deliberately schema-agnostic below the type
// contract — `loadActiveGrant` uses the admin Supabase client because a
// mentor is a reseller-type user with legitimate service access; the gate
// is the application-layer check, not RLS.

// NOTE: DB accessors (loadActiveGrant + loadAllGrantsForFounder) moved to
// access-tiers-server.ts so this file stays client-safe. The mentor-invite
// consent form (client component) imports CONSENT_LIFETIME_DAYS + tierLabel +
// MentorAccessTier — pulling supabase.ts into it broke the browser bundle.

// ─── Tier constants ────────────────────────────────────────────────────

export const MENTOR_ACCESS_TIERS = [
  "attributed_only",
  "reports_shared",
  "full_mentor",
] as const;

export type MentorAccessTier = (typeof MENTOR_ACCESS_TIERS)[number];

export const TIER_RANK: Record<MentorAccessTier, number> = {
  attributed_only: 0,
  reports_shared: 1,
  full_mentor: 2,
};

/** Default consent lifetime for reports_shared / full_mentor grants. */
export const CONSENT_LIFETIME_DAYS = 365;

/** Warning windows before expiry — used by consent-expiry-cron.ts. */
export const EXPIRY_WARN_DAYS = [30, 7] as const;

// ─── Grant row shape (mirrors mentor_access_grants) ────────────────────

export interface MentorAccessGrant {
  id: string;
  reseller_id: string;
  /** The mentor's app_users.id — a reseller admin acting as mentor. */
  mentor_user_id: string;
  /** The founder's app_users.id — the person whose data is being viewed. */
  founder_user_id: string;
  /** Optional project scope (per-startup grant); null = all founder projects. */
  project_id: string | null;
  tier: MentorAccessTier;
  granted_at: string;
  /** null for tier attributed_only; ISO timestamp for tier B/C. */
  expires_at: string | null;
  /** null when active; ISO timestamp when the founder revoked. */
  revoked_at: string | null;
  /** Per-report toggle map — { [reportId]: true } founder has opted in to. */
  report_toggles: Record<string, boolean> | null;
  /** ISO timestamps of when the 30d / 7d warning emails were fired. */
  reminder_30d_sent_at: string | null;
  reminder_7d_sent_at: string | null;
}

/** Minimal per-report shape needed for canViewReport. */
export interface AssembledReportLite {
  id: string;
  /** Founder-facing toggle: has the founder shared THIS report? */
  shared_with_mentor: boolean;
}

// ─── Pure helpers ──────────────────────────────────────────────────────

/** True when the caller's tier is at least the minimum required. */
export function tierAtLeast(
  have: MentorAccessTier | null | undefined,
  need: MentorAccessTier,
): boolean {
  if (!have) return false;
  return TIER_RANK[have] >= TIER_RANK[need];
}

/**
 * Convenience alias matching the spec's requireTier() name. Returns a
 * boolean rather than throwing so callers can render an
 * <AccessRequestBanner /> in place of the gated content.
 */
export function requireTier(
  current: MentorAccessTier | null | undefined,
  minimum: MentorAccessTier,
): boolean {
  return tierAtLeast(current, minimum);
}

/** Human-readable label for tier chips + settings copy. */
export function tierLabel(t: MentorAccessTier): string {
  switch (t) {
    case "attributed_only":
      return "Attributed only";
    case "reports_shared":
      return "Reports shared";
    case "full_mentor":
      return "Full mentor";
  }
}

/**
 * Semantic colour bucket for AccessTierBadge — maps to the shadcn Badge
 * variants exposed by @/components/ui/badge.
 */
export function tierBadgeColor(
  t: MentorAccessTier,
): "default" | "brand" | "success" {
  switch (t) {
    case "attributed_only":
      return "default";
    case "reports_shared":
      return "brand";
    case "full_mentor":
      return "success";
  }
}

/** One-line disclosure of what the mentor sees at this tier. */
export function tierDisclosure(t: MentorAccessTier): string {
  switch (t) {
    case "attributed_only":
      return "Growth phase and masked KPIs. No SVI numbers, no reports, no cap-table.";
    case "reports_shared":
      return "Everything at Attributed, plus SVI numbers and reports you toggle on.";
    case "full_mentor":
      return "Everything at Reports Shared, plus SVI evidence trail, cap-table shape, exit-readiness lenses, and mentor notes.";
  }
}

// ─── Investor Dossier field allow-lists (G13 S-D3, BA spec §A.3 block 3) ──
//
// What the dossier's evidence block may SHOW at each consent tier. The
// loader (lib/evaluations/dossier.ts `projectEvidenceByTier`) masks
// server-side; this table is the single statement of the rule the block
// renders as "what you see / what needs the founder's next grant".

export const DOSSIER_FIELDS = [
  "phase",
  "kpi_bands",
  "evidence_counts",
  "full_report",
  "evidence_items",
  "evidence_source_kind",
  "evidence_freshness",
  "connector_freshness",
  "public_urls",
  "document_links",
  "dataroom_index",
  "cap_table_summary",
  "exit_readiness",
  "founder_notes",
] as const;
export type DossierField = (typeof DOSSIER_FIELDS)[number];

export const DOSSIER_FIELD_LABELS: Record<DossierField, string> = {
  phase: "Growth phase",
  kpi_bands: "KPI bands (not values)",
  evidence_counts: "Evidence counts per dimension",
  full_report: "Full Trusted Business Report",
  evidence_items: "Evidence items (type, label)",
  evidence_source_kind: "Source kind per item (self-declared → connected)",
  evidence_freshness: "Evidence date / freshness",
  connector_freshness: "Connector freshness (Stripe / Xero / GA4 / GitHub)",
  public_urls: "Public URLs cited",
  document_links: "Uploaded document links",
  dataroom_index: "Data-room index",
  cap_table_summary: "Cap-table summary",
  exit_readiness: "Exit-readiness lenses",
  founder_notes: "Founder notes",
};

/** Exactly the §A.3 block-3 table, as allow-lists. */
export const DOSSIER_FIELD_ALLOW_LIST: Record<MentorAccessTier, readonly DossierField[]> = {
  attributed_only: ["phase", "kpi_bands", "evidence_counts"],
  reports_shared: ["phase", "kpi_bands", "evidence_counts", "full_report", "evidence_items", "evidence_source_kind", "evidence_freshness", "connector_freshness", "public_urls"],
  full_mentor: [...DOSSIER_FIELDS],
};

export function canShowDossierField(tier: MentorAccessTier | null | undefined, field: DossierField): boolean {
  if (!tier) return false;
  return DOSSIER_FIELD_ALLOW_LIST[tier].includes(field);
}

/** Fields the NEXT tier unlocks (the request-upgrade CTA copy); empty at full_mentor. */
export function dossierFieldsUnlockedBy(tier: MentorAccessTier): { next: MentorAccessTier | null; fields: DossierField[] } {
  const idx = MENTOR_ACCESS_TIERS.indexOf(tier);
  const next = idx >= 0 && idx < MENTOR_ACCESS_TIERS.length - 1 ? MENTOR_ACCESS_TIERS[idx + 1] : null;
  if (!next) return { next: null, fields: [] };
  const have = new Set(DOSSIER_FIELD_ALLOW_LIST[tier]);
  return { next, fields: DOSSIER_FIELD_ALLOW_LIST[next].filter((f) => !have.has(f)) };
}

// ─── Grant-scoped predicates ───────────────────────────────────────────

/**
 * True if the mentor can view a specific assembled report. Per-report
 * founder toggle takes precedence at every tier — even at full_mentor a
 * mentor cannot view a report the founder has NOT toggled shared_with_mentor.
 */
export function canViewReport(
  grant: MentorAccessGrant | null,
  report: AssembledReportLite,
  now = new Date(),
): boolean {
  if (!grant) return false;
  if (isExpired(grant, now) || grant.revoked_at) return false;
  if (!tierAtLeast(grant.tier, "reports_shared")) return false;
  // Per-report toggle map wins over tier — mentor at C still needs the
  // founder to have opted in to THIS report.
  return report.shared_with_mentor === true;
}

/** True if the mentor can view SVI evidence (raw source-of-truth rows). */
export function canViewSviEvidence(
  grant: MentorAccessGrant | null,
  now = new Date(),
): boolean {
  if (!grant) return false;
  if (isExpired(grant, now) || grant.revoked_at) return false;
  return tierAtLeast(grant.tier, "full_mentor");
}

/** True if the mentor can leave a note the founder sees. */
export function canLeaveNote(
  grant: MentorAccessGrant | null,
  now = new Date(),
): boolean {
  if (!grant) return false;
  if (isExpired(grant, now) || grant.revoked_at) return false;
  return tierAtLeast(grant.tier, "full_mentor");
}

/**
 * True if the grant expires within `days` days from `now`. Boundary
 * behaviour: at exactly `days` remaining this returns true; beyond
 * `days` returns false. Tier attributed_only never expires.
 */
export function isExpiringSoon(
  grant: MentorAccessGrant | null,
  days = 30,
  now: Date = new Date(),
): boolean {
  if (!grant?.expires_at) return false;
  if (grant.revoked_at) return false;
  const ms = new Date(grant.expires_at).getTime() - now.getTime();
  if (ms <= 0) return false; // already expired — different signal
  const dayMs = 24 * 60 * 60 * 1000;
  return ms <= days * dayMs;
}

/** True if the grant is past its expires_at timestamp. */
export function isExpired(
  grant: MentorAccessGrant | null,
  now: Date = new Date(),
): boolean {
  if (!grant?.expires_at) return false;
  return new Date(grant.expires_at).getTime() <= now.getTime();
}

/**
 * True iff the grant is currently effective — not revoked, not expired.
 */
export function isEffective(
  grant: MentorAccessGrant | null,
  now: Date = new Date(),
): boolean {
  if (!grant) return false;
  if (grant.revoked_at) return false;
  if (isExpired(grant, now)) return false;
  return true;
}

// ─── Server loaders — moved to ./access-tiers-server.ts (needs supabase) ──
// Import loadActiveGrant / loadAllGrantsForFounder from "@/lib/mentor/access-tiers-server".
