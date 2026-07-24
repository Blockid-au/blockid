// Right-of-First-Refusal (ROFR) / pre-emption workflow for AU secondary
// share transfers.
//
// A secondary transfer of shares in an AU proprietary company is almost always
// gated by (a) a pre-emption right written into the company constitution
// and/or shareholders' agreement, and (b) the Corporations Act 2001 (Cth)
// s707(3) "on-sale" rule that pulls the transfer back into s708(1) headroom
// when the shares being transferred were themselves issued under the
// small-scale personal-offer exemption within the last 12 months.
//
// Both concerns intersect at the moment a founder wants to sell to a new
// investor — the founder must give notice to existing pre-emptive-right
// holders, wait out a notice period (typically 15 business days per Blackbird /
// AirTree / Square Peg standard SHAs), then only sell whatever slice the
// existing holders did not take up.
//
// This module is a pure workflow calculator, not a legal opinion — it reads a
// snapshot of the cap table + waivers/exercises already collected + the
// proposed transfer, and returns the outstanding steps in a shape a founder
// dashboard tile or CLO agent can render without inventing prose.
//
// Statutory + market anchors (retrieved 2026):
//   - Corporations Act 2001 (Cth) s707 (on-sale rule) / s708 (small-scale)
//     https://www.legislation.gov.au/C2004A00818/latest/text
//   - ASIC RG 254 pre-emption disclosure guidance
//     https://asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/rg-254/
//   - Blackbird Ventures starter-kit SHA (Right of First Refusal template)
//     https://www.blackbird.vc/starter-kit
//   - AirTree open-source-vc SHA templates
//     https://www.airtree.vc/open-source-vc

export const ROFR_DISCLAIMER =
  "Not legal advice — pre-emption + ROFR terms live in your constitution + shareholders' agreement. This calculator assumes pro-rata entitlement across pre-emptive-right holders and a single notice window; drag-along, tag-along, and buyer-substitution mechanics are stubs only. Confirm with an Australian corporate lawyer before you sign the transfer form.";

/** Default notice-window length: 15 business days on a standard SHA. */
export const ROFR_DEFAULT_NOTICE_DAYS = 15 as const;
/** Default tag-along trigger — a founder-block sale ≥ this % of the founder's
 *  holdings pulls minority holders into the tag-along right. */
export const TAG_ALONG_FOUNDER_BLOCK_PCT = 0.5 as const;
/** s707 on-sale re-classification window: shares issued < 12 mo ago consume
 *  s708(1) headroom on transfer per s707(3). */
export const S707_ON_SALE_WINDOW_DAYS = 365 as const;

export interface CapTableHolder {
  holder_id: string;
  name?: string;
  held_shares: number;
  is_founder?: boolean;
  /** Default `true`. Set `false` for holders who signed a standing waiver
   *  (e.g. option-holders whose grant does not carry pre-emption). */
  pre_emption_right?: boolean;
}

export interface RofrProposedTransfer {
  seller_id: string;
  buyer_name: string;
  share_count: number;
  price_per_share_aud: number;
  /** Date the transfer notice was (or will be) served on other holders. */
  notice_date_iso: string;
  /** Date the seller's shares were originally issued by the company.
   *  Used for the s707 on-sale re-classification flag. Optional — if absent
   *  we do not raise the flag. */
  original_issue_date_iso?: string;
  /** Transfers between related bodies corporate / to a spouse / to a wholly-
   *  owned trustee typically do NOT trigger the ROFR under standard SHAs. */
  is_related_body_corporate_transfer?: boolean;
}

export interface RofrWaiver {
  holder_id: string;
  waived_at_iso: string;
}

export interface RofrExercise {
  holder_id: string;
  exercised_at_iso: string;
  shares_taken: number;
}

export interface RofrWorkflowInput {
  cap_table: readonly CapTableHolder[];
  proposed_transfer: RofrProposedTransfer;
  waivers?: readonly RofrWaiver[];
  exercises?: readonly RofrExercise[];
  notice_period_days?: number;
  now?: Date;
}

export type RofrStatus =
  | "not_applicable"
  | "pending_notice"
  | "notice_period_open"
  | "notice_period_closed"
  | "fully_waived"
  | "partially_exercised"
  | "fully_exercised";

