#!/usr/bin/env node
/**
 * Nightly C-Level Review Orchestrator (Goal 5A — T-1100 + T-1101)
 *
 * Two operating modes:
 *
 * 1. NIGHTLY mode (default, no special flag) — T-1101 production gate.
 *    Uses today's date for filenames ({role}-nightly-YYYY-MM-DD.md), feeds
 *    git diff from the last 24 h as the primary prompt context, retains only
 *    the 7 most recent per-role reports, generates a digest, and sends the
 *    digest to Telegram. This is what the cron calls.
 *
 * 2. VERSION mode (--version-mode) — T-1100 legacy scaffold.
 *    Uses version.json for filenames ({role}-review-{version}.md) and the
 *    curated manifest for evidence. Kept for manual re-runs and CI baseline.
 *
 * Persona report files land at:
 *   web/content/reports/{role}-nightly-YYYY-MM-DD.md   (nightly mode)
 *   web/content/reports/{role}-review-{version}.md      (version mode)
 *
 * Digest lands at:
 *   web/content/reports/nightly-digest-YYYY-MM-DD.md
 *
 * Flags:
 *   --dry-run           log intended writes, do not touch the filesystem
 *   --persona=<name>    run only one persona (dev iteration)
 *   --stub              force stub mode regardless of ANTHROPIC_API_KEY (CI-safe)
 *   --version-mode      use legacy version-based filenames + manifest evidence
 *
 * Env:
 *   ANTHROPIC_API_KEY         enables live LLM mode when set (and --stub absent)
 *   CLEVEL_REVIEW_CHEAP=1     swap sonnet-5 -> haiku-4-5 (cost fallback)
 *   TELEGRAM_BOT_TOKEN        optional: digest message target
 *   TELEGRAM_CHAT_ID          optional: chat / channel id
 *   SUPABASE_URL              optional: Supabase project URL for DB writes
 *   SUPABASE_SERVICE_ROLE_KEY optional: service-role key for cron DB writes
 *   CLEVEL_PROJECT_ID         optional: projects.id to scope DB writes per-startup
 *   CLEVEL_STARTUP_ID         optional: svi_accounts.id to scope DB writes per-startup
 *
 * DB writes (when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + CLEVEL_PROJECT_ID set):
 *   clevel_reports_v2       — one row per persona per run (upsert by role+scenario+date)
 *   clevel_trend_snapshots  — one row per persona per run (upsert by project+role+date)
 *
 * Exit codes:
 *   0  success (or nothing to do)
 *   1  version.json missing or unreadable, or SDK not installed in live mode
 *   2  invalid CLI arguments
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

// ─── Supabase lazy loader ─────────────────────────────────────────────────────
// Loaded only when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present.
// Fail-soft: if the package is missing, DB writes are silently skipped.
let _supabaseClient = null;

async function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  const url = process.env.SUPABASE_URL || _loadEnvVar("SUPABASE_URL");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    _loadEnvVar("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    _supabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return _supabaseClient;
  } catch (err) {
    console.warn(
      `[nightly-clevel-review] @supabase/supabase-js not available — DB writes skipped (${err.message})`,
    );
    return null;
  }
}

/** Read a single env var from web/.env without loading all vars into process.env */
function _loadEnvVar(name) {
  try {
    const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)/);
      if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env not readable — ignore
  }
  return null;
}

