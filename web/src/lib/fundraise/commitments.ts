// Fundraise commitments — the pure half (S26-A).
//
// A round (`fundraise_rounds`) carries a target; the tracker records every
// cheque against it (`fundraise_commitments`, migration 0355) the way a
// cap-table tool does: soft → committed → signed → funded, or withdrawn.
// Everything here is dependency-free so the colocated suite can pin the
// validation, the status ladder and the roll-up maths without a database;
// the routes under api/fundraise/[roundId] do the I/O and write the totals
// back onto the round row (`soft_aud` / `committed_aud` / `funded_aud`) —
// maintained by the API, never by a trigger.
//
// No `server-only`: the round page's client components import the types
// and the progress maths.

export const COMMITMENT_STATUSES = ["soft", "committed", "signed", "funded", "withdrawn"] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const COMMITMENT_INSTRUMENTS = ["safe", "convertible_note", "priced_equity"] as const;
export type CommitmentInstrument = (typeof COMMITMENT_INSTRUMENTS)[number];

export const ROUND_STATUSES = ["draft", "active", "closed"] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

/** Largest single cheque the tracker accepts — A$1B keeps a fat-fingered "000" from wrecking the bar. */
export const MAX_COMMITMENT_AUD = 1_000_000_000;
export const COMMITMENT_TEXT_MAX = 200;
export const COMMITMENT_NOTES_MAX = 2_000;

export const STATUS_LABEL: Record<CommitmentStatus, string> = {
  soft: "Soft-circled",
  committed: "Committed",
  signed: "Signed",
  funded: "Funded",
  withdrawn: "Withdrawn",
};

export const INSTRUMENT_LABEL: Record<CommitmentInstrument, string> = {
  safe: "SAFE",
  convertible_note: "Convertible note",
  priced_equity: "Priced equity",
};

/**
 * The only round moves the API accepts. A closed round stays closed — the
 * cap table has been (or is about to be) updated from it, so re-opening it
 * would let the totals drift from the register.
 */
export const ROUND_TRANSITIONS: Record<RoundStatus, readonly RoundStatus[]> = {
  draft: ["active"],
  active: ["closed"],
  closed: [],
};

export function isRoundStatus(v: unknown): v is RoundStatus {
  return typeof v === "string" && (ROUND_STATUSES as readonly string[]).includes(v);
}

export function canTransitionRound(from: string, to: string): boolean {
  if (!isRoundStatus(from) || !isRoundStatus(to)) return false;
  return ROUND_TRANSITIONS[from].includes(to);
}

export function isCommitmentStatus(v: unknown): v is CommitmentStatus {
  return typeof v === "string" && (COMMITMENT_STATUSES as readonly string[]).includes(v);
}

export function isCommitmentInstrument(v: unknown): v is CommitmentInstrument {
  return typeof v === "string" && (COMMITMENT_INSTRUMENTS as readonly string[]).includes(v);
}

// ── Input validation ─────────────────────────────────────────────────────

export interface CommitmentInput {
  investorName: string;
  investorEmail: string | null;
  investorOrg: string | null;
  amountAud: number;
  status: CommitmentStatus;
  instrument: CommitmentInstrument;
  notes: string | null;
  /** Optional tie to a data-room investor link (`data_room_access_tokens.id`). */
  accessTokenId: string | null;
}

export type CommitmentPatch = Partial<CommitmentInput>;

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

function cleanEmail(v: unknown): string | null | false {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return false;
  return s;
}

function cleanAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[,\s]/g, "")) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_COMMITMENT_AUD) return null;
  return Math.round(n * 100) / 100;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a POST body (every required field present) or a PATCH body
 * (`partial: true` — only the keys sent are checked and returned). Every
 * failure is a 400 in the route with the message returned here.
 */
