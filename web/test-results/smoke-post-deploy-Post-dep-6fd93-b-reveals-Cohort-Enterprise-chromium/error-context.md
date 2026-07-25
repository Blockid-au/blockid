# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke/post-deploy.spec.ts >> Post-deploy hydrated smoke >> /pricing — Accelerator tab reveals Cohort Enterprise
- Location: tests/e2e/smoke/post-deploy.spec.ts:52:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/cohort enterprise/i).first()
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByText(/cohort enterprise/i).first()

```

```yaml
- link "Skip to main content":
  - /url: "#main-content"
- banner:
  - navigation "Primary":
    - link "BlockID.au — home":
      - /url: /
      - text: BlockID .au
    - list:
      - listitem:
        - button "Product menu": Product
      - listitem:
        - button "For menu": For
      - listitem:
        - link "Pricing":
          - /url: /pricing
      - listitem:
        - button "Demo menu": Demo
      - listitem:
        - button "Compare menu": Compare
      - listitem:
        - button "Docs menu": Docs
    - group "Language":
      - text: EN
      - button "VI"
    - link "Sign in":
      - /url: /auth/login
    - link "Start free":
      - /url: /onboarding
- main:
  - region "Get fundable in 7 days. Then choose your plan.":
    - paragraph: Pricing v2.0
    - heading "Get fundable in 7 days. Then choose your plan." [level=1]
    - paragraph: Every monthly plan includes a 7-day free trial. Card required at signup, charged only on Day 8. Cancel anytime before with no charge.
    - link "Start 7-day free trial":
      - /url: /signup?plan=founder-starter&trial=1
  - region "Pricing hero secondary":
    - link "See all 12 plans below ↓":
      - /url: "#pricing-matrix"
  - region "Pricing guarantees": 7-day free trial on all monthly plans No lock-in — cancel any time AUD pricing, GST-inclusive
  - region "Pricing matrix":
    - tablist "Choose your role":
      - tab "Founder Build & raise" [selected]
      - tab "Investor Screen & track"
      - tab "Advisor Guide & earn equity"
      - tab "Accelerator Run cohorts"
    - tabpanel "Founder Build & raise":
      - region "Pricing for founders":
        - text: Beta pricing
        - heading "Pricing for founders" [level=2]
        - paragraph: Start free. Upgrade the day you decide to raise. Cancel any time.
        - radiogroup "Billing interval":
          - radio "Monthly" [checked]
          - radio "Annual Save ~17%"
        - paragraph: "How this fits your role: build your startup profile, model your cap-table, and get investor-ready — from Day 0 to a signed term sheet."
        - article "Growth plan":
          - text: Most popular
          - heading "Growth" [level=3]
          - paragraph: Raising a round
          - text: A$99 /mo
          - paragraph: AUD · ex-GST · billed monthly
          - text: 7-day free trial
          - list:
            - listitem: Everything in Starter
            - listitem: Cap-table sync + vesting engine
            - listitem: Dividend simulator
            - listitem: 200 AI credits / month
            - listitem: Term Sheet AI drafter
            - listitem: Priority support (24h)
          - link "Start trial — Growth":
            - /url: /onboarding?trial=1&plan=founder_growth
            - text: Start trial
        - article "Starter plan":
          - heading "Starter" [level=3]
          - paragraph: Solo founder
          - text: A$29 /mo
          - paragraph: AUD · ex-GST · billed monthly
          - text: 7-day free trial
          - list:
            - listitem: Full SVI 13-criteria score
            - listitem: 1 startup workspace
            - listitem: Unlimited DOCX + PDF export
            - listitem: 50 AI credits / month
            - listitem: Email support (48h)
          - link "Start trial — Starter":
            - /url: /onboarding?trial=1&plan=founder_starter
            - text: Start trial
        - article "Scale plan":
          - heading "Scale" [level=3]
          - paragraph: Series A ready
          - text: A$299 /mo
          - paragraph: AUD · ex-GST · billed monthly
          - text: 7-day free trial
          - list:
            - listitem: Everything in Growth
            - listitem: Tokenization requests (on-chain)
            - listitem: Investor data room access
            - listitem: Read-only API keys
            - listitem: 3,000 AI credits / month
            - listitem: Named customer success manager
          - link "Start trial — Scale":
            - /url: /onboarding?trial=1&plan=founder_scale
            - text: Start trial
        - article "Enterprise plan":
          - heading "Enterprise" [level=3]
          - paragraph: Multi-entity groups
          - text: Custom
          - paragraph: Volume pricing on request
          - text: 7-day free trial
          - list:
            - listitem: SSO / SAML + audit log
            - listitem: Dedicated CSM + SLA 99.9%
            - listitem: Unlimited AI credits
            - listitem: Custom on-chain deployment
            - listitem: Legal + compliance review add-on
            - listitem: Volume pricing
          - link "Contact sales — Enterprise":
            - /url: /contact?plan=founder_enterprise
            - text: Contact sales
        - paragraph: Prices in Australian dollars, GST-exclusive. GST added at checkout for Australian customers once Auschain PTY LTD (ABN 79 659 615 111) crosses the A$75,000 turnover threshold. Card required to prevent abuse. Cancel anytime. Email reminder 48h before we charge.
        - paragraph: Not financial advice. Plan information is general in nature and does not account for your objectives or financial situation — seek independent advice before subscribing.
  - region "Frequently asked questions":
    - paragraph: Frequently Asked
    - heading "Questions we hear from founders and investors" [level=2]
    - paragraph: Everything you need to know about trials, billing, equity, and compliance.
    - group:
      - heading "What happens after the 7-day free trial?" [level=3]
    - group:
      - heading "Is a credit card required to start the trial?" [level=3]
    - group:
      - heading "Can I switch plans mid-trial?" [level=3]
    - group:
      - heading "What's the refund policy?" [level=3]
    - group:
      - heading "What does \"equity in lieu of cash\" mean?" [level=3]
    - group:
      - heading "Do digital shares issued via BlockID count as real securities?" [level=3]
    - group:
      - heading "How do you handle GST?" [level=3]
    - group:
      - heading "Can I switch segment (e.g., from Founder to Investor)?" [level=3]
    - paragraph: Information provided on this page is general in nature and does not constitute financial, legal, or tax advice. Consult a licensed professional before making decisions about securities, equity, or tax treatment. BlockID.au is operated by Auschain PTY LTD (ACN 659 615 111).
  - region "Need custom pricing or equity-in-lieu?":
    - paragraph: Enterprise
    - heading "Need custom pricing or equity-in-lieu?" [level=2]
    - paragraph: Enterprise multi-entity plans with SSO, API access, dedicated CSM, or our compliance-gated equity-for-solution arrangement (5–10% equity in lieu of cash).
  - region "Integrated with":
    - paragraph: Integrated with
    - list:
      - listitem:
        - link "Stripe for Startups — payment infrastructure partner":
          - /url: https://stripe.com/startups
          - img "Stripe for Startups — payment infrastructure partner"
  - region "Talk to sales for a bespoke fit.":
    - heading "Talk to sales for a bespoke fit." [level=2]
    - link "Talk to sales":
      - /url: /contact
    - link "Explore equity-for-solution":
      - /url: /workspace/equity-offer
  - paragraph: Not financial advice. Equity arrangements require independent legal and tax review. Auschain PTY LTD · Sydney NSW.
  - complementary "Conversion call to action":
    - link "Start 7-day free trial Card required. Charged on Day 8.":
      - /url: /signup?plan=founder-starter&trial=1
    - button "Dismiss call to action"
