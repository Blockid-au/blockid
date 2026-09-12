// POST /api/pitchdeck/ocr — OCR fallback for image-only pitch decks.
//
// Strategy: for each embedded raster (or the whole PDF page rendered as an
// image), try tesseract.js first (free, on-box). If tesseract yields <30
// chars for a page it falls back to a vision LLM via callAI (paid — gated
// at +2 credits).

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getCurrentUser } from "@/lib/auth";
import { canAfford, spendCredits } from "@/lib/credits";
import { callAI } from "@/lib/ai-client";
import { apiRoute } from "@/lib/audit/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OCR_FEATURE = "pitchdeck_ocr";
const OCR_COST_CREDITS = 2;

interface Body {
  file: {
    filename: string;
    base64: string;
    mimeType?: string;
  };
  /** Force LLM vision path even if tesseract would have run. */
  forceLlm?: boolean;
}

async function tryTesseract(buffer: Buffer): Promise<string> {
  try {
    const mod = (await import("tesseract.js")) as {
      recognize?: (
        image: Buffer | string,
        lang?: string,
        opts?: unknown,
      ) => Promise<{ data: { text: string } }>;
    };
    if (typeof mod.recognize !== "function") return "";
    const res = await mod.recognize(buffer, "eng");
    return res.data.text ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[pitchdeck:ocr] tesseract failed", msg);
    return "";
  }
}

async function tryVisionLlm(buffer: Buffer, mimeType: string): Promise<string> {
  const b64 = buffer.toString("base64");
  // Vision via callAI: not every provider supports it. Use a text-prompt
  // best-effort — the model can transcribe if it's a Claude/Gemini vision
  // route. If it fails, return empty and the caller degrades cleanly.
  try {
    const res = await callAI({
      system:
        "You are OCR. Transcribe verbatim every legible word in the supplied image. Return the plain text only, no commentary.",
      user: `<image mime="${mimeType}">data:${mimeType};base64,${b64.slice(0, 200000)}</image>\n\nTranscribe.`,
      maxTokens: 1200,
      temperature: 0,
      agentId: "pitchdeck-ocr",
    });
    return res.text ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[pitchdeck:ocr] vision LLM failed", msg);
    return "";
  }
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "auth required" }, { status: 401 });
  }

  const afford = await canAfford(user.id, OCR_FEATURE);
  if (!afford.allowed && afford.balance < OCR_COST_CREDITS) {
    return NextResponse.json(
      {
        ok: false,
        error: "insufficient credits",
        required: OCR_COST_CREDITS,
        balance: afford.balance,
      },
      { status: 402 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body.file?.base64) {
    return NextResponse.json({ ok: false, error: "file.base64 required" }, { status: 400 });
  }

  const buffer = Buffer.from(body.file.base64, "base64");
  const mimeType = body.file.mimeType ?? "image/png";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-"));
  const tmpPath = path.join(tmpDir, body.file.filename || "input.bin");
  await fs.writeFile(tmpPath, buffer);

  let text = "";
  let usedLlm = false;

  if (!body.forceLlm) {
    text = await tryTesseract(buffer);
  }

  if (body.forceLlm || text.trim().length < 30) {
    const vision = await tryVisionLlm(buffer, mimeType);
    if (vision.trim().length > text.trim().length) {
      text = vision;
      usedLlm = true;
    }
  }

  // Only charge if we actually invoked the vision path.
  let charged = 0;
  if (usedLlm) {
    try {
      const spent = await spendCredits(user.id, OCR_FEATURE, {
        reason: "pitchdeck-ocr LLM vision fallback",
        filename: body.file.filename,
      });
      if (spent.ok) charged = OCR_COST_CREDITS;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[pitchdeck:ocr] credit spend failed", msg);
    }
  }

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    text: text.trim(),
    length: text.trim().length,
    method: usedLlm ? "vision_llm" : "tesseract",
    credits_charged: charged,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/pitchdeck/ocr/route.ts", method: "POST" }, POST_handler);