export function parseCommitmentInput(
  body: unknown,
  opts: { partial?: boolean } = {},
): { ok: true; value: CommitmentInput } | { ok: true; value: CommitmentPatch } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid JSON body" };
  const b = body as Record<string, unknown>;
  const partial = opts.partial === true;
  const out: CommitmentPatch = {};

  if ("investorName" in b || !partial) {
    const name = cleanText(b.investorName, COMMITMENT_TEXT_MAX);
    if (!name) return { ok: false, error: "investorName is required" };
    out.investorName = name;
  }
  if ("investorEmail" in b || !partial) {
    const email = cleanEmail(b.investorEmail);
    if (email === false) return { ok: false, error: "investorEmail is not a valid email address" };
    out.investorEmail = email;
  }
  if ("investorOrg" in b || !partial) out.investorOrg = cleanText(b.investorOrg, COMMITMENT_TEXT_MAX);
  if ("amountAud" in b || !partial) {
    const amount = cleanAmount(b.amountAud);
    if (amount === null) return { ok: false, error: `amountAud must be a positive number up to ${MAX_COMMITMENT_AUD}` };
    out.amountAud = amount;
  }
  if ("status" in b) {
    if (!isCommitmentStatus(b.status)) return { ok: false, error: `status must be one of ${COMMITMENT_STATUSES.join(", ")}` };
    out.status = b.status;
  } else if (!partial) {
    out.status = "soft";
  }
  if ("instrument" in b) {
    if (!isCommitmentInstrument(b.instrument)) {
      return { ok: false, error: `instrument must be one of ${COMMITMENT_INSTRUMENTS.join(", ")}` };
    }
    out.instrument = b.instrument;
  } else if (!partial) {
    out.instrument = "safe";
  }
  if ("notes" in b || !partial) out.notes = cleanText(b.notes, COMMITMENT_NOTES_MAX);
  if ("accessTokenId" in b || !partial) {
    const t = b.accessTokenId;
    if (t === null || t === undefined || t === "") out.accessTokenId = null;
    else if (typeof t === "string" && UUID_RE.test(t)) out.accessTokenId = t;
    else return { ok: false, error: "accessTokenId must be a uuid" };
  }
  if (partial && Object.keys(out).length === 0) return { ok: false, error: "Nothing to update" };
  return { ok: true, value: partial ? out : (out as CommitmentInput) };
}

// ── Status dates ─────────────────────────────────────────────────────────

export interface CommitmentDates {
  committed_at: string | null;
  signed_at: string | null;
  funded_at: string | null;
  withdrawn_at: string | null;
}

/**
 * Which date columns a status change stamps. Moving UP the ladder stamps
 * the milestone (and keeps earlier ones); moving to `withdrawn` stamps
 * `withdrawn_at`; moving back DOWN (funded → committed, a bounced
 * transfer) clears the milestones above the new status so the row never
 * claims a date for a state it is no longer in. Existing stamps are kept.
 */
export function stampStatusDates(
  existing: Partial<CommitmentDates> | null | undefined,
  status: CommitmentStatus,
  now: Date = new Date(),
): CommitmentDates {
  const iso = now.toISOString();
  const cur: CommitmentDates = {
    committed_at: existing?.committed_at ?? null,
    signed_at: existing?.signed_at ?? null,
    funded_at: existing?.funded_at ?? null,
    withdrawn_at: existing?.withdrawn_at ?? null,
  };
  switch (status) {
    case "soft":
      return { committed_at: null, signed_at: null, funded_at: null, withdrawn_at: null };
    case "committed":
      return { committed_at: cur.committed_at ?? iso, signed_at: null, funded_at: null, withdrawn_at: null };
    case "signed":
      return { committed_at: cur.committed_at ?? iso, signed_at: cur.signed_at ?? iso, funded_at: null, withdrawn_at: null };
    case "funded":
      return {
        committed_at: cur.committed_at ?? iso,
        signed_at: cur.signed_at ?? iso,
        funded_at: cur.funded_at ?? iso,
        withdrawn_at: null,
      };
    case "withdrawn":
      return { ...cur, withdrawn_at: cur.withdrawn_at ?? iso };
  }
}

