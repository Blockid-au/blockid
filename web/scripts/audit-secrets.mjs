#!/usr/bin/env node
// Secret-pattern audit — scans the working tree for common leaked keys.
// Owned by CISO. Runs in CI + locally.
//
// Rules:
//   * NEVER print the secret value. Report file:line + pattern name + a
//     masked snippet (first 8 chars of the match, remainder redacted).
//   * Fails-open by design: exit code is 0 whether hits are found or not.
//     Detection is signal, not gate — decide policy at review time.
//   * Skips build artifacts, dependencies, git internals, and generated
//     content that would only add noise (reports, docs).

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

const WEB_ROOT = resolve(new URL("..", import.meta.url).pathname);
const REPO_ROOT = resolve(WEB_ROOT, "..");

const SCAN_ROOTS = [
  join(WEB_ROOT, "src"),
  join(WEB_ROOT, "scripts"),
  join(WEB_ROOT, "supabase", "migrations"),
];

// Directory-name blocklist — never descend into these.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "content", // reports & sample data live under content/
  "docs",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "coverage",
]);

// File-extension allowlist — anything else gets skipped.
const SCAN_EXT = /\.(m?[jt]sx?|cjs|mjs|json|env|sh|py|sql|yml|yaml|toml)$/i;

// Env-file suffix — extra hex-token check runs for these.
const ENV_FILE = /^\.env(\.|$)|\.env$/i;

