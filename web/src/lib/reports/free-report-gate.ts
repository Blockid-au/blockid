// The free-allowance gate as POST /api/intake runs it (G25-C, 2026-09-21).
//
// Replaces the S32 signup gate (`lib/analyses/signup-gate.ts` — run 1
// unwalled, run 2 asks for an account). The founder's rule: the e-mail is
// REQUIRED before every guest run, the first TWO reports per address are
// free, the third goes to the A$3 quote-then-pay path. The wall is the
// address, never the account: nothing here charges, and nothing here asks
// for a sign-up.
//
// The point of a gate is to SPEND NOTHING before it decides, so the order
// is strict: validate the address → cheap abuse checks → count → decide →
// reserve the grant → only then run the pipeline. Everything I/O is
// injectable; the colocated suite replays every branch without a database.

import "server-only";

import { getEntitlements } from "@/lib/entitlements";
import { hashIp } from "@/lib/iphash";
import { TRUST_REPORT_AMOUNT_CENTS, TRUST_REPORT_SKU_ID, trustReportPriceLabelLong } from "@/lib/pricing/trust-report-price";
import {
  countFreeReportsSubmittedToday,
  countIpFreeReportsToday,
  recordSubmission,
  remainingFreeReports,
  type FreeReportGrantRow,
  type RecordSubmissionOutcome,
} from "./free-grants";
import {
  FREE_REPORT_ALLOWANCE_USED,
  FREE_REPORT_EMAIL_DISPOSABLE,
  FREE_REPORT_EMAIL_INVALID,
  FREE_REPORT_EMAIL_REQUIRED,
  FREE_REPORT_HONEYPOT_FIELD,
  FREE_REPORT_IP_LIMIT,
  FREE_REPORTS_PER_EMAIL,
  cleanReportEmail,
  decideFreeReportGate,
  freeReportsDailyCap,
  isDisposableReportEmail,
  remainingFrom,
  type FreeReportSource,
} from "./free-grants-rules";

/** The A$3 quote the third run is answered with — the same shape `/api/reports/access` publishes. */
export function freeReportPayQuote() {
  return {
    sku: TRUST_REPORT_SKU_ID,
    amount_cents: TRUST_REPORT_AMOUNT_CENTS,
    label: trustReportPriceLabelLong(),
  };
}

/** Where a signed-in founder buys the next report (the unlock rail → ReportPaywallGate). */
export const FREE_REPORT_PAY_HREF = "/workspace/reports/business";

export interface FreeReportGateContext {
  /** Signed-in user, or null. */
  user: { id: string; email: string; plan: string | null } | null;
  /** Raw `email` from the body (guest path). */
  bodyEmail: unknown;
  /** Raw honeypot value from the body. */
  honeypot: unknown;
  /** The hop our edge saw (lib/iphash clientIpFromHeaders) — hashed here, never stored raw. */
  clientIp: string | null;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}

export interface FreeReportGateDeps {
  remaining: (email: string) => Promise<{ used: number }>;
  ipToday: (ipHash: string | null) => Promise<number | null>;
  submittedToday: () => Promise<number>;
  record: (input: { email: string; sequenceNo: 1 | 2; source: FreeReportSource; ipHash: string | null }) => Promise<RecordSubmissionOutcome>;
  entitlements: (plan: string | null, userId: string) => Promise<string[]>;
  hashIp: (ip: string | null) => string | null;
}

export function defaultFreeReportGateDeps(): FreeReportGateDeps {
  return {
    remaining: (email) => remainingFreeReports(email),
    ipToday: (ipHash) => countIpFreeReportsToday(ipHash),
    submittedToday: () => countFreeReportsSubmittedToday(),
    record: (input) => recordSubmission(input),
    entitlements: (plan, userId) => getEntitlements(plan, userId),
    hashIp: (ip) => hashIp(ip),
  };
}

export type FreeReportGateResult =
  | {
      allow: true;
      /** Which path the run takes. */
      path: "free" | "entitled";
      /** The destination the PDF goes to (guest: the given address; account: the account address). */
      email: string;
      source: FreeReportSource;
      /** The reserved grant (free path only). */
      grant: FreeReportGrantRow | null;
      /** Platform cap reached — accept + record, but the cron starts the run. */
      queued: boolean;
      /** Free reports left AFTER this one. */
      remaining: number;
    }
  | {
      allow: false;
      /** HTTP status the route answers with. */
      status: 400 | 429 | 200;
      reason:
        | typeof FREE_REPORT_EMAIL_REQUIRED
        | typeof FREE_REPORT_EMAIL_INVALID
        | typeof FREE_REPORT_EMAIL_DISPOSABLE
        | typeof FREE_REPORT_IP_LIMIT
        | typeof FREE_REPORT_ALLOWANCE_USED
        | "honeypot";
      /** Free reports already used (allowance_used only). */
      used?: number;
    };

/**
 * Run the gate. Never throws: an I/O failure in a count is the permissive
 * answer (the UNIQUE index still bounds the ledger), an I/O failure in the
 * reservation lets the run proceed WITHOUT a grant (logged) rather than
 * walling a founder over a database wobble.
 */
