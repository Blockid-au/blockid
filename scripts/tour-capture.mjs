#!/usr/bin/env node
// scripts/tour-capture.mjs
//
// Playwright-based screenshot tour capture driver.
//
// Reads the FEATURE_TOURS registry (web/src/lib/product-tour/feature-tours.ts
// preferred, falling back to web/src/lib/tours/feature-tours.ts, and finally an
// in-file hardcoded registry with a single "onboarding" tour). For each step
// of the selected tour it navigates, waits for a data-testid, blurs any
// masked selectors, hides the caret, disables animations and writes a PNG to
// web/public/tour/<tour-id>/step-<id>.png alongside a manifest.json.
//
// Usage:
//   node scripts/tour-capture.mjs --tour=onboarding [--baseUrl=http://localhost:3000]
//                                 [--role=founder] [--headed] [--allow-staging]
//
// Base URL allow-list: localhost, 127.0.0.1, *.local, staging.blockid.au
// (only with --allow-staging). Production blockid.au is always refused.
//
// Chromium is NOT installed by this script — if the binary is missing the
// driver prints the exact bootstrap command and exits non-zero.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const WEB_ROOT = join(REPO_ROOT, 'web');
const PUBLIC_TOUR_ROOT = join(WEB_ROOT, 'public', 'tour');

