// POST /api/pitchdeck/classify
//
// Wave 11 step 1 — coverage-gated pitchdeck analysis.
//
// Founder uploads a deck via /api/upload (existing) and then hands us the
// storage path + filename. We extract the raw text (pdf-parse / mammoth),
// ask a cheap-tier LLM to classify each of the 8 SVI dimensions as
// `strong` / `partial` / `missing`, persist the row to
// `pitchdeck_analyses`, and return the coverage map + row id so the client
// can render the coverage heatmap + gate the follow-on analyze step.
//
// G14 S35: the pipeline itself lives in `@/lib/pitchdeck/classify`
// (`classifyDeck`) so the program-intake submission runner shares it; this
// route is the HTTP shell (auth + body + status mapping).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { classifyDeck, type ClassifyDeckError } from "@/lib/pitchdeck/classify";
import { apiRoute } from "@/lib/audit/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATUS_BY_ERROR: Record<ClassifyDeckError, number> = {
  storage_not_found_or_disallowed: 400,
  extracted_text_too_short: 400,
  extraction_failed: 500,
  classification_parse_failed: 502,
  classification_ai_failed: 502,
};

async function POST_handler(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    filename?: string;
    storageUrl?: string;
    projectId?: string | null;
    rawText?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const filename = (body.filename ?? "pitchdeck.pdf").slice(0, 200);
  const projectId = body.projectId ?? null;
  const storageUrl = body.storageUrl ?? "";

  // Prefer raw text if the caller already has it (paste-from-clipboard flow).
  // Otherwise resolve the upload path and extract PDF/DOCX text.
  const result = await classifyDeck({
    text: typeof body.rawText === "string" ? body.rawText : "",
    filepath: storageUrl || null,
    filename,
    userId: user.id,
    projectId,
    storageUrl,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.detail ? { detail: result.detail } : {}) },
      { status: STATUS_BY_ERROR[result.error] },
    );
  }

  // Persist the classified row so the client can hand the id to
  // /api/pitchdeck/analyze on the next step — a miss is a hard error here.
  if (!result.pitchdeckId) {
    return NextResponse.json(
      { ok: false, error: "persist_failed", detail: result.warnings.join("; ") },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    pitchdeckId: result.pitchdeckId,
    coverage: result.coverage,
    textBytes: result.textBytes,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/pitchdeck/classify/route.ts", method: "POST" }, POST_handler);
