import { randomUUID } from "node:crypto";
import { withReportSpendScope } from "@/lib/ai/report-attempt-budget";
// POST /api/intake — context-aware backend intake wrapper.
//
// Accepts { text?, url?, file? (base64) } and returns the IntakeResult
// plus a `suggestedNext` action for the front-end. No credits consumed.
//
// PERSISTENCE (2026-09-08)
// ------------------------
// This route used to write nothing. A founder pasted an idea into the hero,
// watched a real SVI score and valuation render on /analyze, and the run
// ceased to exist the moment they navigated. Every run is now saved — logged
// in or not — against either the session user or an httpOnly `blockid_anon`
// cookie, and the row id comes back as `analysisId` so the caller can link
// to /api/analyses/<id>.
//
// The write is strictly best-effort. If Supabase is down, misconfigured, or
// simply slow to accept the insert, the analysis is still returned with a
// loud server log and `analysisId: null`. Losing a good analysis to a
// database hiccup would be a worse failure than not saving it.
//
// FREE-ALLOWANCE GATE (G25-C, 2026-09-21 — replaces the 2026-09-08 signup gate)
// ---------------------------------------------------------------------------
// Founder decision 2026-09-21: the first TWO business reports per e-mail
// address are free, the address is REQUIRED before the run so the report can
// be e-mailed, and the system records who submitted and who received it.
// See `@/lib/reports/free-report-gate` (the gate) and
// `@/lib/reports/free-grants` (the ledger, migration 0439).
//
// The gate is checked here, server-side, before `analyzeInput` is called. A
// client-side check would be bypassed with one devtools edit and would leave
// the model-spend exposure exactly where it started. The point of the gate is
// to SPEND NOTHING, so the sequence is strictly: parse body → resolve
// identity → validate the address → count → decide → reserve the grant →
// only then analyse.
//
// RESPONSE SHAPES
//   * 400 `{ ok: false, reason: "email_required" | "email_invalid" |
//     "email_disposable" }` — a guest without a usable address. A genuine
//     client error: the form did not send what the contract requires.
//   * 429 `{ ok: false, reason: "free_ip_limit" }` — more than three free
//     reports from one network today.
//   * 200 `{ ok: false, reason: "free_allowance_used", used, price, next:
//     "pay", payHref }` — the third run. Nothing failed: the request was
//     valid, we understood it, and the A$3 quote-then-pay path takes over.
//     A 200 because the client collapses every non-2xx into "Something went
//     wrong", and this is not an error — it is the quote.
//   * 200 `{ ok: true, …, freeReport: { sequenceNo, remaining, queued,
//     emailTo } }` — the run. `queued` = the platform cap deferred it to
//     the cron; the visitor is told "we e-mail you when it is ready".
//   The status line is not the contract; `ok` + `reason` are.

import { NextResponse } from "next/server";
import { analyzeInput, type IntakeFileInput, type IntakeResult } from "@/lib/intake/analyze-input";
import { getCurrentUser } from "@/lib/auth";
import { ensureAnonKey } from "@/lib/analyses/anon-key";
import {
  checkAnalysisWriteLimit,
  checkAnonRunLimit,
  countAnonRunsInWindow,
  countUserRuns,
  saveAnalysis,
} from "@/lib/analyses/store";
import { deriveCompactSvi, type CompactSvi } from "@/lib/analyses/payload";
import { emitFreeReportSubmitted, emitScoreComputed, emitSviAnalyze } from "@/lib/analytics/funnel";
import { emitDeckUploaded, emitWebsiteImported } from "@/lib/analytics/fi-events";
import { apiRoute } from "@/lib/audit/api-route";
import { startAnalysisReportJob } from "@/lib/analyses/first-analysis/dispatch";
import { cancelQueuedFullReport } from "@/lib/analyses/first-analysis/store";
import { parseMultipart } from "@/lib/http/multipart";
import { clientIpFromHeaders } from "@/lib/iphash";
import { maskSummaryEmail } from "@/lib/analyses/free-summary";
import { attachAnalysis, releaseGrant } from "@/lib/reports/free-grants";
import { canAfford, spendCredits } from "@/lib/credits";
import { INTAKE_CREDIT_CHANNEL, INTAKE_CREDIT_FEATURE } from "@/lib/analyses/credit-refund";
import {
  FREE_REPORT_ALLOWANCE_USED,
  FREE_REPORT_HONEYPOT_FIELD,
  FREE_REPORT_IP_LIMIT,
  FREE_REPORTS_PER_IP_PER_DAY,
} from "@/lib/reports/free-grants-rules";
import {
  FREE_REPORT_PAY_HREF,
  freeReportPayQuote,
  runFreeReportGate,
  type FreeReportGateResult,
} from "@/lib/reports/free-report-gate";