// ── Roll-up ──────────────────────────────────────────────────────────────

export interface CommitmentRowLike {
  amount_aud: number | string | null;
  status: string;
}

export interface RoundSummary {
  targetAud: number;
  /** status = soft */
  softAud: number;
  /** status = committed OR signed — promised, not landed */
  committedAud: number;
  /** status = signed (subset of committedAud, shown as its own tick) */
  signedAud: number;
  /** status = funded — landed */
  fundedAud: number;
  withdrawnAud: number;
  /** committed + funded: what the round can count on */
  hardAud: number;
  /** soft + committed + funded: the whole pipeline */
  pipelineAud: number;
  remainingAud: number;
  /** 0..100+ (over-subscription shows > 100) */
  pct: { soft: number; committed: number; funded: number; hard: number; pipeline: number };
  counts: Record<CommitmentStatus, number>;
  investors: number;
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : v == null ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctOf(part: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((part / target) * 1000) / 10;
}

/** The progress model the round page draws: target vs soft vs committed vs funded. */
export function summariseCommitments(rows: readonly CommitmentRowLike[], targetAud: number | string | null): RoundSummary {
  const target = Math.max(0, num(targetAud));
  const counts: Record<CommitmentStatus, number> = { soft: 0, committed: 0, signed: 0, funded: 0, withdrawn: 0 };
  let soft = 0;
  let committed = 0;
  let signed = 0;
  let funded = 0;
  let withdrawn = 0;
  for (const r of rows) {
    if (!isCommitmentStatus(r.status)) continue;
    const amt = num(r.amount_aud);
    counts[r.status]++;
    switch (r.status) {
      case "soft":
        soft += amt;
        break;
      case "committed":
        committed += amt;
        break;
      case "signed":
        committed += amt;
        signed += amt;
        break;
      case "funded":
        funded += amt;
        break;
      case "withdrawn":
        withdrawn += amt;
        break;
    }
  }
  const hard = committed + funded;
  const pipeline = soft + hard;
  return {
    targetAud: round2(target),
    softAud: round2(soft),
    committedAud: round2(committed),
    signedAud: round2(signed),
    fundedAud: round2(funded),
    withdrawnAud: round2(withdrawn),
    hardAud: round2(hard),
    pipelineAud: round2(pipeline),
    remainingAud: round2(Math.max(0, target - hard)),
    pct: {
      soft: pctOf(soft, target),
      committed: pctOf(committed, target),
      funded: pctOf(funded, target),
      hard: pctOf(hard, target),
      pipeline: pctOf(pipeline, target),
    },
    counts,
    investors: counts.soft + counts.committed + counts.signed + counts.funded,
  };
}

/** The three columns the API writes back onto `fundraise_rounds`. */
export function roundTotalsFromSummary(s: RoundSummary): { soft_aud: number; committed_aud: number; funded_aud: number } {
  return { soft_aud: s.softAud, committed_aud: s.committedAud, funded_aud: s.fundedAud };
}

/**
 * Segments for a stacked progress bar, each clamped so the bar never
 * exceeds 100% even when the round is over-subscribed: funded first (the
 * money that is real), then committed, then soft. Widths are percentages
 * of the target.
 */
export function progressSegments(s: RoundSummary): Array<{ key: "funded" | "committed" | "soft"; pct: number; aud: number }> {
  const out: Array<{ key: "funded" | "committed" | "soft"; pct: number; aud: number }> = [];
  let used = 0;
  for (const [key, aud] of [
    ["funded", s.fundedAud],
    ["committed", s.committedAud],
    ["soft", s.softAud],
  ] as const) {
    const raw = s.targetAud > 0 ? (aud / s.targetAud) * 100 : 0;
    const pct = Math.max(0, Math.min(raw, 100 - used));
    used += pct;
    out.push({ key, pct: Math.round(pct * 10) / 10, aud });
  }
  return out;
}

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
export function formatAud(n: number): string {
  return AUD.format(Number.isFinite(n) ? n : 0);
}
