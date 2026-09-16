/**
 * 24 — Outbound webhooks (release-qa2 row 21, qa4 SSRF posture):
 * `/workspace/evidence/connectors` #webhooks — plan gate on Free (402
 * plan_required + gate copy), the SSRF guard rejects `http://169.254.169.254`
 * and `http://localhost` (and the https metadata host), an endpoint is
 * created through the UI with the signing secret shown ONCE (never returned
 * by the list), a test ping is delivered and its `webhook_deliveries` row
 * is visible (API + table), then the endpoint is deleted.
 *
 * The endpoint URL is https://example.com/… — IANA's documentation host,
 * publicly resolvable (the guard refuses anything that does not resolve to
 * a public address, so TEST-NET / .invalid hosts cannot be used) and safe to
 * receive one signed ping.
 */
import { test, expect } from "./fixtures";
import { evidence, get, post } from "./lib/api";
import { getScratch, setScratch } from "./lib/run-state";

const SINK_URL = "https://example.com/hooks/blockid-live-qa";
const SSRF_URLS = ["http://169.254.169.254/latest/meta-data/", "http://localhost/hooks", "https://169.254.169.254/", "https://localhost:3000/hooks", "https://127.0.0.1/"];

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
}
interface Delivery {
  id: string;
  event: string;
  status: "queued" | "delivered" | "failed" | "dead";
  attempts: number;
  response_status: number | null;
  last_error: string | null;
}

