// G21 P3-C — reviewer signature block for dossiers and IC memos.
//
// P2-C put a signature on the Cohort Report (lib/evaluations/cohort-report.ts
// `signature` + `humanReview`); this is the same shape for the per-startup
// surfaces: the web dossier, the IC memo PDF. One pure builder so the three
// twins print the same fields:
//
//   Reviewer · Role (· Organisation) · Date · Methodology (SVI_VERSION) ·
//   Overrides for this startup · "Humans make the decision" line
//
// Overrides are read fail-soft by the caller (assessment_overrides,
// migration 0423 — `countOverridesForProject`); null means "not available",
// which the block states rather than printing 0.
//
// Pure: no I/O, safe in PDF and client code.

import { SVI_VERSION } from "@/lib/svi-analysis";

/** The institutional line (docs/design/messaging.md § 4b; governance principle). */
export const HUMANS_DECIDE_LINE = "BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.";

/** Seat roles (lib/investor/organisations.ts SEAT_ROLES) → the label printed on a signature. */
export const SEAT_ROLE_LABEL: Record<string, string> = {
  investor_viewer: "Viewer",
  investor_analyst: "Analyst",
  investment_manager: "Investment manager",
  investment_partner: "Investment partner",
  ic_member: "IC member",
  fund_admin: "Fund admin",
  accelerator_analyst: "Program analyst",
  institutional_admin: "Institutional admin",
};

export interface ReviewerSignatureInput {
  /** Display name (or e-mail) of the signer; null / empty → a signature line to fill by hand. */
  reviewerName: string | null | undefined;
  /** A seat role code (SEAT_ROLES) or a free-text role; null → the fallback. */
  role?: string | null;
  /** Fallback role label when no seat role is known. */
  roleFallback?: string;
  /** Organisation the reviewer acts for (investor_organisations.name); omitted for a personal org. */
  organisation?: string | null;
  /** ISO — when the document was generated. */
  generatedAt: string;
  methodologyVersion?: string | null;
  /** assessment_overrides for THIS startup; null when the table could not be read. */
  overridesCount: number | null;
}

export interface ReviewerSignature {
  name: string;
  role: string;
  organisation: string | null;
  /** en-AU long date (Australia/Sydney). */
  date: string;
  methodologyVersion: string;
  overrides: number | null;
  /** One sentence about overrides for this startup. */
  overridesLine: string;
  humansLine: string;
}

export function fmtSignatureDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });
}

/** Seat role code → label; free text passes through; empty → fallback. */
export function reviewerRoleLabel(role: string | null | undefined, fallback = "Evaluator"): string {
  const r = (role ?? "").trim();
  if (!r) return fallback;
  return SEAT_ROLE_LABEL[r] ?? r;
}

export function overridesLine(count: number | null): string {
  if (count === null) return "Reviewer overrides for this startup could not be read; the canonical SVI is shown unchanged.";
  if (count === 0) return "No dimension score was overridden by a reviewer for this startup.";
  return `${count} reviewer override${count === 1 ? "" : "s"} recorded for this startup with a reason code, shown beside the canonical SVI and never replacing it.`;
}

/** Pure: the signature block for a dossier / IC memo. */
export function buildReviewerSignature(input: ReviewerSignatureInput): ReviewerSignature {
  const overrides = typeof input.overridesCount === "number" && Number.isFinite(input.overridesCount) ? Math.max(0, Math.round(input.overridesCount)) : null;
  return {
    name: (input.reviewerName ?? "").trim(),
    role: reviewerRoleLabel(input.role, input.roleFallback),
    organisation: (input.organisation ?? "").trim() || null,
    date: fmtSignatureDate(input.generatedAt),
    methodologyVersion: (input.methodologyVersion ?? "").trim() || SVI_VERSION,
    overrides,
    overridesLine: overridesLine(overrides),
    humansLine: HUMANS_DECIDE_LINE,
  };
}

/** label · value lines for the PDF / text twins (the name prints a rule to sign when empty). */
export function signatureLines(sig: ReviewerSignature): Array<{ label: string; value: string }> {
  const lines = [
    { label: "Reviewer", value: sig.name || "____________________" },
    { label: "Role", value: sig.organisation ? `${sig.role} · ${sig.organisation}` : sig.role },
    { label: "Date", value: sig.date },
    { label: "Methodology", value: `Startup Value Index v${sig.methodologyVersion}` },
    { label: "Overrides", value: sig.overrides === null ? "not available" : String(sig.overrides) },
  ];
  return lines;
}
