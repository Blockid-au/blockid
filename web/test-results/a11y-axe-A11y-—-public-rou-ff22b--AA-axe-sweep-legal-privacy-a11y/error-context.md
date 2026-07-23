# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: a11y/axe.spec.ts >> A11y — public routes (WCAG 2.1 AA) >> axe sweep: /legal/privacy
- Location: tests/e2e/a11y/axe.spec.ts:61:9

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/legal/privacy
Call log:
  - navigating to "http://localhost:3000/legal/privacy", waiting until "domcontentloaded"

```

# Test source

```ts
  1   | /**
  2   |  * Accessibility sweep — WCAG 2.1 AA compliance across canonical routes.
  3   |  *
  4   |  * Runs axe-core over 20 routes (10 public, 10 gated) and asserts zero
  5   |  * serious/critical violations. Target: >= 95% AA compliance.
  6   |  *
  7   |  * Import from @axe-core/playwright: if the dep is missing at CI time the
  8   |  * spec fails loudly rather than passing silently.
  9   |  */
  10  | 
  11  | import { test, expect } from "@playwright/test";
  12  | import AxeBuilder from "@axe-core/playwright";
  13  | import { loginAs } from "../fixtures/accounts";
  14  | 
  15  | const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
  16  | 
  17  | const PUBLIC_ROUTES: readonly string[] = [
  18  |   "/",
  19  |   "/pricing",
  20  |   "/pricing/founder_growth",
  21  |   "/for/founder",
  22  |   "/for/investor",
  23  |   "/legal/terms",
  24  |   "/legal/privacy",
  25  |   "/legal/disclaimers",
  26  |   "/auth/login",
  27  |   "/vs/cake",
  28  | ];
  29  | 
  30  | const GATED_ROUTES: readonly string[] = [
  31  |   "/onboarding",
  32  |   "/dashboard",
  33  |   "/workspace/investor",
  34  |   "/workspace/investor/dealflow",
  35  |   "/workspace/investor/watchlist",
  36  |   "/workspace/advisor",
  37  |   "/workspace/accelerator",
  38  |   "/workspace/equity-offer",
  39  |   "/account/billing",
  40  | ];
  41  | 
  42  | const ADMIN_ROUTE = "/admin/pricing-metrics";
  43  | 
  44  | interface AxeSummary {
  45  |   route: string;
  46  |   totalViolations: number;
  47  |   seriousOrCritical: number;
  48  |   ruleIds: string[];
  49  | }
  50  | 
  51  | function printSummary(s: AxeSummary): void {
  52  |   const line = `[a11y] ${s.route.padEnd(40)} violations=${s.totalViolations} serious+critical=${s.seriousOrCritical}${
  53  |     s.ruleIds.length ? ` rules=${s.ruleIds.join(",")}` : ""
  54  |   }`;
  55  |   // eslint-disable-next-line no-console
  56  |   console.log(line);
  57  | }
  58  | 
  59  | test.describe("A11y — public routes (WCAG 2.1 AA)", () => {
  60  |   for (const route of PUBLIC_ROUTES) {
  61  |     test(`axe sweep: ${route}`, async ({ page }) => {
> 62  |       const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
      |                               ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/legal/privacy
  63  |       if (resp && resp.status() === 404) {
  64  |         test.skip(true, `Route ${route} returned 404`);
  65  |         return;
  66  |       }
  67  |       await page.waitForLoadState("networkidle").catch(() => {
  68  |         /* tolerate long-poll endpoints */
  69  |       });
  70  | 
  71  |       const results = await new AxeBuilder({ page })
  72  |         .withTags([...WCAG_TAGS])
  73  |         .analyze();
  74  | 
  75  |       const blocking = results.violations.filter(
  76  |         (v) => v.impact === "serious" || v.impact === "critical",
  77  |       );
  78  | 
  79  |       printSummary({
  80  |         route,
  81  |         totalViolations: results.violations.length,
  82  |         seriousOrCritical: blocking.length,
  83  |         ruleIds: blocking.map((v) => v.id),
  84  |       });
  85  | 
  86  |       expect(
  87  |         blocking,
  88  |         `Serious/critical WCAG violations on ${route}: ${blocking
  89  |           .map((v) => `${v.id} (${v.nodes.length} nodes)`)
  90  |           .join(", ")}`,
  91  |       ).toEqual([]);
  92  |     });
  93  |   }
  94  | });
  95  | 
  96  | test.describe("A11y — gated routes (WCAG 2.1 AA)", () => {
  97  |   for (const route of GATED_ROUTES) {
  98  |     test(`axe sweep: ${route}`, async ({ page }) => {
  99  |       try {
  100 |         await loginAs(page, "qa-founder-2@blockid.au");
  101 |       } catch (err) {
  102 |         test.skip(true, `Login failed for qa-founder-2: ${(err as Error).message}`);
  103 |         return;
  104 |       }
  105 | 
  106 |       const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
  107 |       if (resp && (resp.status() === 404 || resp.status() === 403)) {
  108 |         test.skip(true, `Route ${route} returned ${resp.status()}`);
  109 |         return;
  110 |       }
  111 |       await page.waitForLoadState("networkidle").catch(() => {
  112 |         /* tolerate long-poll endpoints */
  113 |       });
  114 | 
  115 |       const results = await new AxeBuilder({ page })
  116 |         .withTags([...WCAG_TAGS])
  117 |         .analyze();
  118 | 
  119 |       const blocking = results.violations.filter(
  120 |         (v) => v.impact === "serious" || v.impact === "critical",
  121 |       );
  122 | 
  123 |       printSummary({
  124 |         route,
  125 |         totalViolations: results.violations.length,
  126 |         seriousOrCritical: blocking.length,
  127 |         ruleIds: blocking.map((v) => v.id),
  128 |       });
  129 | 
  130 |       expect(
  131 |         blocking,
  132 |         `Serious/critical WCAG violations on ${route}: ${blocking
  133 |           .map((v) => `${v.id} (${v.nodes.length} nodes)`)
  134 |           .join(", ")}`,
  135 |       ).toEqual([]);
  136 |     });
  137 |   }
  138 | 
  139 |   test(`axe sweep: ${ADMIN_ROUTE}`, async ({ page }) => {
  140 |     try {
  141 |       await loginAs(page, "qa-admin@blockid.au");
  142 |     } catch (err) {
  143 |       test.skip(true, `Login failed for qa-admin: ${(err as Error).message}`);
  144 |       return;
  145 |     }
  146 | 
  147 |     const resp = await page.goto(ADMIN_ROUTE, { waitUntil: "domcontentloaded" });
  148 |     if (resp && (resp.status() === 404 || resp.status() === 403)) {
  149 |       test.skip(true, `Route ${ADMIN_ROUTE} returned ${resp.status()}`);
  150 |       return;
  151 |     }
  152 |     await page.waitForLoadState("networkidle").catch(() => {
  153 |       /* tolerate long-poll endpoints */
  154 |     });
  155 | 
  156 |     const results = await new AxeBuilder({ page })
  157 |       .withTags([...WCAG_TAGS])
  158 |       .analyze();
  159 | 
  160 |     const blocking = results.violations.filter(
  161 |       (v) => v.impact === "serious" || v.impact === "critical",
  162 |     );
```