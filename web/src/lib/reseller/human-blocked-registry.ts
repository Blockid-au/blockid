// Registry of currently human_blocked phases in the reseller module goal file.
//
// COO advisory §h (docs/plans/reviews/plan-review-coo.md rec #1) asked that the
// two open escalations surface in the weekly digest so admin@blockid.au sees
// them without having to grep the goal file. The autonomous loop cannot resolve
// these — they need a human to (a) confirm InfoVision's ABN + GST status per
// H.20 and (b) mint the Stripe add-on price env vars for share management.
//
// Keeping this as a hand-maintained const array (not a goal-file parser) is
// deliberate: the two entries have been stable since P0 sign-off (tick 43) and
// the parser would need to track YAML shape drift across ticks. When a new
// human_blocked leaf lands in the goal file, add an entry here in the same
// tick so the digest catches it on the next Monday run.
//
// Kept dependency-free so the digest formatter can be unit-tested in isolation.

/**
 * One row per open human-review item that the autonomous loop cannot advance.
 * `id` mirrors the goal-file `sub_phases` key so ops can grep it back.
 */
export interface HumanBlockedItem {
  /** Stable identifier from the goal file (e.g. `P1.5_infovision_seed`). */
  readonly id: string;
  /** Parent phase (`P1`, `P8`, etc.) for grouping in the digest table. */
  readonly phase: string;
  /** Short label for the digest row. */
  readonly title: string;
  /** What is blocking progress — one sentence, human-readable. */
  readonly blocker: string;
  /** Concrete action the human reviewer needs to take. */
  readonly action_required: string;
  /**
   * Owner email — who should act. Kept as a string (not enum) so the registry
   * can point at counsel / finance / ops without a code change.
   */
  readonly owner: string;
}

export const HUMAN_BLOCKED_ITEMS: readonly HumanBlockedItem[] = [
  {
    id: "P1.5_infovision_seed",
    phase: "P1",
    title: "InfoVision reseller seed",
    blocker:
      "resellers_seeded_intent.gst_registered + abn are both TBD_verify_at_creation; wholesale row requires both before the INSERT can fire.",
    action_required:
      "Confirm Auschain's InfoVision ABN + GST status per H.20 (Auschain existing counsel or LegalVision AU) so a single SQL INSERT can seed the first wholesale reseller row.",
    owner: "admin@blockid.au",
  },
  {
    id: "P8.5_env_and_playwright",
    phase: "P8",
    title: "Share-management add-on Stripe env vars",
    blocker:
      "STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY and STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL must be minted in the Stripe dashboard before the Playwright happy-path suite can green.",
    action_required:
      "Mint the two add-on price IDs in the Stripe dashboard (test + live mode) and paste them into the .env.local + production env store so P8.5 unblocks.",
    owner: "admin@blockid.au",
  },
] as const;

/**
 * Build a snapshot suitable for JSONL append (e.g. reseller-goal-history.jsonl
 * per COO next-tick ask #1). Pure so callers can format the timestamp
 * externally.
 */
export function buildHumanBlockedSnapshot(now: Date): {
  ran_at: string;
  count: number;
  items: ReadonlyArray<Pick<HumanBlockedItem, "id" | "phase" | "owner">>;
} {
  return {
    ran_at: now.toISOString(),
    count: HUMAN_BLOCKED_ITEMS.length,
    items: HUMAN_BLOCKED_ITEMS.map((i) => ({
      id: i.id,
      phase: i.phase,
      owner: i.owner,
    })),
  };
}
