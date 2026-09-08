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
  countAnonRunsInWindow,
  saveAnalysis,
} from "@/lib/analyses/store";
import { deriveCompactSvi } from "@/lib/analyses/payload";
import {
  decideSignupGate,
  isPaidSellableInput,
  type SignupGateDecision,
} from "@/lib/analyses/signup-gate";

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
      svi: deriveCompactSvi(result),
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
}> {
  let anonKey: string | null = null;
  try {
    anonKey = (await ensureAnonKey()).key;
  } catch {
    anonKey = null; // un-cookied: the run still happens, it just cannot be counted
  }
  let userId: string | null = null;
  try {
    userId = (await getCurrentUser())?.id ?? null;
  } catch {
    userId = null; // anonymous is the normal case, not an error
  }
  return { anonKey, userId };
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

export async function POST(request: Request) {
  let body: Body;
  let file: IntakeFileInput | undefined;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      body = {
        text: (form.get("text") as string | null) ?? undefined,
        url: (form.get("url") as string | null) ?? undefined,
        tier: (form.get("tier") as string | null) ?? undefined,
      };
      const formFile = form.get("file");
      if (formFile && typeof formFile !== "string") {
        const buffer = Buffer.from(await formFile.arrayBuffer());
        file = {
          filename: (formFile as File).name || "upload.bin",
          buffer,
          mimeType: (formFile as File).type,
        };
      }
    } else {
      body = (await request.json()) as Body;
      if (body.file) {
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
  const { anonKey, userId } = await resolveCaller();
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

  try {
    const result = await analyzeInput({
      text: body.text,
      url: body.url,
      file,
    });
    const analysisId = await persist(request, anonKey, userId, result, {
      url: body.url,
      filename: file?.filename,
      mimeType: file?.mimeType,
      bytes: file?.buffer.length,
    });
    return NextResponse.json({ ok: true, analysisId, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Intake failed: ${msg}` },
      { status: 500 },
    );
  }
}
