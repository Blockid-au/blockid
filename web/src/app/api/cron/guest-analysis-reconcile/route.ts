// /api/cron/guest-analysis-reconcile — close out abandoned A$3 guest checkouts.
//
// The A$3 One-Click Report is the only self-serve purchase on the site, so a
// dropped checkout is a disproportionate loss. Until this job existed a
// `guest_analyses` row that reached Stripe and was never paid stayed at
// status='pending' forever: no follow-up, no cleanup, and — because
// `amount_paid_aud_cents` is stamped at session *creation* — visually
// identical to a customer who paid and got nothing.
//
// Two phases, both driven by Stripe as the only source of payment truth. We
// never infer payment from our own columns.
//
//   Phase 1 — reconcile. For each pending row past its session's expiry, ask
//   Stripe what happened:
//     paid / no_payment_required  → the webhook was missed. Flip to 'paid',
//         record the real amount, and run the delivery we already owe. This
//         is the branch that stops a paying customer's report from silently
//         never arriving.
//     unpaid + expired (or past expires_at) → 'abandoned' + abandoned_at.
//     open and not yet expired → leave alone, it is still a live checkout.
//     no session id on the row, or Stripe 404s it, and the row has aged out
//         → 'expired'. We could not establish a truth, so we close it
//         quietly and never email about it.
//
//   Phase 2 — recovery. For rows that have been 'abandoned' for at least an
//   hour (and no more than RECOVERY_MAX_AGE_HOURS), send exactly one email
//   offering to finish the report, with a link that resumes the purchase
//   using the input they already gave us.
//
// Once-only is enforced by a guarded UPDATE that CLAIMS
// recovery_email_sent_at (WHERE recovery_email_sent_at IS NULL) *before* the
// send is attempted — the same claim-then-act shape the Stripe webhook uses
// for its status flips. A second run of this job matches zero rows.
//
// Auth: CRON_SECRET via `x-cron-secret` or `Authorization: Bearer`, matching
// every other cron here. GET and POST both work (cron-runner.sh POSTs).
// `?dry=1` reports the plan and writes/sends nothing.

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { canSendEmail } from "@/lib/email-preferences";
import { sendGuestCheckoutRecovery } from "@/lib/email";
import { sendTelegram } from "@/lib/telegram";
import { isCronAuthorised } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Never touch a checkout younger than this — it may still be on-screen. */
const MIN_AGE_MINUTES = Number(
  process.env.GUEST_RECONCILE_MIN_AGE_MINUTES ?? 30,
);
/** A pending row we cannot resolve against Stripe is closed as 'expired'. */
const UNRESOLVABLE_AFTER_HOURS = Number(
  process.env.GUEST_RECONCILE_UNRESOLVABLE_HOURS ?? 48,
);
/** "Roughly an hour after abandonment", not immediately. */
const RECOVERY_DELAY_MINUTES = Number(
  process.env.GUEST_RECOVERY_DELAY_MINUTES ?? 60,
);
/** Do not chase a checkout that is stale — that stops reading as a follow-up. */
const RECOVERY_MAX_AGE_HOURS = Number(
  process.env.GUEST_RECOVERY_MAX_AGE_HOURS ?? 72,
);
const MAX_ROWS = 100;

function authorised(request: Request): boolean {
  return isCronAuthorised(request, { xCronSecretHeader: true });
}

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(
    /\/$/,
    "",
  );
}

type Outcome =
  | "paid_recovered"
  | "abandoned"
  | "expired"
  | "still_open"
  | "lookup_failed"
  | "update_failed";

interface ReconcileEntry {
  id: string;
  outcome: Outcome;
  stripe_status?: string;
  detail?: string;
}

interface RecoveryEntry {
  id: string;
  action: "sent" | "send_failed" | "suppressed" | "claim_lost";
  detail?: string;
}

interface PendingRow {
  id: string;
  email: string;
  stripe_session_id: string | null;
  created_at: string;
  status: string;
}

interface AbandonedRow {
  id: string;
  email: string;
  input_type: string;
  input_value: string;
  input_filename: string | null;
  abandoned_at: string;
  resume_token: string | null;
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}

async function run(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured() || !isStripeConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const stripe = getStripe();
  if (!supabase || !stripe) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";

  const reconciled = await reconcilePending(supabase, stripe, dry);
  const recovered = await sendRecoveryEmails(supabase, dry);

  const missedWebhooks = reconciled.filter(
    (r) => r.outcome === "paid_recovered",
  );
  if (missedWebhooks.length > 0 && !dry) {
    // A missed webhook means someone paid and got nothing until this cron
    // noticed. That is worth waking a human for even though we self-healed.
    await sendTelegram(
      `⚠️ guest-analysis-reconcile recovered ${missedWebhooks.length} PAID guest ` +
        `analysis row(s) the Stripe webhook missed: ` +
        missedWebhooks.map((m) => m.id).join(", "),
    ).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    dry,
    reconciled,
    recovery: recovered,
    counts: {
      scanned: reconciled.length,
      abandoned: reconciled.filter((r) => r.outcome === "abandoned").length,
      expired: reconciled.filter((r) => r.outcome === "expired").length,
      paid_recovered: missedWebhooks.length,
      emails_sent: recovered.filter((r) => r.action === "sent").length,
    },
  });
}

