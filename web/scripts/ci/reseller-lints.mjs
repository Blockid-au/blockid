#!/usr/bin/env node
// R-01 + R-03 CI enforcement.
//
// R-01 — every /api/reseller/** route that uses getSupabaseAdmin must also
// import scopedReseller (chokepoint) or resellerSupabase (typed wrapper).
// Files may opt out with `// r-01-exempt: <reason>`.
//
// R-03 — every mutation handler (POST/PATCH/PUT/DELETE) in a route file
// listed in web/src/lib/feature-gates.manifest.ts must invoke
// `gateRequireFeature("<key>")` or `requireFeature(..., "<key>")` inside
// its body, with <key> matching the manifest's required_feature. Handlers
// may opt out with `// r-03-exempt: <reason>` immediately above the
// export declaration.
//
// Canonical analyzers: web/src/lib/reseller/reseller-lints.ts (unit-tested).
// The regexes below duplicate those on purpose so this CLI stays plain
// node .mjs — matches web/scripts/audit-secrets.mjs pattern (no tsx, no
// build). Keep the two in lockstep when either changes.
//
// Exit 0 on clean, 1 on any error-severity finding.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WEB_ROOT = resolve(new URL("../..", import.meta.url).pathname);
const REPO_ROOT = resolve(WEB_ROOT, "..");
const RESELLER_SCAN_ROOT = join(WEB_ROOT, "src", "app", "api", "reseller");
const APP_ROOT = join(WEB_ROOT, "src", "app");
const MANIFEST_PATH = join(WEB_ROOT, "src", "lib", "feature-gates.manifest.ts");

// ---- R-01 -----------------------------------------------------------------

const ADMIN_TOKEN = /\bgetSupabaseAdmin\b/;
const SCOPE_IMPORT =
  /from\s+["'](?:@\/lib\/reseller\/scope|(?:\.{1,2}\/)+(?:[^"']*\/)?reseller\/scope)["']/;
const WRAPPER_IMPORT =
  /from\s+["'](?:@\/lib\/reseller\/supabase|(?:\.{1,2}\/)+(?:[^"']*\/)?reseller\/supabase)["']/;
const R01_EXEMPT_PRAGMA = /\/\/\s*r-01-exempt:\s*(.*)$/;

