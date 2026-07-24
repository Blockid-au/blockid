// Landing-page draft renderer — Phase 4 P1 gap ("landing-page one-click
// publisher — Chapter 4 CTA references it but no `/api/landing-page/publish`
// route"). Spun off as P4a-landing-page-preview.
//
// Chapter 4 (`04-mvp`) promises a `landing-page-draft.md` artefact and a
// live landing page with a GA measurement ID stamped
// (web/src/lib/guide/startup-journey.ts:176, :309, :338). This module ships
// the pure content half — a validator + markdown draft + self-contained HTML
// preview that a founder can either paste into their own Vercel / Netlify /
// Framer host, or that a follow-up `/api/landing-page/publish` route can
// render straight to disk. Storage + subdomain routing are the subsequent
// leg (P4a-publish-route + P4a-publish-storage) — this tick is deliberately
// dependency-free so any surface can import it without a Supabase gate.
//
// Analytics: exactly one of `ga4_measurement_id` (GA4 `G-XXXXXXX...` shape)
// or `plausible_domain` (bare hostname) is stamped into the rendered HTML
// `<head>`. Both is fine — the snippet renders both in stable order (GA4
// first, Plausible second) so a founder can dual-run during a migration.
// Neither is fine — the preview still renders (some founders test copy
// before wiring analytics) with an inline comment marking the gap so the
// CMO agent can catch it in a review pass.
//
// Boundary: renders factual marketing copy the founder supplied. No AFSL
// disclaimer needed because there is no financial-product output. The
// rendered HTML deliberately does NOT include any BlockID branding /
// tracking so a founder can publish it on their own domain without leaking
// our GA4 property.

export const LANDING_PAGE_MAX_HEADLINE_LENGTH = 120;
export const LANDING_PAGE_MAX_SUBHEADLINE_LENGTH = 240;
export const LANDING_PAGE_MAX_BULLET_LENGTH = 160;
export const LANDING_PAGE_MIN_BULLETS = 1;
export const LANDING_PAGE_MAX_BULLETS = 6;

export type LandingPageInvalidReason =
  | "headline_empty"
  | "headline_too_long"
  | "subheadline_empty"
  | "subheadline_too_long"
  | "bullet_missing"
  | "bullet_too_long"
  | "bullet_count_too_low"
  | "bullet_count_too_high"
  | "cta_label_empty"
  | "cta_href_empty"
  | "cta_href_invalid"
  | "ga4_measurement_id_invalid"
  | "plausible_domain_invalid";

export interface LandingPageInput {
  headline: string;
  subheadline: string;
  bullets: string[];
  cta_label: string;
  cta_href: string;
  ga4_measurement_id?: string;
  plausible_domain?: string;
  brand_name?: string;
}

export interface LandingPageValidation {
  valid: boolean;
  reasons: LandingPageInvalidReason[];
}

/**
 * Validate a landing-page draft. Pure — no I/O, no throws.
 *
 * A caller that wants to short-circuit on the first error should read
 * `reasons[0]`; a caller that wants to surface every gap to the founder in
 * one pass should render the whole array.
 */