const PERSONAS = ["cto", "cfo", "ceo", "cdo", "ciso", "cro", "cmo"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORTS_DIR = join(REPO_ROOT, "web", "content", "reports");
const VERSION_PATH = join(REPORTS_DIR, "version.json");
const HISTORY_PATH = join(REPORTS_DIR, "clevel-review-history.jsonl");
const PROMPTS_DIR = join(__dirname, "lib", "clevel-prompts");
const MANIFEST_PATH = join(__dirname, "lib", "clevel-review-manifest.json");

// ─── Telegram ────────────────────────────────────────────────────────────────
// Bot token is published in the codebase (same as telegram-report/route.ts).
const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ?? "8866491988:AAF24ixnoNFzubydEARc28klTd0lw1V5fCk";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

// ─── Model + pricing ─────────────────────────────────────────────────────────
const MODEL_DEFAULT = "claude-sonnet-4-5";
const MODEL_CHEAP = "claude-haiku-4-5";
const MAX_TOKENS = 8000;
const TEMPERATURE = 0.2;

const PRICING_USD = {
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
};

// ─── Nightly retention ───────────────────────────────────────────────────────
const MAX_NIGHTLY_REPORTS_PER_ROLE = 7;

// ─── Domain scope per persona — drives git-diff filter in nightly mode ───────
const PERSONA_SCOPE = {
  cto: { keywords: ["src/", "scripts/", "package.json", "next.config", "tsconfig", "Dockerfile", "deploy", ".sh"], label: "Engineering / Infrastructure" },
  cfo: { keywords: ["plans", "pricing", "stripe", "billing", "gst", "revenue", "subscription", "coupon", "dcf", "c-level", "forecast"], label: "Finance / Monetisation" },
  ceo: { keywords: ["roadmap", "svi", "goals", "founder", "startup-journey", "guide", "vision", "changelog"], label: "Strategy / Roadmap" },
  cdo: { keywords: ["analytics", "events", "bq", "bigquery", "tracking", "insights", "segment", "dashboard"], label: "Data / Analytics" },
  ciso: { keywords: ["audit", "security", "legal", "gate", "rls", "policy", "auth", "token", "secret", "proxy"], label: "Security / Compliance" },
  cro: { keywords: ["conversion", "experiment", "upsell", "upgrade", "funnel", "ab-", "trigger", "waitlist"], label: "Revenue / Conversion" },
  cmo: { keywords: ["marketing", "sitemap", "content", "roadmap", "seo", "email", "drip", "nurture", "linkedin", "blog"], label: "Marketing / Growth" },
};

// ─── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { dryRun: false, persona: null, stub: false, versionMode: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") {
      args.dryRun = true;
    } else if (raw === "--stub") {
      args.stub = true;
    } else if (raw === "--version-mode") {
      args.versionMode = true;
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

// ─── version.json ────────────────────────────────────────────────────────────
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

// ─── Git diff helpers ────────────────────────────────────────────────────────
function getGitDiff24h() {
  try {
    const changedFiles = execSync(
      `git log --since="24 hours ago" --name-only --format="" 2>/dev/null | sort -u`,
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    )
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const diffStat = execSync(
      `git log --since="24 hours ago" --stat --format="commit %h %s" 2>/dev/null | head -200`,
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();

    return { changedFiles, diffStat };
  } catch {
    return { changedFiles: [], diffStat: "(git diff unavailable)" };
  }
}

function filterFilesByScope(changedFiles, persona) {
  const scope = PERSONA_SCOPE[persona];
  if (!scope) return changedFiles;
  return changedFiles.filter((f) =>
    scope.keywords.some((kw) => f.toLowerCase().includes(kw.toLowerCase())),
  );
}

// ─── Prior review finder ─────────────────────────────────────────────────────
function findPriorNightlyReport(persona) {
  if (!existsSync(REPORTS_DIR)) return null;
  const prefix = `${persona}-nightly-`;
  const candidates = [];
  for (const name of readdirSync(REPORTS_DIR)) {
    if (!name.startsWith(prefix) || !name.endsWith(".md")) continue;
    const full = join(REPORTS_DIR, name);
    try {
      const s = statSync(full);
      if (s.isFile()) candidates.push({ path: full, name, mtimeMs: s.mtimeMs });
    } catch {
      // ignore
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0];
}

function findPriorReview(persona) {
  if (!existsSync(REPORTS_DIR)) return null;
  const prefixSolo = `${persona}-review-`;
  const prefixCombined = persona === "cro" || persona === "cmo" ? "cro-cmo-review-" : null;
  const candidates = [];
  for (const name of readdirSync(REPORTS_DIR)) {
    if (!name.endsWith(".md")) continue;
    if (name.startsWith(prefixSolo) || (prefixCombined && name.startsWith(prefixCombined))) {
      const full = join(REPORTS_DIR, name);
      try {
        const s = statSync(full);
        if (s.isFile()) candidates.push({ path: full, name, mtimeMs: s.mtimeMs });
      } catch {
        // ignore
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0];
}

// ─── Retention: keep only 7 most recent nightly reports per role ─────────────
function pruneOldNightlyReports(persona, dryRun) {
  const prefix = `${persona}-nightly-`;
  const candidates = [];
  try {
    for (const name of readdirSync(REPORTS_DIR)) {
      if (!name.startsWith(prefix) || !name.endsWith(".md")) continue;
      const full = join(REPORTS_DIR, name);
      try {
        const s = statSync(full);
        if (s.isFile()) candidates.push({ path: full, name, mtimeMs: s.mtimeMs });
      } catch {
        // ignore
      }
    }
  } catch {
    return;
  }
  if (candidates.length <= MAX_NIGHTLY_REPORTS_PER_ROLE) return;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const toDelete = candidates.slice(MAX_NIGHTLY_REPORTS_PER_ROLE);
  for (const f of toDelete) {
    if (dryRun) {
      console.log(`[nightly-clevel-review] (dry-run) would delete old report: ${f.name}`);
    } else {
      try {
        rmSync(f.path);
        console.log(`[nightly-clevel-review] pruned old report: ${f.name}`);
      } catch (err) {
        console.warn(`[nightly-clevel-review] could not prune ${f.name}: ${err.message}`);
      }
    }
  }
}

// ─── Prompt loaders ──────────────────────────────────────────────────────────
function loadPromptFor(persona) {
  const path = join(PROMPTS_DIR, `${persona}.md`);
  if (!existsSync(path)) {
    throw new Error(`persona prompt missing: ${path}`);
  }
  return readFileSync(path, "utf8");
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`manifest missing: ${MANIFEST_PATH}`);
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

// ─── Evidence builders ───────────────────────────────────────────────────────
const PER_FILE_CHAR_CAP = 60_000;

function readEvidenceFile(relPath) {
  const full = join(REPO_ROOT, relPath);
  if (!existsSync(full)) {
    return { path: relPath, missing: true, body: null };
  }
  try {
    let body = readFileSync(full, "utf8");
    let truncated = false;
    if (body.length > PER_FILE_CHAR_CAP) {
      body = body.slice(0, PER_FILE_CHAR_CAP);
      truncated = true;
    }
    return { path: relPath, missing: false, body, truncated };
  } catch (err) {
    console.warn(`[nightly-clevel-review] cannot read ${relPath}: ${err.message}`);
    return { path: relPath, missing: true, body: null };
  }
}

/**
 * Build nightly evidence blob — git diff from the last 24h filtered to the
 * persona's domain, plus the prior nightly report for delta comparison.
 */
function buildNightlyEvidenceBlob({ persona, date, changedFiles, diffStat, prior }) {
  const scope = PERSONA_SCOPE[persona];
  const relevant = filterFilesByScope(changedFiles, persona);

  const priorSection = prior
    ? `## Prior nightly report (delta comparison)\n\n\`${prior.name}\` — generated ${new Date(prior.mtimeMs).toISOString()}\n\n\`\`\`\n${readFileSync(prior.path, "utf8").slice(0, PER_FILE_CHAR_CAP)}\n\`\`\`\n`
    : `## Prior nightly report\n\nNone on disk — establish a baseline for this persona.\n`;

  const allFilesSection =
    changedFiles.length > 0
      ? `## All files changed in the last 24 h (${changedFiles.length} files)\n\n\`\`\`\n${changedFiles.join("\n")}\n\`\`\`\n`
      : `## All files changed in the last 24 h\n\nNo commits in the last 24 h.\n`;

  const relevantSection =
    relevant.length > 0
      ? `## Files relevant to ${scope?.label ?? persona} domain (${relevant.length} files)\n\n\`\`\`\n${relevant.join("\n")}\n\`\`\`\n`
      : `## Files relevant to ${scope?.label ?? persona} domain\n\nNo domain-relevant files changed in the last 24 h. Check baseline and prior report for anything lingering.\n`;

  const diffStatSection = diffStat
    ? `## Commit log summary (last 24 h)\n\n\`\`\`\n${diffStat.slice(0, 8_000)}\n\`\`\`\n`
    : "";

  return `# Nightly evidence blob for persona: ${persona.toUpperCase()}

Date under review: **${date}**
Domain: **${scope?.label ?? persona}**
Generated at: ${new Date().toISOString()}

${priorSection}

${allFilesSection}

${relevantSection}

${diffStatSection}

---

You have received the persona system prompt separately. Produce the nightly review now.
Use the git diff above as the primary evidence. Flag regressions, highlight improvements,
and call out any domain-relevant file that changed but looks risky. Cite file paths.
Mark UNKNOWN where evidence is missing. Be direct and concrete — no fluff.
`;
}

/**
 * Build version-mode evidence blob (manifest-based, original T-1100 approach).
 */
function buildEvidenceBlob({ persona, version, prior, manifest }) {
  const files = (manifest[persona] || []).map(readEvidenceFile);
  const priorSection = prior
    ? `## Prior review (for delta comparison)\n\n\`web/content/reports/${prior.name}\` — mtime ${new Date(prior.mtimeMs).toISOString()}\n\n\`\`\`\n${readFileSync(prior.path, "utf8").slice(0, PER_FILE_CHAR_CAP)}\n\`\`\`\n`
    : `## Prior review (for delta comparison)\n\nNone on disk — establish the baseline for this persona.\n`;

  const evidenceSections = files
    .map((f) => {
      if (f.missing) {
        return `### ${f.path}\n\n(missing on disk — flag as UNKNOWN in the review)\n`;
      }
      const noteTrunc = f.truncated ? ` (truncated to ${PER_FILE_CHAR_CAP} chars)` : "";
      return `### ${f.path}${noteTrunc}\n\n\`\`\`\n${f.body}\n\`\`\`\n`;
    })
    .join("\n");

  return `# Evidence blob for persona: ${persona}

Release under review: **${version}**
Generated at: ${new Date().toISOString()}

${priorSection}

## Curated source files

${evidenceSections}

---

You have received the persona system prompt separately. Produce the review now,
following every rule in that prompt. Cite \`file:line\` for every claim. Mark
UNKNOWN where evidence is missing.
`;
}

// ─── Scaffold markdown (stub mode) ───────────────────────────────────────────
function scaffoldNightlyMarkdown({ persona, date, prior, timestamp }) {
  const priorLine = prior
    ? `- **Prior report:** \`web/content/reports/${prior.name}\``
    : `- **Prior report:** none on disk`;
  return `# ${persona.toUpperCase()} Nightly Review — ${date}

- **Persona:** ${persona}
- **Generated:** ${timestamp}
- **Date:** ${date}
${priorLine}
- **Mode:** stub (ANTHROPIC_API_KEY not set or --stub passed). No LLM output.

## Status

_Stub mode — set ANTHROPIC_API_KEY and re-run to produce a real review._

## Findings

- Finding 1: TBD
- Finding 2: TBD

## Top-3 actions

1. TBD
2. TBD
3. TBD
`;
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
- **Mode:** stub (forced or ANTHROPIC_API_KEY unset). LLM output disabled for this run.

## Ship summary

_Placeholder — running in stub mode. Set ANTHROPIC_API_KEY and re-run without
\`--stub\` to produce a real review._

${followUpLine}

## Findings

- Finding 1: TBD
- Finding 2: TBD
- Finding 3: TBD

## Top-3 actions

1. TBD — action for ${persona} owner.
2. TBD — action for ${persona} owner.
3. TBD — action for ${persona} owner.
`;
}

// ─── Infra ───────────────────────────────────────────────────────────────────
function ensureReportsDir(dryRun) {
  if (existsSync(REPORTS_DIR)) return;
  if (dryRun) {
    console.log(`[nightly-clevel-review] (dry-run) would mkdir ${REPORTS_DIR}`);
    return;
  }
  mkdirSync(REPORTS_DIR, { recursive: true });
}

async function loadAnthropicSDK() {
  try {
    const mod = await import("@anthropic-ai/sdk");
    return mod.default;
  } catch (err) {
    console.error(
      `[nightly-clevel-review] cannot import @anthropic-ai/sdk (${err.message}). ` +
        `Install with: cd web && pnpm add @anthropic-ai/sdk. ` +
        `Pass --stub to run in stub mode without the SDK.`,
    );
    process.exit(1);
  }
}

function estimateCostUsd(model, tokensIn, tokensOut) {
  const rates = PRICING_USD[model];
  if (!rates) return 0;
  return (tokensIn / 1_000_000) * rates.input + (tokensOut / 1_000_000) * rates.output;
}

// ─── LLM calls ───────────────────────────────────────────────────────────────
async function generateNightlyPersonaReview({
  persona,
  date,
  changedFiles,
  diffStat,
  prior,
  client,
  model,
  timestamp,
}) {
  const systemPrompt = loadPromptFor(persona);
  const evidence = buildNightlyEvidenceBlob({ persona, date, changedFiles, diffStat, prior });

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: systemPrompt,
    messages: [{ role: "user", content: evidence }],
  });

  const tokensIn = response.usage?.input_tokens ?? 0;
  const tokensOut = response.usage?.output_tokens ?? 0;
  const costUsd = estimateCostUsd(model, tokensIn, tokensOut);

  const textBlocks = (response.content || []).filter((b) => b.type === "text");
  const bodyText = textBlocks.map((b) => b.text).join("\n\n").trim();

  const priorLine = prior
    ? `- **Prior report:** \`web/content/reports/${prior.name}\``
    : `- **Prior report:** none on disk`;

  const header = `# ${persona.toUpperCase()} Nightly Review — ${date}

- **Persona:** ${persona}
- **Generated:** ${timestamp}
- **Date:** ${date}
${priorLine}
- **Mode:** live (model ${model}, tokens in=${tokensIn} out=${tokensOut}, ~US$${costUsd.toFixed(4)})

---

`;

  return {
    body: header + bodyText + "\n",
    tokensIn,
    tokensOut,
    costUsd,
    model,
    bodyText,
  };
}

async function generatePersonaReview({
  persona,
  version,
  prior,
  manifest,
  client,
  model,
  timestamp,
}) {
  const systemPrompt = loadPromptFor(persona);
  const evidence = buildEvidenceBlob({ persona, version, prior, manifest });

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: systemPrompt,
    messages: [{ role: "user", content: evidence }],
  });

  const tokensIn = response.usage?.input_tokens ?? 0;
  const tokensOut = response.usage?.output_tokens ?? 0;
  const costUsd = estimateCostUsd(model, tokensIn, tokensOut);

  const textBlocks = (response.content || []).filter((b) => b.type === "text");
  const bodyText = textBlocks.map((b) => b.text).join("\n\n").trim();

  const priorLine = prior
    ? `- **Prior review:** \`web/content/reports/${prior.name}\` (mtime ${new Date(prior.mtimeMs).toISOString()})`
    : `- **Prior review:** none on disk`;

  const header = `# ${persona.toUpperCase()} Review — ${version}

- **Persona:** ${persona}
- **Generated:** ${timestamp}
- **Version:** ${version}
${priorLine}
- **Mode:** live (model ${model}, tokens in=${tokensIn} out=${tokensOut}, ~US$${costUsd.toFixed(4)})

---

`;

  return {
    body: header + bodyText + "\n",
    tokensIn,
    tokensOut,
    costUsd,
    model,
  };
}

// ─── Digest ──────────────────────────────────────────────────────────────────
/**
 * Read role reports and generate a digest markdown file.
 *
 * In live mode the digest is generated by Claude (synthesises all six reports
 * into RED/YELLOW/GREEN + action items). In stub mode it is a static summary.
 */
async function generateDigest({ date, reportBodies, timestamp, client, model, dryRun, version }) {
  const digestPath = join(REPORTS_DIR, `nightly-digest-${date}.md`);

  let digestBody;

  if (client && Object.keys(reportBodies).length > 0) {
    const combinedReports = Object.entries(reportBodies)
      .map(([role, body]) => `## ${role.toUpperCase()} Report\n\n${body.slice(0, 12_000)}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are the CEO of BlockID.au. You have just received nightly review reports from six C-Level agents (CTO, CFO, CDO, CISO, CRO, CMO). Your job is to synthesise them into a single executive digest.

Format EXACTLY as follows (no deviations):
1. One-line overall status: RED / YELLOW / GREEN with a single sentence explaining why.
2. Per-domain status table:
   | Domain | Status | Key finding |
   |--------|--------|-------------|
   (one row per persona, Status = RED/YELLOW/GREEN)
3. Critical action items (at most 5, numbered, owner in brackets).
4. Positive signals (at most 3 bullet points).

Rules: No emoji. No hype. Australian English. Direct and concrete. Under 600 words total.`;

    const userPrompt = `Date: ${date}
Version: ${version}

${combinedReports}

---

Produce the executive digest now.`;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 1500,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const textBlocks = (response.content || []).filter((b) => b.type === "text");
      const digestText = textBlocks.map((b) => b.text).join("\n\n").trim();
      digestBody = `# Nightly Digest — ${date}

- **Generated:** ${timestamp}
- **Version:** ${version}
- **Roles reviewed:** ${Object.keys(reportBodies).join(", ")}
- **Mode:** live (model ${model})

---

${digestText}
`;
    } catch (err) {
      console.error(`[nightly-clevel-review] digest LLM call failed: ${err.message}. Using stub digest.`);
      digestBody = buildStubDigest({ date, timestamp, version, reportBodies });
    }
  } else {
    digestBody = buildStubDigest({ date, timestamp, version, reportBodies });
  }

  if (dryRun) {
    console.log(`[nightly-clevel-review] (dry-run) would write digest: ${digestPath} (${digestBody.length} bytes)`);
  } else {
    try {
      writeFileSync(digestPath, digestBody, "utf8");
      console.log(`[nightly-clevel-review] wrote digest: ${digestPath}`);
    } catch (err) {
      console.error(`[nightly-clevel-review] failed to write digest: ${err.message}`);
    }
  }

  return { digestPath, digestBody };
}

function buildStubDigest({ date, timestamp, version, reportBodies }) {
  const roles = Object.keys(reportBodies);
  const rows = PERSONAS.map((p) => {
    const hasReport = roles.includes(p);
    return `| ${p.toUpperCase()} | ${hasReport ? "YELLOW" : "UNKNOWN"} | ${hasReport ? "Report generated (stub mode — no LLM analysis)" : "Report not generated"} |`;
  }).join("\n");

  return `# Nightly Digest — ${date}

- **Generated:** ${timestamp}
- **Version:** ${version}
- **Mode:** stub (ANTHROPIC_API_KEY not set or --stub passed)

## Overall Status: YELLOW

Stub mode — no LLM analysis performed. Set ANTHROPIC_API_KEY for real reviews.

## Per-Domain Status

| Domain | Status | Key finding |
|--------|--------|-------------|
${rows}

## Critical Action Items

1. Set ANTHROPIC_API_KEY in web/.env to enable live nightly reviews.

## Positive Signals

- Nightly review orchestrator is running correctly.
`;
}

// ─── Telegram ────────────────────────────────────────────────────────────────
async function sendTelegram(text) {
  if (!TELEGRAM_CHAT_ID) {
    console.log("[nightly-clevel-review] TELEGRAM_CHAT_ID not set — skipping Telegram send");
    return false;
  }
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("[nightly-clevel-review] TELEGRAM_BOT_TOKEN not set — skipping Telegram send");
    return false;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      },
    );
    const data = await res.json();
    if (!data.ok) {
      console.error(`[nightly-clevel-review] Telegram send failed: ${data.description}`);
    }
    return data.ok === true;
  } catch (err) {
    console.error(`[nightly-clevel-review] Telegram error: ${err.message}`);
    return false;
  }
}

