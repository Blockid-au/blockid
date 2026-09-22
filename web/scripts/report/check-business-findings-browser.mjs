// Offline, synthetic browser acceptance. No application server, accounts or paid calls.
// Run: node scripts/report/check-business-findings-browser.mjs
import { build } from "esbuild";
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../", import.meta.url));
const scratch = await fs.mkdtemp(
  join(tmpdir(), "blockid-findings-acceptance-"),
);
const fixturePath = join(scratch, "fixture.cjs");
await build({
  stdin: {
    contents:
      'import {demoReportV2} from "./src/lib/report-v2/fixtures"; console.log(JSON.stringify(demoReportV2()));',
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: fixturePath,
  tsconfig: join(root, "tsconfig.json"),
});
const report = JSON.parse(
  execFileSync(process.execPath, [fixturePath], { encoding: "utf8" }),
);
const built = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {FullReportPanel} from './src/components/analyze/full-report-panel'; import {BusinessFindings} from './src/components/analyze/business-findings'; import {projectBusinessFindings} from './src/lib/report-v2/business-findings'; import {SavedAnalysisView} from './src/app/analyze/[id]/saved-analysis-view'; const root=createRoot(document.getElementById('root')); window.updates=[];window.draw=(props)=>root.render(<FullReportPanel {...props} onFinalReport={u=>window.updates.push(u)} />);window.findings=()=>root.render(<BusinessFindings findings={projectBusinessFindings({})} />); window.saved=(props)=>root.render(<SavedAnalysisView {...props}/>);`,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  tsconfig: join(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "framework-stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/(dynamic|link)$/ }, (a) => ({
          path: a.path,
          namespace: "stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
          contents: a.path.endsWith("dynamic")
            ? "export default ()=>()=>null;"
            : 'import React from "react"; export default function Link(props){return React.createElement("a",props);}',
          loader: "js",
          resolveDir: root,
        }));
      },
    },
  ],
});
const bundle = built.outputFiles[0].text;
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
  });
  let calls = 0;
  const held = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") {
      await route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
      return;
    }
    calls++;
    if (url.pathname === "/api/analyses/SA") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          analysis: {
            id: "SA",
            createdAt: "2026-09-22T00:00:00Z",
            owned: true,
            input: {
              kind: "website",
              url: "https://saved-A.example",
              filename: null,
              chars: 10,
              truncated: false,
            },
            intake: {
              inputKind: "website",
              rawText: "A",
              structured: {},
              signals: {},
            },
          },
        }),
      });
      return;
    }
    if (url.pathname.includes("/A/"))
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "done",
          format: "v2",
          reportV2: report,
          pollAfterSec: 0,
        }),
      });
    else held.push(route);
  });
  await page.goto("http://findings-fixture.test/");
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() =>
    window.draw({ analysisId: "A", authenticated: true }),
  );
  await page.waitForFunction(() =>
    window.updates.some((u) => u.analysisId === "A" && u.report),
  );
  assert.equal(
    await page.locator('[data-testid="analyze-full-report-download"]').count(),
    1,
  );
  await page.evaluate(() =>
    window.draw({ analysisId: "B", authenticated: true }),
  );
  await page.waitForFunction(() =>
    window.updates.some((u) => u.analysisId === "B" && u.report === null),
  );
  assert.equal(
    await page.locator('[data-testid="analyze-full-report-download"]').count(),
    0,
    "A content must not expose B download during pending B",
  );
  await held
    .shift()
    .fulfill({ status: 404, contentType: "application/json", body: "{}" });
  await page.waitForFunction(
    () =>
      window.updates.filter((u) => u.analysisId === "B" && u.report === null)
        .length >= 2,
  );
  assert.equal(
    await page.locator('[data-testid="analyze-full-report-download"]').count(),
    0,
  );
  await page.evaluate(() => window.findings());
  await page.waitForSelector('[data-finding-state="preliminary"]');
  assert.equal(await page.locator("[data-finding-state]").count(), 9);
  const before = calls;
  const summary = page.locator("#finding-mpc-problem > summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator("#finding-mpc-problem").getAttribute("open"),
    "",
  );
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator("#finding-mpc-problem").getAttribute("open"),
    null,
  );
  for (const item of await page.locator("[data-finding-state] > summary").all())
    await item.click();
  assert.equal(
    calls,
    before,
    "opening every detail must never call AI, billing or research",
  );
  await page.evaluate(() => window.saved({ id: "SA", token: "tokenA" }));
  await page.waitForFunction(() =>
    document.querySelector("h1")?.textContent?.includes("saved-A.example"),
  );
  await page.evaluate(() => window.saved({ id: "SB", token: "tokenB" }));
  await page.waitForSelector('[data-testid="saved-analysis-loading"]');
  assert.equal(
    await page.locator("h1").count(),
    0,
    "saved A must hide synchronously while B is pending",
  );
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="saved-analysis-loading"]'),
  );
  while (!held.length) await new Promise((resolve) => setTimeout(resolve, 10));
  await held
    .shift()
    .fulfill({ status: 404, contentType: "application/json", body: "{}" });
  await page.waitForSelector('[data-testid="saved-analysis-not-found"]');
  console.log(
    JSON.stringify({
      passed: [
        "completed authorized canonical handoff",
        "synchronous A-to-B hiding",
        "failed B does not retain A",
        "all9areas accessible",
        "keyboard expand/collapse",
        "no network on expand",
        "saved A-to-B scope and failure hiding",
      ],
      requests: calls,
      viewport: 375,
      reducedMotion: true,
      limitations:
        "Real components with dynamic heavy report stub; no full-page/auth session or computed CSS visual acceptance",
    }),
  );
} finally {
  await browser.close();
  await fs.rm(scratch, { recursive: true, force: true });
}
