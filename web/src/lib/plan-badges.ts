// Plan badge styling helpers — presentation-only, admin surfaces.
//
// TODO(entitlement): once plans-db exposes a `badge_color` column, replace
// these hard-coded plan-id branches with a lookup against the plans matrix.
// The comparisons below intentionally reference legacy plan ids so they
// keep colouring grandfathered accounts (founding50, growth, pro) until
// the migration lands. This is display-only and does NOT gate access.

export function planBadgeClass(plan: string | null | undefined): string {
  if (plan === "founding50") return "bg-brand-100 text-brand-700"; // legacy display-only
  if (plan === "growth") return "bg-green-100 text-green-700"; // legacy display-only
  if (plan === "pro") return "bg-green-100 text-green-700";
  return "bg-surface-100 text-ink-700";
}
