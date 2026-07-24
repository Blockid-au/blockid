#!/usr/bin/env node
// scripts/docs/regenerate-team-page.mjs
//
// Rebuilds web/content/team-roster.json + web/content/team/{slug}.json
// from `.claude/skills/{slug}/SKILL.md` front-matter and last-30-day
// activity reports under `web/content/reports/`.
//
// Fails loudly if any of the 11 expected slugs is missing a SKILL.md.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SKILLS_DIR = path.join(REPO_ROOT, ".claude", "skills");
const REPORTS_DIR = path.join(REPO_ROOT, "web", "content", "reports");
const OUT_ROSTER = path.join(REPO_ROOT, "web", "content", "team-roster.json");
const OUT_DIR = path.join(REPO_ROOT, "web", "content", "team");

// Canonical slug order — used by /team page rendering.
const SLUGS = [
  "cdo",
  "cfo",
  "chro",
  "ciso",
  "clo",
  "cmo",
  "coo",
  "cpo",
  "cro",
  "cto",
  "customer-success",
];

const ROLE_LABELS = {
  cdo: "Chief Data Officer",
  cfo: "Chief Financial Officer",
  chro: "Chief People Officer",
  ciso: "Chief Information Security Officer",
  clo: "Chief Legal Officer",
  cmo: "Chief Marketing Officer",
  coo: "Chief Operating Officer",
  cpo: "Chief Product Officer",
  cro: "Chief Revenue Officer",
  cto: "Chief Technology Officer",
  "customer-success": "Customer Success Lead",
};

// KPIs each role publishes into their daily report / dashboard tile.
const ROLE_KPIS = {
  cdo: ["SVI scoring reliability", "Data pipeline uptime", "AI hallucination rate"],
  cfo: ["MRR / ARR (net)", "Unit economics (CAC, LTV)", "Runway"],
  chro: ["ESOP vesting progress", "Team health", "Div 83A compliance"],
  ciso: ["SOC2 posture", "Portal auth gates", "Incident MTTR"],
  clo: ["AU compliance coverage", "Contract review SLA", "Disclaimer freshness"],
  cmo: ["SEO impressions", "GA4 funnel deltas", "Content pipeline"],
  coo: ["Deploy frequency", "Cron health", "Sprint velocity"],
  cpo: ["Feature ship rate", "UX research cadence", "Roadmap alignment"],
  cro: ["Trial→Paid rate", "Churn %", "Save-offer accept rate"],
  cto: ["Build health", "Tech-debt burndown", "P95 latency"],
  "customer-success": ["NPS", "Onboarding completion", "Support MTTR"],
};

// --- SKILL.md front-matter parser ----------------------------------------

function parseSkill(slug) {
  const p = path.join(SKILLS_DIR, slug, "SKILL.md");
  if (!fs.existsSync(p)) {
    throw new Error(`Missing SKILL.md for slug "${slug}" at ${p}`);
  }
  const raw = fs.readFileSync(p, "utf-8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const front = {};
  let body = raw;
  if (fmMatch) {
    body = fmMatch[2] ?? "";
    for (const line of fmMatch[1].split("\n")) {
      const m = line.match(/^([a-zA-Z0-9_-]+):\s*"?(.*?)"?\s*$/);
      if (m) front[m[1]] = m[2];
    }
  }
  // Description tagline: front-matter description or first non-heading paragraph.
  let tagline = front.description ?? "";
  if (!tagline) {
    for (const para of body.split(/\n\s*\n/)) {
      const t = para.trim();
      if (!t || t.startsWith("#")) continue;
      tagline = t.replace(/\s+/g, " ");
      break;
    }
  }
  // First line of body (# heading) becomes title.
  const titleMatch = body.match(/^#\s+(.+?)\s*$/m);
  const title = titleMatch ? titleMatch[1] : ROLE_LABELS[slug] ?? slug;
  return { slug, title, tagline, body };
}

// --- last-30-day activity from web/content/reports ------------------------

function activityFor(slug, now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const entries = [];
  if (!fs.existsSync(REPORTS_DIR)) return { total30d: 0, entries };
  const files = fs.readdirSync(REPORTS_DIR);
  const dailyRe = new RegExp(`^${slug}-daily-(\\d{4}-\\d{2}-\\d{2})\\.md$`);
  for (const f of files) {
    const m = f.match(dailyRe);
    if (!m) continue;
    const date = m[1];
    if (date < cutoffIso) continue;
    entries.push({ date, title: `Daily report — ${date}`, file: f });
  }
  // Also fold in history JSONL if it exists (one line per entry).
  const historyFile = path.join(REPORTS_DIR, `${slug}-history.jsonl`);
  if (fs.existsSync(historyFile)) {
    const lines = fs.readFileSync(historyFile, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        const date = (row.date ?? row.ts ?? row.at ?? "").slice(0, 10);
        if (!date || date < cutoffIso) continue;
        entries.push({
          date,
          title: row.title ?? row.subject ?? row.event ?? "entry",
          file: `${slug}-history.jsonl`,
        });
      } catch {
        // ignore malformed lines
      }
    }
  }
  entries.sort((a, b) => (a.date > b.date ? -1 : 1));
  return { total30d: entries.length, entries };
}

// --- entry point ----------------------------------------------------------

export function regenerateTeamPage({ dryRun = false } = {}) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const missing = SLUGS.filter(
    (s) => !fs.existsSync(path.join(SKILLS_DIR, s, "SKILL.md")),
  );
  if (missing.length > 0) {
    throw new Error(
      `regenerate-team-page: missing SKILL.md for slugs: ${missing.join(", ")}`,
    );
  }

  const now = new Date();
  const roster = [];
  const changed = [];
  for (const slug of SLUGS) {
    const skill = parseSkill(slug);
    const act = activityFor(slug, now);
    const role = ROLE_LABELS[slug] ?? skill.title;
    const kpis = ROLE_KPIS[slug] ?? [];
    const rosterRow = {
      slug,
      role,
      tagline: skill.tagline,
      last30d_count: act.total30d,
      latest_activity_date:
        act.entries.length > 0 ? act.entries[0].date : null,
    };
    roster.push(rosterRow);

    const detail = {
      slug,
      role,
      title: skill.title,
      tagline: skill.tagline,
      description: skill.body.split(/\n\s*\n/).slice(0, 2).join("\n\n").trim(),
      kpis,
      last30d_count: act.total30d,
      activity: act.entries.slice(0, 10),
    };
    const outFile = path.join(OUT_DIR, `${slug}.json`);
    const nextJson = JSON.stringify(detail, null, 2) + "\n";
    const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf-8") : null;
    if (!dryRun && prev !== nextJson) {
      fs.writeFileSync(outFile, nextJson, "utf-8");
      changed.push(outFile);
    }
  }

  const nextRoster = JSON.stringify(roster, null, 2) + "\n";
  const prevRoster = fs.existsSync(OUT_ROSTER)
    ? fs.readFileSync(OUT_ROSTER, "utf-8")
    : null;
  if (!dryRun && prevRoster !== nextRoster) {
    fs.writeFileSync(OUT_ROSTER, nextRoster, "utf-8");
    changed.push(OUT_ROSTER);
  }
  return { changed, roster };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dry = process.argv.includes("--dry");
  const result = regenerateTeamPage({ dryRun: dry });
  process.stderr.write(
    `regenerate-team-page: ${result.roster.length} roster rows, ${result.changed.length} file(s) changed\n`,
  );
}