// ─── Report metric parsers ────────────────────────────────────────────────────

/**
 * Parse AUD valuation estimate from a CFO report.
 * Looks for patterns like "A$2,500,000" or "AUD 2.5M" or "valuation: $2.5M".
 * Returns integer cents (AUD) or null if not found.
 */
export function parseValuationAud(reportText) {
  if (!reportText) return null;
  // Match patterns: A$1,234,567 | AUD 1.2M | $1.5m | valuation.*$2M
  const patterns = [
    // A$1,234,567 or A$1.2M
    /A\$\s*([\d,]+(?:\.\d+)?)\s*([MmKk]?)/g,
    // AUD 1.2M or AUD 1,234,567
    /AUD\s+([\d,]+(?:\.\d+)?)\s*([MmKk]?)/gi,
    // plain $2.5M after "valuation" keyword
    /valuation[^$\d]*\$\s*([\d,]+(?:\.\d+)?)\s*([MmKk]?)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(reportText)) !== null) {
      const raw = parseFloat(m[1].replace(/,/g, ""));
      const suffix = (m[2] || "").toLowerCase();
      if (!Number.isFinite(raw) || raw <= 0) continue;
      let aud;
      if (suffix === "m") aud = Math.round(raw * 1_000_000);
      else if (suffix === "k") aud = Math.round(raw * 1_000);
      else aud = Math.round(raw);
      if (aud > 10_000) return aud; // sanity: >$10k before accepting
    }
  }
  return null;
}

