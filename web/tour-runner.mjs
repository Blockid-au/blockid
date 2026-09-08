import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES = [
  { host: 'https://blockid.au', path: '/', name: '01-home' },
  { host: 'https://blockid.au', path: '/analyze', name: '02-analyze-free' },
  { host: 'https://blockid.au', path: '/analyze?tier=paid', name: '03-analyze-paid' },
  { host: 'https://blockid.au', path: '/team', name: '04-team' },
  { host: 'https://blockid.au', path: '/changelog', name: '05-changelog' },
  { host: 'https://blockid.au', path: '/roadmap', name: '06-roadmap' },
  { host: 'https://blockid.au', path: '/docs', name: '07-docs' },
  { host: 'https://blockid.au', path: '/dashboard', name: '08-dashboard' },
  { host: 'https://startupvalueindex.com', path: '/', name: '09-svi-home' },
  { host: 'https://startupvalueindex.com', path: '/analyze', name: '10-svi-analyze' },
];

// Resolve against this file's own location, not the caller's cwd. A relative
// 'web/public/...' silently produced web/web/public/... when run from web/.
const DATE = process.env.TOUR_DATE || new Date().toISOString().slice(0, 10);
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'public/tour', DATE);
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
for (const r of ROUTES) {
  const page = await ctx.newPage();
  const url = r.host + r.path;
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    const fp = `${OUT_DIR}/${r.name}.png`;
    await page.screenshot({ path: fp, fullPage: false });
    results.push({ url, status: resp?.status(), file: fp });
    console.log('OK', resp?.status(), url);
  } catch (e) {
    results.push({ url, err: String(e).slice(0, 120) });
    console.log('ERR', url, String(e).slice(0, 120));
  } finally { await page.close(); }
}
await browser.close();
writeFileSync(`${OUT_DIR}/index.json`, JSON.stringify(results, null, 2));
console.log('DONE', results.length, 'routes');
