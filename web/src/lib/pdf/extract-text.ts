// Shared PDF → text extraction (G13-W5-R5 / S-R5).
//
// The repo's only PDF text helper (`extractPdfText` in
// lib/guest-analysis/runner.ts) was written against pdf-parse v1 (a default
// export function). package.json pins v2.4.5, whose API is `new
// PDFParse({ data }).getText()` — so the old helper silently fell through to
// its ASCII byte-scan on every real PDF. This module speaks both shapes and
// is what the LinkedIn parser and the guest-analysis runner now call.
//
// Dynamic import: pdf-parse pulls pdfjs (~2 MB); nothing pays for it until
// a PDF actually arrives. Never throws — the caller gets "" and decides.

export interface PdfTextResult {
  text: string;
  pages: number;
  /** Parser-provided page numbers; never inferred from paragraph breaks. */
  pageTexts?: Array<{ page: number; text: string }>;
  /** "pdf-parse-v2" | "pdf-parse-v1" | "byte-scan" | "none" */
  engine: string;
}

type V2Ctor = new (opts: { data: Uint8Array | Buffer }) => { getText(): Promise<{ text: string; pages?: Array<{ num: number; text: string }>; total?: number }>; destroy(): Promise<void> };
type V1Fn = (b: Buffer) => Promise<{ text: string; numpages?: number }>;

/** Diagnostic byte view only. Never use PDF container bytes as business evidence. */
export function byteScanText(buffer: Buffer): string {
  return buffer
    .toString("binary")
    .replace(/[^\x20-\x7E\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractPdfTextFromBuffer(buffer: Buffer, opts: { byteScanFallback?: boolean } = {}): Promise<PdfTextResult> {
  if (!buffer || buffer.length === 0) return { text: "", pages: 0, engine: "none" };
  try {
    const mod = (await import("pdf-parse")) as unknown as { PDFParse?: V2Ctor; default?: V1Fn | { PDFParse?: V2Ctor } };
    const Ctor = mod.PDFParse ?? (typeof mod.default === "object" ? mod.default?.PDFParse : undefined);
    if (Ctor) {
      const parser = new Ctor({ data: new Uint8Array(buffer) });
      try {
        const r = await parser.getText();
        const pages = Array.isArray(r.pages) ? r.pages.length : typeof r.total === "number" ? r.total : 0;
        const pageTexts = (r.pages ?? []).filter(p => Number.isInteger(p.num) && p.num > 0 && typeof p.text === "string").map(p => ({ page: p.num, text: p.text.trim() }));
        return { text: pageTexts.length ? pageTexts.map(page => page.text).join("\n\f\n").trim() : (r.text ?? "").trim(), pages, pageTexts, engine: "pdf-parse-v2" };
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    }
    if (typeof mod.default === "function") {
      const r = await mod.default(buffer);
      return { text: (r.text ?? "").trim(), pages: r.numpages ?? 0, engine: "pdf-parse-v1" };
    }
  } catch (err) {
    console.warn("[pdf/extract-text] pdf-parse unavailable/failed", err instanceof Error ? err.message : String(err));
  }
  if (opts.byteScanFallback !== true) return { text: "", pages: 0, engine: "none" };
  return { text: byteScanText(buffer), pages: 0, engine: "byte-scan" };
}