// ── Phase 1 — reconcile pending rows against Stripe ───────────────────────

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function reconcilePending(
  supabase: SupabaseAdmin,
  stripe: Stripe,
  dry: boolean,
): Promise<ReconcileEntry[]> {
  const cutoff = new Date(
    Date.now() - MIN_AGE_MINUTES * 60_000,
  ).toISOString();

  const { data, error } = await supabase
    .from("guest_analyses")
    .select("id, email, stripe_session_id, created_at, status")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);

  if (error) {
    console.error(
      "[blockid:guest-reconcile] pending scan failed",
      error.message,
    );
    return [];
  }

  const rows = (data ?? []) as PendingRow[];
  const out: ReconcileEntry[] = [];

  for (const row of rows) {
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    const agedOut = ageMs > UNRESOLVABLE_AFTER_HOURS * 3_600_000;

    if (!row.stripe_session_id) {
      // Checkout never got as far as a Stripe session (or the stamping
      // UPDATE lost its race). Nothing to ask Stripe about.
      if (agedOut) {
        out.push(
          await closeUnresolvable(supabase, row.id, "no_stripe_session", dry),
        );
      } else {
        out.push({ id: row.id, outcome: "still_open", detail: "no_session_yet" });
      }
      continue;
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (agedOut) {
        out.push(
          await closeUnresolvable(
            supabase,
            row.id,
            `stripe_lookup_failed: ${msg.slice(0, 160)}`,
            dry,
          ),
        );
      } else {
        out.push({ id: row.id, outcome: "lookup_failed", detail: msg.slice(0, 160) });
      }
      continue;
    }

    const stripeStatus = `${session.status ?? "unknown"}/${session.payment_status ?? "unknown"}`;
    const paid =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required";
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    const pastExpiry = expiresAtMs > 0 && expiresAtMs < Date.now();

    if (paid) {
      out.push(
        await recoverMissedWebhook(supabase, row, session, stripeStatus, dry),
      );
      continue;
    }

    if (session.status === "expired" || pastExpiry) {
      out.push(await markAbandoned(supabase, row.id, stripeStatus, dry));
      continue;
    }

    // Stripe says the session is still open and has not expired — the
    // founder may literally be on the card form. Leave it pending.
    out.push({ id: row.id, outcome: "still_open", stripe_status: stripeStatus });
  }

  return out;
}

/**
 * Stripe says this session WAS paid but our row never left 'pending' — the
 * webhook was missed. Complete the delivery we already owe: flip to 'paid'
 * (guarded on the row still being pending) and hand off to the same runner
 * the webhook uses.
 */