// 2026-09-19: same ceiling as the intake-link deck path (DECK_MAX_BYTES in
// lib/intake/submission-runner — not imported to keep that fs/pitchdeck graph
// out of this route). analyze-root.tsx mirrors it as FILE_MAX_MB.
const DECK_MAX_BYTES = 25 * 1024 * 1024;

/*
 * 2026-09-25 — a signed-in founder past the two free reports pays for THIS
 * run with credits, from the same page, after seeing the cost. Before this
 * the only way out was a link to the workspace report page, which dropped
 * the uploaded deck and showed the founder's previous report instead.
 * Same feature key (and so the same price) as the workspace Trusted
 * Business Report: FEATURE_COSTS.trust_report, pinned to the A$ SKU.
 * The debit happens only once the row is saved, tagged with its id, so a
 * run that later fails for good is refunded by the report job (AF04).
 */

interface CreditQuote {
  feature: string;
  cost: number;
  balance: number;
  canAfford: boolean;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  text?: string;
  url?: string;
  /** `?tier=` the visitor arrived on — only ever widens the gate, never charges. */
  tier?: string;
  /** G25-C: REQUIRED for a guest — where the free report is e-mailed. Ignored for a signed-in caller (the account address is used). */
  email?: string;
  /** G25-C honeypot (FREE_REPORT_HONEYPOT_FIELD) — a human never fills it. */
  company_website?: string;
  /** "credits" — a signed-in caller past the free allowance confirmed paying for this run with credits. */
  payWith?: string;
  file?: {
    filename: string;
    base64: string;
    mimeType?: string;
  };
}

interface PersistMeta {
  url?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  bytes?: number | null;
}

/**
 * Save the run and hand back the row id. Swallows everything: the caller has
 * a good result in hand and must return it either way.
 */
async function persist(
  request: Request,
  anonKey: string | null,
  userId: string | null,
  result: IntakeResult,
  svi: CompactSvi | null,
  meta: PersistMeta,
  fullReportEmail: string | null = null,
): Promise<string | null> {
  try {
    const key = anonKey ?? (await ensureAnonKey()).key;
    // Review v3.26.0 P3: the trusted hop (the same helper the free-report
    // ledger uses), never the client-forgeable first XFF entry.
    const ip = clientIpFromHeaders(request.headers) ?? "unknown";
    const limit = checkAnalysisWriteLimit(key, ip);
    if (!limit.allowed) {
      console.warn(
        `[intake] write rate-limited (${limit.reason}) — analysis returned but not saved`,
      );
      return null;
    }
    return await saveAnalysis({
      anonKey: key,
      userId,
      result,
      svi,
      url: meta.url ?? null,
      filename: meta.filename ?? null,
      mimeType: meta.mimeType ?? null,
      bytes: meta.bytes ?? null,
      fullReportEmail,
    });
  } catch (err) {
    console.error("[intake] persist failed — analysis returned unsaved:", err);
    return null;
  }
}

