/**
 * G26 lane R — the ONE colour constant for every DOCX export.
 *
 * `docx` takes hex WITHOUT the leading `#`, so every value here is the
 * `lib/pdf/theme.ts` value with the hash stripped — same light paper, navy
 * headings, ink body, sunken table header rows as the PDF twin and the web
 * report. Never write a literal hex in a DOCX builder; add a key here.
 */
import { PDF_THEME } from "@/lib/pdf/theme";

/** `#rrggbb` → `rrggbb` (docx colour syntax). */
export function docxHex(hex: string): string {
  return hex.replace(/^#/, "").toUpperCase();
}

export const DOCX_THEME = {
  paper: docxHex(PDF_THEME.paper),
  sunken: docxHex(PDF_THEME.sunken),
  hover: docxHex(PDF_THEME.hover),
  border: docxHex(PDF_THEME.border),
  ink: docxHex(PDF_THEME.ink),
  inkMuted: docxHex(PDF_THEME.inkMuted),
  inkSubtle: docxHex(PDF_THEME.inkSubtle),
  inkTertiary: docxHex(PDF_THEME.inkTertiary),
  inkFaint: docxHex(PDF_THEME.inkFaint),
  navy: docxHex(PDF_THEME.navy),
  navySoft: docxHex(PDF_THEME.navySoft),
  cyan: docxHex(PDF_THEME.cyan),
  action: docxHex(PDF_THEME.action),
  success: docxHex(PDF_THEME.success),
  warn: docxHex(PDF_THEME.warn),
  danger: docxHex(PDF_THEME.danger),
} as const;