// Pattern set. Kept small on purpose — pattern sprawl produces false-positive
// spam that trains everyone to ignore the report. Add new ones only after a
// real incident or a new dependency starts issuing tokens.
const PATTERNS = [
  { name: "stripe-live", re: /sk_live_[A-Za-z0-9]{16,}/g },
  { name: "stripe-test", re: /sk_test_[A-Za-z0-9]{16,}/g },
  { name: "slack-bot", re: /xoxb-[A-Za-z0-9-]{10,}/g },
  { name: "slack-user", re: /xoxp-[A-Za-z0-9-]{10,}/g },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/g },
  { name: "pem-block", re: /-----BEGIN [A-Z ]+-----/g },
  { name: "google-api-key", re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "slack-token-var", re: /SLACK_TOKEN\s*=\s*['"]?[A-Za-z0-9\-_.]{10,}/g },
  { name: "openai-key-var", re: /OPENAI_API_KEY\s*=\s*['"]?[A-Za-z0-9\-_.]{10,}/g },
  { name: "openai-key-raw", re: /sk-[A-Za-z0-9]{20,}/g },
  { name: "github-pat-classic", re: /ghp_[A-Za-z0-9]{36}/g },
  { name: "github-pat-fine", re: /github_pat_[A-Za-z0-9_]{80,}/g },
];

// Extra pattern applied only inside .env* files: any hex token >= 40 chars
// paired to a variable name. Ignores standalone hashes / commit-shas found
// mid-comment.
const ENV_HEX_TOKEN = /^[A-Z0-9_]+\s*=\s*['"]?[a-fA-F0-9]{40,}/gm;

// ── Helpers ──────────────────────────────────────────────────────────

/** Mask a matched secret to `first-8-chars****redacted****`. */
function maskMatch(match) {
  const head = match.slice(0, 8);
  return `${head}****redacted****`;
}

/** Walk a directory tree, calling `visit(absPath)` for each file to scan. */
function walk(root, visit) {
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return; // missing dir — skip silently (e.g. no supabase/migrations yet)
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(root, name);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(abs, visit);
    } else if (stat.isFile()) {
      const isEnv = ENV_FILE.test(name);
      if (isEnv || scanExtOk(name)) visit(abs, { isEnv });
    }
  }
}

function scanExtOk(name) {
  return SCAN_EXT.test(name);
}

// (helper defined; used above in walk())

/** Scan a single file's content; return array of hits. */
function scanFile(absPath, isEnv) {
  let content;
  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    return [];
  }
  // Skip anything huge — likely a checked-in binary blob or lockfile.
  if (content.length > 2_000_000) return [];

  const hits = [];
  const lines = content.split("\n");

  for (const { name, re } of PATTERNS) {
    // Reset regex state (global flag maintains lastIndex across calls).
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split("\n").length;
      hits.push({
        pattern: name,
        line: lineNum,
        masked: maskMatch(m[0]),
      });
    }
  }

  if (isEnv) {
    ENV_HEX_TOKEN.lastIndex = 0;
    let m;
    while ((m = ENV_HEX_TOKEN.exec(content)) !== null) {
      // Extract only the value portion for masking.
      const eqIdx = m[0].indexOf("=");
      const val = m[0].slice(eqIdx + 1).replace(/^['"]/, "");
      const lineNum = content.slice(0, m.index).split("\n").length;
      hits.push({
        pattern: "env-hex-token-40+",
        line: lineNum,
        masked: maskMatch(val),
      });
    }
  }

  // Suppress noise: comment lines explicitly marking a false-positive
  // with `// audit-secrets:ignore` on the same line.
  return hits.filter((h) => {
    const line = lines[h.line - 1] ?? "";
    return !line.includes("audit-secrets:ignore");
  });
}

// ── Main ─────────────────────────────────────────────────────────────

const findings = [];
const scannedFiles = [];

for (const root of SCAN_ROOTS) {
  walk(root, (absPath, ctx) => {
    scannedFiles.push(relative(REPO_ROOT, absPath));
    const hits = scanFile(absPath, ctx.isEnv);
    for (const h of hits) {
      findings.push({ file: relative(REPO_ROOT, absPath), ...h });
    }
  });
}

const today = new Date().toISOString().slice(0, 10);
const reportPath = join(WEB_ROOT, "content", "reports", `security-secrets-audit-${today}.md`);
mkdirSync(dirname(reportPath), { recursive: true });

const patternBreakdown = new Map();
for (const f of findings) {
  patternBreakdown.set(f.pattern, (patternBreakdown.get(f.pattern) ?? 0) + 1);
}

const scanRootsRel = SCAN_ROOTS.map((r) => relative(REPO_ROOT, r));
const patternNames = PATTERNS.map((p) => p.name).concat(["env-hex-token-40+"]);

const lines = [];
lines.push(`# Secrets Audit — ${today}`);
lines.push("");
lines.push(`**Owner:** CISO agent  ·  **Script:** \`web/scripts/audit-secrets.mjs\``);
lines.push("");
lines.push(`- Files scanned: ${scannedFiles.length}`);
lines.push(`- Patterns applied: ${patternNames.length}`);
lines.push(`- Findings: **${findings.length}**`);
lines.push("");
lines.push("## Scan scope");
lines.push("");
for (const r of scanRootsRel) lines.push(`- \`${r}/\``);
lines.push("");
lines.push("Skipped directory names: " + Array.from(SKIP_DIRS).map((s) => `\`${s}\``).join(", "));
lines.push("");
lines.push("## Patterns");
lines.push("");
for (const n of patternNames) lines.push(`- \`${n}\``);
lines.push("");
lines.push("## Results");
lines.push("");

if (findings.length === 0) {
  lines.push("No secrets detected.");
} else {
  lines.push("| File | Line | Pattern | Masked snippet |");
  lines.push("| --- | ---: | --- | --- |");
  for (const f of findings) {
    lines.push(`| \`${f.file}\` | ${f.line} | ${f.pattern} | \`${f.masked}\` |`);
  }
  lines.push("");
  lines.push("### Breakdown by pattern");
  lines.push("");
  for (const [name, count] of patternBreakdown) {
    lines.push(`- \`${name}\`: ${count}`);
  }
}

lines.push("");
lines.push("---");
lines.push("_Full secret values are never included. Review each finding — a hit is signal, not proof — and rotate any live credential immediately._");
lines.push("");

writeFileSync(reportPath, lines.join("\n"), "utf8");

// stdout summary
const rel = relative(REPO_ROOT, reportPath);
if (findings.length === 0) {
  console.log(`[audit-secrets] clean — scanned ${scannedFiles.length} files. report: ${rel}`);
} else {
  console.log(`[audit-secrets] ${findings.length} finding(s) across ${scannedFiles.length} scanned files. report: ${rel}`);
  for (const [name, count] of patternBreakdown) {
    console.log(`  - ${name}: ${count}`);
  }
}

// Always exit 0 — the audit reports, it does not gate.
process.exit(0);
