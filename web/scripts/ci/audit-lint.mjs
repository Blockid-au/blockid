#!/usr/bin/env node
// Iteration-16 DX #2 — audit-log manifest lint.
//
// Prevents the "route ships, audit forgotten" drift class by mirroring the
// CISO feature-gates lint (web/scripts/ci/reseller-lints.mjs, R-03):
//
//   1. Walk every `web/src/app/api/**/route.ts`.
//   2. For each POST / PATCH / PUT / DELETE handler in that file, require
//      ONE of:
//        (a) the file imports `logUserAction` from `@/lib/audit/log`,
//        (b) the file carries a top-of-file `// audit-exempt: <reason>`
//            pragma,
//        (c) the file's route is not listed in AUDIT_REQUIRED_ROUTES (i.e.
//            no mutation there is currently expected to audit — this is the
//            opt-in-only default so routes that never touched audit stay
//            green until they're explicitly promoted into the manifest).
//   3. Any manifest row pointing at a file that fails (a) AND (b) exits 1.
//
// Exit 0 on clean, 1 on any error-severity finding.
//
// Canonical manifest: web/src/lib/audit/manifest.ts (unit-tested by
// manifest.test.ts). This CLI reads the manifest source via regex — no tsx,
// matches the reseller-lints.mjs pattern.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WEB_ROOT = resolve(new URL("../..", import.meta.url).pathname);
const REPO_ROOT = resolve(WEB_ROOT, "..");
const APP_ROOT = join(WEB_ROOT, "src", "app");
const API_ROOT = join(APP_ROOT, "api");
const MANIFEST_PATH = join(WEB_ROOT, "src", "lib", "audit", "manifest.ts");

const MUTATION_METHODS = ["POST", "PATCH", "PUT", "DELETE"];
const AUDIT_IMPORT_RE =
  /import\s*\{[^}]*\blogUserAction\b[^}]*\}\s*from\s*["']@\/lib\/audit\/log["']/;
const AUDIT_EXEMPT_PRAGMA = /\/\/\s*audit-exempt:\s*(.*)$/;

// ---- Manifest parser ------------------------------------------------------

function loadRequiredRoutes() {
  const src = readFileSync(MANIFEST_PATH, "utf8");
  const routes = new Set();
  const re = /route:\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) routes.add(m[1]);
  return routes;
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
    else if (st.isFile() && name === "route.ts") out.push(abs);
  }
}

function methodsInFile(src) {
  const found = new Set();
  for (const verb of MUTATION_METHODS) {
    const re = new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`);
    if (re.test(src)) found.add(verb);
  }
  return found;
}

function firstExemptPragma(src) {
  // Only recognise pragma in the first 20 lines (top-of-file convention).
  const lines = src.split("\n").slice(0, 20);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(AUDIT_EXEMPT_PRAGMA);
    if (m) return { line: i + 1, reason: (m[1] ?? "").trim() };
  }
  return null;
}

// ---- Pass -----------------------------------------------------------------

const required = loadRequiredRoutes();
const files = [];
walk(API_ROOT, files);

const errors = [];
const exemptions = [];
let scannedRequired = 0;
let scannedTotal = 0;

for (const abs of files) {
  const relFromApp = relative(APP_ROOT, abs).replace(/\\/g, "/");
  const relFromRepo = relative(REPO_ROOT, abs);
  scannedTotal++;

  if (!required.has(relFromApp)) continue;
  scannedRequired++;

  const src = readFileSync(abs, "utf8");
  const methods = methodsInFile(src);
  if (methods.size === 0) {
    // Manifest lists this route but it currently has no mutation handler.
    // That's a manifest-completeness issue; the vitest suite catches it.
    continue;
  }

  if (AUDIT_IMPORT_RE.test(src)) continue;

  const pragma = firstExemptPragma(src);
  if (pragma) {
    if (!pragma.reason) {
      errors.push({
        file: relFromRepo,
        line: pragma.line,
        message:
          "audit-lint: `// audit-exempt:` pragma requires a non-empty reason.",
      });
      continue;
    }
    exemptions.push({
      file: relFromRepo,
      line: pragma.line,
      reason: pragma.reason,
    });
    continue;
  }

  errors.push({
    file: relFromRepo,
    line: 1,
    message:
      `audit-lint: route is listed in AUDIT_REQUIRED_ROUTES with ` +
      `mutation handler(s) [${[...methods].join(", ")}] but does not import ` +
      `\`logUserAction\` from \`@/lib/audit/log\`. Wire the audit call ` +
      `after the mutation succeeds, or add \`// audit-exempt: <reason>\` ` +
      `at the top of the file if this route is intentionally silent.`,
  });
}

// Also flag any manifest row whose route file no longer exists — that's
// the mirror of feature-gates' "phantom rows" guard.
const missing = [];
for (const route of required) {
  const abs = join(APP_ROOT, route);
  try {
    if (!statSync(abs).isFile()) missing.push(route);
  } catch {
    missing.push(route);
  }
}
for (const route of missing) {
  errors.push({
    file: `web/src/app/${route}`,
    line: 0,
    message:
      `audit-lint: manifest lists \`${route}\` but the route file is ` +
      `missing. Remove the manifest row or restore the file.`,
  });
}

// ---- Report ---------------------------------------------------------------

if (exemptions.length > 0) {
  console.log(`Exemptions (${exemptions.length}):`);
  for (const e of exemptions) {
    console.log(`  [audit-lint] ${e.file}:${e.line}  ${e.reason}`);
  }
}

if (errors.length > 0) {
  console.error(`\nViolations (${errors.length}):`);
  for (const e of errors) {
    console.error(`  [audit-lint] ${e.file}:${e.line}\n    ${e.message}`);
  }
  console.error(
    `\nScanned ${scannedTotal} route.ts file(s); ${scannedRequired} in ` +
      `AUDIT_REQUIRED_ROUTES. Failing.`,
  );
  process.exit(1);
}

console.log(
  `\nOK — audit-lint scanned ${scannedTotal} route.ts file(s); ` +
    `${scannedRequired} in AUDIT_REQUIRED_ROUTES, ` +
    `${exemptions.length} exemption(s), 0 violations.`,
);
