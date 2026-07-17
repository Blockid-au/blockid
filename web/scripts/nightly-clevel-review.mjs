#!/usr/bin/env node
/**
 * Nightly C-Level Review Orchestrator (Goal 5A — T-1100 + T-1102)
 *
 * Regenerates six per-persona review markdown files each night. T-1100 shipped
 * the scaffold path; T-1102 (this file) wires the real Anthropic Messages API
 * on top of it. The stub mode still exists for CI / no-cost runs — it activates
 * automatically when ANTHROPIC_API_KEY is not set, or when --stub is passed.
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
 *   --stub              force stub mode regardless of ANTHROPIC_API_KEY (CI-safe)
 *
 * Env:
 *   ANTHROPIC_API_KEY       enables live LLM mode when set (and --stub absent)
 *   CLEVEL_REVIEW_CHEAP=1   swap sonnet-5 -> haiku-4-5 (cost fallback)
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
  statSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PERSONAS = ["cto", "cfo", "cdo", "ciso", "cro", "cmo"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORTS_DIR = join(REPO_ROOT, "web", "content", "reports");
const VERSION_PATH = join(REPORTS_DIR, "version.json");
const HISTORY_PATH = join(REPORTS_DIR, "clevel-review-history.jsonl");
const PROMPTS_DIR = join(__dirname, "lib", "clevel-prompts");
const MANIFEST_PATH = join(__dirname, "lib", "clevel-review-manifest.json");

// Model + pricing (see docs/goal-5a-t1102-llm-wiring-notes.md for the math).
// Default target is claude-sonnet-5 per the claude-api skill; the cheap
// fallback is claude-haiku-4-5. Update these two rows when the model catalogue
// shifts — the cost estimate consumes them directly.
const MODEL_DEFAULT = "claude-sonnet-5";
const MODEL_CHEAP = "claude-haiku-4-5";
const MAX_TOKENS = 8000;
const TEMPERATURE = 0.2;

// USD per 1M tokens. Kept inline (not a JSON file) so a rate change is a
// one-line diff you can review with the rest of the wiring.
const PRICING_USD = {
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

function parseArgs(argv) {
  const args = { dryRun: false, persona: null, stub: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") {
      args.dryRun = true;
    } else if (raw === "--stub") {
      args.stub = true;
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
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
}

/**
 * Read a curated evidence file. Missing files are logged and skipped, not
 * fatal — the manifest is a hint, not a contract. This keeps the nightly job
 * green when a file is renamed between the manifest edit and the next run.
 * Individual files are capped at 60KB to avoid a single monster file
 * consuming the whole token budget.
 */
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
        `Install with: cd web && pnpm add @anthropic-ai/sdk (already in web/package.json as of v2.0.0-beta.9). ` +
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

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv);
  const version = readVersion();

  const wantLive = !args.stub && !!process.env.ANTHROPIC_API_KEY;
  const cheapMode = process.env.CLEVEL_REVIEW_CHEAP === "1";
  const model = cheapMode ? MODEL_CHEAP : MODEL_DEFAULT;

  const modeLabel = wantLive
    ? `live (model=${model}${cheapMode ? " CHEAP" : ""})`
    : args.stub
      ? "stub (forced via --stub)"
      : "stub (ANTHROPIC_API_KEY not set)";
  console.log(
    `[nightly-clevel-review] version=${version} exec=${args.dryRun ? "dry-run" : "write"} mode=${modeLabel}`,
  );

  ensureReportsDir(args.dryRun);

  let client = null;
  let manifest = null;
  if (wantLive) {
    const Anthropic = await loadAnthropicSDK();
    client = new Anthropic();
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
        const gen = await generatePersonaReview({
          persona,
          version,
          prior,
          manifest,
          client,
          model,
          timestamp,
        });
        body = gen.body;
        personaMeta = {
          persona,
          tokens_in: gen.tokensIn,
          tokens_out: gen.tokensOut,
          cost_usd_estimate: Number(gen.costUsd.toFixed(6)),
          model: gen.model,
        };
        totalTokensIn += gen.tokensIn;
        totalTokensOut += gen.tokensOut;
        totalCostUsd += gen.costUsd;
      } catch (err) {
        console.error(
          `[nightly-clevel-review] LLM call failed for ${persona}: ${err.message}. Falling back to stub for this persona.`,
        );
        body = scaffoldMarkdown({ persona, version, prior, timestamp });
      }
    } else {
      body = scaffoldMarkdown({ persona, version, prior, timestamp });
    }

    if (args.dryRun) {
      console.log(
        `[nightly-clevel-review] (dry-run) would write ${outPath} (${body.length} bytes)`,
      );
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
    ts: timestamp,
    version,
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