/**
 * Who is asking, and how many runs have they already had?
 *
 * Everything here is fail-soft in the permissive direction: an unavailable
 * cookie store or session table means "anonymous, zero prior runs", so a
 * platform wobble opens the gate instead of walling everybody.
 */
async function resolveCaller(): Promise<{
  anonKey: string | null;
  userId: string | null;
  userEmail: string | null;
  userPlan: string | null;
  userRole: "user" | "admin" | null;
}> {
  let anonKey: string | null = null;
  try {
    anonKey = (await ensureAnonKey()).key;
  } catch {
    anonKey = null; // un-cookied: the run still happens, it just cannot be counted
  }
  let userId: string | null = null;
  let userEmail: string | null = null;
  let userPlan: string | null = null;
  let userRole: "user" | "admin" | null = null;
  try {
    const user = await getCurrentUser();
    userId = user?.id ?? null;
    userEmail = user?.email ?? null; // the qa-live-* flag + the account's free allowance (G25-C)
    userPlan = user?.plan ?? null;
    userRole = user?.role ?? null;
  } catch {
    userId = null; // anonymous is the normal case, not an error
  }
  return { anonKey, userId, userEmail, userPlan, userRole };
}

/** The body the client branches on when the free-allowance gate declines. */
function gatedResponse(
  result: Extract<FreeReportGateResult, { allow: false }>,
  credits: CreditQuote | null = null,
) {
  if (result.reason === FREE_REPORT_ALLOWANCE_USED) {
    // The third run: not an error — the quote. The client shows the price
    // and hands over to the existing A$3 quote-then-pay path.
    return NextResponse.json({
      ok: false,
      reason: FREE_REPORT_ALLOWANCE_USED,
      used: result.used ?? 0,
      price: freeReportPayQuote(),
      next: "pay",
      payHref: FREE_REPORT_PAY_HREF,
      // Signed-in only: what running THIS input with credits costs, and
      // whether the balance covers it. Nothing has been charged.
      ...(credits ? { credits } : {}),
      analysisId: null,
    });
  }
  if (result.reason === FREE_REPORT_IP_LIMIT) {
    return NextResponse.json(
      {
        ok: false,
        reason: FREE_REPORT_IP_LIMIT,
        error: `Up to ${FREE_REPORTS_PER_IP_PER_DAY} free reports a day from one network. Try again tomorrow, or sign in.`,
        analysisId: null,
      },
      { status: 429 },
    );
  }
  // email_required / email_invalid / email_disposable / honeypot — the form
  // did not send a usable address. The honeypot answers with the generic
  // shape so a bot learns nothing.
  const reason = result.reason === "honeypot" ? "email_invalid" : result.reason;
  return NextResponse.json(
    { ok: false, reason, error: reason, analysisId: null },
    { status: 400 },
  );
}

