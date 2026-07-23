# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke/post-deploy.spec.ts >> Post-deploy hydrated smoke >> /pricing — Accelerator tab reveals Cohort Enterprise
- Location: tests/e2e/smoke/post-deploy.spec.ts:29:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/cohort enterprise/i).first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText(/cohort enterprise/i).first()

```

```yaml
- link "Skip to main content":
  - /url: "#main-content"
- banner:
  - navigation "Primary":
    - link "BlockID.au — home":
      - /url: /
      - text: BlockID .au Beta
    - list:
      - listitem:
        - button "Product"
      - listitem:
        - button "For"
      - listitem:
        - link "Pricing":
          - /url: /pricing
      - listitem:
        - button "Compare"
      - listitem:
        - button "Docs"
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
        - article "Founder+ plan":
          - heading "Founder+" [level=3]
          - paragraph: Anchor tier
          - text: A$79 /mo
          - paragraph: AUD · ex-GST · billed monthly
          - text: 14-day free trial
          - list:
            - listitem: Everything in Founder
            - listitem: Priority support (12h SLA)
            - listitem: Warm investor intros (up to 3/mo)
          - link "Start trial — Founder+":
            - /url: /onboarding?trial=1&plan=founder_plus_anchor
            - text: Start trial
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
            - listitem: 800 AI credits / month
            - listitem: Term Sheet AI drafter
            - listitem: Priority support (24h)
          - link "Start trial — Growth":
            - /url: /onboarding?trial=1&plan=founder_growth
            - text: Start trial
        - article "Free plan":
          - heading "Free" [level=3]
          - paragraph: Kick the tyres
          - text: A$0
          - paragraph: Forever free · no card required
          - list:
            - listitem: SVI basic score (1 startup)
            - listitem: 10-page valuation report
            - listitem: Community Slack access
            - listitem: Watermarked PDF export
            - listitem: Idea validation checklist
          - link "Start free — Free":
            - /url: /onboarding?trial=1&plan=founder_free
            - text: Start free
        - article "Starter plan":
          - heading "Starter" [level=3]
          - paragraph: Solo founder
          - text: A$29 /mo
          - paragraph: AUD · ex-GST · billed monthly
          - text: 7-day free trial
          - list:
            - listitem: Full SVI 13-criteria score
            - listitem: Up to 3 startup workspaces
            - listitem: Unlimited DOCX + PDF export
            - listitem: 200 AI credits / month
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
        - paragraph: Prices in Australian dollars, GST-exclusive. GST added at checkout for Australian customers once Auschain PTY LTD (ABN 79 659 615 111) crosses the A$75,000 turnover threshold. Trial ends automatically — we email 3 days before any charge. Cancel any time from Billing.
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
  - region "Talk to sales for a bespoke fit.":
    - heading "Talk to sales for a bespoke fit." [level=2]
    - link "Talk to sales":
      - /url: /contact
    - link "Explore equity-for-solution":
      - /url: /workspace/equity-offer
  - paragraph: Not financial advice. Equity arrangements require independent legal and tax review. Auschain PTY LTD · Sydney NSW.
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
  29  |   test("/pricing — Accelerator tab reveals Cohort Enterprise", async ({
  30  |     page,
  31  |   }) => {
  32  |     await page.goto("/pricing", { waitUntil: "domcontentloaded" });
  33  | 
  34  |     const acceleratorTab = page.getByRole("tab", { name: /accelerator/i });
  35  |     await expect(acceleratorTab).toBeVisible({ timeout: PAGE_TIMEOUT });
  36  |     await acceleratorTab.click();
  37  | 
  38  |     // After hydration + tab switch, the accelerator plan matrix renders.
  39  |     // "Cohort Enterprise" is the top accelerator tier (plans-v2.ts).
> 40  |     await expect(page.getByText(/cohort enterprise/i).first()).toBeVisible({
      |                                                                ^ Error: expect(locator).toBeVisible() failed
  41  |       timeout: PAGE_TIMEOUT,
  42  |     });
  43  |   });
  44  | 
  45  |   test("/roadmap — Recently landed section renders", async ({ page }) => {
  46  |     await page.goto("/roadmap", { waitUntil: "domcontentloaded" });
  47  |     await expect(
  48  |       page.getByRole("heading", { name: /recently landed/i }),
  49  |     ).toBeVisible({ timeout: PAGE_TIMEOUT });
  50  |   });
  51  | 
  52  |   test("/workspace/branding — loads or redirects to /auth/login", async ({
  53  |     page,
  54  |   }) => {
  55  |     const resp = await page.goto("/workspace/branding", {
  56  |       waitUntil: "domcontentloaded",
  57  |     });
  58  |     expect(resp, "no response for /workspace/branding").not.toBeNull();
  59  |     const status = resp!.status();
  60  |     // Signed-out users are redirected to /auth/login; signed-in reach the page.
  61  |     // Both count as healthy; a 4xx/5xx here is the regression we're catching.
  62  |     expect([200, 302, 307], `unexpected status ${status}`).toContain(status);
  63  |     const finalUrl = page.url();
  64  |     const okUrl =
  65  |       /\/workspace\/branding($|\?)/.test(finalUrl) ||
  66  |       /\/auth\/login($|\?)/.test(finalUrl);
  67  |     expect(okUrl, `unexpected final URL ${finalUrl}`).toBe(true);
  68  |   });
  69  | 
  70  |   // ── /workspace/audit-log + /workspace/projects (iter-12) ────────────
  71  |   // Both pages call `redirect("/auth/login?next=...")` inside an async
  72  |   // Server Component when getCurrentUser() returns null. Because they
  73  |   // sit under app/workspace/loading.tsx, Next 16 streams a shell + the
  74  |   // NEXT_REDIRECT template rather than returning a raw 307 to the wire.
  75  |   // A `curl -sI` sees HTTP 200 and (incorrectly) flags this as an auth
  76  |   // leak — the client runtime honours the template and lands on
  77  |   // /auth/login. This hydrated smoke asserts the visible behaviour so
  78  |   // the false-positive from the iter-12 curl-only gate can't recur.
  79  |   for (const path of ["/workspace/audit-log", "/workspace/projects"] as const) {
  80  |     test(`${path} — anonymous lands on /auth/login (hydrated)`, async ({
  81  |       page,
  82  |       context,
  83  |     }) => {
  84  |       await context.clearCookies();
  85  |       const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
  86  |       expect(resp, `no response for ${path}`).not.toBeNull();
  87  |       const status = resp!.status();
  88  |       // 200 (streamed shell) or a raw 307/302 both count — regression is 4xx/5xx.
  89  |       expect([200, 302, 307], `unexpected status ${status}`).toContain(status);
  90  |       // Once hydration processes the NEXT_REDIRECT template the URL must
  91  |       // settle on /auth/login (anonymous session).
  92  |       await page.waitForURL(/\/auth\/login/, { timeout: PAGE_TIMEOUT });
  93  |       expect(page.url()).toMatch(
  94  |         new RegExp(`/auth/login.*next=.*${path.replace(/\//g, "%2F")}`),
  95  |       );
  96  |     });
  97  |   }
  98  | 
  99  |   test("/showcase/blockid — opengraph-image returns image/png", async ({
  100 |     request,
  101 |   }) => {
  102 |     const resp = await request.get("/showcase/blockid/opengraph-image");
  103 |     expect(resp.status()).toBe(200);
  104 |     const ct = resp.headers()["content-type"] ?? "";
  105 |     expect(ct.toLowerCase()).toContain("image/png");
  106 |   });
  107 | });
  108 | 
```