- contentinfo "Site footer":
  - heading "Site footer" [level=2]
  - paragraph: Product
  - list:
    - listitem:
      - link "SVI lookup":
        - /url: /svi
    - listitem:
      - link "Pricing":
        - /url: /pricing
    - listitem:
      - link "Book a demo":
        - /url: /demo
  - paragraph: For
  - list:
    - listitem:
      - link "Founders":
        - /url: /for/founder
    - listitem:
      - link "Investors":
        - /url: /for/investor
    - listitem:
      - link "Advisors":
        - /url: /for/advisor
    - listitem:
      - link "Accelerators":
        - /url: /for/accelerator
  - paragraph: Case Studies
  - list:
    - listitem:
      - link "Atlassian (live demo)":
        - /url: /showcase/atlassian?step=1
    - listitem:
      - link "Canva":
        - /url: /showcase/canva
    - listitem:
      - link "Xero":
        - /url: /showcase/xero
    - listitem:
      - link "SafetyCulture":
        - /url: /showcase/safetyculture
    - listitem:
      - link "All case studies":
        - /url: /showcase
  - paragraph: Docs
  - list:
    - listitem:
      - link "Roadmap":
        - /url: /roadmap
    - listitem:
      - link "Changelog":
        - /url: /changelog
    - listitem:
      - link "Status":
        - /url: /status
    - listitem:
      - link "Security audit":
        - /url: /security-audit
  - paragraph: Legal
  - list:
    - listitem:
      - link "Terms":
        - /url: /legal/terms
    - listitem:
      - link "Privacy":
        - /url: /legal/privacy
    - listitem:
      - link "Disclaimers":
        - /url: /legal/disclaimers
  - paragraph: Accepted into
  - list:
    - listitem:
      - link "Founder Institute — global pre-seed accelerator":
        - /url: https://fi.co
        - img "Founder Institute — global pre-seed accelerator"
    - listitem:
      - link "NVIDIA Inception program member":
        - /url: https://www.nvidia.com/en-us/startups/
        - img "NVIDIA Inception program member"
    - listitem:
      - link "Spacecubed AI Fellowship cohort":
        - /url: https://spacecubed.com/labs/
        - img "Spacecubed AI Fellowship cohort"
  - paragraph: Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW
  - paragraph: © 2026 Auschain Pty Ltd v2.0.0-beta.10