async function POST_handler(request: Request) {
  let body: Body;
  let file: IntakeFileInput | undefined;
  // Cheapest check first: a declared body over the cap answers the typed
  // 413 before the multipart parser (which fails on very large bodies with
  // an opaque "Failed to parse body as FormData" → 400) ever runs. Small
  // allowance for multipart framing + the text/url/tier fields.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > DECK_MAX_BYTES + 64 * 1024) {
    return NextResponse.json(
      { ok: false, error: "file_too_large", max_bytes: DECK_MAX_BYTES },
      { status: 413 },
    );
  }
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      // Buffer first, size, then parse with our own multipart reader: the
      // runtime's formData() has no dependable size signal and, in the
      // standalone server, fails outright on bodies above ~10 MB ("Failed to
      // parse body as FormData") — the size of a normal pitch deck
      // (2026-09-19; see lib/http/multipart.ts).
      const raw = Buffer.from(await request.arrayBuffer());
      if (raw.byteLength > DECK_MAX_BYTES + 64 * 1024) {
        return NextResponse.json(
          { ok: false, error: "file_too_large", max_bytes: DECK_MAX_BYTES },
          { status: 413 },
        );
      }
      const parsed = parseMultipart(raw, contentType);
      body = {
        text: parsed.fields.text ?? undefined,
        url: parsed.fields.url ?? undefined,
        tier: parsed.fields.tier ?? undefined,
        email: parsed.fields.email ?? undefined,
        [FREE_REPORT_HONEYPOT_FIELD]: parsed.fields[FREE_REPORT_HONEYPOT_FIELD] ?? undefined,
        payWith: parsed.fields.payWith ?? undefined,
      };
      const formFile = parsed.files.find((f) => f.name === "file") ?? parsed.files[0];
      if (formFile) {
        if (formFile.buffer.length > DECK_MAX_BYTES) {
          return NextResponse.json(
            { ok: false, error: "file_too_large", max_bytes: DECK_MAX_BYTES },
            { status: 413 },
          );
        }
        file = {
          filename: formFile.filename || "upload.bin",
          buffer: formFile.buffer,
          mimeType: formFile.mimeType,
        };
      }
    } else {
      body = (await request.json()) as Body;
      if (body.file) {
        // base64 inflates by 4/3 — compare the decoded size to the same cap.
        if (Math.floor((body.file.base64.length * 3) / 4) > DECK_MAX_BYTES) {
          return NextResponse.json(
            { ok: false, error: "file_too_large", max_bytes: DECK_MAX_BYTES },
            { status: 413 },
          );
        }
        file = {
          filename: body.file.filename,
          buffer: Buffer.from(body.file.base64, "base64"),
          mimeType: body.file.mimeType,
        };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Invalid request body: ${msg}` },
      { status: 400 },
    );
  }

  // ── The gate. Nothing above this line costs money; nothing below it runs
  // until the gate says so. ────────────────────────────────────────────────
  const { anonKey, userId, userEmail, userPlan, userRole } = await resolveCaller();
  const authenticated = Boolean(userId);
  // G16-A `first` flag: an anonymous run is first when this cookie has no
  // prior saved runs; skipped for a signed-in or un-cookied caller.
  const priorRuns =
    authenticated || !anonKey ? 0 : await countAnonRunsInWindow(anonKey);

  // Defence in depth, BEFORE the ledger is touched (review 2026-09-21: a
  // 429 after the reservation would burn one of the address's two free
  // reports for nothing). The per-network ceiling stops one person looping
  // runs by clearing site data between them. Generous enough that a real
  // founder never meets it, and skipped entirely for a signed-in caller.
  if (!authenticated) {
    // Review v3.26.0 P3: the trusted hop (the same helper the free-report
    // ledger uses), never the client-forgeable first XFF entry.
    const ip = clientIpFromHeaders(request.headers) ?? "unknown";
    const runLimit = checkAnonRunLimit(ip);
    if (!runLimit.allowed) {
      console.warn(`[intake] anonymous run ceiling hit (${runLimit.reason})`);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Too many analyses from this network in a short time. Try again shortly, or sign in.",
        },
        { status: 429 },
      );
    }
  }

  const gateResult = await runFreeReportGate({
    user: userId && userEmail ? { id: userId, email: userEmail, plan: userPlan, role: userRole } : null,
    bodyEmail: body.email,
    honeypot: body[FREE_REPORT_HONEYPOT_FIELD],
    clientIp: clientIpFromHeaders(request.headers),
  });
  // Credits the caller agreed to pay for this run — debited once the row is saved.
  let creditQuote: CreditQuote | null = null;
  let creditCharge: { cost: number } | null = null;
  let gate: Extract<FreeReportGateResult, { allow: true }>;
  if (gateResult.allow) {
    gate = gateResult;
  } else if (gateResult.reason === FREE_REPORT_ALLOWANCE_USED && userId && userEmail) {
    // Signed in, free allowance spent: quote the credit price for THIS
    // input; charge only when the client comes back with payWith=credits
    // (the founder saw the cost and pressed the button).
    const afford = await canAfford(userId, INTAKE_CREDIT_FEATURE).catch(() => null);
    const quote: CreditQuote | null = afford && afford.reason !== "unknown_feature"
      ? { feature: INTAKE_CREDIT_FEATURE, cost: afford.cost, balance: afford.balance, canAfford: afford.allowed }
      : null;
    if (body.payWith !== "credits") return gatedResponse(gateResult, quote);
    if (!quote || !quote.canAfford) {
      return NextResponse.json(
        { ok: false, reason: "insufficient_credits", credits: quote, analysisId: null },
        { status: 402 },
      );
    }
    creditQuote = quote;
    gate = { allow: true, path: "entitled", email: userEmail, source: "account", grant: null, queued: false, remaining: 0 };
  } else {
    return gatedResponse(gateResult);
  }
  // A guest's address rides on the row so the job e-mails the PDF and the
  // page is never locked; a signed-in run resolves the account address at
  // delivery (nothing to stamp).
  const guestEmail = gate.source === "guest" ? gate.email : null;

  try {
    const aiBudgetScope = `blockid:intake:${randomUUID()}`;
    const result = await withReportSpendScope(aiBudgetScope, () => analyzeInput({
      text: body.text,
      url: body.url,
      file,
    }));
    result.aiBudgetScope = aiBudgetScope;
    const svi = deriveCompactSvi(result);
    const analysisId = await persist(request, anonKey, userId, result, svi, {
      url: body.url,
      filename: file?.filename,
      mimeType: file?.mimeType,
      bytes: file?.buffer.length,
    }, guestEmail);
    if (creditQuote && userId) {
      // Charge only for a run that exists: no saved row → no report job →
      // nothing to pay for (the founder keeps the instant result).
      if (!analysisId) {
        creditQuote = null;
      } else {
        const spent = await spendCredits(userId, INTAKE_CREDIT_FEATURE, {
          channel: INTAKE_CREDIT_CHANNEL,
          analysis_id: analysisId,
        }).catch(() => null);
        if (!spent?.ok) {
          // Balance moved since the check: nothing was charged, so the saved
          // row is taken out of the queue — otherwise the 5-minute cron would
          // write (and e-mail) the report for free.
          await cancelQueuedFullReport(analysisId).catch(() => false);
          return NextResponse.json(
            {
              ok: false,
              reason: "insufficient_credits",
              credits: { ...creditQuote, balance: spent?.balance ?? creditQuote.balance, canAfford: false },
              analysisId: null,
            },
            { status: 402 },
          );
        }
        creditCharge = { cost: creditQuote.cost };
      }
    }
    // G25-C — the ledger. A saved row is attached to its reservation; a
    // run that never saved gives the reservation back so the address is
    // not charged a free report for nothing. Never affects the response.
    if (gate.grant) {
      try {
        if (analysisId) await attachAnalysis(gate.grant.id, analysisId);
        else await releaseGrant(gate.grant.id);
      } catch (err) {
        console.error("[intake] free-report ledger write failed —", err instanceof Error ? err.message : String(err));
      }
    }
    // G16-A — funnel truth. This route IS the founder's first analysis
    // (S32), so the `svi_analyze` step is emitted here, `first` decided
    // server-side: an anonymous run is first when the gate saw no prior
    // runs; a signed-in run when the user has no earlier saved row (the
    // row just written counts as one). `svi_score_computed` follows once a
    // score exists. Fire-and-forget, never affects the response.
    try {
      let first: boolean;
      if (userId) {
        const runs = await countUserRuns(userId);
        first = runs <= (analysisId ? 1 : 0);
      } else {
        first = priorRuns === 0;
      }
      const score = svi?.totalSVI;
      emitSviAnalyze({
        userId,
        email: userEmail,
        projectId: analysisId,
        analysisId,
        first,
        score,
        sessionId: anonKey,
      });
      if (analysisId && typeof score === "number" && Number.isFinite(score)) {
        emitScoreComputed({
          userId,
          email: userEmail,
          projectId: analysisId,
          score,
          slug: analysisId,
          analysisId,
          sessionId: anonKey,
        });
      }
      // G21 P0-D — FI envelope: what came in (a website, a deck). The
      // svi_analyze / svi_score_computed rows above already stand for
      // `startup_created` / `initial_score_generated` (FI_EVENT_ALIASES).
      if (body.url) {
        emitWebsiteImported({ userId, email: userEmail, sessionId: anonKey, analysisId, channel: "intake", url: body.url });
      }
      if (file) {
        emitDeckUploaded({ userId, email: userEmail, sessionId: anonKey, analysisId, channel: "intake", sizeBytes: file.buffer.length, mimeType: file.mimeType });
      }
      // G25-C — the free allowance: one row per grant (event_id = the grant id).
      if (gate.grant && analysisId) {
        emitFreeReportSubmitted({
          grantId: gate.grant.id,
          sequenceNo: gate.grant.sequence_no,
          source: gate.grant.source,
          queued: gate.queued,
          analysisId,
          userId,
          email: gate.email,
          sessionId: anonKey,
        });
      }
    } catch (err) {
      console.warn("[intake] funnel emit failed —", err instanceof Error ? err.message : String(err));
    }
    // G28-C — the report runs as a background job on the saved row, through
    // the SAME ReportV2 pipeline the paid Trusted Business Report uses
    // (`orchestrateReport`, tier standard): free runs 1–2 (guest or account)
    // and an entitled member's run all receive the v3 document — on the
    // page, in the e-mail body (the investment view) and as the PDF twin.
    // Fire-and-forget: the response never waits on a model call, and the
    // 5-minute cron re-drives anything that stalls. (S32-B's seven-voice
    // runner remains only for rows written before G28 — dispatch.ts.)
    //
    // G25-C: it starts NOW on the free path and the entitled path. Over the
    // daily platform cap (`gate.queued`) the row stays `queued` and the
    // first-analysis cron starts it when the cap allows — the visitor is
    // told "we e-mail you when it is ready". One pipeline run per grant.
    const startNow = Boolean(analysisId) && !gate.queued;
    if (analysisId && startNow) {
      try {
        startAnalysisReportJob(analysisId, { userId });
      } catch (err) {
        console.error("[intake] could not start the report job —", err);
      }
    }
    // AF08: an unsaved run has no report job and its grant was given back —
    // never say "sending report N" for it.
    const freeReport =
      gate.path === "free" && analysisId
        ? {
            sequenceNo: gate.grant?.sequence_no ?? null,
            remaining: gate.remaining,
            queued: gate.queued,
            emailTo: maskSummaryEmail(gate.email),
          }
        : null;
    return NextResponse.json({
      ok: true,
      analysisId,
      freeReport,
      ...(analysisId ? {} : { saveFailed: true }),
      ...(creditCharge ? { creditsCharged: creditCharge.cost } : {}),
      ...result,
    });
  } catch (err) {
    if (gate.grant) {
      try {
        await releaseGrant(gate.grant.id);
      } catch {
        /* the reservation stays queued with no analysis; the runbook says how to clear it */
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    const extractionStatus: Record<string, number> = {
      image_too_large: 413, unsupported_image: 415, animated_image: 415,
      invalid_image: 422, needs_input: 422, ocr_failed: 422, ocr_busy: 429, ocr_timeout: 504,
    };
    if (extractionStatus[msg]) return NextResponse.json({ ok: false, reason: msg, error: msg }, { status: extractionStatus[msg] });
    return NextResponse.json(
      { ok: false, error: `Intake failed: ${msg}` },
      { status: 500 },
    );
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/intake/route.ts", method: "POST" }, POST_handler);
