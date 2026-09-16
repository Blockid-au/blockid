#!/usr/bin/env node
// scripts/investor-update.mjs — render the monthly "Investor Update" draft
// (G14-S33) from files the crons already write. Nothing is invented: every
// figure comes from content/reports/traction-snapshot.json (daily
// /api/cron/traction-snapshot), content/reports/ai-spend-daily.json (COGS)
// and content/reports/live-qa-latest.json (release quality); a figure that
// is null / absent prints "n/a". Highlights are the last 30 days of dated
// CHANGELOG.md headings; Challenges / Ask stay `[[fill]]` for the founder.
//
//   node scripts/investor-update.mjs                 # print to stdout
//   node scripts/investor-update.mjs --write         # also write docs/marketing/investor-updates/YYYY-MM.md
//   node scripts/investor-update.mjs --month=2026-09 # pick the period (default: current UTC month)
//   node scripts/investor-update.mjs --root=/path    # repo root override (tests)
//
// Template: .claude/skills/investor-relations/SKILL.md §5 (Key Metrics /
// Highlights / Challenges / Ask / Next Month Focus). Exit 0 always, unless
// --write cannot create the file (exit 1).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** web/ */
export const WEB_DIR = resolve(__dirname, "..");
/** repo root (web/..) */
export const REPO_ROOT = resolve(WEB_DIR, "..");

export const FILL = "[[fill]]";
export const NA = "n/a";

// ─── Args ───────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const out = { write: false, month: null, root: null, help: false };
  for (const a of argv) {
    if (a === "--write") out.write = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else if (a.startsWith("--month=")) out.month = a.slice("--month=".length);
    else if (a.startsWith("--root=")) out.root = a.slice("--root=".length);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (out.month && !/^\d{4}-\d{2}$/.test(out.month)) throw new Error(`--month must be YYYY-MM, got ${out.month}`);
  return out;
}

// ─── Inputs (each optional; a missing / bad file is null) ───────────────────

export function readJsonSafe(path) {
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function readTextSafe(path) {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

export function loadInputs(root = REPO_ROOT) {
  const reports = join(root, "web", "content", "reports");
  return {
    snapshot: readJsonSafe(join(reports, "traction-snapshot.json")),
    history: readTextSafe(join(reports, "traction-history.jsonl")),
    aiSpend: readJsonSafe(join(reports, "ai-spend-daily.json")),
    liveQa: readJsonSafe(join(reports, "live-qa-latest.json")),
    changelog: readTextSafe(join(root, "web", "CHANGELOG.md")),
  };
}

// ─── Formatting (never invents a number) ────────────────────────────────────

export function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-AU") : NA;
}

export function aud(cents) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return NA;
  return `A$${(cents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
}

export function usd(v, digits = 2) {
  return typeof v === "number" && Number.isFinite(v) ? `US$${v.toFixed(digits)}` : NA;
}

export function pct(v) {
  return typeof v === "number" && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` : NA;
}

function sumRecord(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  let s = 0;
  for (const v of Object.values(r)) if (typeof v === "number" && Number.isFinite(v)) s += v;
  return s;
}

