// R-10 typed-wrapper enforcement analyzer.
//
// Closes P10_hardening exit criterion "security-audit: RLS + typed wrapper
// enforced end-to-end" (docs/plans/reseller-module-goal.md § P10, plan
// § U.15.13 D3-CISO-01).
//
// R-01 already forces every /api/reseller/** file that touches
// getSupabaseAdmin to import scopedReseller / resellerSupabase — but it does
// not stop a caller from importing the wrapper and then still writing a
// direct `.from("reseller_something").select(...)` without a reseller_id
// filter. R-10 closes that gap by scanning for direct-table access to the
// canonical reseller-scoped tables and requiring each site to carry visible
// scoping (predicate `.eq("reseller_id", …)` OR insert payload with a
// `reseller_id:` key) inside the same statement window.
//
// Files may opt out at the file level with `// r-01-exempt: <reason>` (the
// R-01 file-level pragma already documents public / self-lookup routes such
// as /api/reseller/code/validate and /api/reseller/me — that justification
// carries R-10 too, no separate pragma required). Individual sites may opt
// out with `// r-10-exempt: <reason>` immediately above the `.from(...)`
// call.

export const RESELLER_SCOPED_TABLES = [
  "resellers",
  "reseller_admins",
  "reseller_attributions",
  "reseller_promotion_codes",
  "reseller_credit_grants",
  "reseller_requests",
  "reseller_report_files",
  "reseller_report_runs",
  "reseller_commissions",
  "reseller_events",
  "reseller_audit_log",
] as const;

export type ResellerScopedTable = (typeof RESELLER_SCOPED_TABLES)[number];

export type R10Severity = "error" | "exempt";

export interface R10Finding {
  file: string;
  line: number;
  severity: R10Severity;
  message: string;
  reason?: string;
  table?: string;
}

const R10_EXEMPT_PRAGMA = /\/\/\s*r-10-exempt:\s*(.*)$/;
const R01_FILE_EXEMPT_PRAGMA = /\/\/\s*r-01-exempt:\s*(.*)$/;
const FROM_CALL = /\.from\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*\)/g;
const RESELLER_ID_PREDICATE = /\.eq\(\s*["'`]reseller_id["'`]\s*,/;
const RESELLER_ID_INSERT_KEY = /reseller_id\s*:/;
const RESERVED_STATEMENT_LOOKAHEAD = 30;

function isScopedTable(name: string): name is ResellerScopedTable {
  return (RESELLER_SCOPED_TABLES as readonly string[]).includes(name);
}

function lineFromOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

/**
 * Scan a source file for `.from("<scoped-table>")` sites. Returns an
 * inventory of every occurrence — used by the audit and by tests that lock
 * in expected sites.
 */
export function scanResellerTableAccess(
  file: string,
  content: string,
): Array<{ file: string; line: number; table: ResellerScopedTable }> {
  const out: Array<{ file: string; line: number; table: ResellerScopedTable }> = [];
  let m: RegExpExecArray | null;
  FROM_CALL.lastIndex = 0;
  while ((m = FROM_CALL.exec(content)) !== null) {
    const table = m[1];
    if (!isScopedTable(table)) continue;
    out.push({
      file,
      line: lineFromOffset(content, m.index),
      table,
    });
  }
  return out;
}

/**
 * Analyze a source file against R-10.
 *
 * Rule:
 *   For every `.from("<scoped-table>")` inside a /api/reseller/** file, the
 *   same statement window (~30 lines forward) MUST contain either:
 *     - `.eq("reseller_id", …)`  — scoped SELECT / UPDATE / DELETE, OR
 *     - a `reseller_id:` key inside an insert payload
 *   OR the file must carry a file-level `// r-01-exempt: <reason>` pragma
 *   (documenting the public / self-lookup posture), OR the specific site
 *   must be opted out with `// r-10-exempt: <reason>` on one of the ~3
 *   lines above the `.from(...)` call.
 */
export function analyzeR10(file: string, content: string): R10Finding[] {
  const findings: R10Finding[] = [];
  const lines = content.split("\n");
  const sites = scanResellerTableAccess(file, content);
  if (sites.length === 0) return findings;

  const fileExemptIdx = lines.findIndex((l) => R01_FILE_EXEMPT_PRAGMA.test(l));
  const fileExempt = fileExemptIdx !== -1
    ? (lines[fileExemptIdx].match(R01_FILE_EXEMPT_PRAGMA)?.[1] ?? "").trim()
    : null;

  for (const site of sites) {
    // Look for a per-site r-10-exempt pragma on any of the ~3 lines above
    // the .from(...) call. The site line is 1-indexed.
    let siteExempt: string | null = null;
    for (let back = 1; back <= 3; back++) {
      const idx = site.line - 1 - back;
      if (idx < 0) break;
      const pm = lines[idx].match(R10_EXEMPT_PRAGMA);
      if (pm) {
        siteExempt = (pm[1] ?? "").trim();
        break;
      }
    }

    if (siteExempt !== null) {
      if (siteExempt === "") {
        findings.push({
          file: site.file,
          line: site.line,
          severity: "error",
          table: site.table,
          message:
            "R-10: `// r-10-exempt:` pragma above `.from(...)` requires a non-empty reason.",
        });
        continue;
      }
      findings.push({
        file: site.file,
        line: site.line,
        severity: "exempt",
        table: site.table,
        message: `R-10 exemption on \`.from("${site.table}")\``,
        reason: siteExempt,
      });
      continue;
    }

    if (fileExempt !== null) {
      if (fileExempt === "") {
        findings.push({
          file: site.file,
          line: site.line,
          severity: "error",
          table: site.table,
          message:
            "R-10: file carries `// r-01-exempt:` pragma with an empty reason — R-10 inherits R-01's file-level exemption but the reason must be non-empty.",
        });
        continue;
      }
      findings.push({
        file: site.file,
        line: site.line,
        severity: "exempt",
        table: site.table,
        message: `R-10 exemption (via file-level r-01-exempt) on \`.from("${site.table}")\``,
        reason: fileExempt,
      });
      continue;
    }

    // Statement window = the ~30 lines forward from the .from(...) call.
    const windowStart = site.line - 1;
    const windowEnd = Math.min(lines.length, windowStart + RESERVED_STATEMENT_LOOKAHEAD);
    const window = lines.slice(windowStart, windowEnd).join("\n");

    const hasEqPredicate = RESELLER_ID_PREDICATE.test(window);
    const hasInsertKey = RESELLER_ID_INSERT_KEY.test(window);

    if (hasEqPredicate || hasInsertKey) continue;

    findings.push({
      file: site.file,
      line: site.line,
      severity: "error",
      table: site.table,
      message:
        `R-10: direct \`.from("${site.table}")\` access without visible reseller_id scoping. ` +
        `Add \`.eq("reseller_id", scope.reseller_id)\` to the query chain, ` +
        `include a \`reseller_id:\` key in the insert payload, prefer the ` +
        `\`resellerSupabase()\` typed wrapper, or place ` +
        `\`// r-10-exempt: <reason>\` immediately above the \`.from(...)\` call ` +
        `if this site is intentionally unscoped.`,
    });
  }

  return findings;
}