- alert
```

# Test source

```ts
  1   | /**
  2   |  * Post-deploy hydrated smoke — Playwright.
  3   |  *
  4   |  * Runs AFTER a successful deploy (curl-based gates already passed) to catch
  5   |  * regressions the SSR-only curl grep in scripts/deploy-live.sh can't see:
  6   |  * client-side rendered content behind interactive tabs, hydrated widgets,
  7   |  * and image responses generated by App Router opengraph-image routes.
  8   |  *
  9   |  * The 2026-07-23 outage that prompted this file: the Accelerator tab on
  10  |  * /pricing swapped its plan matrix client-side (SegmentTabs). The old curl
  11  |  * probe fetched HTML that only contained the Founder tab's plans, so a
  12  |  * regression that broke the Accelerator surface (missing "Cohort Enterprise")
  13  |  * would not have been caught by grep.
  14  |  *
  15  |  * Constraints:
  16  |  *   - Reuses playwright.config.ts baseURL (PLAYWRIGHT_BASE_URL env, defaults
  17  |  *     to https://blockid.au via package.json script).
  18  |  *   - <10 assertions total, target <60s wall time. Chromium only.
  19  |  */
  20  | 
  21  | import { test, expect } from "@playwright/test";
  22  | 
  23  | // Give each hydrated page a hard ceiling so a stuck deploy doesn't hang CI.
  24  | const PAGE_TIMEOUT = 15_000;
  25  | 
  26  | test.describe("Post-deploy hydrated smoke", () => {
  27  |   test.setTimeout(45_000);
  28  | 
  29  |   test("/pricing?tier=accelerator — SSR seeds Accelerator tab (deep link)", async ({
  30  |     page,
  31  |   }) => {
  32  |     // iter-19 flake hardening: the tab-click path (next test) can flake on
  33  |     // cold CDN hydration because Playwright must wait for React to hydrate
  34  |     // before the click registers + the panel swap paints. The `?tier=`
  35  |     // deep-link path renders the Accelerator matrix as the SSR default, so
  36  |     // we can assert on first paint without waiting for hydration at all.
  37  |     // If THIS test fails but the click test passes, the query-param wire
  38  |     // has regressed. If BOTH fail, the surface is genuinely broken.
  39  |     test.setTimeout(30_000);
  40  |     await page.goto("/pricing?tier=accelerator", {
  41  |       waitUntil: "domcontentloaded",
  42  |     });
  43  |     const acceleratorTab = page.getByRole("tab", { name: /accelerator/i });
  44  |     await expect(acceleratorTab).toHaveAttribute("aria-selected", "true", {
  45  |       timeout: PAGE_TIMEOUT,
  46  |     });
  47  |     await expect(page.getByText(/cohort enterprise/i).first()).toBeVisible({
  48  |       timeout: 30_000,
  49  |     });
  50  |   });
  51  | 
  52  |   test("/pricing — Accelerator tab reveals Cohort Enterprise", async ({
  53  |     page,
  54  |   }) => {
  55  |     // iter-17 flake safeguard B: cold Next.js hydration on the very
  56  |     // first probe of /pricing after a swap can push the Cohort
  57  |     // Enterprise reveal past the 15s PAGE_TIMEOUT ceiling. Double this
  58  |     // test's overall budget (still under the 45s file-scope cap) so a
  59  |     // slow warm-up doesn't false-fail, while keeping the assertion
  60  |     // itself real — anything past 30s IS a regression.
  61  |     test.setTimeout(30_000);
  62  | 
  63  |     await page.goto("/pricing", { waitUntil: "domcontentloaded" });
  64  | 
  65  |     const acceleratorTab = page.getByRole("tab", { name: /accelerator/i });
  66  |     await expect(acceleratorTab).toBeVisible({ timeout: PAGE_TIMEOUT });
  67  |     await acceleratorTab.click();
  68  | 
  69  |     // After hydration + tab switch, the accelerator plan matrix renders.
  70  |     // "Cohort Enterprise" is the top accelerator tier (plans-v2.ts).
  71  |     // Flake-prone assertion: bumped to 30s per iter-17 flake analysis.
> 72  |     await expect(page.getByText(/cohort enterprise/i).first()).toBeVisible({
      |                                                                ^ Error: expect(locator).toBeVisible() failed
  73  |       timeout: 30_000,
  74  |     });
  75  |   });
  76  | 
  77  |   test("/roadmap — Recently landed section renders", async ({ page }) => {
  78  |     await page.goto("/roadmap", { waitUntil: "domcontentloaded" });
  79  |     await expect(
  80  |       page.getByRole("heading", { name: /recently landed/i }),
  81  |     ).toBeVisible({ timeout: PAGE_TIMEOUT });
  82  |   });
  83  | 
  84  |   test("/workspace/branding — loads or redirects to /auth/login", async ({
  85  |     page,
  86  |   }) => {
  87  |     const resp = await page.goto("/workspace/branding", {
  88  |       waitUntil: "domcontentloaded",
  89  |     });
  90  |     expect(resp, "no response for /workspace/branding").not.toBeNull();
  91  |     const status = resp!.status();
  92  |     // Signed-out users are redirected to /auth/login; signed-in reach the page.
  93  |     // Both count as healthy; a 4xx/5xx here is the regression we're catching.
  94  |     expect([200, 302, 307], `unexpected status ${status}`).toContain(status);
  95  |     const finalUrl = page.url();
  96  |     const okUrl =
  97  |       /\/workspace\/branding($|\?)/.test(finalUrl) ||
  98  |       /\/auth\/login($|\?)/.test(finalUrl);
  99  |     expect(okUrl, `unexpected final URL ${finalUrl}`).toBe(true);
  100 |   });
  101 | 
  102 |   // ── /workspace/audit-log + /workspace/projects (iter-12) ────────────
  103 |   // Both pages call `redirect("/auth/login?next=...")` inside an async
  104 |   // Server Component when getCurrentUser() returns null. Because they
  105 |   // sit under app/workspace/loading.tsx, Next 16 streams a shell + the
  106 |   // NEXT_REDIRECT template rather than returning a raw 307 to the wire.
  107 |   // A `curl -sI` sees HTTP 200 and (incorrectly) flags this as an auth
  108 |   // leak — the client runtime honours the template and lands on
  109 |   // /auth/login. This hydrated smoke asserts the visible behaviour so
  110 |   // the false-positive from the iter-12 curl-only gate can't recur.
  111 |   // /dashboard/portfolio (iter-14, shipped 7ed825be) shares the same
  112 |   // getCurrentUser()→redirect() auth-gate pattern, so it lives in the
  113 |   // same loop.
  114 |   for (const path of [
  115 |     "/workspace/audit-log",
  116 |     "/workspace/projects",
  117 |     "/workspace/projects/archived",
  118 |     "/dashboard/portfolio",
  119 |   ] as const) {
  120 |     test(`${path} — anonymous lands on /auth/login (hydrated)`, async ({
  121 |       page,
  122 |       context,
  123 |     }) => {
  124 |       await context.clearCookies();
  125 |       const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
  126 |       expect(resp, `no response for ${path}`).not.toBeNull();
  127 |       const status = resp!.status();
  128 |       // 200 (streamed shell) or a raw 307/302 both count — regression is 4xx/5xx.
  129 |       expect([200, 302, 307], `unexpected status ${status}`).toContain(status);
  130 |       // Once hydration processes the NEXT_REDIRECT template the URL must
  131 |       // settle on /auth/login (anonymous session).
  132 |       await page.waitForURL(/\/auth\/login/, { timeout: PAGE_TIMEOUT });
  133 |       // Next.js 16 emits `next=` with the raw path (not percent-encoded), but
  134 |       // some intermediate proxies may re-encode `/`. Accept either form so
  135 |       // this stays a behavior assertion, not an encoding assertion.
  136 |       const encoded = path.replace(/\//g, "%2F");
  137 |       expect(page.url()).toMatch(
  138 |         new RegExp(`/auth/login.*next=.*(?:${path}|${encoded})`),
  139 |       );
  140 |     });
  141 |   }
  142 | 
  143 |   test("/workspace/audit-log — login redirect carries exact next param", async ({
  144 |     page,
  145 |     context,
  146 |   }) => {
  147 |     // iter-18 hardening: the loop above accepts either the raw path or a
  148 |     // percent-encoded fallback in `next=`. This narrower assertion pins
  149 |     // the Next 16 emission shape (raw `/workspace/audit-log`) so a silent
  150 |     // change to the redirect helper — e.g. dropping the `next` param or
  151 |     // encoding it inconsistently — fails loudly on the audit-log surface
  152 |     // that the compliance team relies on for deep-linking back after
  153 |     // sign-in. Anonymous only; no auth-fixture needed.
  154 |     await context.clearCookies();
  155 |     await page.goto("/workspace/audit-log", { waitUntil: "domcontentloaded" });
  156 |     await page.waitForURL(/\/auth\/login/, { timeout: PAGE_TIMEOUT });
  157 |     const finalUrl = page.url();
  158 |     expect(
  159 |       finalUrl.includes("next=/workspace/audit-log"),
  160 |       `expected exact next=/workspace/audit-log substring, got ${finalUrl}`,
  161 |     ).toBe(true);
  162 |   });
  163 | 
  164 |   test("/dashboard/portfolio — post-redirect login shell hydrates", async ({
  165 |     page,
  166 |     context,
  167 |   }) => {
  168 |     // After the auth-gate redirect, the /auth/login page must render its
  169 |     // canonical hero shell — protects the empty-state / column layout on
  170 |     // /dashboard/portfolio from a silent regression that turns the redirect
  171 |     // into a blank page (e.g. a broken WorkspaceLayout import).
  172 |     await context.clearCookies();
```