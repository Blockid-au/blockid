// Local image transcription only. Vision requires a qualified multimodal policy.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { canAfford } from "@/lib/credits";
import { apiRoute } from "@/lib/audit/api-route";
import { prepareVisualImage, VISUAL_IMAGE_LIMITS } from "@/lib/intake/visual-image";
import { transcribeVisualImage } from "@/lib/intake/visual-ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_JSON_BYTES = Math.ceil(VISUAL_IMAGE_LIMITS.bytes / 3) * 4 + 4096;
const bodySchema = z.object({
  file: z.object({ filename: z.string().max(200).optional(), base64: z.string().min(4), mimeType: z.string().max(100).optional() }),
  forceLlm: z.boolean().optional(),
});

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("invalid_json");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) { await reader.cancel(); throw new Error("body_too_large"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth required" }, { status: 401 });
  // Preserve existing entitlement gate; local OCR still consumes no credits.
  const afford = await canAfford(user.id, "pitchdeck_ocr");
  if (!afford.allowed && afford.balance < 2) return NextResponse.json({ ok: false, error: "insufficient credits", required: 2, balance: afford.balance }, { status: 402 });
  let raw: unknown;
  try { raw = await readBody(request); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error && error.message === "body_too_large" ? "body_too_large" : "invalid JSON" }, { status: error instanceof Error && error.message === "body_too_large" ? 413 : 400 }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid image request" }, { status: 400 });
  if (parsed.data.forceLlm) return NextResponse.json({ ok: false, reason: "vision_not_qualified", credits_charged: 0 }, { status: 503 });
  const base64 = parsed.data.file.base64;
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return NextResponse.json({ ok: false, error: "invalid base64" }, { status: 400 });
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) return NextResponse.json({ ok: false, error: "invalid base64" }, { status: 400 });
  const image = await prepareVisualImage(bytes);
  if (!image.ok) return NextResponse.json({ ok: false, reason: image.reason, credits_charged: 0 }, { status: image.reason === "image_too_large" ? 413 : 422 });
  const result = await transcribeVisualImage(image.bytes);
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason, credits_charged: 0 }, { status: result.reason === "ocr_busy" ? 429 : result.reason === "ocr_timeout" ? 504 : 422 });
  return NextResponse.json({
    ok: true, text: result.text, length: result.text.length, method: "tesseract", credits_charged: 0,
    evidenceStatus: "transcribed_unverified", visualAnalysis: "not_performed",
    source: { originalSha256: image.originalSha256, derivativeSha256: image.derivativeSha256, width: image.width, height: image.height, transformVersion: image.transformVersion },
    warnings: ["OCR transcribes text only; charts, diagrams and financial claims still require visual interpretation and verification."],
  });
}

export const POST = apiRoute({ route: "api/pitchdeck/ocr/route.ts", method: "POST" }, POST_handler);
