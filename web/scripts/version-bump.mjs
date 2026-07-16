#!/usr/bin/env node
/**
 * version-bump.mjs — BlockID Guardian G-13
 *
 * Bumps /web/content/reports/version.json (semver), refreshes git_sha /
 * task_ids / notes, and appends a section to /web/CHANGELOG.md.
 *
 * Bump-kind auto-detect from the last commit message:
 *   - major : "BREAKING CHANGE" or "feat!:"
 *   - minor : contains a T-01xx / T-02xx / T-03xx / T-04xx task ID (Goal 1-3)
 *   - patch : everything else (Guardian G-xx, docs, fixes)
 *
 * CLI:
 *   --kind=major|minor|patch    override auto-detect
 *   --dry-run                   log only, do not write files
 *
 * Exit codes:
 *   0 success, 1 error, 2 dry-run.
 *
 * Stdout: the new version string (e.g. "v1.2.3"). ship-task.sh captures this.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REPO_ROOT = '/home/dovanlong/blockid.au';
const VERSION_FILE = join(REPO_ROOT, 'web/content/reports/version.json');
const CHANGELOG_FILE = join(REPO_ROOT, 'web/CHANGELOG.md');
const CHANGELOG_HEADER = '# BlockID.au Changelog\n\n';
const TASK_ID_RE = /T-[G0-9A-Z]+/g;
const GOAL_TASK_RE = /T-0[1234]\d{2}\b/;

function parseArgs(argv) {
  const out = { kind: null, dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--kind=')) out.kind = a.slice('--kind='.length).trim();
    else if (a === '--kind' || a.startsWith('--kind ')) {
      // tolerate space form
      const idx = argv.indexOf('--kind');
      if (idx !== -1 && argv[idx + 1]) out.kind = argv[idx + 1].trim();
    }
  }
  if (out.kind && !['major', 'minor', 'patch'].includes(out.kind)) {
    throw new Error(`invalid --kind=${out.kind} (expected major|minor|patch)`);
  }
  return out;
}

function git(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function lastCommitSubject() {
  return git('git log -1 --pretty=%s');
}

function lastCommitBody() {
  return git('git log -1 --pretty=%B');
}

function currentSha() {
  return git('git rev-parse HEAD');
}

function last20CommitSubjects() {
  const raw = git('git log -20 --pretty=%H%x1f%s');
  return raw.split('\n').filter(Boolean).map((line) => {
    const [sha, subject] = line.split('\x1f');
    return { sha, subject: subject || '' };
  });
}

function detectKind(commitBody) {
  const body = commitBody || '';
  if (/BREAKING CHANGE/.test(body) || /^feat!:/m.test(body)) return 'major';
  if (GOAL_TASK_RE.test(body)) return 'minor';
  return 'patch';
}

function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec((v || '').trim());
  if (!m) throw new Error(`invalid semver: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function bumpSemver({ major, minor, patch }, kind) {
  if (kind === 'major') return `v${major + 1}.0.0`;
  if (kind === 'minor') return `v${major}.${minor + 1}.0`;
  return `v${major}.${minor}.${patch + 1}`;
}

function readVersionFile() {
  if (!existsSync(VERSION_FILE)) {
    return {
      version: 'v0.0.0',
      updated_at: new Date(0).toISOString(),
      git_sha: '',
      task_ids: [],
      notes: '',
    };
  }
  const raw = readFileSync(VERSION_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`cannot parse ${VERSION_FILE}: ${err.message}`);
  }
}

function extractTaskIds(text) {
  const found = (text || '').match(TASK_ID_RE) || [];
  return [...new Set(found)];
}

function collectRecentTaskIds(commits) {
  const seen = new Set();
  const ordered = [];
  for (const { subject } of commits) {
    for (const id of extractTaskIds(subject)) {
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
  }
  return ordered;
}

function buildChangelogSection(newVersion, isoDate, commits) {
  const date = isoDate.slice(0, 10);
  const lines = [`## ${newVersion} - ${date}`];
  const seenTaskLine = new Set();
  let any = false;
  for (const { subject } of commits) {
    const ids = extractTaskIds(subject);
    if (ids.length === 0) continue;
    const key = `${ids.join(',')}::${subject}`;
    if (seenTaskLine.has(key)) continue;
    seenTaskLine.add(key);
    lines.push(`- ${ids.join(', ')}: ${subject}`);
    any = true;
  }
  if (!any) {
    // fall back to the last commit subject so the section is not empty
    lines.push(`- ${commits[0]?.subject || '(no commits)'}`);
  }
  return lines.join('\n') + '\n\n';
}

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function appendChangelog(section) {
  let body = CHANGELOG_HEADER;
  if (existsSync(CHANGELOG_FILE)) {
    body = readFileSync(CHANGELOG_FILE, 'utf8');
    if (!body.startsWith('#')) body = CHANGELOG_HEADER + body;
    if (!body.endsWith('\n')) body += '\n';
  }
  // Insert new section right after the header block so newest is on top.
  const headerEnd = body.indexOf('\n\n');
  if (body.startsWith('# ') && headerEnd !== -1) {
    const head = body.slice(0, headerEnd + 2);
    const tail = body.slice(headerEnd + 2);
    return head + section + tail;
  }
  return body + section;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(`[version-bump] ${err.message}`);
    process.exit(1);
  }

  try {
    const current = readVersionFile();
    const parsed = parseSemver(current.version);
    const commits = last20CommitSubjects();
    const lastSubject = lastCommitSubject();
    const lastBody = lastCommitBody();
    const kind = args.kind || detectKind(lastBody);
    const newVersion = bumpSemver(parsed, kind);
    const updatedAt = new Date().toISOString();
    const sha = currentSha();
    const taskIds = collectRecentTaskIds(commits);

    const nextVersionJson = {
      ...current,
      version: newVersion,
      updated_at: updatedAt,
      git_sha: sha,
      task_ids: taskIds,
      notes: lastSubject,
    };

    const section = buildChangelogSection(newVersion, updatedAt, commits);

    if (args.dryRun) {
      console.error(`[version-bump] DRY-RUN kind=${kind} ${current.version} -> ${newVersion}`);
      console.error(`[version-bump] would write ${VERSION_FILE}`);
      console.error(JSON.stringify(nextVersionJson, null, 2));
      console.error(`[version-bump] would append to ${CHANGELOG_FILE}:`);
      console.error(section);
      console.log(newVersion);
      process.exit(2);
    }

    ensureDir(VERSION_FILE);
    writeFileSync(VERSION_FILE, JSON.stringify(nextVersionJson, null, 2) + '\n', 'utf8');

    ensureDir(CHANGELOG_FILE);
    const nextChangelog = appendChangelog(section);
    writeFileSync(CHANGELOG_FILE, nextChangelog, 'utf8');

    console.error(`[version-bump] kind=${kind} ${current.version} -> ${newVersion} sha=${sha.slice(0, 8)}`);
    console.log(newVersion);
    process.exit(0);
  } catch (err) {
    console.error(`[version-bump] ERROR: ${err.stack || err.message || err}`);
    process.exit(1);
  }
}

main();
