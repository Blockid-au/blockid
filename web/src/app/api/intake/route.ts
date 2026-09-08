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

import { NextResponse } from "next/server";
import { analyzeInput, type IntakeFileInput, type IntakeResult } from "@/lib/intake/analyze-input";
import { getCurrentUser } from "@/lib/auth";
import { ensureAnonKey } from "@/lib/analyses/anon-key";
import { checkAnalysisWriteLimit, saveAnalysis } from "@/lib/analyses/store";
import { deriveCompactSvi } from "@/lib/analyses/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  text?: string;
  url?: string;
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
  result: IntakeResult,
  meta: PersistMeta,
): Promise<string | null> {
  try {
    const { key: anonKey } = await ensureAnonKey();
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limit = checkAnalysisWriteLimit(anonKey, ip);
    if (!limit.allowed) {
      console.warn(
        `[intake] write rate-limited (${limit.reason}) — analysis returned but not saved`,
      );
      return null;
    }
    let userId: string | null = null;
    try {
      userId = (await getCurrentUser())?.id ?? null;
    } catch {
      userId = null; // anonymous is the normal case, not an error
    }
    return await saveAnalysis({
      anonKey,
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

export async function POST(request: Request) {
  let body: Body;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      body = {
        text: (form.get("text") as string | null) ?? undefined,
        url: (form.get("url") as string | null) ?? undefined,
      };
      const file = form.get("file");
      if (file && typeof file !== "string") {
        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = (file as File).name || "upload.bin";
        const fileInput: IntakeFileInput = {
          filename,
          buffer,
          mimeType: (file as File).type,
        };
        const result = await analyzeInput({
          text: body.text,
          url: body.url,
          file: fileInput,
        });
        const analysisId = await persist(request, result, {
          url: body.url,
          filename,
          mimeType: (file as File).type,
          bytes: buffer.length,
        });
        return NextResponse.json({ ok: true, analysisId, ...result });
      }
    } else {
      body = (await request.json()) as Body;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Invalid request body: ${msg}` },
      { status: 400 },
    );
  }

  const file: IntakeFileInput | undefined = body.file
    ? {
        filename: body.file.filename,
        buffer: Buffer.from(body.file.base64, "base64"),
        mimeType: body.file.mimeType,
      }
    : undefined;

  try {
    const result = await analyzeInput({
      text: body.text,
      url: body.url,
      file,
    });
    const analysisId = await persist(request, result, {
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