export async function runFreeReportGate(
  ctx: FreeReportGateContext,
  deps: FreeReportGateDeps = defaultFreeReportGateDeps(),
): Promise<FreeReportGateResult> {
  const env = ctx.env ?? process.env;

  // Honeypot: a filled hidden field is a bot. Refuse quietly — the shape is
  // the "invalid" one so nothing tells the bot which field gave it away.
  // Any non-empty value counts (a JSON bot may send a number or an array).
  if (ctx.honeypot !== undefined && ctx.honeypot !== null && String(ctx.honeypot).trim().length > 0) {
    console.warn(`[free-report-gate] honeypot "${FREE_REPORT_HONEYPOT_FIELD}" filled — refused`);
    return { allow: false, status: 400, reason: "honeypot" };
  }

  // ── Identity ──────────────────────────────────────────────────────────
  let email: string;
  let source: FreeReportSource;
  if (ctx.user) {
    const account = cleanReportEmail(ctx.user.email);
    if (!account) return { allow: false, status: 400, reason: FREE_REPORT_EMAIL_INVALID };
    email = account;
    source = "account";
  } else {
    if (ctx.bodyEmail === undefined || ctx.bodyEmail === null || (typeof ctx.bodyEmail === "string" && ctx.bodyEmail.trim() === "")) {
      return { allow: false, status: 400, reason: FREE_REPORT_EMAIL_REQUIRED };
    }
    const clean = cleanReportEmail(ctx.bodyEmail);
    if (!clean) return { allow: false, status: 400, reason: FREE_REPORT_EMAIL_INVALID };
    if (isDisposableReportEmail(clean)) return { allow: false, status: 400, reason: FREE_REPORT_EMAIL_DISPOSABLE };
    email = clean;
    source = "guest";
  }

  // NOTE (review 2026-09-21): `?tier=paid` is NOT a bypass. Before G25-C the
  // signup gate let a "paid guest" straight through and the S32 job then ran
  // the full report for free; with the address now required on every guest
  // run, a tier=paid submission is counted like any other — its third run
  // is the quote, and the A$3 guest checkout is a separate purchase that
  // never depends on this run.

  // A paid report entitlement is never counted against the allowance.
  if (ctx.user) {
    try {
      const flags = await deps.entitlements(ctx.user.plan, ctx.user.id);
      if (flags.includes("report.basic") || flags.includes("report.premium")) {
        return { allow: true, path: "entitled", email, source, grant: null, queued: false, remaining: FREE_REPORTS_PER_EMAIL };
      }
    } catch (err) {
      console.warn("[free-report-gate] entitlement read failed — counting the allowance", err instanceof Error ? err.message : String(err));
    }
  }

  // ── Counts (all fail-open) ────────────────────────────────────────────
  const ipHash = ctx.user ? null : safeHash(deps, ctx.clientIp);
  const [remaining, ipToday, submittedToday] = await Promise.all([
    deps.remaining(email).catch(() => ({ used: 0 })),
    ctx.user ? Promise.resolve<number | null>(null) : deps.ipToday(ipHash).catch(() => null),
    deps.submittedToday().catch(() => 0),
  ]);

  const decision = decideFreeReportGate({
    used: remaining.used,
    ipToday,
    submittedToday,
    cap: freeReportsDailyCap(env),
  });

  if (!decision.allow) {
    if (decision.reason === FREE_REPORT_IP_LIMIT) return { allow: false, status: 429, reason: FREE_REPORT_IP_LIMIT };
    return { allow: false, status: 200, reason: FREE_REPORT_ALLOWANCE_USED, used: decision.used };
  }
  if (decision.reason !== "free_allowance") {
    // Unreachable today (paidEntitlement is resolved above); typed for completeness.
    return { allow: true, path: "entitled", email, source, grant: null, queued: false, remaining: FREE_REPORTS_PER_EMAIL };
  }

  // ── Reserve ───────────────────────────────────────────────────────────
  const reserved = await deps.record({ email, sequenceNo: decision.sequenceNo, source, ipHash }).catch(
    (): RecordSubmissionOutcome => ({ ok: false, reason: "unavailable" }),
  );
  if (!reserved.ok) {
    if (reserved.reason === "allowance_used") {
      return { allow: false, status: 200, reason: FREE_REPORT_ALLOWANCE_USED, used: FREE_REPORTS_PER_EMAIL };
    }
    if (reserved.reason === "invalid_email") return { allow: false, status: 400, reason: FREE_REPORT_EMAIL_INVALID };
    console.error("[free-report-gate] ledger unavailable — the run proceeds without a grant");
    return { allow: true, path: "free", email, source, grant: null, queued: decision.queued, remaining: remainingFrom(decision.sequenceNo) };
  }
  return {
    allow: true,
    path: "free",
    email,
    source,
    grant: reserved.grant,
    queued: decision.queued,
    remaining: remainingFrom(reserved.grant.sequence_no),
  };
}

function safeHash(deps: FreeReportGateDeps, ip: string | null): string | null {
  try {
    return deps.hashIp(ip);
  } catch {
    return null;
  }
}
