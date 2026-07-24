#!/usr/bin/env node
// scripts/docs/regenerate-changelog.mjs
//
// Regenerates the top of web/CHANGELOG.md by walking `git log` and
// detecting `chore(version): stamp vX.Y.Z ...` commits as version
// boundaries. Commits between two version stamps are grouped into
// Features / Fixes / Chores / Docs and rendered as a section
// per version.
//
// Idempotent: only appends sections for versions newer than the
// newest hand-authored `## v...` heading already present in the
// changelog. Hand-authored sections below that heading are preserved
// byte-for-byte.
//
// Filters out `chore(loop): autonomous tick ...` and
// `chore(loop): commit uncommitted ...` noise entirely.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CHANGELOG_PATH = path.join(REPO_ROOT, "web", "CHANGELOG.md");

// --- config ---------------------------------------------------------------

const NOISE_SUBJECT = /^chore\(loop\):\s*(autonomous tick|commit uncommitted)/i;
const VERSION_STAMP =
  /^chore\((?:version|release)\):\s*(?:stamp\s+)?(v[0-9][0-9A-Za-z.\-]*)/i;
const CONV_COMMIT =
  /^(feat|fix|chore|docs|refactor|test|perf|build|ci|style)(\(([^)]+)\))?!?:\s*(.*)$/;

// Section boundary that human authors have already touched. We never
// rewrite at or below this line. Detected as the newest `## vX...`
// header in the existing changelog.
const HAND_AUTHORED_MAX_VERSION = "v2.0.0-beta.6";

// --- helpers --------------------------------------------------------------

function git(args) {
  return execSync(`git ${args}`, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** parse `git log` into commit objects. */
function loadCommits(limit = 2500) {
  const raw = git(
    `log --no-merges -n ${limit} --pretty=format:%H%x09%aI%x09%s`,
  );
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, date, ...rest] = line.split("\t");
      return { sha, date, subject: rest.join("\t") };
    });
}

function bucketFor(subject) {
  const m = subject.match(CONV_COMMIT);
  if (!m) return "other";
  const type = m[1].toLowerCase();
  if (type === "feat") return "features";
  if (type === "fix") return "fixes";
  if (type === "docs") return "docs";
  if (type === "chore") return "chores";
  return "other";
}

function parseScope(subject) {
  const m = subject.match(CONV_COMMIT);
  if (!m) return { scope: null, msg: subject };
  return { scope: m[3] ?? null, msg: m[4] ?? subject };
}

function renderBullet({ sha, subject }) {
  const { scope, msg } = parseScope(subject);
  const sha7 = sha.slice(0, 7);
  const scopePart = scope ? `**${scope}** ` : "";
  return `- ${scopePart}${msg} (\`${sha7}\`)`;
}

/**
 * Walk commits (newest → oldest) and split into windows delimited
 * by `chore(version): stamp vX.Y.Z` commits. Everything after the
 * newest stamp becomes an "Unreleased" window; everything up to
 * (and including) HAND_AUTHORED_MAX_VERSION is stopped at.
 */
function windowsFromCommits(commits) {
  const windows = [];
  // Walking newest → oldest: current collects commits that belong to
  // the *previous* (newer) release. Initial bucket is Unreleased,
  // holding commits that landed after the newest stamp.
  let current = {
    version: null, // null → "Unreleased"
    headline: null,
    date: null,
    commits: [],
  };

  for (const c of commits) {
    const stampMatch = c.subject.match(VERSION_STAMP);
    if (stampMatch) {
      // The stamp itself is the boundary. Whatever we accumulated
      // above this stamp belongs to the *previously seen* newer
      // version — push it now.
      windows.push(current);
      // Stop once we've reached the last hand-authored version.
      if (stampMatch[1] === HAND_AUTHORED_MAX_VERSION) {
        current = null;
        break;
      }
      const parenMatch = c.subject.match(/\(([^)]+)\)\s*$/);
      current = {
        version: stampMatch[1],
        date: c.date.slice(0, 10),
        headline: parenMatch ? parenMatch[1] : null,
        commits: [],
      };
      continue;
    }
    if (NOISE_SUBJECT.test(c.subject)) continue;
    current.commits.push(c);
  }
  if (current && current.commits.length > 0) {
    windows.push(current);
  }
  return windows;
}

function renderWindow(w) {
  const buckets = { features: [], fixes: [], chores: [], docs: [], other: [] };
  for (const c of w.commits) {
    buckets[bucketFor(c.subject)].push(c);
  }

  const versionLabel = w.version ?? "Unreleased";
  const dateLabel = w.version
    ? (w.date ?? new Date().toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10);
  const headline = w.headline ? ` (${w.headline})` : "";

  const parts = [`## ${versionLabel} — ${dateLabel}${headline}`, ""];

  const totalReal =
    buckets.features.length + buckets.fixes.length + buckets.chores.length +
    buckets.docs.length + buckets.other.length;
  if (totalReal === 0) {
    parts.push("_No shipped changes in window (loop noise filtered)._");
    parts.push("");
    return parts.join("\n");
  }

  const groups = [
    ["Features", buckets.features],
    ["Fixes", buckets.fixes],
    ["Docs", buckets.docs],
    ["Chores", buckets.chores],
    ["Other", buckets.other],
  ];
  for (const [label, arr] of groups) {
    if (arr.length === 0) continue;
    parts.push(`### ${label}`);
    parts.push("");
    for (const c of arr) parts.push(renderBullet(c));
    parts.push("");
  }
  return parts.join("\n");
}

// --- entry point ----------------------------------------------------------

export function regenerateChangelog({ dryRun = false } = {}) {
  const commits = loadCommits(2500);
  const windows = windowsFromCommits(commits);

  const existing = fs.readFileSync(CHANGELOG_PATH, "utf-8");
  const anchorIndex = existing.indexOf(`## ${HAND_AUTHORED_MAX_VERSION}`);
  if (anchorIndex === -1) {
    throw new Error(
      `Cannot find anchor '## ${HAND_AUTHORED_MAX_VERSION}' in ${CHANGELOG_PATH}; refusing to rewrite.`,
    );
  }
  const preserved = existing.slice(anchorIndex);

  // Header lifted from existing file (everything before the first
  // `## ` — regardless of whether it's a version line or a
  // previously-regenerated `## Unreleased` line). Idempotent.
  const firstSectionIdx = existing.search(/^## /m);
  const header = (firstSectionIdx === -1
    ? existing
    : existing.slice(0, firstSectionIdx)
  ).trimEnd() + "\n\n";

  const newSections = windows
    .filter((w) => w.version !== HAND_AUTHORED_MAX_VERSION)
    // Skip windows with zero real commits AND no version stamp.
    .filter((w) => w.version || w.commits.length > 0)
    .map(renderWindow)
    .join("\n");

  const next = `${header}${newSections}${preserved.trimEnd()}\n`;

  if (dryRun) {
    process.stdout.write(next);
    return { changed: existing !== next };
  }
  if (existing !== next) {
    fs.writeFileSync(CHANGELOG_PATH, next, "utf-8");
  }
  return { changed: existing !== next };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dry = process.argv.includes("--dry");
  const result = regenerateChangelog({ dryRun: dry });
  if (!dry) {
    process.stderr.write(
      result.changed
        ? "regenerate-changelog: rewrote web/CHANGELOG.md\n"
        : "regenerate-changelog: no change\n",
    );
  }
}
