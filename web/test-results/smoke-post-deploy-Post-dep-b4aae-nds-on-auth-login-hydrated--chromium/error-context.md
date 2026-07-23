# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke/post-deploy.spec.ts >> Post-deploy hydrated smoke >> /workspace/audit-log — anonymous lands on /auth/login (hydrated)
- Location: tests/e2e/smoke/post-deploy.spec.ts:80:9

# Error details

```
Error: expect(received).toMatch(expected)

Expected pattern: /\/auth\/login.*next=.*%2Fworkspace%2Faudit-log/
Received string:  "https://blockid.au/auth/login?next=/workspace/audit-log"
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e4]:
      - link "BlockID home" [ref=e5] [cursor=pointer]:
        - /url: /
        - generic [ref=e7]: BlockID.au
      - navigation "Primary" [ref=e8]:
        - link "Get SVI Score" [ref=e9] [cursor=pointer]:
          - /url: /score
        - button "Free Tools" [ref=e11]:
          - text: Free Tools
          - img [ref=e12]
        - link "Product" [ref=e14] [cursor=pointer]:
          - /url: /#product
        - link "Pricing" [ref=e15] [cursor=pointer]:
          - /url: /#pricing
        - link "Benchmarks" [ref=e16] [cursor=pointer]:
          - /url: /benchmarks
        - link "Insights" [ref=e17] [cursor=pointer]:
          - /url: /insights
        - link "Version" [ref=e18] [cursor=pointer]:
          - /url: /version
        - link "Login" [ref=e19] [cursor=pointer]:
          - /url: /auth/login
      - generic [ref=e20]:
        - link "Try free tools" [ref=e21] [cursor=pointer]:
          - /url: /#idea-tools
        - button "Switch to Tiếng Việt" [ref=e22]:
          - generic [ref=e23]: 🇦🇺
          - generic [ref=e24]: EN
        - link "Get your Score" [ref=e25] [cursor=pointer]:
          - /url: /score
          - button "Get your Score" [ref=e26]
  - main [ref=e27]:
    - generic [ref=e28]:
      - paragraph [ref=e29]: BlockID.au
      - generic [ref=e30]:
        - heading "Sign in to BlockID" [level=2] [ref=e32]
        - paragraph [ref=e33]: Own your cap table. Prove your equity. Raise with confidence.
        - generic [ref=e36]:
          - button "Sign in with Google. Opens in new tab" [ref=e38] [cursor=pointer]:
            - generic [ref=e40]:
              - img [ref=e42]
              - generic [ref=e49]: Sign in with Google
          - iframe
        - generic [ref=e52]: or continue with email
        - generic [ref=e54]:
          - button "Email & Password" [ref=e55] [cursor=pointer]
          - button "Magic Link" [ref=e56] [cursor=pointer]
        - generic [ref=e57]:
          - generic [ref=e58]:
            - button "Sign In" [ref=e59] [cursor=pointer]
            - button "Create Account" [ref=e60] [cursor=pointer]
          - textbox "Email address" [ref=e61]
          - textbox "Password" [ref=e62]
          - button "Sign In" [ref=e63] [cursor=pointer]
          - button "Forgot your password?" [ref=e64] [cursor=pointer]
        - button "Have a partner code?" [ref=e65]
  - contentinfo [ref=e66]:
    - generic [ref=e68]:
      - generic [ref=e69]:
        - generic [ref=e70]:
          - link "BlockID home" [ref=e71] [cursor=pointer]:
            - /url: /
            - generic [ref=e73]: BlockID.au
          - paragraph [ref=e74]: The all-in-one ownership and fundraising platform for Australian startups and SMEs.
          - generic [ref=e75]:
            - paragraph [ref=e76]:
              - img [ref=e77]
              - generic [ref=e80]: ABN 79 659 615 111
            - paragraph [ref=e81]:
              - img [ref=e82]
              - generic [ref=e85]: AU data residency. SOC2 Type II in progress.
        - generic [ref=e86]:
          - heading "Product" [level=4] [ref=e87]
          - list [ref=e88]:
            - listitem [ref=e89]:
              - link "Investor-Ready Score" [ref=e90] [cursor=pointer]:
                - /url: /score
            - listitem [ref=e91]:
              - link "Cap Table" [ref=e92] [cursor=pointer]:
                - /url: /tools/cap-table
            - listitem [ref=e93]:
              - link "Term Sheet AI" [ref=e94] [cursor=pointer]:
                - /url: /tools/term-sheet
            - listitem [ref=e95]:
              - link "Data Room" [ref=e96] [cursor=pointer]:
                - /url: /workspace/data-room
        - generic [ref=e97]:
          - heading "Tools" [level=4] [ref=e98]
          - list [ref=e99]:
            - listitem [ref=e100]:
              - link "Dilution Calculator" [ref=e101] [cursor=pointer]:
                - /url: /tools/dilution
            - listitem [ref=e102]:
              - link "Cap Table Diff" [ref=e103] [cursor=pointer]:
                - /url: /tools/cap-table
            - listitem [ref=e104]:
              - link "Term Sheet AI" [ref=e105] [cursor=pointer]:
                - /url: /tools/term-sheet
            - listitem [ref=e106]:
              - link "Data Room Checklist" [ref=e107] [cursor=pointer]:
                - /url: /tools/data-room
            - listitem [ref=e108]:
              - link "Free Score" [ref=e109] [cursor=pointer]:
                - /url: /score
        - generic [ref=e110]:
          - heading "Company" [level=4] [ref=e111]
          - list [ref=e112]:
            - listitem [ref=e113]:
              - link "About" [ref=e114] [cursor=pointer]:
                - /url: /about
            - listitem [ref=e115]:
              - link "AU Benchmarks" [ref=e116] [cursor=pointer]:
                - /url: /benchmarks
            - listitem [ref=e117]:
              - link "Insights" [ref=e118] [cursor=pointer]:
                - /url: /insights
            - listitem [ref=e119]:
              - link "Investors" [ref=e120] [cursor=pointer]:
                - /url: /investors
            - listitem [ref=e121]:
              - link "Contact" [ref=e122] [cursor=pointer]:
                - /url: /contact
        - generic [ref=e123]:
          - heading "Legal" [level=4] [ref=e124]
          - list [ref=e125]:
            - listitem [ref=e126]:
              - link "Privacy" [ref=e127] [cursor=pointer]:
                - /url: /privacy
            - listitem [ref=e128]:
              - link "Terms" [ref=e129] [cursor=pointer]:
                - /url: /terms
            - listitem [ref=e130]:
              - link "Security" [ref=e131] [cursor=pointer]:
                - /url: /privacy#security
      - generic [ref=e132]:
        - paragraph [ref=e133]: © 2026 Auschain Pty Ltd (ACN 659 615 111). Sydney, NSW, Australia.
        - paragraph [ref=e134]: Not financial advice. BlockID is a software platform — engage a licensed adviser for your raise.
    - generic [ref=e137]:
      - generic [ref=e138]:
        - img [ref=e140]
        - generic [ref=e142]: BlockID.au
        - generic [ref=e143]: Valuation. Ownership. Growth.
      - generic [ref=e144]:
        - generic [ref=e145]:
          - img [ref=e147]
          - generic [ref=e150]:
            - generic [ref=e151]: CLEAR OWNERSHIP
            - generic [ref=e152]: Build trust from the idea stage
        - generic [ref=e153]:
          - img [ref=e155]
          - generic [ref=e160]:
            - generic [ref=e161]: SMARTER FUNDRAISING
            - generic [ref=e162]: Be investor-ready, always
        - generic [ref=e163]:
          - img [ref=e165]
          - generic [ref=e167]:
            - generic [ref=e168]: REAL VALUE
            - generic [ref=e169]: Track, understand and grow equity value
  - alert [ref=e170]
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
  40  |     await expect(page.getByText(/cohort enterprise/i).first()).toBeVisible({
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
> 93  |       expect(page.url()).toMatch(
      |                          ^ Error: expect(received).toMatch(expected)
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