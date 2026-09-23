/**
 * 22 — Evaluator ladder (G12; release-qa2 rows E1–E5, qa3 §1 pricing truth):
 * `/pricing` Founder ↔ Evaluator switch, Scout / Firm / Program cards at
 * A$79 / A$149 / A$349 with the card-required trial pill, `/solutions/advisor`
 * and `/compare*` render clean, the evaluator sign-up up to the card step
 * (nothing entered — the register-with-card contract is asserted by its
 * validation shapes, which run before any Stripe call), and
 * `/workspace/evaluations` for a founder account shows the gate copy.
 */
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, json, post } from "./lib/api";
import { dbAllowed, psql, setAccountType } from "./lib/db";

const LADDER = [
  { id: "tier-scout", name: "Scout", price: "A$79", plan: "investor_angel" },
  { id: "tier-firm", name: "Firm", price: "A$149", plan: "investor_advisor" },
  { id: "tier-program", name: "Program", price: "A$349", plan: "investor_vc_small" },
] as const;

test.describe("Pricing — evaluator segment", () => {
  test("/pricing: Founder ↔ Evaluator switch flips the ladder; Scout / Firm / Program priced A$79 / A$149 / A$349 with a card-required 7-day trial", async ({ page, visit }, testInfo) => {
    await visit("/pricing");
    const sw = page.getByTestId("pricing-segment-switch");
    await expect(sw).toBeVisible({ timeout: 30_000 });
    // 1e0d7e6d7: /pricing opens on Evaluator; the Founder tab still flips the ladder.
    expect(await sw.getAttribute("data-active-tab")).toBe("evaluator");
    await page.locator("#pricing-tab-founder").click();
    await expect(sw).toHaveAttribute("data-active-tab", "founder");
    await expect(page.getByTestId("founder-ladder")).toBeVisible();

    await page.locator("#pricing-tab-evaluator").click();
    await expect(sw).toHaveAttribute("data-active-tab", "evaluator");
    const ladder = page.getByTestId("evaluator-ladder");
    await expect(ladder).toBeVisible();
    await expect(page.locator("#pricing-matrix-heading")).toContainText(/evaluators/i);
    // Evaluator is the default tab, so switching back clears the alias rather than writing ?segment=evaluator.
    expect(new URL(page.url()).searchParams.get("segment")).toBeNull();

    const rows: Array<{ name: string; price: string | null; cta: string | null; trialPill: boolean }> = [];
    for (const tier of LADDER) {
      const card = page.locator(`#${tier.id}`);
      await expect(card).toBeVisible();
      await expect(card.getByRole("heading", { level: 3 })).toHaveText(tier.name);
      const text = await card.innerText();
      const cta = card.getByRole("link", { name: /Start 7-day free trial/ }).first();
      const href = await cta.getAttribute("href");
      rows.push({ name: tier.name, price: (text.match(/A\$\d+/) ?? [null])[0], cta: href, trialPill: /card required/i.test(text) });
      expect(text, `${tier.name} price`).toContain(tier.price);
      expect(text, `${tier.name} trial pill`).toMatch(/7-day free trial/);
      expect(text, `${tier.name} card required`).toMatch(/card required/i);
      // G25-D: the card CTA lands on the review step (never a card form or Stripe).
      expect(href ?? "", `${tier.name} CTA`).toContain(`plan=${tier.plan}`);
      expect(href ?? "", `${tier.name} CTA review step`).toMatch(/^\/checkout\/review\?plan=/);
      expect(href ?? "", `${tier.name} CTA entry`).toContain("entry=pricing_card");
    }
    await evidence(testInfo, "evaluator ladder", rows);
    await expect(page.getByTestId("evaluator-trial-included").first()).toContainText(/Trusted Business Report/);

    // ?segment=evaluator lands on the evaluator tab directly (E1).
    await visit("/pricing?segment=evaluator");
    await expect(page.getByTestId("pricing-segment-switch")).toHaveAttribute("data-active-tab", "evaluator", { timeout: 30_000 });
  });

  for (const path of ["/solutions/advisor", "/compare", "/compare/chatgpt", "/compare/valuers"]) {
    test(`${path} renders its h1 without console errors or failed requests`, async ({ page, visit, guard }, testInfo) => {
      const g = guard(page, { allowRequest: [{ method: "GET", pathRe: /^\/api\/svi\/phase-progress$/, status: 429 }] });
      await visit(path, { waitUntil: "networkidle" });
      const h1 = page.getByRole("heading", { level: 1 }).first();
      await expect(h1).toBeVisible({ timeout: 30_000 });
      const text = await h1.innerText();
      const report = g.report(path);
      await evidence(testInfo, "page", { h1: text, guard: report });
      if (path.startsWith("/compare")) expect(text).toMatch(/BlockID vs ChatGPT vs a valuer/);
      else expect(text).toMatch(/A\$3/);
      if (report.allowed.length) testInfo.annotations.push({ type: "allow-listed", description: `${report.allowed.length}× Cloudflare-injected GTM bootstrap refused by CSP` });
      expect(report.errors, "unexpected console errors").toEqual([]);
      expect(report.failedRequests, "unexpected failed requests (≥400)").toEqual([]);
    });
  }
});

