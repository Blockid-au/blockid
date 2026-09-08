// POST /api/intake — context-aware backend intake wrapper.
//
// Accepts { text?, url?, file? (base64) } and returns the IntakeResult
// plus a `suggestedNext` action for the front-end. No credits consumed.

import { NextResponse } from "next/server";
import { analyzeInput, type IntakeFileInput } from "@/lib/intake/analyze-input";

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
        return NextResponse.json({ ok: true, ...result });
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
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Intake failed: ${msg}` },
      { status: 500 },
    );
  }
}
