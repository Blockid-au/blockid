// R-01 + R-03 static analyzers.
//
// R-01 (per docs/plans/reseller-module-plan.md § U.15.12 R-01 and § P4.4):
// any file under web/src/app/api/reseller/** that references
// `getSupabaseAdmin` MUST also import one of the reseller-scope helpers —
// either `scopedReseller` (chokepoint at @/lib/reseller/scope) or
// `resellerSupabase` (typed wrapper at @/lib/reseller/supabase). A file may
// opt out by placing `// r-01-exempt: <reason>` anywhere in the source.
//
// R-03 (per § U.15.12 R-03 and § P8.2): every exported mutation handler
// (POST / PATCH / PUT / DELETE) inside a file listed in
// feature-gates.manifest MUST invoke `gateRequireFeature(...)` or
// `requireFeature(...)` inside its body, referencing the manifest's
// required_feature key. Files may opt out per-handler with
// `// r-03-exempt: <reason>` immediately above the handler declaration.

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
const R01_EXEMPT_PRAGMA = /\/\/\s*r-01-exempt:\s*(.*)$/;

export function analyzeR01(file: string, content: string): R01Finding[] {
  const lines = content.split("\n");
  const adminIdx = lines.findIndex((l) => ADMIN_TOKEN.test(l));
  if (adminIdx === -1) return [];

  if (SCOPE_IMPORT.test(content) || WRAPPER_IMPORT.test(content)) return [];

  const exemptIdx = lines.findIndex((l) => R01_EXEMPT_PRAGMA.test(l));
  if (exemptIdx !== -1) {
    const match = lines[exemptIdx].match(R01_EXEMPT_PRAGMA);
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

// ---------------------------------------------------------------------------
// R-03 — every mutation handler in a manifest route must call
// gateRequireFeature / requireFeature with the manifest's required_feature.
// ---------------------------------------------------------------------------

export type R03Severity = "error" | "exempt";

export interface R03Finding {
  file: string;
  line: number;
  severity: R03Severity;
  message: string;
  reason?: string;
  method?: string;
}

const MUTATION_METHODS = ["POST", "PATCH", "PUT", "DELETE"] as const;
const R03_EXEMPT_PRAGMA = /\/\/\s*r-03-exempt:\s*(.*)$/;

/**
 * Locate the body of an exported mutation handler in a file. Returns a
 * mapping of method → { declLine, bodyStart, bodyEnd } (line numbers are
 * 1-indexed and inclusive). Uses brace-matching on the body — we only need
 * to be robust against balanced braces inside strings/comments; the
 * pathological cases would fail tsc first.
 */
function locateHandlers(
  content: string,
): Map<string, { declLine: number; bodyStart: number; bodyEnd: number }> {
  const lines = content.split("\n");
  const out = new Map<
    string,
    { declLine: number; bodyStart: number; bodyEnd: number }
  >();
  for (const method of MUTATION_METHODS) {
    const declRe = new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${method}\\b`,
    );
    const idx = lines.findIndex((l) => declRe.test(l));
    if (idx === -1) continue;

    // Walk the source char-by-char starting at the declaration line to find
    // (a) the closing `)` of the parameter list, then (b) the opening `{` of
    // the function body, then (c) its matching `}`. Multi-line signatures
    // with destructured params (e.g. `{ params }: { ... }`) confuse a naive
    // "first `{` after decl" scan, so track paren depth first.
    const flatStart = lineOffset(lines, idx);
    const rest = content.slice(flatStart);
    // Find the first `(` (function param list start).
    const paramOpen = rest.indexOf("(");
    if (paramOpen === -1) continue;
    let pos = paramOpen;
    let parenDepth = 0;
    let paramClose = -1;
    for (; pos < rest.length; pos++) {
      const ch = rest[pos];
      if (ch === "(") parenDepth++;
      else if (ch === ")") {
        parenDepth--;
        if (parenDepth === 0) {
          paramClose = pos;
          break;
        }
      }
    }
    if (paramClose === -1) continue;
    // Now find the next `{` — that's the body opener.
    const bodyOpen = rest.indexOf("{", paramClose);
    if (bodyOpen === -1) continue;
    // Balance braces from there.
    let braceDepth = 0;
    let bodyClose = -1;
    for (pos = bodyOpen; pos < rest.length; pos++) {
      const ch = rest[pos];
      if (ch === "{") braceDepth++;
      else if (ch === "}") {
        braceDepth--;
        if (braceDepth === 0) {
          bodyClose = pos;
          break;
        }
      }
    }
    if (bodyClose === -1) bodyClose = rest.length - 1;
    const bodyStartLine = lineFromOffset(content, flatStart + bodyOpen);
    const bodyEndLine = lineFromOffset(content, flatStart + bodyClose);
    out.set(method, {
      declLine: idx + 1,
      bodyStart: bodyStartLine,
      bodyEnd: bodyEndLine,
    });
  }
  return out;
}

function lineOffset(lines: string[], lineIdx: number): number {
  let acc = 0;
  for (let i = 0; i < lineIdx; i++) acc += lines[i].length + 1; // +1 for \n
  return acc;
}

function lineFromOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

/**
 * Analyze a manifest route file against R-03.
 *
 * @param file           relative path (for reporting only)
 * @param content        file contents
 * @param requiredFeature the manifest-required feature key for this route
 */
export function analyzeR03(
  file: string,
  content: string,
  requiredFeature: string,
): R03Finding[] {
  const findings: R03Finding[] = [];
  const lines = content.split("\n");
  const handlers = locateHandlers(content);

  if (handlers.size === 0) {
    // No mutation handler in this file — nothing to enforce (the manifest
    // completeness test independently ensures every mutation handler is
    // registered, so any drift here would surface there first).
    return findings;
  }

  const featureQuoted = new RegExp(
    `(?:gateRequireFeature|requireFeature)\\s*\\(\\s*[^)]*?["'\`]${escapeRegex(requiredFeature)}["'\`]`,
  );

  for (const [method, span] of handlers.entries()) {
    // r-03-exempt pragma may live on the declaration line itself or one line above
    const pragmaLine =
      lines[span.declLine - 2] && R03_EXEMPT_PRAGMA.test(lines[span.declLine - 2])
        ? span.declLine - 2
        : R03_EXEMPT_PRAGMA.test(lines[span.declLine - 1])
          ? span.declLine - 1
          : -1;
    if (pragmaLine !== -1) {
      const m = lines[pragmaLine].match(R03_EXEMPT_PRAGMA);
      const reason = (m?.[1] ?? "").trim();
      if (!reason) {
        findings.push({
          file,
          line: pragmaLine + 1,
          severity: "error",
          method,
          message: `R-03: \`// r-03-exempt:\` pragma above ${method} requires a non-empty reason.`,
        });
        continue;
      }
      findings.push({
        file,
        line: pragmaLine + 1,
        severity: "exempt",
        method,
        message: `R-03 exemption on ${method}`,
        reason,
      });
      continue;
    }

    const body = lines.slice(span.bodyStart - 1, span.bodyEnd).join("\n");
    if (!featureQuoted.test(body)) {
      findings.push({
        file,
        line: span.declLine,
        severity: "error",
        method,
        message:
          `R-03: ${method} handler must invoke ` +
          `\`gateRequireFeature("${requiredFeature}")\` or ` +
          `\`requireFeature(..., "${requiredFeature}")\` before the first ` +
          `await outside conditionals. Add the gate, or place ` +
          `\`// r-03-exempt: <reason>\` immediately above the handler.`,
      });
    }
  }

  return findings;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