function get(obj, path) {
  let cur = obj;
  for (const k of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Month-over-month delta from the history JSONL: the last line generated before the 1st of `month`. */
export function priorSnapshotFromHistory(history, month) {
  if (!history) return null;
  const cutoff = Date.parse(`${month}-01T00:00:00Z`);
  if (!Number.isFinite(cutoff)) return null;
  let best = null;
  for (const line of history.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const t = Date.parse(row?.generated_at ?? "");
    if (!Number.isFinite(t) || t >= cutoff) continue;
    if (!best || t > Date.parse(best.generated_at)) best = row;
  }
  return best;
}

function delta(nowV, prevV) {
  if (typeof nowV !== "number" || typeof prevV !== "number" || !Number.isFinite(nowV) || !Number.isFinite(prevV)) return null;
  return nowV - prevV;
}

function momPct(nowV, prevV) {
  if (typeof nowV !== "number" || typeof prevV !== "number" || !Number.isFinite(nowV) || !Number.isFinite(prevV) || prevV === 0) return null;
  return ((nowV - prevV) / prevV) * 100;
}

// ─── Highlights from CHANGELOG.md ───────────────────────────────────────────

/** Dated `##` / `###` headings within the last `days` days of `now` (newest first, de-duplicated). */
export function changelogHighlights(changelog, now = new Date(), days = 30, max = 8) {
  if (!changelog) return [];
  const cutoff = now.getTime() - days * 86_400_000;
  const out = [];
  const seen = new Set();
  const re = /^#{2,3}\s+(?:[^\n]*?)(\d{4}-\d{2}-\d{2})\s*[:—–-]\s*([^\n]+)$/gm;
  let m;
  while ((m = re.exec(changelog))) {
    const t = Date.parse(`${m[1]}T00:00:00Z`);
    if (!Number.isFinite(t) || t < cutoff || t > now.getTime() + 86_400_000) continue;
    const text = m[2].trim().replace(/\s+/g, " ");
    const key = `${m[1]}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date: m[1], text });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out.slice(0, max);
}

// ─── Render ─────────────────────────────────────────────────────────────────

function tree(lines) {
  if (lines.length === 0) return `└── ${NA}`;
  return lines.map((l, i) => `${i === lines.length - 1 ? "└──" : "├──"} ${l}`).join("\n");
}

export function monthLabel(month) {
  const [y, mo] = month.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function currentMonth(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function render(inputs, opts = {}) {
  const now = opts.now ?? new Date();
  const month = opts.month ?? currentMonth(now);
  const s = inputs.snapshot ?? null;
  const prev = priorSnapshotFromHistory(inputs.history, month);

  const mrrSubs = get(s, "mrr_aud_cents.from_subscriptions");
  const mrrRev = get(s, "mrr_aud_cents.from_revenue_events");
  const reconciled = get(s, "mrr_aud_cents.stripe_reconciled");
  const users = get(s, "users.total");
  const founders = get(s, "users.founders");
  const evaluators = sumRecord(get(s, "users.evaluators_by_plan"));
  const paying = sumRecord(get(s, "evaluators.paying_by_plan"));
  const trials = get(s, "evaluators.trials");
  const svi = get(s, "analyses.svi_analyses");
  const guestPaid = get(s, "analyses.guest_analyses_paid");
  const tbr = get(s, "tbr.purchased");
  const tbrShared = get(s, "tbr.shared");
  const tbrViews = get(s, "tbr.views");
  const assessments = get(s, "assessments.submitted");
  const apiKeys = get(s, "api_keys_active");
  const webhooks = get(s, "webhooks_active");
  const excluded = get(s, "users.excluded_count");
  const warnings = Array.isArray(get(s, "warnings")) ? get(s, "warnings") : [];

  const mrrMom = momPct(mrrSubs, get(prev, "mrr_aud_cents.from_subscriptions"));
  const usersNew = delta(users, get(prev, "users.total"));
  const sviNew = delta(svi, get(prev, "analyses.svi_analyses"));

  const spend = inputs.aiSpend;
  const cogsLine = spend
    ? `AI COGS (${spend.day ?? NA}): ${usd(spend.spent_usd, 4)} over ${num(spend.calls)} calls` +
      (typeof spend.spent_usd === "number" && typeof spend.calls === "number" && spend.calls > 0 ? ` (${usd(spend.spent_usd / spend.calls, 5)} / call)` : "")
    : `AI COGS: ${NA}`;

  const qa = inputs.liveQa;
  const qaLine = qa
    ? `Live QA (${typeof qa.ts === "string" ? qa.ts.slice(0, 10) : NA}): ${num(qa.passed)} passed · ${num(qa.failed)} failed · ${num(qa.skipped)} skipped${qa.exitCode === 0 ? " · green" : ""}`
    : `Live QA: ${NA}`;

  const highlights = changelogHighlights(inputs.changelog, now);

  const metrics = [
    `MRR: ${aud(mrrSubs)} (${mrrMom === null ? `MoM ${NA}` : `${pct(mrrMom)} MoM`}) — subscriptions; revenue events 30d ${aud(mrrRev)}; Stripe reconciled: ${reconciled === true ? "yes" : reconciled === false ? "NO" : NA}`,
    `Users: ${num(users)} (${usersNew === null ? `new ${NA}` : `${usersNew >= 0 ? "+" : ""}${num(usersNew)} new`}) — ${num(founders)} founders · ${num(evaluators)} evaluator seats · ${num(paying)} paying · ${num(trials)} on trial`,
    `SVI Analyses: ${num(svi)} total (${sviNew === null ? `this month ${NA}` : `${sviNew >= 0 ? "+" : ""}${num(sviNew)} this month`}) · ${num(guestPaid)} paid A$3 guest reports`,
    `Trust Business Reports: ${num(tbr)} purchased · ${num(tbrShared)} shared · ${num(tbrViews)} views · ${num(assessments)} evaluator assessments`,
    `Integrations: ${num(apiKeys)} active API keys · ${num(webhooks)} active webhooks`,
    cogsLine,
    qaLine,
    `Net Promoter Score: ${NA}`,
  ];

  const highlightLines = highlights.length ? highlights.map((h) => `${h.date} — ${h.text}`) : [`${NA} (no dated CHANGELOG.md headings in the last 30 days)`];

  const provenance = [
    s ? `traction-snapshot.json generated ${get(s, "generated_at") ?? NA}${get(s, "git_sha") ? ` @ ${String(get(s, "git_sha")).slice(0, 10)}` : ""}` : `traction-snapshot.json: ${NA} (run /api/cron/traction-snapshot)`,
    `QA / seeded / erased accounts excluded from every user figure: ${num(excluded)}`,
    prev ? `Month-over-month baseline: traction-history.jsonl line generated ${prev.generated_at}` : `Month-over-month baseline: ${NA} (no history line before ${month}-01)`,
    ...(warnings.length ? [`Snapshot warnings (${warnings.length}): ${warnings.slice(0, 5).join(" · ")}${warnings.length > 5 ? " · …" : ""}`] : []),
  ];

  const body = `Subject: BlockID.au — ${monthLabel(month)} Update

Key Metrics:
${tree(metrics)}

Highlights:
${tree(highlightLines)}

Challenges:
├── ${FILL} (challenge 1 + mitigation)
└── ${FILL} (challenge 2 + mitigation)

Ask:
├── ${FILL} (intro request)
├── ${FILL} (hiring need)
└── ${FILL} (partnership opportunity)

Next Month Focus:
├── ${FILL} (priority 1)
├── ${FILL} (priority 2)
└── ${FILL} (priority 3)

---
Provenance (do not send):
${tree(provenance)}
Generated ${now.toISOString()} by web/scripts/investor-update.mjs — figures marked ${NA} were not measurable; never replace them with an estimate.
`;
  return { month, body, highlights, metrics, hasSnapshot: !!s };
}

export function outputPath(root, month) {
  return join(root, "docs", "marketing", "investor-updates", `${month}.md`);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2), deps = {}) {
  const out = deps.stdout ?? ((t) => process.stdout.write(t));
  const err = deps.stderr ?? ((t) => process.stderr.write(`${t}\n`));
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    err(e.message);
    return 1;
  }
  if (args.help) {
    out("usage: node scripts/investor-update.mjs [--write] [--month=YYYY-MM] [--root=<repo>]\n  prints the Investor Update draft; --write also saves docs/marketing/investor-updates/YYYY-MM.md\n");
    return 0;
  }
  const root = args.root ? resolve(args.root) : deps.root ?? REPO_ROOT;
  const inputs = deps.inputs ?? loadInputs(root);
  const now = deps.now ?? new Date();
  const result = render(inputs, { month: args.month ?? undefined, now });
  out(result.body);
  if (!result.hasSnapshot) err(`investor-update: no traction-snapshot.json under ${root}/web/content/reports — every figure is ${NA}`);
  if (args.write) {
    const file = outputPath(root, result.month);
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `# Investor Update — ${monthLabel(result.month)}\n\n\`\`\`\n${result.body}\`\`\`\n`);
      err(`investor-update: wrote ${file}`);
    } catch (e) {
      err(`investor-update: write failed — ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
  }
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`investor-update: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
      process.exit(1);
    },
  );
}