export interface RofrHolderEntry {
  holder_id: string;
  name?: string;
  /** Pro-rata slice of `share_count` this holder is entitled to take. */
  entitled_shares: number;
  waived: boolean;
  /** Shares actually taken up during the notice window (≤ entitled_shares). */
  exercised_shares: number;
}

export interface RofrWorkflowResult {
  status: RofrStatus;
  notice_deadline_iso: string;
  eligible_holders: RofrHolderEntry[];
  outstanding_holder_ids: string[];
  shares_taken_by_rofr: number;
  shares_remaining_for_third_party: number;
  tag_along_triggered: boolean;
  s707_on_sale_risk: boolean;
  next_action: string;
  warnings: string[];
  disclaimer: string;
}

function toUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function parseIsoDay(iso: string | undefined): Date | null {
  if (!iso) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Compute the ROFR / pre-emption workflow state for a proposed secondary
 * transfer. Pure — no I/O, no throw on malformed input (bad rows are dropped
 * and surfaced via `warnings[]` where relevant).
 */
export function assessRofrWorkflow(
  input: RofrWorkflowInput,
): RofrWorkflowResult {
  const now = input.now ?? new Date();
  const noticePeriodDays =
    Number.isFinite(input.notice_period_days) && input.notice_period_days! > 0
      ? Math.floor(input.notice_period_days!)
      : ROFR_DEFAULT_NOTICE_DAYS;

  const transfer = input.proposed_transfer;
  const shareCount = Math.max(
    0,
    Math.floor(
      Number.isFinite(transfer.share_count) ? transfer.share_count : 0,
    ),
  );
  const noticeDate = parseIsoDay(transfer.notice_date_iso);
  const deadlineDate = noticeDate
    ? addDays(noticeDate, noticePeriodDays)
    : null;
  const noticeDeadlineIso = deadlineDate ? isoDay(deadlineDate) : "";

  const warnings: string[] = [];
  const disclaimer = ROFR_DISCLAIMER;

  // Related-body-corporate / spouse / trustee transfers skip pre-emption
  // under every standard AU SHA we have seen (Blackbird / AirTree / Square
  // Peg). Flag the exemption but return a "not_applicable" envelope so a
  // founder tile can render it clearly.
  if (transfer.is_related_body_corporate_transfer) {
    return {
      status: "not_applicable",
      notice_deadline_iso: noticeDeadlineIso,
      eligible_holders: [],
      outstanding_holder_ids: [],
      shares_taken_by_rofr: 0,
      shares_remaining_for_third_party: shareCount,
      tag_along_triggered: false,
      s707_on_sale_risk: hasS707Risk(transfer, noticeDate),
      next_action:
        "Related-body-corporate / spouse / bare-trustee transfer — pre-emption is typically waived. Confirm the exemption wording in your constitution + SHA and lodge the transfer form + ASIC Form 484 once counter-signed.",
      warnings: [
        ...warnings,
        "Related-body-corporate exemption assumed — verify the exact wording before relying on this envelope.",
      ],
      disclaimer,
    };
  }

  const nowDay = toUtcDay(now);
  const noticeDay = noticeDate ? toUtcDay(noticeDate) : null;

  // Eligible pool = every holder except the seller, that has an active
  // pre-emption right, that has a positive share balance.
  const eligibleRaw = input.cap_table.filter((h) => {
    if (!h || typeof h.holder_id !== "string") return false;
    if (h.holder_id === transfer.seller_id) return false;
    if (h.pre_emption_right === false) return false;
    if (!Number.isFinite(h.held_shares) || h.held_shares <= 0) return false;
    return true;
  });

  const eligibleShareBase = eligibleRaw.reduce(
    (sum, h) => sum + h.held_shares,
    0,
  );

  const waiverSet = new Set(
    (input.waivers ?? [])
      .filter((w) => typeof w?.holder_id === "string")
      .map((w) => w.holder_id),
  );

  const exercisesByHolder = new Map<string, number>();
  for (const ex of input.exercises ?? []) {
    if (!ex || typeof ex.holder_id !== "string") continue;
    if (!Number.isFinite(ex.shares_taken)) continue;
    const shares = Math.max(0, Math.floor(ex.shares_taken));
    if (shares === 0) continue;
    exercisesByHolder.set(
      ex.holder_id,
      (exercisesByHolder.get(ex.holder_id) ?? 0) + shares,
    );
  }

  const eligibleHolders: RofrHolderEntry[] = eligibleRaw.map((h) => {
    const entitled =
      eligibleShareBase > 0
        ? Math.round((shareCount * h.held_shares) / eligibleShareBase)
        : 0;
    const exercisedRaw = exercisesByHolder.get(h.holder_id) ?? 0;
    // A holder cannot take more than their pro-rata slice under a strict ROFR
    // (over-subscription rights are a separate mechanic — this calculator
    // stubs them out and warns instead).
    const exercised = Math.min(exercisedRaw, entitled);
    if (exercisedRaw > entitled) {
      warnings.push(
        `Holder ${h.holder_id} exercised ${exercisedRaw} shares but pro-rata entitlement is ${entitled} — over-subscription is not modelled; treat the excess separately.`,
      );
    }
    return {
      holder_id: h.holder_id,
      name: h.name,
      entitled_shares: entitled,
      waived: waiverSet.has(h.holder_id),
      exercised_shares: exercised,
    };
  });

  const outstandingHolderIds = eligibleHolders
    .filter((h) => !h.waived && h.exercised_shares === 0)
    .map((h) => h.holder_id);

  const sharesTakenByRofr = eligibleHolders.reduce(
    (sum, h) => sum + h.exercised_shares,
    0,
  );
  const sharesRemaining = Math.max(0, shareCount - sharesTakenByRofr);

  const status = classifyStatus({
    nowDay,
    noticeDay,
    deadlineDate: deadlineDate ? toUtcDay(deadlineDate) : null,
    outstandingCount: outstandingHolderIds.length,
    eligibleCount: eligibleHolders.length,
    sharesTakenByRofr,
    shareCount,
    hasAnyWaiverOrExercise:
      eligibleHolders.some((h) => h.waived) || sharesTakenByRofr > 0,
  });

  // Tag-along trigger: seller is a founder AND is disposing of ≥ 50% of their
  // block to a non-related third party. Encourages the founder to give tag-
  // along notice so minority holders can piggyback on the exit.
  const seller = input.cap_table.find(
    (h) => h?.holder_id === transfer.seller_id,
  );
  const tagAlong = Boolean(
    seller?.is_founder &&
      Number.isFinite(seller.held_shares) &&
      seller.held_shares > 0 &&
      shareCount / seller.held_shares >= TAG_ALONG_FOUNDER_BLOCK_PCT,
  );
  if (tagAlong) {
    warnings.push(
      "Founder block sale ≥ 50% of holdings — tag-along right may fire; issue a tag-along notice alongside the ROFR notice.",
    );
  }

  const s707Risk = hasS707Risk(transfer, noticeDate);
  if (s707Risk) {
    warnings.push(
      "Original issue < 12 months ago — this transfer consumes s708(1) headroom under the s707 on-sale rule. Run it through the s708 counter (assessS708SmallScale) before completion.",
    );
  }

  if (!noticeDate) {
    warnings.push(
      "notice_date_iso is missing or malformed — the workflow assumes notice has not yet been served.",
    );
  }

  const nextAction = deriveNextAction({
    status,
    noticeDeadlineIso,
    outstandingHolderIds,
    sharesTakenByRofr,
    sharesRemaining,
    buyerName: transfer.buyer_name,
    tagAlong,
  });

  return {
    status,
    notice_deadline_iso: noticeDeadlineIso,
    eligible_holders: eligibleHolders,
    outstanding_holder_ids: outstandingHolderIds,
    shares_taken_by_rofr: sharesTakenByRofr,
    shares_remaining_for_third_party: sharesRemaining,
    tag_along_triggered: tagAlong,
    s707_on_sale_risk: s707Risk,
    next_action: nextAction,
    warnings,
    disclaimer,
  };
}

function hasS707Risk(
  transfer: RofrProposedTransfer,
  noticeDate: Date | null,
): boolean {
  const issueDate = parseIsoDay(transfer.original_issue_date_iso);
  if (!issueDate || !noticeDate) return false;
  const cutoff = addDays(noticeDate, -S707_ON_SALE_WINDOW_DAYS);
  return issueDate >= cutoff && issueDate <= noticeDate;
}

interface ClassifyInput {
  nowDay: Date;
  noticeDay: Date | null;
  deadlineDate: Date | null;
  outstandingCount: number;
  eligibleCount: number;
  sharesTakenByRofr: number;
  shareCount: number;
  hasAnyWaiverOrExercise: boolean;
}

function classifyStatus(input: ClassifyInput): RofrStatus {
  const {
    nowDay,
    noticeDay,
    deadlineDate,
    outstandingCount,
    eligibleCount,
    sharesTakenByRofr,
    shareCount,
    hasAnyWaiverOrExercise,
  } = input;

  // No notice served yet.
  if (!noticeDay || nowDay < noticeDay) return "pending_notice";
  // No eligible pre-emption holders on the register — treat as fully waived
  // so the founder can proceed straight to the transfer form.
  if (eligibleCount === 0) return "fully_waived";

  const beforeDeadline = deadlineDate ? nowDay <= deadlineDate : true;

  if (sharesTakenByRofr >= shareCount && shareCount > 0) {
    return "fully_exercised";
  }
  if (outstandingCount === 0 && !hasAnyWaiverOrExercise) {
    // Impossible when eligibleCount > 0 — defensive branch.
    return "notice_period_closed";
  }
  if (outstandingCount === 0) {
    // Everyone either waived or exercised. Split into fully_waived vs
    // partially_exercised based on whether anyone actually took shares.
    return sharesTakenByRofr > 0 ? "partially_exercised" : "fully_waived";
  }
  if (beforeDeadline) return "notice_period_open";
  // Past the deadline with outstanding holders — treat non-response as
  // deemed waiver under most SHAs, but flag as "notice_period_closed" so
  // the founder tile can prompt for the counter-signed transfer form.
  return sharesTakenByRofr > 0
    ? "partially_exercised"
    : "notice_period_closed";
}

interface NextActionInput {
  status: RofrStatus;
  noticeDeadlineIso: string;
  outstandingHolderIds: string[];
  sharesTakenByRofr: number;
  sharesRemaining: number;
  buyerName: string;
  tagAlong: boolean;
}

function deriveNextAction(input: NextActionInput): string {
  const {
    status,
    noticeDeadlineIso,
    outstandingHolderIds,
    sharesTakenByRofr,
    sharesRemaining,
    buyerName,
    tagAlong,
  } = input;

  switch (status) {
    case "pending_notice":
      return `Serve the pre-emption notice on all eligible holders. Notice period closes ${noticeDeadlineIso || "on the date + notice_period_days"}.`;
    case "notice_period_open":
      return `Chase waivers or exercise notices from ${outstandingHolderIds.length} outstanding holder(s). Deadline ${noticeDeadlineIso}.`;
    case "notice_period_closed":
      return `Deadline ${noticeDeadlineIso} has passed with ${outstandingHolderIds.length} holder(s) silent. Under most SHAs silence is deemed waiver — collect the counter-signed transfer form from ${buyerName} and lodge ASIC Form 484.`;
    case "fully_waived":
      return `All holders waived. Execute the share transfer form with ${buyerName}${tagAlong ? " (tag-along notice still owed to minority holders)" : ""} and lodge ASIC Form 484 within 28 days.`;
    case "partially_exercised":
      return `${sharesTakenByRofr} shares taken by existing holders, ${sharesRemaining} left for ${buyerName}. Execute two transfer forms (existing holders + third party) and lodge one ASIC Form 484 covering both.`;
    case "fully_exercised":
      return `Existing holders took the whole block — the sale to ${buyerName} does not proceed. Notify ${buyerName} in writing and record the pre-emption uptake in the share register.`;
    case "not_applicable":
      return "Pre-emption is not applicable to this transfer.";
    default:
      return "Review the ROFR workflow status manually.";
  }
}
