// PDF font registry (G13-W5-R5 / S-R5, W4-review follow-up c).
//
// react-pdf ships Helvetica (WinAnsi) — fine for English, but Vietnamese
// tone marks have no glyph there and `pdfSafeText` had to strip them. For
// `locale: "vi"` we register a bundled Noto Sans subset (public/fonts/,
// ~120 KB per face, Latin + Vietnamese) once per process and switch the
// document to it; English keeps Helvetica so nothing is loaded for the
// common case. Missing files (an unusual release layout) fall back to
// Helvetica + the stripping shim — never a failed render.

import { existsSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const PDF_UNICODE_FAMILY = "Noto Sans";

export interface PdfFontSet {
  /** Family for body text. */
  regular: string;
  /** Family for bold text (Helvetica-Bold, or the same family + fontWeight 700). */
  bold: string;
  /** react-pdf `fontWeight` to put on bold styles (undefined for Helvetica-Bold, which is its own face). */
  boldWeight: number | undefined;
  /** True when the family carries Vietnamese glyphs (pdfSafeText keeps diacritics). */
  unicode: boolean;
}

export const HELVETICA: PdfFontSet = { regular: "Helvetica", bold: "Helvetica-Bold", boldWeight: undefined, unicode: false };
export const NOTO_SANS: PdfFontSet = { regular: PDF_UNICODE_FAMILY, bold: PDF_UNICODE_FAMILY, boldWeight: 700, unicode: true };

/** Candidate directories for the bundled TTFs (release cwd first, then the source checkout). */
export function pdfFontDirs(cwd: string = process.cwd()): string[] {
  const dirs = [path.join(cwd, "public", "fonts"), path.join(cwd, "..", "public", "fonts"), "/home/dovanlong/blockid.au/web/public/fonts"];
  const extra = process.env.PDF_FONT_DIR;
  return extra ? [extra, ...dirs] : dirs;
}

export function pdfFontFiles(cwd?: string): { regular: string; bold: string } | null {
  for (const dir of pdfFontDirs(cwd)) {
    const regular = path.join(dir, "NotoSans-Regular.ttf");
    const bold = path.join(dir, "NotoSans-Bold.ttf");
    if (existsSync(regular)) return { regular, bold: existsSync(bold) ? bold : regular };
  }
  return null;
}

let registered: boolean | null = null;

/** Register Noto Sans once. Returns false (and never throws) when the files are not shipped. */
export function registerUnicodePdfFont(): boolean {
  if (registered !== null) return registered;
  const files = pdfFontFiles();
  if (!files) {
    registered = false;
    return false;
  }
  try {
    Font.register({
      family: PDF_UNICODE_FAMILY,
      fonts: [
        { src: files.regular, fontWeight: 400 },
        { src: files.bold, fontWeight: 700 },
      ],
    });
    // Vietnamese words are short; hyphenation only splits diacritic clusters badly.
    Font.registerHyphenationCallback((word) => [word]);
    registered = true;
  } catch (err) {
    console.warn("[pdf/fonts] Noto Sans registration failed:", err instanceof Error ? err.message : String(err));
    registered = false;
  }
  return registered;
}

/** The font set a locale renders with: Noto Sans for "vi" when bundled, Helvetica otherwise. */
export function pdfFontsForLocale(locale: "en" | "vi" | undefined): PdfFontSet {
  if (locale === "vi" && registerUnicodePdfFont()) return NOTO_SANS;
  return HELVETICA;
}

/** Tests: forget the registration state. */
export function __resetPdfFontRegistry(): void {
  registered = null;
}
