// R-01 static analyzer for /api/reseller/** route files.
//
// Rule (per docs/plans/reseller-module-plan.md § U.15.12 R-01 and § P4.4):
// any file under web/src/app/api/reseller/** that references
// `getSupabaseAdmin` MUST also import one of the reseller-scope helpers —
// either `scopedReseller` (chokepoint at @/lib/reseller/scope) or
// `resellerSupabase` (typed wrapper at @/lib/reseller/supabase). Together
// these are the boundary that prevents an /api/reseller/* handler from
// running an un-scoped service-role query and leaking cross-tenant data.
//
// A file may opt out by placing `// r-01-exempt: <reason>` anywhere in the
// source. The reason is mandatory and surfaces in the CI report — this is
// intended for narrow, reviewed cases (unauthenticated public endpoints,
// per-user reads that don't touch reseller-scoped tables, etc.).

export type R01Severity = "error" | "exempt";

export interface R01Finding {
  file: string;
  line: number;
  severity: R01Severity;
  message: string;
  reason?: string;
}

const ADMIN_TOKEN = /\bgetSupabaseAdmin\b/;
const SCOPE_IMPORT =
  /from\s+["'](?:@\/lib\/reseller\/scope|(?:\.{1,2}\/)+(?:[^"']*\/)?reseller\/scope)["']/;
const WRAPPER_IMPORT =
  /from\s+["'](?:@\/lib\/reseller\/supabase|(?:\.{1,2}\/)+(?:[^"']*\/)?reseller\/supabase)["']/;
const EXEMPT_PRAGMA = /\/\/\s*r-01-exempt:\s*(.*)$/;

export function analyzeR01(file: string, content: string): R01Finding[] {
  const lines = content.split("\n");
  const adminIdx = lines.findIndex((l) => ADMIN_TOKEN.test(l));
  if (adminIdx === -1) return [];

  if (SCOPE_IMPORT.test(content) || WRAPPER_IMPORT.test(content)) return [];

  const exemptIdx = lines.findIndex((l) => EXEMPT_PRAGMA.test(l));
  if (exemptIdx !== -1) {
    const match = lines[exemptIdx].match(EXEMPT_PRAGMA);
    const reason = (match?.[1] ?? "").trim();
    if (!reason) {
      return [
        {
          file,
          line: exemptIdx + 1,
          severity: "error",
          message:
            "R-01: `// r-01-exempt:` pragma requires a non-empty reason.",
        },
      ];
    }
    return [
      {
        file,
        line: exemptIdx + 1,
        severity: "exempt",
        message: "R-01 exemption",
        reason,
      },
    ];
  }

  return [
    {
      file,
      line: adminIdx + 1,
      severity: "error",
      message:
        "R-01: file uses `getSupabaseAdmin` without importing `scopedReseller` " +
        "(@/lib/reseller/scope) or `resellerSupabase` (@/lib/reseller/supabase). " +
        "Wrap the query through the reseller-scope chokepoint, or add " +
        "`// r-01-exempt: <reason>` if this route is intentionally unscoped.",
    },
  ];
}