/**
 * Parse a simple metrics snapshot from any report.
 * Returns { arr_aud, runway_months, team_size } with null for missing fields.
 */
export function parseMetricsSnapshot(reportText) {
  if (!reportText) return null;
  const snapshot = {};

  // ARR: "ARR: A$500k" | "ARR A$500,000" | "ARR of $500K"
  const arrMatch = reportText.match(
    /\bARR[:\s]+(?:A\$|AUD\s*)?([\d,]+(?:\.\d+)?)\s*([MmKk]?)/i,
  );
  if (arrMatch) {
    const raw = parseFloat(arrMatch[1].replace(/,/g, ""));
    const suf = (arrMatch[2] || "").toLowerCase();
    if (Number.isFinite(raw) && raw > 0) {
      snapshot.arr_aud =
        suf === "m"
          ? Math.round(raw * 1_000_000)
          : suf === "k"
            ? Math.round(raw * 1_000)
            : Math.round(raw);
    }
  }

  // Runway: "runway: 18 months" | "18 months runway" | "runway of 12 months"
  const runwayMatch = reportText.match(
    /\brunway[^0-9]*(\d+)\s*months|\b(\d+)\s*months?\s+runway/i,
  );
  if (runwayMatch) {
    const months = parseInt(runwayMatch[1] || runwayMatch[2], 10);
    if (months > 0 && months < 120) snapshot.runway_months = months;
  }

  // Team size: "team of 12" | "12 FTEs" | "team size: 8"
  const teamMatch = reportText.match(
    /\bteam(?:\s+size)?[:\s]+(\d+)|\b(\d+)\s+(?:FTEs?|employees?|headcount)/i,
  );
  if (teamMatch) {
    const n = parseInt(teamMatch[1] || teamMatch[2], 10);
    if (n > 0 && n < 50_000) snapshot.team_size = n;
  }

  if (Object.keys(snapshot).length === 0) return null;
  return snapshot;
}

