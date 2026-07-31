# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke/post-deploy.spec.ts >> Post-deploy hydrated smoke >> /workspace/projects — anonymous lands on /auth/login (hydrated)
- Location: tests/e2e/smoke/post-deploy.spec.ts:120:9

# Error details

```
Error: expect(received).toMatch(expected)

Expected pattern: /\/auth\/login.*next=.*(?:\/workspace\/projects|%2Fworkspace%2Fprojects)/
Received string:  "https://blockid.au/auth/login?next=%2Fdashboard"
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
        - button "Demo" [ref=e15]:
          - text: Demo
          - img [ref=e16]
        - link "Product" [ref=e18] [cursor=pointer]:
          - /url: /#product
        - link "Pricing" [ref=e19] [cursor=pointer]:
          - /url: /#pricing
        - button "Resources" [ref=e21]:
          - text: Resources
          - img [ref=e22]
        - link "Login" [ref=e24] [cursor=pointer]:
          - /url: /auth/login
      - generic [ref=e25]:
        - link "Try free tools" [ref=e26] [cursor=pointer]:
          - /url: /#idea-tools
        - button "Switch to Tiếng Việt" [ref=e27]:
          - generic [ref=e28]: 🇦🇺
          - generic [ref=e29]: EN
        - link "Get your Score" [ref=e30] [cursor=pointer]:
          - /url: /score
          - button "Get your Score" [ref=e31]
  - main [ref=e32]:
    - generic [ref=e33]:
      - paragraph [ref=e34]: BlockID.au
      - generic [ref=e35]:
        - heading "Sign in to BlockID" [level=2] [ref=e37]
        - paragraph [ref=e38]: Own your cap table. Prove your equity. Raise with confidence.
        - generic [ref=e41]:
          - button "Sign in with Google. Opens in new tab" [ref=e43] [cursor=pointer]:
            - generic [ref=e45]:
              - img [ref=e47]
              - generic [ref=e54]: Sign in with Google
          - iframe
        - generic [ref=e57]: or continue with email
        - generic [ref=e59]:
          - button "Email & Password" [ref=e60] [cursor=pointer]
          - button "Magic Link" [ref=e61] [cursor=pointer]
        - generic [ref=e62]:
          - generic [ref=e63]:
            - button "Sign In" [ref=e64] [cursor=pointer]
            - button "Create Account" [ref=e65] [cursor=pointer]
          - textbox "Email address" [ref=e66]
          - textbox "Password" [ref=e67]
          - button "Sign In" [ref=e68] [cursor=pointer]
          - button "Forgot your password?" [ref=e69] [cursor=pointer]
        - button "Have a partner code?" [ref=e70]
  - contentinfo [ref=e71]:
    - generic [ref=e73]:
      - generic [ref=e74]:
        - generic [ref=e75]:
          - link "BlockID home" [ref=e76] [cursor=pointer]:
            - /url: /
            - generic [ref=e78]: BlockID.au
          - paragraph [ref=e79]: The all-in-one ownership and fundraising platform for Australian startups and SMEs.
          - generic [ref=e80]:
            - paragraph [ref=e81]:
              - img [ref=e82]
              - generic [ref=e85]: ABN 79 659 615 111
            - paragraph [ref=e86]:
              - img [ref=e87]
              - generic [ref=e90]: AU data residency. SOC2 Type II in progress.
        - generic [ref=e91]:
          - heading "Product" [level=4] [ref=e92]
          - list [ref=e93]:
            - listitem [ref=e94]:
              - link "Investor-Ready Score" [ref=e95] [cursor=pointer]:
                - /url: /score
            - listitem [ref=e96]:
              - link "Cap Table" [ref=e97] [cursor=pointer]:
                - /url: /tools/cap-table
            - listitem [ref=e98]:
              - link "Term Sheet AI" [ref=e99] [cursor=pointer]:
                - /url: /tools/term-sheet
            - listitem [ref=e100]:
              - link "Data Room" [ref=e101] [cursor=pointer]:
                - /url: /workspace/data-room
        - generic [ref=e102]:
          - heading "Tools" [level=4] [ref=e103]
          - list [ref=e104]:
            - listitem [ref=e105]:
              - link "Dilution Calculator" [ref=e106] [cursor=pointer]:
                - /url: /tools/dilution
            - listitem [ref=e107]:
              - link "Cap Table Diff" [ref=e108] [cursor=pointer]:
                - /url: /tools/cap-table
            - listitem [ref=e109]:
              - link "Term Sheet AI" [ref=e110] [cursor=pointer]:
                - /url: /tools/term-sheet
            - listitem [ref=e111]:
              - link "Data Room Checklist" [ref=e112] [cursor=pointer]:
                - /url: /tools/data-room
            - listitem [ref=e113]:
              - link "Free Score" [ref=e114] [cursor=pointer]:
                - /url: /score
        - generic [ref=e115]:
          - heading "Case Studies" [level=4] [ref=e116]
          - list [ref=e117]:
            - listitem [ref=e118]:
              - link "Atlassian (live demo)" [ref=e119] [cursor=pointer]:
                - /url: /showcase/atlassian?step=1
            - listitem [ref=e120]:
              - link "Canva" [ref=e121] [cursor=pointer]:
                - /url: /showcase/canva
            - listitem [ref=e122]:
              - link "Xero" [ref=e123] [cursor=pointer]:
                - /url: /showcase/xero
            - listitem [ref=e124]:
              - link "SafetyCulture" [ref=e125] [cursor=pointer]:
                - /url: /showcase/safetyculture
            - listitem [ref=e126]:
              - link "All case studies" [ref=e127] [cursor=pointer]:
                - /url: /showcase
        - generic [ref=e128]:
          - heading "Company" [level=4] [ref=e129]
          - list [ref=e130]:
            - listitem [ref=e131]:
              - link "About" [ref=e132] [cursor=pointer]:
                - /url: /about
            - listitem [ref=e133]:
              - link "AU Benchmarks" [ref=e134] [cursor=pointer]:
                - /url: /benchmarks
            - listitem [ref=e135]:
              - link "Insights" [ref=e136] [cursor=pointer]:
                - /url: /insights
            - listitem [ref=e137]:
              - link "Investors" [ref=e138] [cursor=pointer]:
                - /url: /investors
            - listitem [ref=e139]:
              - link "Contact" [ref=e140] [cursor=pointer]:
                - /url: /contact
        - generic [ref=e141]:
          - heading "Legal" [level=4] [ref=e142]
          - list [ref=e143]:
            - listitem [ref=e144]:
              - link "Privacy" [ref=e145] [cursor=pointer]:
                - /url: /privacy
            - listitem [ref=e146]:
              - link "Terms" [ref=e147] [cursor=pointer]:
                - /url: /terms
            - listitem [ref=e148]:
              - link "Security" [ref=e149] [cursor=pointer]:
                - /url: /privacy#security
      - generic "Accepted into" [ref=e151]:
        - paragraph [ref=e152]: Accepted into
        - list [ref=e153]:
          - listitem [ref=e154]:
            - link "Founder Institute — global pre-seed accelerator" [ref=e155] [cursor=pointer]:
              - /url: https://fi.co
              - img "Founder Institute — global pre-seed accelerator" [ref=e156]
          - listitem [ref=e157]:
            - link "NVIDIA Inception program member" [ref=e158] [cursor=pointer]:
              - /url: https://www.nvidia.com/en-us/startups/
              - img "NVIDIA Inception program member" [ref=e159]
          - listitem [ref=e160]:
            - link "Spacecubed AI Fellowship cohort" [ref=e161] [cursor=pointer]:
              - /url: https://spacecubed.com/labs/
              - img "Spacecubed AI Fellowship cohort" [ref=e162]
      - generic [ref=e163]:
        - paragraph [ref=e164]: © 2026 Auschain Pty Ltd (ACN 659 615 111). Sydney, NSW, Australia.
        - paragraph [ref=e165]: Not financial advice. BlockID is a software platform — engage a licensed adviser for your raise.
    - generic [ref=e168]:
      - generic [ref=e169]:
        - img [ref=e171]
        - generic [ref=e173]: BlockID.au
        - generic [ref=e174]: Valuation. Ownership. Growth.
      - generic [ref=e175]:
        - generic [ref=e176]:
          - img [ref=e178]
          - generic [ref=e181]:
            - generic [ref=e182]: CLEAR OWNERSHIP
            - generic [ref=e183]: Build trust from the idea stage
        - generic [ref=e184]:
          - img [ref=e186]
          - generic [ref=e191]:
            - generic [ref=e192]: SMARTER FUNDRAISING
            - generic [ref=e193]: Be investor-ready, always
        - generic [ref=e194]:
          - img [ref=e196]
          - generic [ref=e198]:
            - generic [ref=e199]: REAL VALUE
            - generic [ref=e200]: Track, understand and grow equity value
  - alert [ref=e201]
```

# Test source

```ts
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
  72  |     await expect(page.getByText(/cohort enterprise/i).first()).toBeVisible({
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
> 137 |       expect(page.url()).toMatch(
      |                          ^ Error: expect(received).toMatch(expected)
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
  173 |     await page.goto("/dashboard/portfolio", { waitUntil: "domcontentloaded" });
  174 |     await page.waitForURL(/\/auth\/login/, { timeout: PAGE_TIMEOUT });
  175 |     await expect(
  176 |       page.getByRole("heading", { name: /sign in to blockid/i }),
  177 |     ).toBeVisible({ timeout: PAGE_TIMEOUT });
  178 |   });
  179 | 
  180 |   test("/showcase/blockid — opengraph-image returns image/png", async ({
  181 |     request,
  182 |   }) => {
  183 |     const resp = await request.get("/showcase/blockid/opengraph-image");
  184 |     expect(resp.status()).toBe(200);
  185 |     const ct = resp.headers()["content-type"] ?? "";
  186 |     expect(ct.toLowerCase()).toContain("image/png");
  187 |   });
  188 | });
  189 | 
```