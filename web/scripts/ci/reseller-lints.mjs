#!/usr/bin/env node
// R-01 CI enforcement — every /api/reseller/** route that uses
// getSupabaseAdmin must also import scopedReseller (chokepoint) or
// resellerSupabase (typed wrapper). Files may opt out with
// `// r-01-exempt: <reason>`.
//
// Canonical analyzer: web/src/lib/reseller/reseller-lints.ts (unit-tested).
// The regexes below are duplicated on purpose so this CLI stays a plain
// node .mjs — matches web/scripts/audit-secrets.mjs pattern (no tsx, no
// build). Keep the two in lockstep when either changes.
//
// Exit 0 on clean, 1 on any error-severity finding.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WEB_ROOT = resolve(new URL("../..", import.meta.url).pathname);
const REPO_ROOT = resolve(WEB_ROOT, "..");
const SCAN_ROOT = join(WEB_ROOT, "src", "app", "api", "reseller");

const ADMIN_TOKEN = /\bgetSupabaseAdmin\b/;
const SCOPE_IMPORT =
  /from\s+["'](?:@\/lib\/reseller\/scope|(?:\.{1,2}\/)+(?:[^"']*\/)?reseller\/scope)["']/;
const WRAPPER_IMPORT =
  /from\s+["'](?:@\/lib\/reseller\/supabase|(?:\.{1,2}\/)+(?:[^"']*\/)?reseller\/supabase)["']/;
const EXEMPT_PRAGMA = /\/\/\s*r-01-exempt:\s*(.*)$/;

function analyze(file, content) {
  const lines = content.split("\n");
  const adminIdx = lines.findIndex((l) => ADMIN_TOKEN.test(l));
  if (adminIdx === -1) return [];

  if (SCOPE_IMPORT.test(content) || WRAPPER_IMPORT.test(content)) return [];

  const exemptIdx = lines.findIndex((l) => EXEMPT_PRAGMA.test(l));
  if (exemptIdx !== -1) {
    const m = lines[exemptIdx].match(EXEMPT_PRAGMA);
    const reason = (m?.[1] ?? "").trim();
    if (!reason) {
      return [
        {
          file,
          line: exemptIdx + 1,
          severity: "error",
          message: "R-01: `// r-01-exempt:` pragma requires a non-empty reason.",
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

const files = [];
walk(SCAN_ROOT, files);

const errors = [];
const exemptions = [];

for (const abs of files) {
  const rel = relative(REPO_ROOT, abs);
  const content = readFileSync(abs, "utf8");
  for (const f of analyze(rel, content)) {
    if (f.severity === "error") errors.push(f);
    else exemptions.push(f);
  }
}

if (exemptions.length > 0) {
  console.log(`R-01 exemptions (${exemptions.length}):`);
  for (const e of exemptions) {
    console.log(`  ${e.file}:${e.line}  ${e.reason}`);
  }
}

if (errors.length > 0) {
  console.error(`\nR-01 violations (${errors.length}):`);
  for (const e of errors) {
    console.error(`  ${e.file}:${e.line}\n    ${e.message}`);
  }
  console.error(
    `\nScanned ${files.length} file(s) under web/src/app/api/reseller/. Failing.`,
  );
  process.exit(1);
}

console.log(
  `\nR-01 OK — scanned ${files.length} file(s) under web/src/app/api/reseller/; ` +
    `${exemptions.length} exemption(s), 0 violations.`,
);