// ─── Supabase DB writers (fail-soft) ─────────────────────────────────────────

/**
 * Insert a persona report into clevel_reports_v2.
 * Fail-soft: any error is logged and execution continues.
 *
 * @param {object} opts
 * @param {string} opts.projectId    - projects.id UUID
 * @param {string} opts.startupId   - svi_accounts.id UUID
 * @param {string} opts.role        - e.g. "cfo"
 * @param {string} opts.reportText  - full markdown body
 * @param {string} opts.date        - YYYY-MM-DD
 * @param {string} opts.model       - model name or null
 * @param {number} opts.tokensIn
 * @param {number} opts.tokensOut
 * @param {number} opts.costUsd
 * @param {number} opts.durationMs
 * @returns {Promise<string|null>} inserted row id or null
 */
export async function insertReportToDb({
  projectId,
  startupId,
  role,
  reportText,
  date,
  model,
  tokensIn,
  tokensOut,
  costUsd,
  durationMs,
}) {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const valuation = role === "cfo" ? parseValuationAud(reportText) : null;
  const metrics = parseMetricsSnapshot(reportText);

  const row = {
    project_id: projectId,
    startup_id: startupId,
    role,
    scenario: "base", // nightly cron always writes the base scenario
    title: `${role.toUpperCase()} Nightly Review — ${date}`,
    body_markdown: reportText,
    sections: {},
    key_findings: [],
    action_items: [],
    generated_at: new Date().toISOString(),
    generated_by: "nightly-cron-v2",
    model_used: model || null,
    tokens_in: tokensIn || null,
    tokens_out: tokensOut || null,
    cost_usd_estimate: costUsd ? Number(costUsd.toFixed(4)) : null,
    duration_ms: durationMs || null,
    is_confidential: true,
    has_real_startup_names: false,
    // CFO-specific valuation (stored in AUD cents)
    dcf_valuation_base: valuation ?? null,
    // Metrics snapshot stored in sensitivity_drivers field as JSONB
    sensitivity_drivers: metrics ?? null,
  };

  try {
    const { data, error } = await supabase
      .from("clevel_reports_v2")
      .upsert(row, {
        onConflict: "project_id,role,scenario,generated_at::date",
        ignoreDuplicates: false,
      })
      .select("id")
      .single();
    if (error) {
      console.warn(
        `[nightly-clevel-review] DB insert clevel_reports_v2 (${role}): ${error.message}`,
      );
      return null;
    }
    console.log(
      `[nightly-clevel-review] DB wrote clevel_reports_v2 (${role}) id=${data?.id}`,
    );
    return data?.id ?? null;
  } catch (err) {
    console.warn(
      `[nightly-clevel-review] DB insert clevel_reports_v2 (${role}) threw: ${err.message}`,
    );
    return null;
  }
}

/**
 * Insert a trend snapshot into clevel_trend_snapshots.
 * Fail-soft: any error is logged and execution continues.
 *
 * @param {object} opts
 * @param {string} opts.projectId   - projects.id UUID
 * @param {string} opts.role        - e.g. "cfo"
 * @param {string} opts.date        - YYYY-MM-DD snapshot date
 * @param {string} opts.reportId    - clevel_reports_v2.id (for data_source)
 * @param {string} opts.reportText  - used to parse metric values
 */