function analyzeR01(file, content) {
  const lines = content.split("\n");
  const adminIdx = lines.findIndex((l) => ADMIN_TOKEN.test(l));
  if (adminIdx === -1) return [];

  if (SCOPE_IMPORT.test(content) || WRAPPER_IMPORT.test(content)) return [];

  const exemptIdx = lines.findIndex((l) => R01_EXEMPT_PRAGMA.test(l));
  if (exemptIdx !== -1) {
    const m = lines[exemptIdx].match(R01_EXEMPT_PRAGMA);
    const reason = (m?.[1] ?? "").trim();
    if (!reason) {
      return [
        {
          rule: "R-01",
          file,
          line: exemptIdx + 1,
          severity: "error",
          message: "R-01: `// r-01-exempt:` pragma requires a non-empty reason.",
        },
      ];
    }
    return [
      {
        rule: "R-01",
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
      rule: "R-01",
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

// ---- R-03 -----------------------------------------------------------------

const MUTATION_METHODS = ["POST", "PATCH", "PUT", "DELETE"];
const R03_EXEMPT_PRAGMA = /\/\/\s*r-03-exempt:\s*(.*)$/;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineOffset(lines, lineIdx) {
  let acc = 0;
  for (let i = 0; i < lineIdx; i++) acc += lines[i].length + 1;
  return acc;
}

function lineFromOffset(content, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

function locateHandlers(content) {
  const lines = content.split("\n");
  const out = new Map();
  for (const method of MUTATION_METHODS) {
    const declRe = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
    const idx = lines.findIndex((l) => declRe.test(l));
    if (idx === -1) continue;
    const flatStart = lineOffset(lines, idx);
    const rest = content.slice(flatStart);
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
    const bodyOpen = rest.indexOf("{", paramClose);
    if (bodyOpen === -1) continue;
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

function analyzeR03(file, content, requiredFeature) {
  const findings = [];
  const lines = content.split("\n");
  const handlers = locateHandlers(content);
  if (handlers.size === 0) return findings;

  const featureQuoted = new RegExp(
    `(?:gateRequireFeature|requireFeature)\\s*\\(\\s*[^)]*?["'\`]${escapeRegex(requiredFeature)}["'\`]`,
  );

  for (const [method, span] of handlers.entries()) {
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
          rule: "R-03",
          file,
          line: pragmaLine + 1,
          severity: "error",
          method,
          message: `R-03: \`// r-03-exempt:\` pragma above ${method} requires a non-empty reason.`,
        });
        continue;
      }
      findings.push({
        rule: "R-03",
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
        rule: "R-03",
        file,
        line: span.declLine,
        severity: "error",
        method,
        message:
          `R-03: ${method} handler must invoke ` +
          `\`gateRequireFeature("${requiredFeature}")\` or ` +
          `\`requireFeature(..., "${requiredFeature}")\` inside its body. ` +
          `Add the gate, or place \`// r-03-exempt: <reason>\` immediately ` +
          `above the handler declaration.`,
      });
    }
  }
  return findings;
}

// ---- Manifest parser ------------------------------------------------------

// Read FEATURE_GATES entries from the manifest source (plain node, no tsx).
// We only need the { route, required_feature } pairs so a regex over the
// literal object entries is enough. If the manifest shape ever changes,
// the vitest suite `feature-gates.manifest.test.ts` catches it first.
function loadManifest() {
  const src = readFileSync(MANIFEST_PATH, "utf8");
  const entries = [];
  const re = /\{\s*route:\s*["']([^"']+)["']\s*,\s*required_feature:\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    entries.push({ route: m[1], required_feature: m[2] });
  }
  return entries;
}

// ---- Walk helpers ---------------------------------------------------------

function walk(root, out) {
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(root, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(abs, out);
    else if (st.isFile() && (name.endsWith(".ts") || name.endsWith(".tsx"))) {
      out.push(abs);
    }
  }
}

// ---- R-01 pass ------------------------------------------------------------

const r01Files = [];
walk(RESELLER_SCAN_ROOT, r01Files);

const errors = [];
const exemptions = [];

for (const abs of r01Files) {
  const rel = relative(REPO_ROOT, abs);
  const content = readFileSync(abs, "utf8");
  for (const f of analyzeR01(rel, content)) {
    if (f.severity === "error") errors.push(f);
    else exemptions.push(f);
  }
}

// ---- R-03 pass ------------------------------------------------------------

const manifest = loadManifest();
let r03Scanned = 0;
for (const entry of manifest) {
  const abs = join(APP_ROOT, entry.route);
  let content;
  try {
    content = readFileSync(abs, "utf8");
  } catch {
    // Missing files are the manifest-completeness test's problem, not ours.
    continue;
  }
  r03Scanned++;
  const rel = relative(REPO_ROOT, abs);
  for (const f of analyzeR03(rel, content, entry.required_feature)) {
    if (f.severity === "error") errors.push(f);
    else exemptions.push(f);
  }
}

// ---- Report ---------------------------------------------------------------

if (exemptions.length > 0) {
  console.log(`Exemptions (${exemptions.length}):`);
  for (const e of exemptions) {
    const tail = e.method ? `  [${e.method}]` : "";
    console.log(`  [${e.rule}] ${e.file}:${e.line}${tail}  ${e.reason}`);
  }
}

if (errors.length > 0) {
  console.error(`\nViolations (${errors.length}):`);
  for (const e of errors) {
    const tail = e.method ? `  [${e.method}]` : "";
    console.error(`  [${e.rule}] ${e.file}:${e.line}${tail}\n    ${e.message}`);
  }
  console.error(
    `\nScanned ${r01Files.length} reseller file(s) for R-01 + ${r03Scanned} manifest route(s) for R-03. Failing.`,
  );
  process.exit(1);
}

console.log(
  `\nOK — R-01 scanned ${r01Files.length} file(s), R-03 scanned ${r03Scanned} manifest route(s); ` +
    `${exemptions.length} exemption(s), 0 violations.`,
);
