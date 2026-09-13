/**
 * 11 — S27 surfaces (lane 1 #21–#27): valuation certificate ESS annex /
 * honest empty state, secondary sandbox banner + Growth order, on-chain
 * panel status + copy, admin sector-multiples denied.
 */
import { test, expect } from "./fixtures";
import { evidence, get, post } from "./lib/api";



test.describe("Valuation certificate + ESS annex", () => {
  test("no SVI analysis → honest empty state (no A$535K hero) and the certificate preview is 409 without a charge", async ({ page, visit, api, credits }, testInfo) => {
    const vc = await get<{ ok: boolean; empty?: boolean; reason?: string; error?: string }>(api, "/api/valuation/vc");
    // A fresh founder has no svi_accounts row yet: the route answers
    // `ok:false "No SVI account found"`; after a first (unscored) visit it is
    // `ok:true, empty:true, reason:"no_svi_analysis"`. Both mean "no score".
    const noScore = !vc.body.ok || vc.body.empty === true;
    const before = await credits.snapshot();
    const cert = await post<{ ok: boolean; error?: string; preview?: boolean; annexes?: { ess?: { included: boolean; extraCost: number } }; cost?: number; included?: boolean }>(api, "/api/valuation/certificate", { annex: "ess" });
    await evidence(testInfo, "API", { vc: vc.body, certificate: { status: cert.status, body: cert.body } });
    await credits.assertUnchanged(before, "certificate preview with ESS annex");

    await visit("/dashboard/valuation");
    if (noScore) {
      if (vc.body.ok) expect(vc.body.reason).toBe("no_svi_analysis");
      else expect(String(vc.body.error)).toMatch(/SVI (account|analysis)/);
      expect(cert.status).toBe(409);
      expect(cert.body.error).toBe("no_svi_analysis");
      const empty = page.getByTestId("valuation-empty-state");
      const notice = page.getByText(/Complete your SVI analysis first/);
      await expect(empty.or(notice).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("certificate-ess-annex")).toHaveCount(0);
      const body = await page.locator("body").innerText();
      await evidence(testInfo, "UI state", { emptyState: await empty.count(), notice: await notice.count() });
      expect(body, "the hero must not fabricate a valuation from the default SVI of 100 (QA2 F4 / lane-1 F3)").not.toMatch(/A\$535K|SVI 100/);
    } else {
      // An account with a real score: the panel renders and the annex adds 0 credits.
      expect(cert.status).toBe(200);
      expect(cert.body.preview).toBe(true);
      expect(cert.body.annexes?.ess?.extraCost ?? 0).toBe(0);
      const annex = page.getByTestId("certificate-ess-annex");
      await expect(annex).toBeVisible({ timeout: 30_000 });
      await expect(annex).toContainText(/0 extra credits/);
      await annex.getByRole("checkbox").check();
      await page.getByTestId("issue-certificate").click();
      const preview = page.getByTestId("certificate-preview");
      await expect(preview).toBeVisible();
      await expect(preview).toContainText(/Confirm before anything is charged/);
      await expect(page.getByTestId("certificate-preview-ess")).toBeVisible();
      await preview.getByRole("button", { name: "Cancel" }).click();
      await credits.assertUnchanged(before, "certificate preview (UI, cancelled)");
    }
  });
});