test.describe("Evaluator registration — up to the card step", () => {
  test("/signup?segment=evaluator&plan=investor_angel&trial=1: Scout preselected, trial line, Stripe card field mounted — no card entered", async ({ browser, qa }, testInfo) => {
    // A fresh, logged-out browser context: the founder session must not
    // pre-fill or redirect the sign-up.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${qa.baseURL}/signup?segment=evaluator&plan=investor_angel&trial=1`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/A\$3/, { timeout: 30_000 });
      await expect(page.getByTestId("evaluator-trial-line")).toContainText(/7-day free trial · card required/);
      const planSelect = page.locator("select").filter({ hasText: /Scout/ }).first();
      await expect(planSelect).toBeVisible();
      const selected = await planSelect.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? "");
      expect(selected).toMatch(/Scout — A\$79\/mo/);
      await expect(page.getByTestId("signup-account-type")).toBeVisible();
      // G25-D: the submit names the card step and sits under the review block.
      await expect(page.getByTestId("signup-review")).toHaveAttribute("data-plan-id", "investor_angel");
      const submit = page.getByRole("button", { name: /Add card & start 7-day trial/ });
      await expect(submit).toBeVisible();
      // Stripe's CardElement mounts as an iframe titled "Secure card payment input (Stripe)".
      await expect(page.locator('iframe[title*="Secure card payment input"]').first()).toBeAttached({ timeout: 45_000 });
      await evidence(testInfo, "signup card step", { selected, submit: await submit.innerText(), stripeIframes: await page.locator('iframe[src*="stripe"]').count() });
    } finally {
      await ctx.close();
    }
  });

  test("POST /api/auth/register-with-card validates before Stripe: payment_method_required, terms_required, unsupported_plan — no account, no customer", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    const email = `qa-live-evaluator-${Date.now()}@blockid.au`; // never registered — every call below fails validation first
    try {
      const base = { email, password: "Qa!never-registered-1", account_type: "investor", plan_id: "investor_angel", terms_accepted: true };
      const noCard = await post(anon, "/api/auth/register-with-card", base);
      // The pm id only has to pass /^pm_[A-Za-z0-9]{1,125}$/ — it is never sent to Stripe because every call fails an earlier gate.
      const noTerms = await post(anon, "/api/auth/register-with-card", { ...base, payment_method_id: "pm_liveQAplaceholder", terms_accepted: false });
      const badPlan = await post(anon, "/api/auth/register-with-card", { ...base, payment_method_id: "pm_liveQAplaceholder", plan_id: "founder_free" });
      await evidence(testInfo, "register-with-card validation", { noCard: { status: noCard.status, body: noCard.body }, noTerms: { status: noTerms.status, body: noTerms.body }, badPlan: { status: badPlan.status, body: badPlan.body } });
      for (const r of [noCard, noTerms, badPlan]) {
        if (r.status === 429) test.skip(true, "register-with-card bucket (5 / 15 min per IP) is exhausted by another lane — re-run later");
      }
      expect(noCard.status).toBe(400);
      expect(noCard.body.error).toBe("payment_method_required");
      expect(noTerms.status).toBe(400);
      expect(noTerms.body.error).toBe("terms_required");
      expect(badPlan.status).toBe(400);
      expect(["unsupported_plan", "unknown_plan"]).toContain(badPlan.body.error);
      // None of the calls may have created an account.
      const login = await post(anon, "/api/auth/login-password", { email, password: base.password });
      await evidence(testInfo, "no account created", { status: login.status, error: login.body.error });
      expect([401, 429]).toContain(login.status);
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("Evaluator workspace as a founder", () => {
  test("/workspace/evaluations shows the evaluator gate copy for a founder; GET /api/evaluations is 402 feature_locked", async ({ page, visit, api }, testInfo) => {
    await visit("/workspace/evaluations");
    await expect(page.getByRole("heading", { level: 1, name: /Startups I'm evaluating/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/This workspace is for evaluators/)).toBeVisible();
    await expect(page.getByRole("link", { name: /See evaluator plans/ })).toHaveAttribute("href", /\/pricing\?segment=evaluator/);
    expect(await page.getByTestId("evaluation-row").count()).toBe(0);
    const r = await get<{ ok: boolean; error?: string; feature?: string }>(api, "/api/evaluations");
    await evidence(testInfo, "GET /api/evaluations", r.body);
    expect(r.status).toBe(402);
    expect(r.body.error).toBe("feature_locked");
    expect(r.body.feature).toBe("investor.dealflow");
  });
});

// S-IA4 — the evaluator landing. The suite cannot register an evaluator
// (card-required trial), so the check re-types the QA founder to
// investor_angel for the duration of ONE test (LIVE_QA_ALLOW_DB=1, workers=1)
// and restores 'founder' in `finally`. Without DB access it is skipped, not
// failed — the e2e lane (tests/e2e/nav/investor-landing.spec.ts) covers the
// seeded angel on the dev box.
test.describe("Evaluator landing (S-IA4)", () => {
  test("as investor_angel: /dashboard → /workspace/investor, ≥ 3 landing blocks each with a CTA, ≤ 3 sidebar groups", async ({ page, qa, visit, guard }, testInfo) => {
    test.skip(!dbAllowed(), "needs LIVE_QA_ALLOW_DB=1 to re-type the QA account as an evaluator for one test");
    setAccountType(qa.email, "investor_angel");
    try {
      const g = guard(page);
      await visit("/dashboard");
      await page.waitForURL(/\/(workspace\/investor|onboarding)(\?|$)/, { timeout: 30_000 });
      await evidence(testInfo, "persona redirect", { url: page.url() });
      if (/\/onboarding/.test(page.url())) {
        // A QA account that has never held an evaluation is sent to the single
        // wizard (evaluator flow): assert the 3-step v4 wizard, then stop.
        await expect(page.locator('[data-onboarding-wizard="v4"]')).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('[data-wizard-rail="evaluator"], [data-wizard-rail="founder"]').first()).toBeVisible();
        return;
      }
      const landing = page.locator("[data-investor-landing]");
      await expect(landing).toBeVisible({ timeout: 30_000 });
      await expect(landing).toHaveAttribute("data-landing-variant", "investor");
      const names = await landing.locator("[data-landing-block]").evaluateAll((els) => els.map((el) => el.getAttribute("data-landing-block")));
      const empty = await landing.locator("[data-landing-block][data-landing-empty]").evaluateAll((els) => els.map((el) => el.getAttribute("data-landing-block")));
      await evidence(testInfo, "landing blocks", { names, empty });
      expect(names.length).toBeGreaterThanOrEqual(3);
      expect(names[0]).toBe("evaluating");
      for (const n of names) await expect(landing.locator(`[data-landing-block="${n}"] [data-landing-cta="${n}"]`).first()).toBeVisible();
      const groups = await page.locator('nav[aria-label="Workspace navigation"] [data-group-label]').evaluateAll((els) => els.map((el) => el.getAttribute("data-group-label")));
      expect(groups.length).toBeLessThanOrEqual(3);
      const report = g.report("/workspace/investor");
      expect(report.errors, "unexpected console errors").toEqual([]);
    } finally {
      setAccountType(qa.email, "founder");
    }
  });
});

// G14-S34 — founder feedback letter "What investors said". The suite cannot
// register three evaluator seats (card-required trial, 3 registers / 15 min
// per IP already spent), so the k-floor is seeded by a local DB step
// (LIVE_QA_ALLOW_DB=1, same pattern as the S-IA4 lane above): ONE
// founder_claimed evaluation on the QA founder's own project + THREE
// submitted, shared assessments from three seat ids across TWO org ids
// (assessor_user_id / org_id carry no FK — 0392 header). Then the cron's
// `?dry=1` (Bearer CRON_SECRET from .env.runtime — qa-live.sh loads it) must
// report the project as `would_send` with k = 3 / org_count = 2 and write
// nothing. Before migration 0406 the route answers `reason: table_missing`,
// which is recorded as a known-issue annotation, not a failure. Every row
// is removed in `finally` (the teardown's erasure would cascade them anyway).
test.describe("Founder feedback letter (G14-S34)", () => {
  test("seed 3 shared assessments / 2 orgs on the QA project → /api/cron/feedback-letters?dry=1 lists it as eligible (k=3, org_count=2), sends nothing", async ({ qa }, testInfo) => {
    test.skip(!dbAllowed(), "needs LIVE_QA_ALLOW_DB=1 to seed the k-floor by psql");
    test.skip(!process.env.CRON_SECRET, "needs CRON_SECRET (qa-live.sh loads .env.runtime) to call the cron route");
    test.skip(!qa.projectId || !qa.userId, "the QA founder has no project / user id in the run state");
    const projectId = qa.projectId!;
    const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
    const seats = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
    const orgs = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
    let evaluationId: string | null = null;
    try {
      // 0. G13 0393 added evaluation_assessments.org_id → investor_organisations(id)
      //    (ON DELETE SET NULL), so the two orgs must exist: throw-away rows
      //    slugged by the run's timestamp, deleted in the finally below.
      const orgSlug = qa.email.replace(/@.*$/, "");
      psql(
        `insert into public.investor_organisations (id, slug, name, kind, is_personal)
           values (${q(orgs[0])}::uuid, ${q(`${orgSlug}-org-a`)}, 'QA Live Org A', 'angel', false),
                  (${q(orgs[2])}::uuid, ${q(`${orgSlug}-org-b`)}, 'QA Live Org B', 'vc', false)
           on conflict (id) do nothing;`,
      );
      // 1. the founder_claimed evaluation on the QA founder's own project (scoped to the QA email)
      evaluationId =
        psql(
          `insert into public.evaluations (evaluator_user_id, project_id, owner_kind, consent_tier, founder_user_id, founder_email, claimed_at, label)
             select u.id, p.id, 'founder_claimed', 'reports_shared', u.id, u.email, now(), 'live-qa feedback fixture'
               from public.app_users u join public.projects p on p.user_id = u.id
              where u.email = ${q(qa.email)} and u.email ~ '^qa-live-[0-9]{8}-[0-9]{4}@blockid\\.au$' and p.id = ${q(projectId)}::uuid
             on conflict (evaluator_user_id, project_id) do update set owner_kind = 'founder_claimed', founder_user_id = excluded.founder_user_id, claimed_at = now()
             returning id;`,
        )
          .trim()
          .split("\n")[0] || null;
      expect(evaluationId, "evaluation row for the QA project").toMatch(/^[0-9a-f-]{36}$/);
      // 2. three submitted + shared assessments, two orgs
      const values = seats
        .map(
          (seat, i) =>
            `(${q(evaluationId!)}::uuid, ${q(projectId)}::uuid, ${q(seat)}::uuid, ${q(orgs[i])}::uuid, 1, 'submitted', 'track', 3, ` +
            `'{"FTV":{"rating":4,"stance":"agree"},"TRE":{"rating":${i === 1 ? 1 : 2},"stance":"disagree"}}'::jsonb, ` +
            `'[{"title":"No recurring revenue","severity":"high","dimension":"TRE","source":"evaluator"}]'::jsonb, ` +
            `'[{"text":"What is your churn?","dimension":"TRE"}]'::jsonb, 'live-qa private', 'live-qa shared', ` +
            `array['dimension_ratings','risks','questions_for_founder']::text[], now(), now())`,
        )
        .join(",\n");
      const inserted = psql(
        `insert into public.evaluation_assessments (evaluation_id, project_id, assessor_user_id, org_id, version, status, decision, conviction, dimension_ratings, risks, questions_for_founder, private_notes, shared_notes, shared_fields, shared_with_founder_at, submitted_at)
           values ${values}
           on conflict (evaluation_id, assessor_user_id, version) do nothing;
         select count(*) from public.evaluation_assessments where evaluation_id = ${q(evaluationId!)}::uuid and status = 'submitted';`,
      )
        .trim()
        .split("\n")
        .pop();
      await evidence(testInfo, "seeded assessments", { evaluationId, submitted: inserted });
      expect(Number(inserted)).toBeGreaterThanOrEqual(3);

      // 3. the cron's dry run reports the project as eligible and writes nothing
      const anon = await anonRequest(qa.baseURL);
      try {
        type DryProject = { project_id: string; k: number; org_count: number; new_rows: number; weakest_dim: string | null; outcome: string; subject?: string };
        const r = await json<{ ok: boolean; dryRun?: boolean; reason?: string; would_send?: number; sent?: number; projects?: DryProject[] }>(
          anon,
          "GET",
          "/api/cron/feedback-letters?dry=1",
          undefined,
          { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        );
        const mine = r.body.projects?.find((p) => p.project_id === projectId) ?? null;
        await evidence(testInfo, "GET /api/cron/feedback-letters?dry=1", { status: r.status, ok: r.body.ok, dryRun: r.body.dryRun, reason: r.body.reason, would_send: r.body.would_send, sent: r.body.sent, mine });
        expect(r.status).toBe(200);
        expect(r.body.ok).toBe(true);
        if (r.body.reason === "table_missing") {
          testInfo.annotations.push({ type: "known-issue", description: "migration 0404_founder_feedback_letters is not applied yet — the cron answers table_missing; apply it and re-run this lane" });
          return;
        }
        expect(r.body.dryRun).toBe(true);
        expect(r.body.sent).toBe(0);
        expect(mine, "the QA project in the dry-run list").toBeTruthy();
        expect(mine!.k).toBe(3);
        expect(mine!.org_count).toBe(2);
        expect(mine!.new_rows).toBe(3);
        expect(mine!.outcome).toBe("would_send");
        expect(mine!.weakest_dim).toBe("TRE");
        expect(mine!.subject).toMatch(/^What 3 investors said about /);
        // dry = nothing stored
        const letters = psql(`select count(*) from public.founder_feedback_letters where project_id = ${q(projectId)}::uuid;`).trim();
        expect(Number(letters)).toBe(0);
      } finally {
        await anon.dispose();
      }
    } finally {
      // Any run's leftovers (a crashed run leaves rows with an older slug that
      // would block the fixed-id insert): the regex is the whole predicate.
      psql(`delete from public.investor_organisations where slug ~ '^qa-live-[0-9]{8}-[0-9]{4}-org-[ab]$';`);
      if (evaluationId) {
        psql(
          `delete from public.evaluation_assessments a using public.evaluations e, public.app_users u
             where a.evaluation_id = e.id and e.id = ${q(evaluationId)}::uuid and e.evaluator_user_id = u.id and u.email = ${q(qa.email)};
           delete from public.evaluations e using public.app_users u
             where e.id = ${q(evaluationId)}::uuid and e.evaluator_user_id = u.id and u.email = ${q(qa.email)};`,
        );
      }
    }
  });
});