export function validateLandingPageInput(input: LandingPageInput): LandingPageValidation {
  const reasons: LandingPageInvalidReason[] = [];

  const headline = (input.headline ?? "").trim();
  const subheadline = (input.subheadline ?? "").trim();
  const ctaLabel = (input.cta_label ?? "").trim();
  const ctaHref = (input.cta_href ?? "").trim();
  const bullets = Array.isArray(input.bullets) ? input.bullets : [];

  if (!headline) reasons.push("headline_empty");
  else if (headline.length > LANDING_PAGE_MAX_HEADLINE_LENGTH) reasons.push("headline_too_long");

  if (!subheadline) reasons.push("subheadline_empty");
  else if (subheadline.length > LANDING_PAGE_MAX_SUBHEADLINE_LENGTH) reasons.push("subheadline_too_long");

  const trimmedBullets = bullets.map((b) => (b ?? "").trim()).filter((b) => b.length > 0);
  if (trimmedBullets.length < LANDING_PAGE_MIN_BULLETS) reasons.push("bullet_count_too_low");
  if (trimmedBullets.length > LANDING_PAGE_MAX_BULLETS) reasons.push("bullet_count_too_high");
  if (bullets.some((b) => (b ?? "").trim().length === 0)) reasons.push("bullet_missing");
  if (trimmedBullets.some((b) => b.length > LANDING_PAGE_MAX_BULLET_LENGTH)) reasons.push("bullet_too_long");

  if (!ctaLabel) reasons.push("cta_label_empty");
  if (!ctaHref) reasons.push("cta_href_empty");
  else if (!isSafeCtaHref(ctaHref)) reasons.push("cta_href_invalid");

  if (input.ga4_measurement_id !== undefined && input.ga4_measurement_id !== "" && !isValidGa4Id(input.ga4_measurement_id)) {
    reasons.push("ga4_measurement_id_invalid");
  }
  if (input.plausible_domain !== undefined && input.plausible_domain !== "" && !isValidPlausibleDomain(input.plausible_domain)) {
    reasons.push("plausible_domain_invalid");
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Render the founder-facing markdown draft that lands in `dataroom_files`
 * as `landing-page-draft.md` (per Chapter 4 CTA at
 * `web/src/lib/guide/startup-journey.ts:176`). No HTML escaping — markdown
 * files are trusted-founder-authored and reviewed by CMO agent.
 */
export function renderLandingPageMarkdown(input: LandingPageInput): string {
  const headline = (input.headline ?? "").trim();
  const subheadline = (input.subheadline ?? "").trim();
  const bullets = (input.bullets ?? []).map((b) => (b ?? "").trim()).filter(Boolean);
  const ctaLabel = (input.cta_label ?? "").trim();
  const ctaHref = (input.cta_href ?? "").trim();

  const lines: string[] = [];
  lines.push(`# ${headline || "(headline missing)"}`);
  lines.push("");
  lines.push(subheadline || "_(sub-headline missing)_");
  lines.push("");
  lines.push("## Why founders pick us");
  lines.push("");
  if (bullets.length === 0) {
    lines.push("- _(add at least one benefit bullet)_");
  } else {
    for (const b of bullets) lines.push(`- ${b}`);
  }
  lines.push("");
  lines.push("## Call to action");
  lines.push("");
  if (ctaLabel && ctaHref) {
    lines.push(`[${ctaLabel}](${ctaHref})`);
  } else {
    lines.push("_(CTA label + href required)_");
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("_Draft generated by BlockID.au — Chapter 4 landing-page CTA._");
  return lines.join("\n");
}

/**
 * Render a self-contained HTML preview a founder can paste into any static
 * host (Vercel / Netlify / Framer / GitHub Pages) or view locally. Includes
 * a minimal responsive stylesheet + analytics snippet(s). No JavaScript
 * frameworks — the goal is a single file that renders on any browser and
 * cannot silently break because a CDN went down.
 */
export function renderLandingPageHtml(input: LandingPageInput): string {
  const headline = escapeHtml((input.headline ?? "").trim() || "(headline missing)");
  const subheadline = escapeHtml((input.subheadline ?? "").trim() || "(sub-headline missing)");
  const bullets = (input.bullets ?? [])
    .map((b) => (b ?? "").trim())
    .filter(Boolean)
    .map((b) => `      <li>${escapeHtml(b)}</li>`)
    .join("\n");
  const ctaLabel = escapeHtml((input.cta_label ?? "").trim() || "Get started");
  const ctaHrefRaw = (input.cta_href ?? "").trim();
  const ctaHref = isSafeCtaHref(ctaHrefRaw) ? escapeAttr(ctaHrefRaw) : "#";
  const brand = escapeHtml((input.brand_name ?? "").trim() || headline);

  const analytics = renderAnalyticsSnippet(input.ga4_measurement_id, input.plausible_domain);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${headline}</title>
  <meta name="description" content="${subheadline}" />
${analytics}  <style>
    :root { color-scheme: light dark; --fg: #0f172a; --bg: #ffffff; --accent: #2563eb; --muted: #475569; }
    @media (prefers-color-scheme: dark) {
      :root { --fg: #f8fafc; --bg: #0f172a; --accent: #60a5fa; --muted: #94a3b8; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--fg); background: var(--bg); line-height: 1.6; }
    main { max-width: 720px; margin: 0 auto; padding: 4rem 1.5rem; }
    h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 1rem; letter-spacing: -0.02em; }
    p.subheadline { font-size: clamp(1.1rem, 2.5vw, 1.3rem); color: var(--muted); margin: 0 0 2rem; }
    ul { padding: 0; list-style: none; margin: 0 0 2rem; }
    li { padding: 0.5rem 0 0.5rem 1.75rem; position: relative; }
    li::before { content: "\\2713"; position: absolute; left: 0; color: var(--accent); font-weight: 700; }
    a.cta { display: inline-block; background: var(--accent); color: white; padding: 0.9rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; }
    a.cta:hover { opacity: 0.9; }
    footer { margin-top: 4rem; color: var(--muted); font-size: 0.85rem; }
  </style>
</head>
<body>
  <main>
    <h1>${headline}</h1>
    <p class="subheadline">${subheadline}</p>
    <ul>
${bullets || "      <li>(add at least one benefit bullet)</li>"}
    </ul>
    <a class="cta" href="${ctaHref}">${ctaLabel}</a>
    <footer>&copy; ${new Date().getFullYear()} ${brand}</footer>
  </main>
</body>
</html>
`;
}

function renderAnalyticsSnippet(ga4?: string, plausible?: string): string {
  const parts: string[] = [];
  if (ga4 && isValidGa4Id(ga4)) {
    const id = escapeAttr(ga4.trim());
    parts.push(
      `  <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`,
      `  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');</script>`,
    );
  }
  if (plausible && isValidPlausibleDomain(plausible)) {
    const domain = escapeAttr(plausible.trim());
    parts.push(`  <script defer data-domain="${domain}" src="https://plausible.io/js/script.js"></script>`);
  }
  if (parts.length === 0) {
    parts.push("  <!-- Analytics: no GA4 or Plausible ID supplied — stamp one before publishing. -->");
  }
  return parts.join("\n") + "\n";
}

function isSafeCtaHref(href: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return true;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return href.length > href.indexOf(":") + 1;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidGa4Id(id: string): boolean {
  return /^G-[A-Z0-9]{4,20}$/.test(id.trim());
}

function isValidPlausibleDomain(domain: string): boolean {
  const d = domain.trim();
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d);
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
