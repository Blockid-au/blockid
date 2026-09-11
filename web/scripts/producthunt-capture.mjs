// ProductHunt gallery capture (S10-B). Usage: cd web && node scripts/producthunt-capture.mjs [baseUrl]
// Captures at 1440x900 (light theme, reduced motion), crops top 1440x(760*1440/1270) then resizes to 1270x760.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://127.0.0.1:4001').replace(/\/$/, '');
if (/blockid\.au/i.test(BASE)) throw new Error('refusing to capture production; use localhost');
const OUT = new URL('../public/producthunt/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { file: 'gallery-01-home.png', path: '/?hero=F1' },
  { file: 'gallery-02-funding.png', path: '/funding' },
  { file: 'gallery-03-funding-report-demo.png', path: '/funding/report/demo' },
  { file: 'gallery-04-pricing.png', path: '/pricing?segment=evaluator', scrollTo: 'text=/^Scout$/', offset: 325 },
  { file: 'gallery-05-compare-chatgpt.png', path: '/compare/chatgpt', scrollTo: 'table', offset: 140 },
  { file: 'gallery-06-program-sydney.png', path: '/funding/programs/sydney' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-AU', timezoneId: 'Australia/Sydney', reducedMotion: 'reduce', colorScheme: 'light' });
const page = await ctx.newPage();
const manifest = [];
for (const s of SHOTS) {
  await page.goto(BASE + s.path, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.removeItem('blockid_theme'); } catch {} document.documentElement.classList.remove('dark'); });
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  // Dismiss the analytics consent banner (Reject persists in localStorage), hide the reopen chip + sticky trial CTA.
  const reject = page.locator('[aria-label="Analytics consent"] button:has-text("Reject")').first();
  if (await reject.isVisible().catch(() => false)) await reject.click().catch(() => {});
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important} nextjs-portal,[aria-label="Analytics consent"],[aria-label="Open cookie preferences"],div.pointer-events-none.fixed.bottom-0{display:none!important}' }).catch(() => {});
  if (s.scrollTo) {
    const y = await page.locator(s.scrollTo).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY).catch(() => 0);
    await page.evaluate((top) => window.scrollTo(0, top), Math.max(0, y - (s.offset || 0)));
  }
  await page.waitForTimeout(400);
  const raw = await page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' });
  const cropH = Math.round(760 * 1440 / 1270); // 862
  const out = join(OUT, s.file);
  await sharp(raw).extract({ left: 0, top: 0, width: 1440, height: cropH }).resize(1270, 760).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(out);
  const capturedAt = new Date().toISOString();
  manifest.push({ ...s, capturedAt });
  console.log(`${s.file} <- ${s.path} @ ${capturedAt}`);
}
await browser.close();
writeFileSync(join(OUT, '.capture.json'), JSON.stringify(manifest, null, 2));