export async function insertTrendSnapshot({
  projectId,
  role,
  date,
  reportId,
  reportText,
}) {
  const supabase = await getSupabaseClient();
  if (!supabase) return;

  const metrics = parseMetricsSnapshot(reportText) || {};
  const valuation = role === "cfo" ? parseValuationAud(reportText) : null;

  // Derive week number from the date (ISO week within the year)
  const dt = new Date(date);
  const startOfYear = new Date(dt.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((dt - startOfYear) / 86_400_000 + startOfYear.getDay() + 1) / 7,
  );

  const row = {
    project_id: projectId,
    role,
    week_number: weekNumber,
    snapshot_date: date,
    arr_aud: metrics.arr_aud ?? null,
    runway_months: metrics.runway_months ?? null,
    dcf_valuation_base: valuation ?? null,
    data_source: reportId ? `clevel_report:${reportId}` : "nightly-cron",
  };

  try {
    const { error } = await supabase
      .from("clevel_trend_snapshots")
      .upsert(row, { onConflict: "project_id,role,snapshot_date", ignoreDuplicates: false });
    if (error) {
      console.warn(
        `[nightly-clevel-review] DB insert clevel_trend_snapshots (${role}): ${error.message}`,
      );
      return;
    }
    console.log(
      `[nightly-clevel-review] DB wrote clevel_trend_snapshots (${role}) date=${date}`,
    );
  } catch (err) {
    console.warn(
      `[nightly-clevel-review] DB insert clevel_trend_snapshots (${role}) threw: ${err.message}`,
    );
  }
}

// ─── WoW trend alert routing ──────────────────────────────────────────────────

const WOW_ALERT_THRESHOLD_PCT = -15; // negative = drop
const WOW_ALERT_ROLES = ["cfo", "ceo", "cto", "cmo", "cdo"];

// Primary metric per role (mirrors compare-trend.ts logic without importing TS)
const PRIMARY_METRIC_FOR_ROLE = {
  cfo: "dcf_valuation_base",
  ceo: "runway_months",
  cto: "svi_score",
  cmo: "cac_payback_months",
  cdo: "svi_score",
};

// Metrics where bigger = worse (so a rise triggers the alert)
const GOOD_IS_SMALLER = new Set(["churn_rate_pct", "cac_payback_months", "burn_rate_monthly"]);

/**
 * Fetch the last 12 weekly snapshots for a project+role from Supabase,
 * compute week-over-week change, and return an alert object if critical.
 *
 * Returns null on any DB failure or insufficient data.
 *
 * @param {object} opts
 * @param {object} opts.supabase    - Supabase client
 * @param {string} opts.projectId   - projects.id UUID
 * @param {string} opts.role        - one of WOW_ALERT_ROLES
 * @returns {Promise<{role:string, metric:string, wowPct:number}|null>}
 */
export async function checkWoWAlertForRole({ supabase, projectId, role }) {
  const metric = PRIMARY_METRIC_FOR_ROLE[role];
  if (!metric) return null;

  try {
    const { data, error } = await supabase
      .from("clevel_trend_snapshots")
      .select(`snapshot_date, ${metric}`)
      .eq("project_id", projectId)
      .eq("role", role)
      .not(metric, "is", null)
      .order("snapshot_date", { ascending: false })
      .limit(12);

    if (error || !data || data.length < 2) return null;

    // data[0] = most recent, data[1] = previous week
    const latest = Number(data[0][metric]);
    const prev = Number(data[1][metric]);
    if (!Number.isFinite(latest) || !Number.isFinite(prev) || prev === 0) return null;

    const wowPct = ((latest - prev) / Math.abs(prev)) * 100;

    const isCritical = GOOD_IS_SMALLER.has(metric)
      ? wowPct >= Math.abs(WOW_ALERT_THRESHOLD_PCT) // rise is bad
      : wowPct <= WOW_ALERT_THRESHOLD_PCT; // drop is bad

    if (!isCritical) return null;

    return { role, metric, wowPct: Math.round(wowPct * 10) / 10 };
  } catch (err) {
    console.warn(
      `[nightly-clevel-review] WoW check failed for ${role}: ${err.message}`,
    );
    return null;
  }
}

/**
 * After all personas run: check WoW alerts and send Telegram for any critical.
 * Skips entirely if TELEGRAM_CHAT_ID is unset or no DB client is available.
 *
 * @param {object} opts
 * @param {string} opts.projectId   - projects.id UUID
 * @param {string[]} opts.roles     - roles that ran successfully
 */
export async function routeWoWAlertsToTelegram({ projectId, roles }) {
  // Read TELEGRAM_CHAT_ID at call-time so tests can inject it via process.env.
  const telegramChatId = process.env.TELEGRAM_CHAT_ID ?? TELEGRAM_CHAT_ID;
  if (!telegramChatId) {
    console.log("[nightly-clevel-review] WoW alerts: TELEGRAM_CHAT_ID not set, skipping");
    return;
  }
  const supabase = await getSupabaseClient();
  if (!supabase) {
    console.log("[nightly-clevel-review] WoW alerts: no Supabase client, skipping");
    return;
  }

  const alertRoles = roles.filter((r) => WOW_ALERT_ROLES.includes(r));
  if (alertRoles.length === 0) {
    console.log("[nightly-clevel-review] WoW alerts: no eligible roles ran, skipping");
    return;
  }

  const checks = await Promise.all(
    alertRoles.map((role) => checkWoWAlertForRole({ supabase, projectId, role })),
  );
  const criticals = checks.filter(Boolean);

  if (criticals.length === 0) {
    console.log("[nightly-clevel-review] WoW alerts: no critical WoW drops detected");
    return;
  }

  for (const alert of criticals) {
    const direction = GOOD_IS_SMALLER.has(alert.metric) ? "rose" : "dropped";
    const absPct = Math.abs(alert.wowPct);
    const msg =
      `⚠️ BlockID Alert: ${alert.role.toUpperCase()} ${alert.metric} ${direction} ${absPct}% WoW. Review recommended.`;
    console.log(`[nightly-clevel-review] sending WoW alert: ${msg}`);
    await sendTelegram(msg);
  }
}