async function recoverMissedWebhook(
  supabase: SupabaseAdmin,
  row: PendingRow,
  session: Stripe.Checkout.Session,
  stripeStatus: string,
  dry: boolean,
): Promise<ReconcileEntry> {
  if (dry) {
    return { id: row.id, outcome: "paid_recovered", stripe_status: stripeStatus, detail: "dry_run" };
  }

  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  const { data: claimed, error: updErr } = await supabase
    .from("guest_analyses")
    .update({
      status: "paid",
      stripe_payment_intent: paymentIntent,
      paid_amount_aud_cents: session.amount_total ?? null,
      stripe_session_status: stripeStatus,
      reconciled_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id");

  if (updErr) {
    return { id: row.id, outcome: "update_failed", stripe_status: stripeStatus, detail: updErr.message };
  }
  if (!claimed || claimed.length === 0) {
    // The webhook landed between our SELECT and our UPDATE. Nothing to do.
    return { id: row.id, outcome: "still_open", stripe_status: stripeStatus, detail: "claim_lost_to_webhook" };
  }

  const { runGuestAnalysis } = await import("@/lib/guest-analysis/runner");
  const result = await runGuestAnalysis(row.id);

  return {
    id: row.id,
    outcome: "paid_recovered",
    stripe_status: stripeStatus,
    detail: result.success ? "delivered" : `runner_failed: ${result.error}`,
  };
}

async function markAbandoned(
  supabase: SupabaseAdmin,
  id: string,
  stripeStatus: string,
  dry: boolean,
): Promise<ReconcileEntry> {
  if (dry) {
    return { id, outcome: "abandoned", stripe_status: stripeStatus, detail: "dry_run" };
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("guest_analyses")
    .update({
      status: "abandoned",
      abandoned_at: now,
      reconciled_at: now,
      stripe_session_status: stripeStatus,
      // Minted here rather than at checkout so the hot purchase path is
      // untouched. Only abandoned rows ever need a resume link.
      resume_token: randomBytes(24).toString("hex"),
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    return { id, outcome: "update_failed", stripe_status: stripeStatus, detail: error.message };
  }
  return { id, outcome: "abandoned", stripe_status: stripeStatus };
}

async function closeUnresolvable(
  supabase: SupabaseAdmin,
  id: string,
  reason: string,
  dry: boolean,
): Promise<ReconcileEntry> {
  if (dry) return { id, outcome: "expired", detail: `dry_run: ${reason}` };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("guest_analyses")
    .update({
      status: "expired",
      reconciled_at: now,
      error_message: reason.slice(0, 500),
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    return { id, outcome: "update_failed", detail: error.message };
  }
  return { id, outcome: "expired", detail: reason };
}

// ── Phase 2 — one recovery email, once ────────────────────────────────────

async function sendRecoveryEmails(
  supabase: SupabaseAdmin,
  dry: boolean,
): Promise<RecoveryEntry[]> {
  const dueBefore = new Date(
    Date.now() - RECOVERY_DELAY_MINUTES * 60_000,
  ).toISOString();
  const notOlderThan = new Date(
    Date.now() - RECOVERY_MAX_AGE_HOURS * 3_600_000,
  ).toISOString();

  const { data, error } = await supabase
    .from("guest_analyses")
    .select(
      "id, email, input_type, input_value, input_filename, abandoned_at, resume_token",
    )
    .eq("status", "abandoned")
    .is("recovery_email_sent_at", null)
    .lt("abandoned_at", dueBefore)
    .gt("abandoned_at", notOlderThan)
    .limit(MAX_ROWS);

  if (error) {
    console.error(
      "[blockid:guest-reconcile] recovery scan failed",
      error.message,
    );
    return [];
  }

  const rows = (data ?? []) as AbandonedRow[];
  const out: RecoveryEntry[] = [];

  for (const row of rows) {
    // Spam Act 2003: honour any prior unsubscribe before anything else.
    // This is a commercial electronic message, so it sits in the
    // 'promotions' category — a global unsubscribe blocks it too.
    const allowed = await canSendEmail(row.email, "promotions");
    if (!allowed) {
      if (!dry) {
        // Claim it so the scan does not revisit the row every tick. The
        // error column records why nothing was sent.
        await supabase
          .from("guest_analyses")
          .update({
            recovery_email_sent_at: new Date().toISOString(),
            recovery_email_error: "suppressed: recipient unsubscribed",
          })
          .eq("id", row.id)
          .is("recovery_email_sent_at", null);
      }
      out.push({ id: row.id, action: "suppressed", detail: "unsubscribed" });
      continue;
    }

    if (dry) {
      out.push({ id: row.id, action: "sent", detail: "dry_run" });
      continue;
    }

    // CLAIM FIRST. A concurrent run, or a re-run of this job, updates zero
    // rows here and therefore sends nothing. At-most-once by construction.
    const { data: claimed, error: claimErr } = await supabase
      .from("guest_analyses")
      .update({ recovery_email_sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("recovery_email_sent_at", null)
      .select("id");

    if (claimErr) {
      out.push({ id: row.id, action: "claim_lost", detail: claimErr.message });
      continue;
    }
    if (!claimed || claimed.length === 0) {
      out.push({ id: row.id, action: "claim_lost", detail: "already_claimed" });
      continue;
    }

    let token = row.resume_token;
    if (!token) {
      token = randomBytes(24).toString("hex");
      await supabase
        .from("guest_analyses")
        .update({ resume_token: token })
        .eq("id", row.id);
    }

    try {
      const result = await sendGuestCheckoutRecovery({
        email: row.email,
        inputType: row.input_type === "pitch_file" ? "pitch_file" : "website_url",
        inputLabel:
          row.input_type === "pitch_file"
            ? (row.input_filename ?? "your pitch deck")
            : row.input_value,
        resumeUrl: `${siteOrigin()}/api/guest-analysis/resume/${token}`,
        guestAnalysisId: row.id,
      });
      if (result.ok) {
        out.push({ id: row.id, action: "sent" });
      } else {
        await supabase
          .from("guest_analyses")
          .update({ recovery_email_error: `send_failed: ${result.reason}` })
          .eq("id", row.id);
        out.push({ id: row.id, action: "send_failed", detail: result.reason });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("guest_analyses")
        .update({ recovery_email_error: `threw: ${msg.slice(0, 300)}` })
        .eq("id", row.id);
      out.push({ id: row.id, action: "send_failed", detail: msg.slice(0, 160) });
    }
  }

  return out;
}
