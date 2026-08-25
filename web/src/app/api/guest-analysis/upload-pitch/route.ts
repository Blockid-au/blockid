/**
 * POST /api/guest-analysis/upload-pitch — A$3 One-Click Guest Analysis, Phase 2.
 *
 * Guest-friendly pitch deck upload. Accepts PDF/DOCX up to 10 MB. Writes the
 * file to a short-lived temp location and returns the path so the caller can
 * pass it into /api/guest-analysis/create-order as `inputValue`. The analysis
 * runner (Phase 4) reads the file, extracts text, then deletes it.
 *
 * We deliberately do NOT put this in Supabase Storage here — the guest has no
 * auth.uid() to key an RLS policy against, and a public bucket for guest
 * uploads is a phishing/malware distribution risk. `/tmp` files are ephemeral
 * per container lifecycle and the runner cleans up after itself.
 *
 * Rate-limited to 20/hour per IP to keep the tmp dir from filling.
 *
 * Response:
 *   200 { inputValue, filename }
 *   400 no file
 *   413 file too large
 *   415 wrong content type
 *   429 rate limit
 *   500 write error
 */

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

// Prefer a dedicated persistent volume when the container mounts one at
// /app/guest-uploads (see infra layer); otherwise use /tmp which is fine
// for a 1-hour retention window.
const UPLOAD_DIR = existsSync("/app/guest-uploads")
  ? "/app/guest-uploads"
  : "/tmp/guest-uploads";

function safeFilename(originalName: string): string {
  // Strip everything except word chars, dot, dash, and space; trim to 255.
  return originalName.replace(/[^\w.\- ]+/g, "_").slice(0, 255);
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(
    "guest-analysis-upload-pitch",
    null,
    request,
    20,
    60 * 60 * 1000,
  );
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided — send as multipart form field 'file'" },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large. Max ${MAX_SIZE / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: `Content type '${file.type}' not allowed. Accepted: PDF, DOCX.`,
      },
      { status: 415 },
    );
  }

  // Extension is derived from the VALIDATED MIME, never from the client
  // filename — same reasoning as /api/upload/route.ts.
  const ext = EXT_BY_MIME[file.type] ?? "bin";
  const id = randomBytes(16).toString("hex");
  const storedName = `${Date.now()}-${id}.${ext}`;

  if (!existsSync(UPLOAD_DIR)) {
    try {
      await mkdir(UPLOAD_DIR, { recursive: true });
    } catch (err) {
      console.error(
        "[guest-analysis:upload-pitch] mkdir failed",
        err instanceof Error ? err.message : String(err),
      );
      return NextResponse.json(
        { error: "Upload directory unavailable" },
        { status: 500 },
      );
    }
  }

  const filepath = join(UPLOAD_DIR, storedName);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);
  } catch (err) {
    console.error(
      "[guest-analysis:upload-pitch] write failed",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "Failed to store upload" },
      { status: 500 },
    );
  }

  // inputValue = absolute path on disk. The runner (Phase 4) opens it
  // via fs.readFile using this exact path.
  return NextResponse.json({
    inputValue: filepath,
    filename: safeFilename(file.name || storedName),
  });
}