test.describe("Secondary sandbox", () => {
  test("Growth: sandbox banner stays, a small limit order rests on the book, every response is sandbox:true", async ({ page, visit, growth, api, qa }, testInfo) => {
    void growth;
    const samId = qa.scratch["capTable.samId"] as string | undefined;
    expect(samId, "Sam's shareholder id from 03-cap-table").toBeTruthy();
    const book = await get<{ ok: boolean; sandbox: boolean; notice: string; holders: Array<{ holderKey: string; label: string }> }>(api, "/api/secondary/sim/book");
    await evidence(testInfo, "GET book", { status: book.status, sandbox: book.body.sandbox, notice: book.body.notice, holders: book.body.holders });
    expect(book.status).toBe(200);
    expect(book.body.sandbox).toBe(true);

    await visit("/workspace/secondary-offer");
    await expect(page.getByTestId("sandbox-banner")).toBeVisible();
    await expect(page.getByTestId("sim-locked")).toHaveCount(0);
    const form = page.getByTestId("sim-order-form");
    await expect(form).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("sim-side-buy").click();
    await page.getByTestId("sim-holder").selectOption(`sh:${samId}`);
    await page.getByTestId("sim-price").fill("1.00");
    await page.getByTestId("sim-qty").fill("10");
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/secondary/sim/orders") && r.request().method() === "POST"),
      page.getByTestId("sim-submit").click(),
    ]);
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; sandbox?: boolean; order?: { id: string; status?: string }; error?: string };
    await evidence(testInfo, "POST order", { status: res.status(), body });
    expect(res.status()).toBe(200);
    expect(body.sandbox).toBe(true);
    await expect(page.getByTestId("sim-notice")).toContainText(/sandbox/i);
    await expect(page.getByTestId("sim-depth")).toContainText(/Bids/);
    await expect(page.getByTestId("sandbox-banner")).toBeVisible();

    // Tidy: cancel the resting order so the book is empty for the next spec.
    if (body.order?.id) {
      const cancel = await post(api, "/api/secondary/sim/orders", { action: "cancel", orderId: body.order.id });
      await evidence(testInfo, "cancel", { status: cancel.status, sandbox: cancel.body.sandbox });
      expect([200, 409]).toContain(cancel.status);
      expect(cancel.body.sandbox).toBe(true);
    }
  });

  test("sandbox validation errors carry the sandbox marker", async ({ api, growth }, testInfo) => {
    void growth;
    const bad = await post(api, "/api/secondary/sim/orders", { side: "sideways", price: 1, qty: 1 });
    await evidence(testInfo, "bad side", bad.body);
    expect(bad.status).toBe(400);
    expect(bad.body.sandbox).toBe(true);
  });
});

test.describe("On-chain vs register", () => {
  test("without a share token: GET reports token:null, run/push answer 409 no_token, the panel stays hidden", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const status = await get<{ ok: boolean; token: unknown; last: unknown }>(api, "/api/cap-table/chain-reconcile");
    const run = await post(api, "/api/cap-table/chain-reconcile", { action: "run" });
    const push = await post(api, "/api/cap-table/chain-reconcile", { action: "push" });
    await evidence(testInfo, "API", { status: status.body, run: { status: run.status, body: run.body }, push: { status: push.status, body: push.body } });
    expect(status.status).toBe(200);
    await visit("/workspace/cap-table");
    await expect(page.getByRole("heading", { name: "Cap Table" })).toBeVisible({ timeout: 30_000 });
    if (status.body.token) {
      // A token row exists (seeded by an operator): exercise the panel copy.
      const panel = page.getByTestId("chain-reconcile-panel");
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await expect(panel).toContainText(/On-chain vs register/);
      await panel.getByTestId("chain-reconcile-run").click();
      await expect(panel).toHaveAttribute("data-status", /in_sync|drift|unreachable/, { timeout: 60_000 });
      await expect(panel.getByTestId("chain-reconcile-push")).toContainText(/Push register to chain/);
      expect([200, 409, 502]).toContain(push.status);
    } else {
      expect(run.status).toBe(409);
      expect(run.body.error).toBe("no_token");
      expect(push.status).toBe(409);
      expect(push.body.error).toBe("no_token");
      await expect(page.getByTestId("chain-reconcile-panel")).toHaveCount(0);
      testInfo.annotations.push({ type: "coverage", description: "Check-chain / push copy needs a blockchain_sync_config token row (Scale+); the suite does not seed one — API contract covered (409 no_token)." });
    }
  });
});

test.describe("Admin sector multiples", () => {
  test("non-admin founder: API 403 not_admin with the standard error key, page redirects to /dashboard", async ({ page, visit, api }, testInfo) => {
    const r = await get<{ ok: boolean; error?: string; reason?: string }>(api, "/api/admin/sector-multiples");
    await evidence(testInfo, "GET admin", { status: r.status, body: r.body });
    expect(r.status).toBe(403);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe("not_admin");
    const approve = await post(api, "/api/admin/sector-multiples/00000000-0000-4000-8000-000000000000/approve", {});
    expect(approve.status).toBe(403);

    await visit("/dashboard/admin/sector-multiples");
    await page.waitForURL((u) => !/\/dashboard\/admin\/sector-multiples/.test(u.pathname), { timeout: 30_000 });
    const landed = new URL(page.url()).pathname;
    await evidence(testInfo, "page redirect", { landed });
    expect(landed).toMatch(/^\/dashboard(\/onboarding)?$/);
  });
});