// ---------- args ----------
function parseArgs(argv) {
  const out = { headed: false, allowStaging: false };
  for (const raw of argv.slice(2)) {
    if (raw === '--headed') { out.headed = true; continue; }
    if (raw === '--allow-staging') { out.allowStaging = true; continue; }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const args = parseArgs(process.argv);
const TOUR_ID = args.tour || 'onboarding';
const BASE_URL = (args.baseUrl || process.env.TOUR_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ROLE = args.role || 'founder';

// ---------- baseUrl allow-list ----------
function assertAllowedBaseUrl(url, allowStaging) {
  let host;
  try { host = new URL(url).hostname; }
  catch { throw new Error(`Invalid --baseUrl: ${url}`); }

  if (host === 'blockid.au' || host === 'www.blockid.au') {
    throw new Error(`Refusing to capture against production (${host}). Tour capture is only allowed against localhost / staging.`);
  }
  const allowed =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local') ||
    (allowStaging && host === 'staging.blockid.au');
  if (!allowed) {
    throw new Error(`Base URL host "${host}" not in allow-list (localhost, 127.0.0.1, *.local${allowStaging ? ', staging.blockid.au' : ''}).`);
  }
}

// ---------- git sha ----------
function getGitSha() {
  try { return execSync('git rev-parse HEAD', { cwd: REPO_ROOT }).toString().trim(); }
  catch { return 'unknown'; }
}

// ---------- registry loading ----------
const FALLBACK_TOURS = [
  {
    id: 'onboarding',
    title: 'Onboarding walkthrough',
    requiresAuth: false,
    role: 'founder',
    steps: [
      { id: '01-home', path: '/', waitFor: 'body', caption: 'Landing page' },
      { id: '02-pricing', path: '/pricing', waitFor: 'body', caption: 'Pricing overview' },
      { id: '03-dashboard', path: '/dashboard', waitFor: 'body', caption: 'Founder dashboard' },
    ],
  },
];

async function loadFeatureTours() {
  const candidates = [
    join(WEB_ROOT, 'src', 'lib', 'product-tour', 'feature-tours.ts'),
    join(WEB_ROOT, 'src', 'lib', 'tours', 'feature-tours.ts'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      // tsx-registered import (project already uses tsx elsewhere).
      const tsxRegister = join(WEB_ROOT, 'node_modules', 'tsx', 'esm', 'index.mjs');
      if (existsSync(tsxRegister)) {
        const { register } = await import('node:module');
        register(pathToFileURL(tsxRegister).href, pathToFileURL(__filename));
      }
      const mod = await import(pathToFileURL(file).href);
      if (Array.isArray(mod.FEATURE_TOURS) && mod.FEATURE_TOURS.length > 0) {
        return mod.FEATURE_TOURS;
      }
    } catch (err) {
      console.warn(`[tour-capture] could not load ${file}: ${err.message}`);
    }
  }
  console.warn('[tour-capture] using hardcoded fallback registry (no feature-tours.ts found).');
  return FALLBACK_TOURS;
}

// ---------- playwright bootstrap ----------
async function loadPlaywright() {
  const tryPaths = [
    join(WEB_ROOT, 'node_modules', 'playwright', 'index.mjs'),
    join(REPO_ROOT, 'node_modules', 'playwright', 'index.mjs'),
  ];
  for (const p of tryPaths) {
    if (existsSync(p)) {
      return await import(pathToFileURL(p).href);
    }
  }
  try { return await import('playwright'); }
  catch (err) {
    console.error('[tour-capture] Playwright is not installed. Install it with:');
    console.error('  cd web && npm install --save-dev playwright');
    process.exit(2);
  }
}

async function preflightChromium(chromium) {
  try {
    const exe = chromium.executablePath();
    if (!exe || !existsSync(exe)) throw new Error(`missing binary: ${exe}`);
  } catch (err) {
    console.error('[tour-capture] Chromium binary is not installed for Playwright.');
    console.error('Bootstrap it once with:');
    console.error('  npx playwright install chromium');
    console.error(`(underlying error: ${err.message})`);
    process.exit(3);
  }
}

// ---------- dev-server health ----------
async function healthCheck(baseUrl) {
  try {
    const res = await fetch(baseUrl + '/');
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    console.error(`[tour-capture] dev-server unreachable at ${baseUrl} (${err.message}).`);
    console.error('Start it with:  cd web && npm run dev');
    process.exit(4);
  }
}

// ---------- auth ----------
async function authenticate(context, page, baseUrl) {
  const email = process.env.DEMO_FOUNDER_EMAIL;
  const password = process.env.DEMO_FOUNDER_PASSWORD;
  if (!email || !password) {
    console.warn('[tour-capture] DEMO_FOUNDER_EMAIL / DEMO_FOUNDER_PASSWORD not set — running unauthenticated.');
    console.warn('  If your tour needs a signed-in user, seed a demo account via scripts/create-test-accounts.ts.');
    return false;
  }
  try {
    const res = await page.request.post(baseUrl + '/api/auth/dev-login', {
      data: { email, password, role: ROLE },
    });
    if (!res.ok()) throw new Error(`dev-login returned ${res.status()}`);
    return true;
  } catch (err) {
    console.warn(`[tour-capture] dev-login failed (${err.message}) — continuing unauthenticated.`);
    return false;
  }
}

// ---------- capture ----------
async function captureTour(tour) {
  const { chromium, devices: _devices } = await loadPlaywright();
  await preflightChromium(chromium);
  await healthCheck(BASE_URL);

  const outDir = join(PUBLIC_TOUR_ROOT, tour.id);
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.addStyleTag({
    content: `*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }`,
  }).catch(() => {});

  if (tour.requiresAuth) await authenticate(context, page, BASE_URL);

  const stepManifest = [];
  for (const step of tour.steps) {
    const stepViewport = step.viewport;
    if (stepViewport) await page.setViewportSize(stepViewport);

    const url = new URL(step.path, BASE_URL).toString();
    console.log(`[tour-capture] ${tour.id}/${step.id} → ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    if (step.clickBefore) {
      try { await page.click(step.clickBefore, { timeout: 5000 }); }
      catch (err) { console.warn(`  clickBefore(${step.clickBefore}) failed: ${err.message}`); }
    }
    if (step.waitFor) {
      try { await page.waitForSelector(step.waitFor, { timeout: 10000 }); }
      catch (err) { console.warn(`  waitFor(${step.waitFor}) failed: ${err.message}`); }
    }
    if (Array.isArray(step.mask) && step.mask.length) {
      const css = step.mask.map((sel) => `${sel} { filter: blur(6px) !important; }`).join('\n');
      await page.addStyleTag({ content: css }).catch(() => {});
    }
    if (step.hover) {
      try { await page.hover(step.hover, { timeout: 3000 }); } catch { /* ignore */ }
    }

    const outFile = join(outDir, `step-${step.id}.png`);
    await page.screenshot({
      path: outFile,
      fullPage: step.fullPage !== false,
      animations: 'disabled',
      caret: 'hide',
    });

    stepManifest.push({
      id: step.id,
      path: step.path,
      caption: step.caption || '',
      file: `step-${step.id}.png`,
    });
  }

  const manifest = {
    tourId: tour.id,
    title: tour.title,
    role: tour.role || ROLE,
    baseUrl: BASE_URL,
    gitSha: getGitSha(),
    capturedAt: new Date().toISOString(),
    steps: stepManifest,
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[tour-capture] wrote ${stepManifest.length} PNGs + manifest.json to ${outDir}`);

  await context.close();
  await browser.close();
}

// ---------- main ----------
async function main() {
  assertAllowedBaseUrl(BASE_URL, args.allowStaging);
  const registry = await loadFeatureTours();

  if (TOUR_ID === 'list') {
    console.log('Available tours:');
    for (const t of registry) console.log(`  - ${t.id}  ${t.title || ''}`);
    return;
  }

  const targets = TOUR_ID === 'all' ? registry : registry.filter((t) => t.id === TOUR_ID);
  if (targets.length === 0) {
    console.error(`[tour-capture] no tour matched --tour=${TOUR_ID}. Available: ${registry.map((t) => t.id).join(', ')}`);
    process.exit(5);
  }
  for (const tour of targets) await captureTour(tour);
}

main().catch((err) => {
  console.error(`[tour-capture] ${err.stack || err.message}`);
  process.exit(1);
});