test.describe("Webhooks", () => {
  test("plan gate: Free → 402 plan_required + gate copy; Growth → access.allowed with the event catalogue", async ({ page, visit, api, qa }, testInfo) => {
    const list = await get<{ ok: boolean; error?: string; message?: string; endpoints?: Endpoint[]; access?: { allowed: boolean; reason: string }; events?: Array<{ event: string }> }>(api, "/api/webhooks");
    await visit("/workspace/evidence/connectors");
    const section = page.locator("section#webhooks");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section.getByRole("heading", { name: "Webhooks" })).toBeVisible();
    await evidence(testInfo, "GET /api/webhooks", { status: list.status, body: { ...list.body, endpoints: list.body.endpoints?.length } });
    if (!qa.elevated) {
      // GET is never plan-gated (route header): it lists the caller's
      // endpoints and reports `access` so the UI can render the gate copy.
      // Only POST answers 402 plan_required. Verified un-elevated 2026-09-16
      // (G14 Wave A post-deploy review) — the old 402 expectation had only
      // ever run behind LIVE_QA_ELEVATE=1.
      expect(list.status).toBe(200);
      expect(list.body.access?.allowed).toBe(false);
      const create = await post(api, "/api/webhooks", { url: "https://example.com/hook", events: ["svi.rescored"] });
      expect(create.status).toBe(402);
      expect(create.body.error).toBe("plan_required");
      await expect(section.locator("[data-webhooks-gate]")).toContainText(/included with Growth/);
      expect(await section.locator("[data-webhooks-add]").count()).toBe(0);
      return;
    }
    expect(list.status).toBe(200);
    expect(list.body.access?.allowed).toBe(true);
    expect((list.body.events ?? []).map((e) => e.event)).toEqual(expect.arrayContaining(["svi.rescored", "funding.report_ready"]));
    await expect(section.locator("[data-webhooks-add]")).toBeVisible();
  });

  test("SSRF guard: metadata IP, localhost and loopback are 400 url_rejected — no endpoint created", async ({ api, growth }, testInfo) => {
    void growth;
    const rows: Array<{ url: string; status: number; error?: string; reason?: string }> = [];
    for (const url of SSRF_URLS) {
      const r = await post<{ ok: boolean; error?: string; reason?: string }>(api, "/api/webhooks", { url, events: ["svi.rescored"] });
      rows.push({ url, status: r.status, error: r.body.error, reason: r.body.reason });
    }
    const list = await get<{ ok: boolean; endpoints: Endpoint[] }>(api, "/api/webhooks");
    await evidence(testInfo, "ssrf probes", { rows, endpointsAfter: list.body.endpoints?.map((e) => e.url) });
    for (const r of rows) {
      expect(r.status, `${r.url} must be refused`).toBe(400);
      expect(r.error, `${r.url} error code`).toBe("url_rejected");
    }
    expect((list.body.endpoints ?? []).some((e) => /169\.254|localhost|127\.0\.0\.1/.test(e.url))).toBe(false);
  });

  test("create an endpoint through the UI: secret shown once, absent from the list", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    await visit("/workspace/evidence/connectors");
    const section = page.locator("section#webhooks");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await section.locator("[data-webhooks-add]").click();
    const form = section.locator("form");
    await form.locator('input[type="url"]').fill(SINK_URL);
    await form.getByPlaceholder("Zapier → HubSpot").fill("live-QA sink (deleted at the end of the spec)");
    const boxes = form.locator('input[type="checkbox"]');
    if (!(await boxes.first().isChecked())) await boxes.first().check();
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/webhooks") && r.request().method() === "POST", { timeout: 45_000 }),
      form.getByRole("button", { name: /Create endpoint/ }).click(),
    ]);
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; endpoint?: Endpoint; secret?: string; error?: string; reason?: string };
    await evidence(testInfo, "POST /api/webhooks", { status: res.status(), ok: body.ok, endpoint: body.endpoint, secretLength: body.secret?.length ?? 0, error: body.error, reason: body.reason });
    expect(res.status()).toBe(201);
    expect(body.endpoint?.id).toBeTruthy();
    expect((body.secret ?? "").length).toBeGreaterThanOrEqual(16);
    setScratch("webhooks.endpointId", body.endpoint!.id);

    const reveal = section.locator("[data-webhooks-secret]");
    await expect(reveal).toBeVisible();
    await expect(reveal).toContainText(/shown once/);
    await expect(reveal.locator("code")).toHaveText(body.secret!);
    await reveal.getByRole("button", { name: /I have saved it/ }).click();
    await expect(reveal).toHaveCount(0);
    await expect(section.locator(`li[data-webhook-endpoint="${body.endpoint!.id}"]`)).toBeVisible();

    const list = await get<{ ok: boolean; endpoints: Endpoint[] }>(api, "/api/webhooks");
    const mine = list.body.endpoints.find((e) => e.id === body.endpoint!.id);
    expect(mine?.url).toBe(SINK_URL);
    expect(JSON.stringify(mine)).not.toContain(body.secret!);
    expect(list.text).not.toContain(body.secret!);
  });

  test("send a test ping → delivery row visible in the API and the Deliveries table", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const id = getScratch<string>("webhooks.endpointId");
    test.skip(!id, "no endpoint was created earlier in this run");
    await visit("/workspace/evidence/connectors");
    const row = page.locator(`li[data-webhook-endpoint="${id}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/webhooks/${id}/test`) && r.request().method() === "POST", { timeout: 60_000 }),
      row.getByRole("button", { name: /Send test ping/ }).click(),
    ]);
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; delivery_id?: string; status?: number; error?: string; duration_ms?: number };
    await evidence(testInfo, "POST /api/webhooks/[id]/test", { status: res.status(), body });
    expect(res.status()).toBe(200);
    expect(body.delivery_id).toBeTruthy();
    // `status` is the sink's HTTP status (example.com answers 405 to a POST):
    // the signed ping went out and the attempt is on the ledger either way.
    expect(body.status, "sink answered the signed POST").toBeGreaterThanOrEqual(200);
    if (body.ok === false) testInfo.annotations.push({ type: "note", description: `sink ${SINK_URL} answered ${body.status} (${body.error}) — recorded as a failed delivery; the contract (signed POST + ledger row) holds` });
    await expect(row.locator("[data-webhook-test-result]")).toBeVisible({ timeout: 30_000 });

    const deliveries = await get<{ ok: boolean; deliveries: Delivery[] }>(api, `/api/webhooks/${id}/deliveries`);
    const mine = deliveries.body.deliveries.find((d) => d.id === body.delivery_id);
    await evidence(testInfo, "GET deliveries", { count: deliveries.body.deliveries.length, mine });
    expect(deliveries.status).toBe(200);
    expect(mine?.event).toBe("ping");
    expect(["queued", "delivered", "failed", "dead"]).toContain(mine?.status ?? "");
    expect(mine?.response_status, "ledger row carries the sink's HTTP status").toBe(body.status);

    await row.getByRole("button", { name: /^Deliveries$/ }).click();
    const table = row.locator("table");
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(table).toContainText("ping");
    await expect(table).toContainText(mine!.status);
  });

  test("delete the endpoint → gone from the list; 404 afterwards", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const id = getScratch<string>("webhooks.endpointId");
    test.skip(!id, "no endpoint was created earlier in this run");
    await visit("/workspace/evidence/connectors");
    const row = page.locator(`li[data-webhook-endpoint="${id}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    page.once("dialog", (d) => void d.accept());
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/webhooks/${id}`) && r.request().method() === "DELETE", { timeout: 45_000 }),
      row.getByRole("button", { name: /^Delete$/ }).click(),
    ]);
    expect(res.status()).toBe(200);
    await expect(row).toHaveCount(0, { timeout: 30_000 });
    const list = await get<{ ok: boolean; endpoints: Endpoint[] }>(api, "/api/webhooks");
    const again = await api.fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    await evidence(testInfo, "after delete", { listed: list.body.endpoints.some((e) => e.id === id), secondDelete: again.status() });
    expect(list.body.endpoints.some((e) => e.id === id)).toBe(false);
    expect(again.status()).toBe(404);
    setScratch("webhooks.endpointId", null);
  });
});
