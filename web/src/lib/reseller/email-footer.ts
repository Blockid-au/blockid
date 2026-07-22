// Reseller co-branding email footer — locale-switched HTML snippet.
//
// Per docs/plans/reseller-module-plan.md § C.3 + § P5 co-branding: welcome
// emails and payment receipts include an "Introduced by {reseller}" line
// when the recipient has an active reseller attribution.
//
// Pure function — no I/O. Callers look up the display_name and pass it in.

export type Locale = "en" | "vi";

// Minimal HTML escape — mirrors escapeHtml() in web/src/lib/email.ts. Kept
// local so the helper has zero coupling to the large email module.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the co-branding footer block, or empty string if `displayName`
 * is null/blank. Safe to concat into any email `<body>`.
 */
export function resellerFooterHtml(
  displayName: string | null | undefined,
  locale: Locale = "en",
): string {
  const clean = (displayName ?? "").trim();
  if (!clean) return "";

  const isVi = locale === "vi";
  const label = isVi
    ? "Được giới thiệu bởi"
    : "Introduced by";

  return [
    `<div style="margin:16px 0 0 0;padding:12px 16px;`,
    `background:#F1F5F9;border-radius:8px;`,
    `font-size:12px;color:#475569;text-align:center;">`,
    `${escapeHtml(label)} `,
    `<strong style="color:#0F172A;">${escapeHtml(clean)}</strong>`,
    `</div>`,
  ].join("");
}

/**
 * Plain-text equivalent for non-HTML mail clients / logs.
 */
export function resellerFooterText(
  displayName: string | null | undefined,
  locale: Locale = "en",
): string {
  const clean = (displayName ?? "").trim();
  if (!clean) return "";
  return locale === "vi"
    ? `\n\nĐược giới thiệu bởi ${clean}.`
    : `\n\nIntroduced by ${clean}.`;
}
