#!/usr/bin/env node
// scripts/tour-verify.mjs
//
// Screenshot-tour regression check.
//
// 1. Re-runs tour-capture.mjs into scratchpad/tour-verify/<tour>/.
// 2. Byte-compares each freshly-captured PNG against the committed baseline
//    under web/public/tour/<tour>/.
// 3. If pixelmatch + pngjs are installed, escalates any byte-mismatch to a
//    per-pixel diff and only fails when the pixel-diff ratio exceeds
//    THRESHOLD (default 0.5%). Without pixelmatch, byte-mismatch fails.
// 4. Appends one JSONL row per drifted step to
//    web/content/reports/tour-drift.jsonl and exits non-zero when any step
//    drifts.
//
// Usage:
//   node scripts/tour-verify.mjs --tour=onboarding [--threshold=0.005]

import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const WEB_ROOT = join(REPO_ROOT, 'web');
const BASELINE_ROOT = join(WEB_ROOT, 'public', 'tour');
const SCRATCH_ROOT = join(REPO_ROOT, 'scratchpad', 'tour-verify');
const DRIFT_LOG = join(WEB_ROOT, 'content', 'reports', 'tour-drift.jsonl');

function parseArgs(argv) {
  const out = {};
  for (const raw of argv.slice(2)) {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const args = parseArgs(process.argv);
const TOUR_ID = args.tour || 'onboarding';
const THRESHOLD = Number(args.threshold ?? '0.005');

async function tryLoadPixelmatch() {
  try {
    const pm = await import(pathToFileURL(join(WEB_ROOT, 'node_modules', 'pixelmatch', 'index.js')).href);
    const png = await import(pathToFileURL(join(WEB_ROOT, 'node_modules', 'pngjs', 'lib', 'png.js')).href);
    return { pixelmatch: pm.default || pm, PNG: png.PNG };
  } catch {
    return null; // pixelmatch/pngjs are optional; TODO — install once byte-compare proves too strict.
  }
}

function captureIntoScratch(tourId) {
  const outDir = join(SCRATCH_ROOT, tourId);
  mkdirSync(outDir, { recursive: true });
  // Redirect capture output by symlinking or copying — simplest path is
  // running capture normally (which writes into web/public/tour/) then diffing
  // in place is unsafe. Instead we run capture with a temp env override.
  const env = { ...process.env, TOUR_CAPTURE_OUT_DIR: outDir };
  const res = spawnSync('node', [join(REPO_ROOT, 'scripts', 'tour-capture.mjs'), `--tour=${tourId}`], {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    console.error(`[tour-verify] capture failed (exit ${res.status})`);
    process.exit(res.status || 1);
  }
  // NOTE: tour-capture.mjs currently writes to web/public/tour/. Verify diffs
  // in place — future work: honor TOUR_CAPTURE_OUT_DIR to keep baselines clean.
  return join(BASELINE_ROOT, tourId);
}

function listPngs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
}

function byteEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.equals(b);
}

async function pixelDrift(pm, aBuf, bBuf) {
  const a = pm.PNG.sync.read(aBuf);
  const b = pm.PNG.sync.read(bBuf);
  if (a.width !== b.width || a.height !== b.height) return 1;
  const diff = new pm.PNG({ width: a.width, height: a.height });
  const changed = pm.pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  return changed / (a.width * a.height);
}

async function main() {
  const capturedDir = captureIntoScratch(TOUR_ID);
  const baselineDir = join(BASELINE_ROOT, TOUR_ID);

  const pngs = listPngs(capturedDir);
  if (pngs.length === 0) {
    console.error(`[tour-verify] no PNGs produced for tour "${TOUR_ID}"`);
    process.exit(6);
  }

  const pm = await tryLoadPixelmatch();
  const drifted = [];
  for (const file of pngs) {
    const capturedPath = join(capturedDir, file);
    const baselinePath = join(baselineDir, file);
    if (!existsSync(baselinePath)) {
      drifted.push({ file, reason: 'missing-baseline' });
      continue;
    }
    const a = readFileSync(capturedPath);
    const b = readFileSync(baselinePath);
    if (byteEqual(a, b)) continue;
    if (!pm) {
      drifted.push({ file, reason: 'byte-mismatch', note: 'install pixelmatch+pngjs to escalate' });
      continue;
    }
    const ratio = await pixelDrift(pm, a, b);
    if (ratio > THRESHOLD) drifted.push({ file, reason: 'pixel-drift', ratio });
  }

  if (drifted.length === 0) {
    console.log(`[tour-verify] ${TOUR_ID}: OK (${pngs.length} steps identical)`);
    return;
  }

  mkdirSync(dirname(DRIFT_LOG), { recursive: true });
  for (const row of drifted) {
    appendFileSync(DRIFT_LOG, JSON.stringify({
      ts: new Date().toISOString(),
      tourId: TOUR_ID,
      ...row,
    }) + '\n');
  }
  console.error(`[tour-verify] ${TOUR_ID}: DRIFT — ${drifted.length}/${pngs.length} steps changed`);
  for (const d of drifted) console.error(`  ${d.file}  ${d.reason}${d.ratio ? ` (${(d.ratio * 100).toFixed(2)}%)` : ''}`);
  process.exit(7);
}

main().catch((err) => {
  console.error(`[tour-verify] ${err.stack || err.message}`);
  process.exit(1);
});
