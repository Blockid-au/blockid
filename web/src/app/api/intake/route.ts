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
// SIGNUP GATE (2026-09-08)
// ------------------------
// Run 1 is completely unwalled. From run 2, an anonymous browser is asked for
// an email BEFORE the pipeline runs — see `@/lib/analyses/signup-gate` for
// the reasoning and the counting window.
//
// The gate is checked here, server-side, before `analyzeInput` is called. A
// client-side check would be bypassed with one devtools edit and would leave
// the model-spend exposure exactly where it started. The point of the gate is
// to SPEND NOTHING, so the sequence is strictly: parse body → resolve
// identity → count prior runs → decide → only then analyse.
//
// RESPONSE SHAPE — 200 with `{ ok: false, reason: "signup_required" }`, not 401
//   A 401 says "your credentials failed". Nothing failed here: the request was
//   valid, we understood it completely, and we are deliberately declining to
//   run it yet. Three concrete reasons for the 200:
//     1. the existing client already collapses every non-2xx into a generic
//        "Something went wrong" — a 401 would surface the account wall as an
//        error, which it is not;
//     2. a 401 invites browsers, proxies and monitors to treat the route as
//        broken and (for some) to prompt for HTTP auth;
//     3. `reason` is a discriminator the client can branch on without parsing
//        prose, and it rides alongside the real `priorRuns` / `windowDays` so
//        the prompt can state facts rather than invent copy.
//   The status line is not the contract; `ok` is.

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
import { emitScoreComputed, emitSviAnalyze } from "@/lib/analytics/funnel";
import { emitDeckUploaded, emitWebsiteImported } from "@/lib/analytics/fi-events";
import {
  decideSignupGate,
  isPaidSellableInput,
  type SignupGateDecision,
} from "@/lib/analyses/signup-gate";
import { apiRoute } from "@/lib/audit/api-route";
import { startFirstAnalysisJob } from "@/lib/analyses/first-analysis/job";
import { parseMultipart } from "@/lib/http/multipart";

// 2026-09-19: same ceiling as the intake-link deck path (DECK_MAX_BYTES in
// lib/intake/submission-runner — not imported to keep that fs/pitchdeck graph
// out of this route). analyze-root.tsx mirrors it as FILE_MAX_MB.
const DECK_MAX_BYTES = 25 * 1024 * 1024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  text?: string;
  url?: string;
  /** `?tier=` the visitor arrived on — only ever widens the gate, never charges. */
  tier?: string;
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
): Promise<string | null> {
  try {
    const key = anonKey ?? (await ensureAnonKey()).key;
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
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
}> {
  let anonKey: string | null = null;
  try {
    anonKey = (await ensureAnonKey()).key;
  } catch {
    anonKey = null; // un-cookied: the run still happens, it just cannot be counted
  }
  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const user = await getCurrentUser();
    userId = user?.id ?? null;
    userEmail = user?.email ?? null; // only ever used for the qa-live-* flag
  } catch {
    userId = null; // anonymous is the normal case, not an error
  }
  return { anonKey, userId, userEmail };
}

/** The 200 body the client branches on when the account wall fires. */
function gatedResponse(decision: Extract<SignupGateDecision, { allow: false }>) {
  return NextResponse.json({
    ok: false,
    reason: decision.reason,
    priorRuns: decision.priorRuns,
    windowDays: decision.windowDays,
    analysisId: null,
  });
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
  const { anonKey, userId, userEmail } = await resolveCaller();
  const authenticated = Boolean(userId);
  // Counting is pointless for a signed-in caller and for an un-cookied one
  // (nothing to count against), so skip the query entirely in both cases.
  const priorRuns =
    authenticated || !anonKey ? 0 : await countAnonRunsInWindow(anonKey);
  const decision = decideSignupGate({
    authenticated,
    priorRuns,
    tier: body.tier === "paid" ? "paid" : "free",
    paidSellable: isPaidSellableInput({
      hasFile: Boolean(file),
      url: body.url,
      text: body.text,
    }),
  });
  if (!decision.allow) return gatedResponse(decision);

  // Defence in depth. The gate above is keyed to a cookie and cookies can be
  // cleared, so an IP ceiling sits behind it — otherwise one person could
  // loop "run #1" indefinitely by clearing site data between runs. Generous
  // enough that a real founder never meets it, and skipped entirely for a
  // signed-in caller whose spend is governed by credits.
  if (!authenticated) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
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

  try {
    const result = await analyzeInput({
      text: body.text,
      url: body.url,
      file,
    });
    const svi = deriveCompactSvi(result);
    const analysisId = await persist(request, anonKey, userId, result, svi, {
      url: body.url,
      filename: file?.filename,
      mimeType: file?.mimeType,
      bytes: file?.buffer.length,
    });
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
    } catch (err) {
      console.warn("[intake] funnel emit failed —", err instanceof Error ? err.message : String(err));
    }
    // S32-B — the full first analysis (SVI reasoning, indicative valuation,
    // seven C-level sections, the emailed PDF) runs as a background job on
    // the saved row. Fire-and-forget: the response never waits on a model
    // call, and the 5-minute cron re-drives anything that stalls. Costs the
    // founder nothing — the first analysis is free on every path.
    if (analysisId) {
      try {
        startFirstAnalysisJob(analysisId, { userId });
      } catch (err) {
        console.error("[intake] could not start the first-analysis job —", err);
      }
    }
    return NextResponse.json({ ok: true, analysisId, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Intake failed: ${msg}` },
      { status: 500 },
    );
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/intake/route.ts", method: "POST" }, POST_handler);
