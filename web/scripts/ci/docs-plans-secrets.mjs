#!/usr/bin/env node
// R-08 CI enforcement — gitleaks-style secret scanner over docs/plans/**.
//
// gitleaks is not installed on the host; this scanner is the in-repo pure-
// node replacement. Wired into .git/hooks/pre-commit so plan / review /
// delta markdown cannot smuggle a Stripe key, GitLab PAT, or AWS access
// key across a commit boundary.
//
// Canonical analyzer: web/src/lib/reseller/docs-plans-secrets.ts
// (unit-tested via docs-plans-secrets.test.ts). The regexes below duplicate
// those on purpose so this CLI stays plain node .mjs — matches the
// reseller-lints.mjs / audit-secrets.mjs pattern (no tsx, no build). Keep
// the two in lockstep when either changes.
//
// Usage:
//   node web/scripts/ci/docs-plans-secrets.mjs             # full docs/plans scan
//   node web/scripts/ci/docs-plans-secrets.mjs --staged    # only staged files
//
// Exit 0 on clean, 1 on any error-severity finding.

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WEB_ROOT = resolve(new URL("../..", import.meta.url).pathname);
const REPO_ROOT = resolve(WEB_ROOT, "..");
const DOCS_PLANS_ROOT = join(REPO_ROOT, "docs", "plans");

// ---- Pattern set (mirror of web/src/lib/reseller/docs-plans-secrets.ts) ----

const PATTERNS = [
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
const SCAN_EXT = /\.(md|markdown|txt|json|yml|yaml)$/i;

// ---- Helpers --------------------------------------------------------------

function maskMatch(match) {
  return `${match.slice(0, 8)}****redacted****`;
}

function scanContent(file, content) {
  if (content.length > 2_000_000) return [];
  const lines = content.split("\n");
  const hits = [];
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const line = content.slice(0, m.index).split("\n").length;
      hits.push({ file, line, pattern: name, masked: maskMatch(m[0]) });
    }
  }
  return hits.filter((h) => !(lines[h.line - 1] ?? "").includes(IGNORE_MARK));
}

function walk(root, visit) {
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(root, name);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(abs, visit);
    else if (stat.isFile() && SCAN_EXT.test(name)) visit(abs);
  }
}

function stagedDocsPlansFiles() {
  let stdout;
  try {
    stdout = execSync("git diff --cached --name-only --diff-filter=ACMR", {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  } catch (err) {
    process.stderr.write(`[docs-plans-secrets] git diff failed: ${err.message}\n`);
    return [];
  }
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((rel) => rel.startsWith("docs/plans/") && SCAN_EXT.test(rel))
    .map((rel) => join(REPO_ROOT, rel));
}

// ---- Main -----------------------------------------------------------------

const stagedOnly = process.argv.includes("--staged");

const targets = stagedOnly
  ? stagedDocsPlansFiles().filter((abs) => existsSync(abs))
  : (() => {
      const out = [];
      walk(DOCS_PLANS_ROOT, (abs) => out.push(abs));
      return out;
    })();

const findings = [];
let scannedCount = 0;

for (const abs of targets) {
  let content;
  try {
    content = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  scannedCount++;
  const rel = relative(REPO_ROOT, abs);
  findings.push(...scanContent(rel, content));
}

const mode = stagedOnly ? "staged" : "full";
if (findings.length === 0) {
  console.log(
    `[docs-plans-secrets] clean (${mode} mode): scanned ${scannedCount} file(s), 0 finding(s)`,
  );
  process.exit(0);
}

console.error(
  `[docs-plans-secrets] ${findings.length} finding(s) in ${scannedCount} file(s) (${mode} mode):`,
);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.pattern}  ${f.masked}`);
}
console.error(
  "\nRotate any live credentials immediately. Suppress false positives by adding `gitleaks:ignore` on the same line.",
);
process.exit(1);
