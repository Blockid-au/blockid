// Track B B5 follow-up — pure redaction pipeline for /guide/reports download route.
//
// The `web/content/reports/*.md` markdown corpus is BlockID.au's own dogfooding
// log. It is largely operational (KPI checklists, agent daily briefs, review
// verdicts) and does not contain customer data, but sporadic patterns leak in
// via commit messages, config snippets, or route paths quoted verbatim. Before
// we let a public marketing surface serve those files as attachments, we run
// them through this filter so accidental emails / phone numbers / API tokens /
// bearer secrets get masked at the wire.
//
// No I/O — the caller (route handler) supplies file contents and filename; the
// lib returns the redacted string + a normalised attachment filename. Kept
// pure so vitest can cover the mapping without a Next.js request context.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const AU_PHONE_RE = /(?:\+?61[ -]?|0)[2-478](?:[ -]?\d){8}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi;
const GITHUB_TOKEN_RE = /\bgh[pousr]_[A-Za-z0-9]{20,}/g;
const STRIPE_KEY_RE = /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/g;
const OPENAI_KEY_RE = /\bsk-[A-Za-z0-9_-]{24,}/g;
const ANTHROPIC_KEY_RE = /\bsk-ant-[A-Za-z0-9_-]{20,}/g;
const AWS_ACCESS_KEY_RE = /\bAKIA[0-9A-Z]{16}\b/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
// Env-style secret assignments (KEY=value) where the key name looks sensitive.
// Deliberately generous — the goal is over-redact rather than let a live
// credential slip out; a false-positive on `SOME_KEY_NAME=short-config` is
// tolerable on a public marketing surface.
const ENV_SECRET_RE =
  /\b([A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PWD|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*["']?([A-Za-z0-9+/=_.-]{8,})["']?/g;

// Filename shape gate — matches what /guide/reports actually serves and rejects
// path traversal. Server-side callers still must join the basename against the
// content root; this only guards the URL segment.
const FILENAME_RE = /^[a-z0-9][a-z0-9._-]{0,120}\.md$/i;

const REDACTION_BANNER =
  "> _Public showcase copy — sensitive strings (emails, phone numbers, API tokens) redacted at the wire per plan §284 / U.9 §4._\n\n";

/**
 * Returns true iff `filename` is a safe candidate for the /guide/reports
 * download route: markdown-only, no path traversal, no underscore-prefixed
 * templates (those are meant for the daily-report scaffold, not public
 * distribution).
 */
export function isDownloadableReportFilename(filename: string): boolean {
  if (typeof filename !== "string") return false;
  if (filename.length === 0) return false;
  if (filename.includes("/") || filename.includes("\\")) return false;
  if (filename.includes("..")) return false;
  if (filename.startsWith("_")) return false;
  return FILENAME_RE.test(filename);
}

/**
 * Redact a markdown report body ahead of public distribution. Prepends a
 * one-line banner so downstream readers know the file has been filtered.
 * Empty / non-string inputs return the banner + empty body so the caller can
 * always attach a non-zero-byte file.
 */
export function redactReportMarkdown(content: string): string {
  const body = typeof content === "string" ? content : "";
  const filtered = body
    // Order matters: match specific token shapes before the generic env-secret
    // fallback so a Stripe key isn't caught by the ENV_SECRET_RE catch-all.
    .replace(JWT_RE, "[jwt redacted]")
    .replace(GITHUB_TOKEN_RE, "[github-token redacted]")
    .replace(STRIPE_KEY_RE, "[stripe-key redacted]")
    .replace(ANTHROPIC_KEY_RE, "[anthropic-key redacted]")
    .replace(OPENAI_KEY_RE, "[openai-key redacted]")
    .replace(AWS_ACCESS_KEY_RE, "[aws-access-key redacted]")
    .replace(BEARER_RE, "Bearer [token redacted]")
    .replace(ENV_SECRET_RE, (_m, key: string) => `${key}=[secret redacted]`)
    .replace(EMAIL_RE, "[email redacted]")
    .replace(AU_PHONE_RE, "[phone redacted]");
  return REDACTION_BANNER + filtered;
}

/**
 * Normalise a report filename into the value we hand to
 * `Content-Disposition: attachment; filename="..."`. Enforces .md, strips
 * anything that isn't a-z / 0-9 / dash / dot / underscore, clamps to 80 chars
 * so old-school clients don't truncate mid-name.
 */
export function buildDownloadFilename(filename: string): string {
  const cleaned = (filename || "").toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-");
  const trimmed = cleaned.replace(/^-+|-+$/g, "");
  const withExt = trimmed.endsWith(".md") ? trimmed : `${trimmed || "report"}.md`;
  if (withExt.length <= 80) return withExt;
  const head = withExt.slice(0, 76);
  return `${head}.md`.replace(/\.md\.md$/, ".md");
}

export const _internal = {
  EMAIL_RE,
  AU_PHONE_RE,
  BEARER_RE,
  GITHUB_TOKEN_RE,
  STRIPE_KEY_RE,
  ANTHROPIC_KEY_RE,
  OPENAI_KEY_RE,
  AWS_ACCESS_KEY_RE,
  JWT_RE,
  ENV_SECRET_RE,
  FILENAME_RE,
  REDACTION_BANNER,
};
