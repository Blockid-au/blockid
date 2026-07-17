#!/usr/bin/env node
/**
 * Nightly C-Level Review Scaffold (Goal 5A — T-1100)
 *
 * Regenerates six per-persona review markdown files each night. This is the
 * scaffold pass: it writes placeholder content that references the previous
 * review so the follow-up task (T-1102) can wire the real Anthropic Messages
 * API call into the same file layout without further plumbing changes.
 *
 * Persona files land at:
 *   web/content/reports/{persona}-review-{version}.md
 *
 * where {version} is read from web/content/reports/version.json. If a review
 * for the current version already exists it is left in place (idempotent).
 *
 * Flags:
 *   --dry-run           log intended writes, do not touch the filesystem
 *   --persona=<name>    scaffold only one persona (dev iteration)
 *
 * Env:
 *   ANTHROPIC_API_KEY   if set, we log the T-1102 handover marker; otherwise
 *                       we log stub-mode. No LLM calls happen either way.
 *
 * Exit codes:
 *   0  success (or nothing to do)
 *   1  version.json missing or unreadable
 *   2  invalid CLI arguments
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PERSONAS = ["cto", "cfo", "cdo", "ciso", "cro", "cmo"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORTS_DIR = join(REPO_ROOT, "web", "content", "reports");
const VERSION_PATH = join(REPORTS_DIR, "version.json");
const HISTORY_PATH = join(REPORTS_DIR, "clevel-review-history.jsonl");

function parseArgs(argv) {
  const args = { dryRun: false, persona: null };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") {
      args.dryRun = true;
    } else if (raw.startsWith("--persona=")) {
      const value = raw.slice("--persona=".length).trim().toLowerCase();
      if (!PERSONAS.includes(value)) {
        console.error(`[nightly-clevel-review] unknown persona: ${value}`);
        console.error(`[nightly-clevel-review] valid personas: ${PERSONAS.join(", ")}`);
        process.exit(2);
      }
      args.persona = value;
    } else {
      console.error(`[nightly-clevel-review] unknown flag: ${raw}`);
      process.exit(2);
    }
  }
  return args;
}

function readVersion() {
  if (!existsSync(VERSION_PATH)) {
    console.error(`[nightly-clevel-review] missing ${VERSION_PATH}`);
    process.exit(1);
  }
  let raw;
  try {
    raw = readFileSync(VERSION_PATH, "utf8");
  } catch (err) {
    console.error(`[nightly-clevel-review] cannot read ${VERSION_PATH}: ${err.message}`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[nightly-clevel-review] version.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  const version = typeof parsed === "string" ? parsed : parsed?.version;
  if (typeof version !== "string" || version.length === 0) {
    console.error(`[nightly-clevel-review] version.json does not contain a version string`);
    process.exit(1);
  }
  return version;
}

function findPriorReview(persona) {
  if (!existsSync(REPORTS_DIR)) return null;
  const entries = readdirSync(REPORTS_DIR);
  const prefixSolo = `${persona}-review-`;
  // Also match the legacy combined "cro-cmo" file so those two personas can
  // continue the conversation from the last combined report until the split
  // gets its own history.
  const prefixCombined = persona === "cro" || persona === "cmo" ? "cro-cmo-review-" : null;
  const candidates = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    if (name.startsWith(prefixSolo) || (prefixCombined && name.startsWith(prefixCombined))) {
      const full = join(REPORTS_DIR, name);
      try {
        const s = statSync(full);
        if (s.isFile()) candidates.push({ path: full, name, mtimeMs: s.mtimeMs });
      } catch {
        // ignore stat errors — treat as absent
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0];
}

function scaffoldMarkdown({ persona, version, prior, timestamp }) {
  const priorLine = prior
    ? `- **Prior review:** \`web/content/reports/${prior.name}\` (mtime ${new Date(prior.mtimeMs).toISOString()})`
    : `- **Prior review:** none on disk`;
  const followUpLine = prior
    ? `Re-read the prior review at \`${prior.name}\` and confirm which items shipped, which slipped, and which are still open.`
    : `No prior review exists for this persona — establish the baseline: current ship state, top risks, and the first three actions to take.`;
  return `# ${persona.toUpperCase()} Review — ${version}

- **Persona:** ${persona}
- **Generated:** ${timestamp}
- **Version:** ${version}
${priorLine}
- **Mode:** scaffold (T-1100). LLM wiring lands in T-1102.

## Ship summary

_Placeholder — T-1102 will replace this section with an Anthropic Messages API
generation seeded by the persona prompt and the prior review context._

${followUpLine}

## Findings

_Placeholder — findings will be generated from repo diff + prior-review delta
once T-1102 wires the LLM call. For now this scaffold exists so downstream
consumers (dashboard cards, weekly digest, deploy gate) have a stable file
path to read._

- Finding 1: TBD
- Finding 2: TBD
- Finding 3: TBD

## Top-3 actions

_Placeholder — the follow-up task will surface the three highest-leverage
actions for the persona based on the review body._

1. TBD — action for ${persona} owner.
2. TBD — action for ${persona} owner.
3. TBD — action for ${persona} owner.
`;
}

function ensureReportsDir(dryRun) {
  if (existsSync(REPORTS_DIR)) return;
  if (dryRun) {
    console.log(`[nightly-clevel-review] (dry-run) would mkdir ${REPORTS_DIR}`);
    return;
  }
  mkdirSync(REPORTS_DIR, { recursive: true });
}

function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv);
  const version = readVersion();
  const mode = process.env.ANTHROPIC_API_KEY
    ? "LLM mode not yet implemented (T-1102) — writing stub scaffold"
    : "stub mode — writing placeholders (ANTHROPIC_API_KEY not set)";
  console.log(`[nightly-clevel-review] version=${version} mode=${args.dryRun ? "dry-run" : "write"}`);
  console.log(`[nightly-clevel-review] ${mode}`);

  ensureReportsDir(args.dryRun);

  const targets = args.persona ? [args.persona] : PERSONAS;
  const written = [];
  const skipped = [];
  const timestamp = new Date().toISOString();

  for (const persona of targets) {
    const outPath = join(REPORTS_DIR, `${persona}-review-${version}.md`);
    if (existsSync(outPath)) {
      console.log(`[nightly-clevel-review] skip ${persona}: ${outPath} already exists for ${version}`);
      skipped.push(persona);
      continue;
    }
    const prior = findPriorReview(persona);
    const body = scaffoldMarkdown({ persona, version, prior, timestamp });
    if (args.dryRun) {
      console.log(`[nightly-clevel-review] (dry-run) would write ${outPath} (${body.length} bytes)`);
      written.push(persona);
      continue;
    }
    try {
      writeFileSync(outPath, body, "utf8");
      console.log(`[nightly-clevel-review] wrote ${outPath}`);
      written.push(persona);
    } catch (err) {
      console.error(`[nightly-clevel-review] failed to write ${outPath}: ${err.message}`);
      skipped.push(persona);
    }
  }

  const record = {
    ts: timestamp,
    version,
    personas_written: written,
    personas_skipped: skipped,
    duration_ms: Date.now() - startedAt,
    dry_run: args.dryRun,
  };

  if (args.dryRun) {
    console.log(`[nightly-clevel-review] (dry-run) history entry: ${JSON.stringify(record)}`);
  } else {
    try {
      appendFileSync(HISTORY_PATH, JSON.stringify(record) + "\n", "utf8");
    } catch (err) {
      console.error(`[nightly-clevel-review] failed to append history: ${err.message}`);
    }
  }

  console.log(`[nightly-clevel-review] done: wrote=${written.length} skipped=${skipped.length} ms=${record.duration_ms}`);
}

main();
