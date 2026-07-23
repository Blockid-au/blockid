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

// ---------------------------------------------------------------------------
// R-04 — no raw UUID references inside Stripe `metadata:` object literals.
//
// Per docs/plans/plan-delta-2026-07-23.md § D.3 D3-CISO-07: user / reseller
// UUIDs written to Stripe metadata must be hashed via `hashUserId()` before
// leaving our process so a metadata dump can't be joined against app_users
// directly. The rule fires on any `<key>_id: <var>.id` (or `<key>_id: <var>.<..>_id`)
// entry inside a `metadata: { ... }` object literal in files under
// `web/src/app/api/stripe/**`, UNLESS:
//   - the same block contains a peer `<something>_hash:` key (transition
//     window — raw + hash together is acceptable), OR
//   - the value is wrapped in `hashUserId(...)` on the same line, OR
//   - the block is opted out with `// r-04-exempt: <reason>` directly
//     above the `metadata: {` opener.
// ---------------------------------------------------------------------------

export type R04Severity = "error" | "exempt";

export interface R04Finding {
  file: string;
  line: number;
  severity: R04Severity;
  message: string;
  reason?: string;
}

const R04_EXEMPT_PRAGMA = /\/\/\s*r-04-exempt:\s*(.*)$/;
const STRIPE_ROUTE_PATH = /(^|\/)app\/api\/stripe\//;
// Matches `<some_id_or_something>: <ident>.id` or `.<..>_id` — raw UUID refs.
// Excludes matches where the whole value is wrapped in hashUserId(...).
const RAW_UUID_ENTRY =
  /(\b\w*(?:user|reseller|subject|paying|blockid)\w*_id)\s*:\s*([^,\n}]+)/i;

/**
 * Locate every `metadata: {` … `}` object literal in a source file. Uses
 * brace-matching so nested objects don't confuse the scanner. Returns
 * (openLine, closeLine, opener-preceding line) triples, 1-indexed.
 */
function locateMetadataBlocks(
  content: string,
): Array<{ openLine: number; closeLine: number; openOffset: number; closeOffset: number }> {
  const out: Array<{
    openLine: number;
    closeLine: number;
    openOffset: number;
    closeOffset: number;
  }> = [];
  // Matches both object-property syntax (`metadata: {`) and assignment syntax
  // (`sessionParams.metadata = {`) so R-04 covers every stripe metadata write.
  const re = /\bmetadata\s*[:=]\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const openOffset = m.index + m[0].length - 1; // position of `{`
    let depth = 0;
    let closeOffset = -1;
    for (let i = openOffset; i < content.length; i++) {
      const ch = content[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          closeOffset = i;
          break;
        }
      }
    }
    if (closeOffset === -1) continue;
    out.push({
      openLine: lineFromOffset(content, openOffset),
      closeLine: lineFromOffset(content, closeOffset),
      openOffset,
      closeOffset,
    });
  }
  return out;
}

export function analyzeR04(file: string, content: string): R04Finding[] {
  if (!STRIPE_ROUTE_PATH.test(file)) return [];

  const findings: R04Finding[] = [];
  const lines = content.split("\n");
  const blocks = locateMetadataBlocks(content);

  for (const block of blocks) {
    const bodyText = content.slice(block.openOffset + 1, block.closeOffset);

    // Find raw UUID entries inside the block body.
    const offenders: Array<{ line: number; snippet: string }> = [];
    let searchFrom = 0;
    while (searchFrom < bodyText.length) {
      const sub = bodyText.slice(searchFrom);
      const match = RAW_UUID_ENTRY.exec(sub);
      if (!match) break;
      const value = match[2].trim();
      // Skip if wrapped with hashUserId(...) or if the key already ends in _hash.
      const isHashed = /\bhashUserId\s*\(/.test(value);
      const isHashKey = /_hash\b/.test(match[1]);
      // Only flag entries whose value references a `.id` (or `_id` prop) —
      // pure string literals, numbers, and non-UUID values are unrelated.
      const isRawIdRef = /\.\s*(id|[a-zA-Z_]*_id)\b/.test(value);
      if (isRawIdRef && !isHashed && !isHashKey) {
        const absOffset = block.openOffset + 1 + searchFrom + match.index;
        offenders.push({
          line: lineFromOffset(content, absOffset),
          snippet: `${match[1]}: ${value.split(/\s*,/)[0].slice(0, 60)}`,
        });
      }
      searchFrom += match.index + match[0].length;
    }

    if (offenders.length === 0) continue;

    // Check for a peer `_hash:` key anywhere in the block — accepts the
    // transition pattern where raw + hash are written side-by-side.
    const hasPeerHash = /\b\w*(?:user|reseller|subject|paying|blockid)\w*_hash\s*:/i.test(
      bodyText,
    );

    // Check for r-04-exempt pragma on any of the ~3 lines above the opener.
    let exemptReason: string | null = null;
    for (let back = 1; back <= 3; back++) {
      const idx = block.openLine - 1 - back;
      if (idx < 0) break;
      const pm = lines[idx].match(R04_EXEMPT_PRAGMA);
      if (pm) {
        exemptReason = (pm[1] ?? "").trim();
        break;
      }
    }

    if (exemptReason !== null) {
      if (exemptReason === "") {
        findings.push({
          file,
          line: block.openLine,
          severity: "error",
          message:
            "R-04: `// r-04-exempt:` pragma above `metadata:` requires a non-empty reason.",
        });
      } else {
        findings.push({
          file,
          line: block.openLine,
          severity: "exempt",
          message: "R-04 exemption",
          reason: exemptReason,
        });
      }
      continue;
    }

    if (hasPeerHash) continue; // transition-compatible: raw + hash together

    for (const off of offenders) {
      findings.push({
        file,
        line: off.line,
        severity: "error",
        message:
          `R-04: raw UUID reference \`${off.snippet}\` written into Stripe ` +
          `\`metadata:\` — wrap the value with \`hashUserId(...)\` from ` +
          `\`@/lib/reseller/hash\`, add a peer \`_hash\` key next to the raw ` +
          `field, or place \`// r-04-exempt: <reason>\` immediately above ` +
          `the \`metadata: {\` opener. Per D3-CISO-07 (plan-delta 2026-07-23).`,
      });
    }
  }

  return findings;
}