function buildTelegramMessage({ date, version, digestBody, written, skipped }) {
  // Extract the overall status line from the digest if possible.
  const statusMatch = digestBody.match(/## Overall Status:\s*(.+)/);
  const overallStatus = statusMatch ? statusMatch[1].trim() : "UNKNOWN";

  // Extract action items
  const actionsMatch = digestBody.match(/## Critical Action Items\n\n([\s\S]*?)(\n##|$)/);
  const actionsRaw = actionsMatch ? actionsMatch[1].trim() : "";
  const actions = actionsRaw
    .split("\n")
    .filter((l) => l.match(/^\d+\./))
    .slice(0, 3)
    .join("\n");

  const statusEmoji = overallStatus.includes("RED") ? "🔴" : overallStatus.includes("GREEN") ? "🟢" : "🟡";

  return `${statusEmoji} *BlockID Nightly Review — ${date}*
Version: \`${version}\`
Roles reviewed: ${written.join(", ")} ${skipped.length > 0 ? `(skipped: ${skipped.join(", ")})` : ""}

*Overall: ${overallStatus}*

*Top actions:*
${actions || "No critical actions."}

_Full reports in web/content/reports/_`;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv);

  const today = new Date();
  const date = today.toISOString().slice(0, 10); // YYYY-MM-DD

  const wantLive = !args.stub && !!process.env.ANTHROPIC_API_KEY;
  const cheapMode = process.env.CLEVEL_REVIEW_CHEAP === "1";
  const model = cheapMode ? MODEL_CHEAP : MODEL_DEFAULT;

  const modeLabel = wantLive
    ? `live (model=${model}${cheapMode ? " CHEAP" : ""})`
    : args.stub
      ? "stub (forced via --stub)"
      : "stub (ANTHROPIC_API_KEY not set)";

  const runMode = args.versionMode ? "version-mode" : "nightly";

  console.log(
    `[nightly-clevel-review] run-mode=${runMode} date=${date} exec=${args.dryRun ? "dry-run" : "write"} llm=${modeLabel}`,
  );

  ensureReportsDir(args.dryRun);

  let client = null;
  if (wantLive) {
    const Anthropic = await loadAnthropicSDK();
    client = new Anthropic();
  }

  // Version-mode: use version.json + manifest evidence (legacy T-1100 approach).
  if (args.versionMode) {
    const version = readVersion();
    let manifest = null;
    if (wantLive) {
      manifest = loadManifest();
    }
    const targets = args.persona ? [args.persona] : PERSONAS;
    const written = [];
    const skipped = [];
    const perPersonaCosts = [];
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCostUsd = 0;
    const timestamp = new Date().toISOString();

    for (const persona of targets) {
      const outPath = join(REPORTS_DIR, `${persona}-review-${version}.md`);
      if (existsSync(outPath)) {
        console.log(`[nightly-clevel-review] skip ${persona}: ${outPath} already exists for ${version}`);
        skipped.push(persona);
        continue;
      }
      const prior = findPriorReview(persona);
      let body;
      let personaMeta = { persona, tokens_in: 0, tokens_out: 0, cost_usd_estimate: 0 };

      if (wantLive) {
        try {
          const gen = await generatePersonaReview({ persona, version, prior, manifest, client, model, timestamp });
          body = gen.body;
          personaMeta = { persona, tokens_in: gen.tokensIn, tokens_out: gen.tokensOut, cost_usd_estimate: Number(gen.costUsd.toFixed(6)), model: gen.model };
          totalTokensIn += gen.tokensIn;
          totalTokensOut += gen.tokensOut;
          totalCostUsd += gen.costUsd;
        } catch (err) {
          console.error(`[nightly-clevel-review] LLM failed for ${persona}: ${err.message}. Falling back to stub.`);
          body = scaffoldMarkdown({ persona, version, prior, timestamp });
        }
      } else {
        body = scaffoldMarkdown({ persona, version, prior, timestamp });
      }

      if (args.dryRun) {
        console.log(`[nightly-clevel-review] (dry-run) would write ${outPath} (${body.length} bytes)`);
        written.push(persona);
        perPersonaCosts.push(personaMeta);
        continue;
      }
      try {
        writeFileSync(outPath, body, "utf8");
        console.log(`[nightly-clevel-review] wrote ${outPath}`);
        written.push(persona);
        perPersonaCosts.push(personaMeta);
      } catch (err) {
        console.error(`[nightly-clevel-review] failed to write ${outPath}: ${err.message}`);
        skipped.push(persona);
      }
    }

    const record = {
      ts: timestamp, version, mode: wantLive ? "live" : "stub", model: wantLive ? model : null,
      personas_written: written, personas_skipped: skipped, per_persona: perPersonaCosts,
      tokens_in: totalTokensIn, tokens_out: totalTokensOut,
      cost_usd_estimate: Number(totalCostUsd.toFixed(6)),
      duration_ms: Date.now() - startedAt, dry_run: args.dryRun, run_mode: "version",
    };
    if (args.dryRun) {
      console.log(`[nightly-clevel-review] (dry-run) history entry: ${JSON.stringify(record)}`);
    } else {
      try { appendFileSync(HISTORY_PATH, JSON.stringify(record) + "\n", "utf8"); } catch { /* ignore */ }
    }
    console.log(`[nightly-clevel-review] done: wrote=${written.length} skipped=${skipped.length} cost=US$${totalCostUsd.toFixed(4)} ms=${record.duration_ms}`);
    return;
  }

  // ── NIGHTLY MODE (default) ─────────────────────────────────────────────────
  const version = readVersion();
  const { changedFiles, diffStat } = getGitDiff24h();
  console.log(`[nightly-clevel-review] git diff last 24h: ${changedFiles.length} files changed`);

  // DB write config — optional; skipped gracefully when absent
  const DB_PROJECT_ID =
    process.env.CLEVEL_PROJECT_ID || _loadEnvVar("CLEVEL_PROJECT_ID") || null;
  const DB_STARTUP_ID =
    process.env.CLEVEL_STARTUP_ID || _loadEnvVar("CLEVEL_STARTUP_ID") || null;
  const dbEnabled = !!(DB_PROJECT_ID && DB_STARTUP_ID);
  if (dbEnabled) {
    console.log(
      `[nightly-clevel-review] DB writes enabled: project_id=${DB_PROJECT_ID} startup_id=${DB_STARTUP_ID}`,
    );
  } else {
    console.log(
      "[nightly-clevel-review] DB writes disabled (CLEVEL_PROJECT_ID / CLEVEL_STARTUP_ID not set)",
    );
  }

  const targets = args.persona ? [args.persona] : PERSONAS;
  const written = [];
  const skipped = [];
  const perPersonaCosts = [];
  const reportBodies = {}; // persona -> bodyText (for digest)
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostUsd = 0;
  const timestamp = new Date().toISOString();

  // v3.8.0 — Run all personas in parallel (Promise.all). Each personaTask is
  // self-contained (no shared mutable state during the LLM call), and we
  // reduce the per-persona meta into totals after the fact.
  const personaTasks = targets.map(async (persona) => {
    const outPath = join(REPORTS_DIR, `${persona}-nightly-${date}.md`);

    // Idempotent: skip if today's report already exists.
    if (existsSync(outPath)) {
      console.log(`[nightly-clevel-review] skip ${persona}: today's report already exists`);
      let existingBody = "";
      try { existingBody = readFileSync(outPath, "utf8"); } catch { /* ignore */ }
      return { persona, status: "skipped", body: existingBody, personaMeta: null };
    }

    const prior = findPriorNightlyReport(persona);
    let body;
    let bodyText = "";
    let personaMeta = { persona, tokens_in: 0, tokens_out: 0, cost_usd_estimate: 0 };

    if (wantLive) {
      try {
        const gen = await generateNightlyPersonaReview({
          persona, date, changedFiles, diffStat, prior, client, model, timestamp,
        });
        body = gen.body;
        bodyText = gen.bodyText;
        personaMeta = {
          persona,
          tokens_in: gen.tokensIn,
          tokens_out: gen.tokensOut,
          cost_usd_estimate: Number(gen.costUsd.toFixed(6)),
          model: gen.model,
        };
      } catch (err) {
        console.error(`[nightly-clevel-review] LLM failed for ${persona}: ${err.message}. Falling back to stub.`);
        body = scaffoldNightlyMarkdown({ persona, date, prior, timestamp });
        bodyText = body;
      }
    } else {
      body = scaffoldNightlyMarkdown({ persona, date, prior, timestamp });
      bodyText = body;
    }

    if (args.dryRun) {
      console.log(`[nightly-clevel-review] (dry-run) would write ${outPath} (${body.length} bytes)`);
      return { persona, status: "written-dry", body: bodyText, personaMeta };
    }

    try {
      writeFileSync(outPath, body, "utf8");
      console.log(`[nightly-clevel-review] wrote ${outPath}`);
      pruneOldNightlyReports(persona, false);

      // ── DB write (fail-soft) ────────────────────────────────────────────────
      let reportId = null;
      if (dbEnabled) {
        reportId = await insertReportToDb({
          projectId: DB_PROJECT_ID,
          startupId: DB_STARTUP_ID,
          role: persona,
          reportText: body,
          date,
          model: personaMeta.model ?? null,
          tokensIn: personaMeta.tokens_in,
          tokensOut: personaMeta.tokens_out,
          costUsd: personaMeta.cost_usd_estimate,
          durationMs: Date.now() - startedAt,
        });
        await insertTrendSnapshot({
          projectId: DB_PROJECT_ID,
          role: persona,
          date,
          reportId,
          reportText: body,
        });
      }

      return { persona, status: "written", body: bodyText, personaMeta, reportId };
    } catch (err) {
      console.error(`[nightly-clevel-review] failed to write ${outPath}: ${err.message}`);
      return { persona, status: "failed", body: "", personaMeta: null, error: err.message };
    }
  });

  const results = await Promise.all(personaTasks);

  for (const r of results) {
    if (r.status === "skipped" || r.status === "failed") {
      skipped.push(r.persona);
    } else {
      written.push(r.persona);
    }
    if (r.body) reportBodies[r.persona] = r.body;
    if (r.personaMeta) {
      perPersonaCosts.push(r.personaMeta);
      totalTokensIn += r.personaMeta.tokens_in ?? 0;
      totalTokensOut += r.personaMeta.tokens_out ?? 0;
      totalCostUsd += r.personaMeta.cost_usd_estimate ?? 0;
    }
  }

  // ── Digest ─────────────────────────────────────────────────────────────────
  const { digestBody } = await generateDigest({
    date, reportBodies, timestamp, client, model, dryRun: args.dryRun, version,
  });

  // ── Telegram digest ─────────────────────────────────────────────────────────
  if (!args.dryRun && written.length > 0) {
    const msg = buildTelegramMessage({ date, version, digestBody, written, skipped });
    const sent = await sendTelegram(msg);
    console.log(`[nightly-clevel-review] telegram: ${sent ? "sent" : "skipped/failed"}`);
  }

  // ── WoW trend alert routing ──────────────────────────────────────────────────
  // Only runs when DB is enabled and at least one persona wrote data.
  if (!args.dryRun && dbEnabled && written.length > 0) {
    await routeWoWAlertsToTelegram({ projectId: DB_PROJECT_ID, roles: written });
  }

  // ── History record ─────────────────────────────────────────────────────────
  const record = {
    ts: timestamp,
    date,
    version,
    run_mode: "nightly",
    mode: wantLive ? "live" : "stub",
    model: wantLive ? model : null,
    personas_written: written,
    personas_skipped: skipped,
    per_persona: perPersonaCosts,
    tokens_in: totalTokensIn,
    tokens_out: totalTokensOut,
    cost_usd_estimate: Number(totalCostUsd.toFixed(6)),
    duration_ms: Date.now() - startedAt,
    dry_run: args.dryRun,
    git_files_changed: changedFiles.length,
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

  console.log(
    `[nightly-clevel-review] done: wrote=${written.length} skipped=${skipped.length} ` +
      `tokens_in=${totalTokensIn} tokens_out=${totalTokensOut} ` +
      `cost=US$${totalCostUsd.toFixed(4)} ms=${record.duration_ms}`,
  );
}

main().catch((err) => {
  console.error(`[nightly-clevel-review] fatal: ${err.message}`);
  process.exit(1);
});
