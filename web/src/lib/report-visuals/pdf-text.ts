// Glyph safety for the react-pdf twins (G13-W4-R4).
//
// The TBR PDF uses the built-in Helvetica family (no font files to ship in
// the standalone release — see lib/pdf/score-pdf.tsx), which is WinAnsi
// encoded. Symbols the web renderers and agent prose use freely (→ ✓ ▲ Δ ≥
// ≤ ✔ ✗ ─) have no glyph there and would print as blanks or "?", so they
// are mapped to ASCII equivalents before reaching a <Text>. Characters that
// ARE in WinAnsi (… – — • × ° § ©) pass through untouched.

const GLYPH_MAP: ReadonlyArray<[RegExp, string]> = [
  [/→/g, "->"],
  [/←/g, "<-"],
  [/↑/g, "^"],
  [/↓/g, "v"],
  [/✓|✔|☑/g, "OK"],
  [/✗|✘|☒/g, "X"],
  [/▲|△/g, "^"],
  [/▼|▽/g, "v"],
  [/Δ/g, "delta "],
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/≠/g, "!="],
  [/≈/g, "~"],
  [/─|━|═/g, "-"],
  [/│|┃/g, "|"],
  [/[┌┐└┘├┤┬┴┼]/g, "+"],
  [/★|☆/g, "*"],
  [/■|▮|▪|●|◆/g, "*"],
  [/□|▯|◇|○/g, "o"],
  [/⚑|⚐/g, ""],
  [/ /g, " "],
];

export interface PdfSafeTextOptions {
  /**
   * S-R5: the document renders with a Unicode family (Noto Sans, lib/pdf/
   * fonts.ts) — keep Vietnamese / Latin-extended letters and only drop what
   * that subset cannot draw either (emoji, CJK).
   */
  unicode?: boolean;
}

// Noto Sans subset coverage (public/fonts): Latin + Latin Ext + Vietnamese,
// combining marks, general punctuation, currency, a few arrows / shapes.
const UNICODE_KEEP_RE = new RegExp(
  "[^" + "\\u0000-\\u024f" + "\\u0300-\\u036f" + "\\u1e00-\\u1eff" + "\\u2000-\\u206f" + "\\u20a0-\\u20cf" + "\\u2122" + "\\u2190-\\u2199" + "\\u2212" + "\\u2264\\u2265" + "\\u25a0-\\u25ff" + "\\u2713\\u2717" + "]",
  "g",
);

/** Replace glyphs Helvetica cannot draw; idempotent and cheap. */
export function pdfSafeText(value: unknown, opts: PdfSafeTextOptions = {}): string {
  let s = String(value ?? "");
  for (const [re, rep] of GLYPH_MAP) s = s.replace(re, rep);
  if (opts.unicode) return s.replace(UNICODE_KEEP_RE, "");
  // Letters with marks outside Latin-1 (Vietnamese tone marks, ǎ, ő …) keep
  // their base letter: NFD, strip combining marks that WinAnsi cannot carry,
  // then re-compose what Latin-1 does have (é, ü, ñ …).
  if (/[^\u0000-\u00ff]/.test(s)) {
    s = s
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .normalize("NFD")
      .replace(/[̀-ͯ]+/g, (marks) => (/[̧̀́̂̃̈̊]/.test(marks) ? marks.match(/[̧̀́̂̃̈̊]/)![0] : ""))
      .normalize("NFC");
  }
  // Anything still outside WinAnsi (emoji, CJK) is dropped rather than
  // printed as a box.
  return s.replace(/[^\u0000-\u00ffŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/g, "");
}
