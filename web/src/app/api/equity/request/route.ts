// POST /api/equity/request
//
// Equity-for-Solution intake handler. NEVER issues equity. Always returns
// 202 on success — the row is queued for `pending_review` and a human
// reviewer decides next steps. Rate-limited to 3 requests / 30 days per
// user.
//
// Compliance surface:
//  1. recordConsent → consent_events (with the exact disclaimer body hash)
//  2. INSERT INTO equity_requests → row links to consent_events.id
//  3. appendAudit → hash-chained audit trail
//  4. Best-effort Telegram + email notifications (fire-and-forget)

import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordConsent, hashDisclaimerBody } from "@/lib/consent";
import { appendAudit } from "@/lib/audit";
import { DISCLAIMER_VERSIONS } from "@/lib/legal/versions";
import { getSurface } from "@/lib/legal/surfaces";
import { detectJurisdiction } from "@/lib/jurisdiction";
import { sendTelegram, mdEscape } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_DAYS = 30;
const RATE_LIMIT_MAX = 3;

const StageEnum = z.enum(["idea", "pre-seed", "seed", "series-a+"]);
const ScopeEnum = z.enum([
  "svi_valuation",
  "cap_table_esop",
  "blockchain_sync",
  "investor_reporting",
  "full_stack",
]);

const BodySchema = z.object({
  company_name: z.string().trim().min(1).max(200),
  stage: StageEnum,
  equity_pct_requested: z.number().min(5).max(15),
  scope: z.array(ScopeEnum).min(1).max(5),
  message: z.string().trim().min(100).max(5000),
  ack_disclaimer: z.literal(true),
  ack_independent_counsel: z.literal(true),
});

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  let rawBody: unknown = null;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        reason: "Invalid request body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, reason: "Supabase unavailable" },
      { status: 503 },
    );
  }

  // ---- Rate limit: max RATE_LIMIT_MAX rows in the last 30 days ----
  const windowStart = new Date(
    Date.now() - RATE_LIMIT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  try {
    const { count, error: countErr } = await admin
      .from("equity_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("submitted_at", windowStart);
    if (countErr) {
      // Do not fail closed for a counting error — log and continue.
      console.warn("[equity-request] rate-limit count failed", countErr.message);
    } else if ((count ?? 0) >= RATE_LIMIT_MAX) {
      const nextEligibleAt = new Date(
        Date.now() + RATE_LIMIT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      return NextResponse.json(
        {
          ok: false,
          reason: `Rate limit reached (${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_DAYS} days).`,
          next_eligible_at: nextEligibleAt,
        },
        { status: 429 },
      );
    }
  } catch (e) {
    console.warn("[equity-request] rate-limit lookup threw", e);
  }

  // ---- Jurisdiction detection (never throws) ----
  let jurisdiction = "AU";
  try {
    const j = await detectJurisdiction(request);
    if (j?.country) jurisdiction = j.country;
  } catch {
    /* fall through */
  }

  const { ip, ua } = readClientMeta(request);

  // ---- 1. Record consent — hash the exact disclaimer body the user saw ----
  const surface = getSurface("equity_offer_page");
  const disclaimerBody = surface?.body_md ?? "equity_offer_disclaimer:fallback";
  const disclaimerHash = hashDisclaimerBody(disclaimerBody);

  let consentId: string;
  try {
    const consent = await recordConsent({
      user_id: user.id,
      kind: "equity_offer_disclaimer",
      disclaimer_version: DISCLAIMER_VERSIONS.equity_offer_disclaimer,
      disclaimer_hash: disclaimerHash,
      ip,
      ua,
      jurisdiction,
      granted: true,
      detail: {
        surface: "equity_offer_page",
        ack_independent_counsel: true,
        stage: body.stage,
        equity_pct_requested: body.equity_pct_requested,
      },
    });
    consentId = consent.id;
  } catch (err) {
    console.error(
      "[equity-request] recordConsent failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, reason: "Consent persistence failed" },
      { status: 500 },
    );
  }

  // ---- 2. INSERT INTO equity_requests ----
  const scopeText = body.scope.join(",");
  const insertRow = {
    user_id: user.id,
    stage: body.stage,
    equity_pct_requested: body.equity_pct_requested,
    scope: scopeText,
    jurisdiction,
    consent_event_id: consentId,
    status: "pending_review" as const,
    detail: {
      message: body.message,
      company_name: body.company_name,
      scope_selected: body.scope,
    },
  };

  const { data: inserted, error: insertErr } = await admin
    .from("equity_requests")
    .insert(insertRow)
    .select("id, submitted_at")
    .single();

  if (insertErr || !inserted) {
    console.error(
      "[equity-request] insert failed",
      insertErr?.message ?? "no row returned",
    );
    return NextResponse.json(
      { ok: false, reason: "Failed to persist request" },
      { status: 500 },
    );
  }

  // ---- 3. Append to hash-chained audit log ----
  try {
    await appendAudit({
      user_id: user.id,
      actor: "user",
      action: "equity_request_submitted",
      resource_type: "equity_request",
      resource_id: inserted.id as string,
      detail: {
        stage: body.stage,
        equity_pct_requested: body.equity_pct_requested,
        scope: body.scope,
        jurisdiction,
        consent_event_id: consentId,
      },
    });
  } catch (err) {
    console.warn(
      "[equity-request] appendAudit failed (non-fatal)",
      err instanceof Error ? err.message : err,
    );
  }

  // ---- 4. Notify admin via Telegram (fire-and-forget) ----
  const notify = async () => {
    try {
      const line = [
        "*New Equity-for-Solution request*",
        `Company: ${mdEscape(body.company_name)}`,
        `Stage: ${body.stage}`,
        `Equity: ${body.equity_pct_requested}%`,
        `Scope: ${mdEscape(body.scope.join(", "))}`,
        `User: ${mdEscape(user.email)}`,
        `Jurisdiction: ${jurisdiction}`,
        `Request ID: \`${inserted.id}\``,
      ].join("\n");
      await sendTelegram(line);
    } catch (e) {
      console.warn("[equity-request] telegram notify failed", e);
    }
  };
  const ackEmail = async () => {
    try {
      await sendEmail({
        to: user.email,
        subject: "We received your Equity-for-Solution request",
        html: `<p>Hi${user.displayName ? " " + user.displayName : ""},</p>
<p>Thanks for your interest in BlockID's Enterprise-for-Equity programme. We have logged your request and our legal and customer success team will contact you within 3 business days.</p>
<p><strong>This is not an offer of securities.</strong> Nothing has been issued and no securities transaction has occurred. Please seek independent legal, tax, and financial advice.</p>
<p>Request reference: <code>${inserted.id}</code></p>
<p>— The BlockID team</p>`,
      });
    } catch (e) {
      console.warn("[equity-request] ack email failed", e);
    }
  };
  // Do not await — the response must return 202 quickly.
  void notify();
  void ackEmail();

  return NextResponse.json(
    {
      ok: true,
      status: "pending_review",
      request_id: inserted.id,
      consent_id: consentId,
      submitted_at: inserted.submitted_at,
    },
    { status: 202 },
  );
}
