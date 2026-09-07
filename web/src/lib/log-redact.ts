/**
 * PII redaction helper — CISO P1 (2026-08-23 audit).
 *
 * `redactPii()` walks a value and returns a structurally identical copy with
 * every string that looks like an email or an 8+-digit run (ABN / phone /
 * long numeric identifier) replaced by an opaque placeholder. Used by cron
 * logs whose lines were previously interpolating raw `user.email` into
 * plaintext console output.
 *
 * The regex intentionally errs on the side of over-redacting: we would
 * rather lose one debug line than leak one PII token to disk. No external
 * dependencies — this file is imported by cron routes that must be safe to
 * run during a Redis / Supabase outage.
 */

const EMAIL_RE = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
// 8+ consecutive digits, optionally with spaces (matches "79 659 615 111"
// and "796596151110") — captures ABNs, ACNs, and long numeric ids without
// touching short numbers like years / status codes.
const ABN_RE = /\b(?:\d[\s-]?){8,}\d?\b/g;

function redactString(s: string): string {
  return s.replace(EMAIL_RE, "<redacted-email>").replace(ABN_RE, "<redacted-abn>");
}

export function redactPii(input: unknown): unknown {
  if (input == null) return input;
  if (typeof input === "string") return redactString(input);
  if (typeof input === "number" || typeof input === "boolean" || typeof input === "bigint") {
    return input;
  }
  if (Array.isArray(input)) return input.map(redactPii);
  if (input instanceof Error) {
    return { name: input.name, message: redactString(input.message) };
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = redactPii(v);
    }
    return out;
  }
  return input;
}

/** Convenience: redact a single string. */
export function redactString_(s: string): string {
  return redactString(s);
}
