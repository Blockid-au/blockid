// R-08 (per docs/plans/reseller-module-plan.md § U.15.12 R-08):
// gitleaks-style secret scanner over docs/plans/** and docs/plans/reviews/**.
// gitleaks is not installed on the host — this is the in-repo pure-node
// replacement, gated as a pre-commit hook so plan / review markdown never
// carries a live credential across a commit boundary.
//
// Patterns mirror web/scripts/audit-secrets.mjs so the docs scanner uses the
// same detection surface as the source scanner. The CLI walker at
// web/scripts/ci/docs-plans-secrets.mjs duplicates these regexes on purpose
// so it stays plain-node — matches the reseller-lints.ts / reseller-lints.mjs
// dual-file convention already established for R-01/R-03/R-04.

export type SecretSeverity = "error" | "exempt";

export interface SecretPattern {
  name: string;
  re: RegExp;
}

export interface SecretFinding {
  file: string;
  line: number;
  severity: SecretSeverity;
  pattern: string;
  masked: string;
  reason?: string;
}

// Kept in lockstep with web/scripts/audit-secrets.mjs PATTERNS. Only add new
// entries after a real incident or a new dependency starts issuing tokens.
export const PATTERNS: readonly SecretPattern[] = [
  { name: "stripe-live", re: /sk_live_[A-Za-z0-9]{16,}/g },
  { name: "stripe-test", re: /sk_test_[A-Za-z0-9]{16,}/g },
  { name: "slack-bot", re: /xoxb-[A-Za-z0-9-]{10,}/g },
  { name: "slack-user", re: /xoxp-[A-Za-z0-9-]{10,}/g },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/g },
  { name: "pem-block", re: /-----BEGIN [A-Z ]+-----/g },
  { name: "google-api-key", re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "openai-key-raw", re: /sk-[A-Za-z0-9]{20,}/g },
  { name: "github-pat-classic", re: /ghp_[A-Za-z0-9]{36}/g },
  { name: "github-pat-fine", re: /github_pat_[A-Za-z0-9_]{80,}/g },
  { name: "gitlab-pat", re: /glpat-[A-Za-z0-9\-_]{20,}/g },
];

const IGNORE_MARK = "gitleaks:ignore";

/** Mask a matched secret to `first-8-chars****redacted****`. */
export function maskMatch(match: string): string {
  return `${match.slice(0, 8)}****redacted****`;
}

/**
 * Scan a single text blob (already read from disk) for secrets. Pure —
 * takes the file path only so the returned findings can carry it back to
 * the caller. Lines containing the literal `gitleaks:ignore` are dropped.
 */
export function scanContent(file: string, content: string): SecretFinding[] {
  if (content.length > 2_000_000) return [];
  const lines = content.split("\n");
  const hits: SecretFinding[] = [];

  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const line = content.slice(0, m.index).split("\n").length;
      hits.push({
        file,
        line,
        severity: "error",
        pattern: name,
        masked: maskMatch(m[0]),
      });
    }
  }

  return hits.filter((h) => {
    const src = lines[h.line - 1] ?? "";
    if (!src.includes(IGNORE_MARK)) return true;
    (h as { severity: SecretSeverity }).severity = "exempt";
    (h as { reason?: string }).reason = "gitleaks:ignore";
    return false;
  });
}

/** Filter a set of candidate paths down to those the scanner should visit. */
export function isScannablePath(relPath: string): boolean {
  if (!relPath.startsWith("docs/plans/")) return false;
  // Only markdown-ish text; binary attachments in docs would only add noise.
  return /\.(md|markdown|txt|json|yml|yaml)$/i.test(relPath);
}
