/**
 * 23 — Investor data room (S24 / S26; release-qa2 rows 17–18, qa4 token
 * routes): Free → /pricing gate, the founder page on Growth, the room is
 * GENERATED only under LIVE_QA_SPEND_OK (the route is a flat 3-credit charge
 * with no preview / `included` path — annotated), a named investor link is
 * minted, NDA click-wrap + per-investor watermark are switched on, and an
 * ANONYMOUS browser context walks the `/s/dr/<token>` link: gate blocks the
 * documents, the PDF endpoint is 403 `nda_required`, acceptance persists
 * across a reload, the PDF carries "Prepared for <investor>", the founder
 * sees the engagement rows, `PATCH autoFollowUp` round-trips, and revoking
 * the link turns it into the 404 page.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { anonRequest, del, evidence, get, patch, pdfText, post, put } from "./lib/api";
import { env } from "./lib/env";
import { getScratch, setScratch } from "./lib/run-state";

const INVESTOR = { name: "Jane Chen", firm: "Blackbird", email: "jane.chen@example.com" } as const;
const PLACEHOLDER_DOC = "00000000-0000-4000-8000-0000000000d0";

interface Link {
  id: string;
  dataRoomId: string;
  url: string;
  investorName: string | null;
  investorEmail: string | null;
  state: "active" | "revoked" | "expired";
  views: number;
  ndaRequired: boolean;
  ndaSignedAt: string | null;
  watermark: string | null;
  autoFollowUp: boolean;
}
interface Settings {
  dataRoomId: string;
  ndaRequired: boolean;
  ndaVersion: number;
  watermarkEnabled: boolean;
  entitled: boolean;
  canEdit: boolean;
}

/** The link the run minted (scratch), or skip the test with the reason recorded by the minting step. */
function requireLink(): { token: string; url: string; roomId: string } {
  const token = getScratch<string>("dataRoom.token");
  const url = getScratch<string>("dataRoom.url");
  const roomId = getScratch<string>("dataRoom.roomId");
  test.skip(!token || !url || !roomId, getScratch<string>("dataRoom.skipReason") ?? "no investor link was minted earlier in this run");
  return { token: token!, url: url!, roomId: roomId! };
}

async function anonBrowser(ctxFactory: { newContext: (o: { storageState: { cookies: never[]; origins: never[] } }) => Promise<BrowserContext> }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await ctxFactory.newContext({ storageState: { cookies: [], origins: [] } });
  return { ctx, page: await ctx.newPage() };
}

test.describe("Data room — founder side", () => {
  test("/workspace/data-room on Free redirects to /pricing?feature=data_room.access; on Growth renders generator, investor access, trust settings and heatmap", async ({ page, visit, qa }, testInfo) => {
    await visit("/workspace/data-room");
    if (!qa.elevated) {
      await page.waitForURL(/\/pricing/, { timeout: 30_000 });
      const url = new URL(page.url());
      await evidence(testInfo, "redirect", { landed: page.url() });
      expect(url.searchParams.get("feature")).toBe("data_room.access");
      return;
    }
    await expect(page.getByTestId("dataroom-generate")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dataroom-generate")).toContainText(/3\.00 credits/);
    await expect(page.getByTestId("investor-share-panel")).toBeVisible();
    await expect(page.getByTestId("room-trust-settings")).toBeVisible();
    await expect(page.getByTestId("engagement-heatmap")).toBeVisible();
    await evidence(testInfo, "page", { generator: await page.getByTestId("dataroom-generate").innerText() });
  });

  test("contracts without a room: POST link → 409 no_data_room, PATCH unknown token → 404, anon bad link → 404 page, anon NDA bad token → 404", async ({ api, qa, growth }, testInfo) => {
    void growth;
    const links = await get<{ ok: boolean; links: Link[] }>(api, "/api/investor-data-room");
    expect(links.status).toBe(200);
    const hasRoom = (links.body.links ?? []).length > 0 || (await get(api, "/api/data-room/settings")).status === 200;
    const mint = hasRoom ? null : await post(api, "/api/investor-data-room", { investorName: "Nobody" });
    const unknown = await patch(api, "/api/investor-data-room", { token: "not-a-real-token-0123456789", autoFollowUp: true });
    const anon = await anonRequest(qa.baseURL);
    try {
      const pageRes = await anon.get("/s/dr/not-a-real-token-0123456789", { headers: { accept: "text/html" }, maxRedirects: 0 });
      const nda = await post(anon, "/api/data-room/nda", { token: "not-a-real-token-0123456789", version: 1 });
      await evidence(testInfo, "contracts", { hasRoom, mint: mint ? { status: mint.status, body: mint.body } : "room exists", unknownPatch: unknown.body, anonPage: pageRes.status(), nda: nda.body });
      if (mint) {
        expect(mint.status).toBe(409);
        expect(mint.body.error).toBe("no_data_room");
      }
      expect(unknown.status).toBe(404);
      expect(pageRes.status()).toBe(404);
      expect(await pageRes.text()).toMatch(/This data room link is not available/);
      expect(nda.status).toBe(404);
    } finally {
      await anon.dispose();
    }
  });

  test("generate the data room (3 credits — only under LIVE_QA_SPEND_OK; no preview / included path exists)", async ({ page, visit, growth, api, credits }, testInfo) => {
    void growth;
    test.setTimeout(150_000);
    const settings = await get<{ ok: boolean; settings?: Settings }>(api, "/api/data-room/settings");
    if (settings.status === 200 && settings.body.settings?.dataRoomId) {
      setScratch("dataRoom.roomId", settings.body.settings.dataRoomId);
      await evidence(testInfo, "room already exists", settings.body.settings);
      return;
    }
    testInfo.annotations.push({ type: "finding", description: "POST /api/data-room/generate is a flat 3-credit charge with no preview/`included` response — the credits-discipline preview pattern (cost-first, confirm) does not exist on this route" });
    if (!env.spendOk) {
      setScratch("dataRoom.skipReason", "no data room: generation costs 3 credits and LIVE_QA_SPEND_OK is unset (no included path)");
      test.skip(true, "generation costs 3 credits — set LIVE_QA_SPEND_OK=1 to cover the investor-link journey");
    }
    const before = await credits.snapshot();
    await visit("/workspace/data-room");
    const gen = page.getByTestId("dataroom-generate");
    await expect(gen).toBeVisible({ timeout: 30_000 });
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/data-room/generate") && r.request().method() === "POST", { timeout: 120_000 }),
      gen.getByRole("button", { name: /Generate Data Room/ }).click(),
    ]);
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; dataRoomId?: string; documents?: unknown; creditsUsed?: number; balance?: number; error?: string };
    const after = await credits.snapshot();
    await evidence(testInfo, "POST /api/data-room/generate", { status: res.status(), ok: body.ok, dataRoomId: body.dataRoomId, documents: body.documents, creditsUsed: body.creditsUsed, before, after, error: body.error });
    expect(res.status()).toBe(200);
    expect(body.dataRoomId).toBeTruthy();
    expect(after).toBe(before - 3);
    setScratch("dataRoom.roomId", body.dataRoomId!);
    await expect(page.getByRole("heading", { name: /Generated Data Room/ })).toBeVisible({ timeout: 30_000 });
  });

  test("mint a named investor link from the Investor access panel", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const roomId = getScratch<string>("dataRoom.roomId");
    test.skip(!roomId, getScratch<string>("dataRoom.skipReason") ?? "no data room in this run");
    await visit("/workspace/data-room");
    const panel = page.getByTestId("investor-share-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await panel.locator("#investor-name").fill(INVESTOR.name);
    await panel.locator("#investor-firm").fill(INVESTOR.firm);
    await panel.locator("#investor-email").fill(INVESTOR.email);
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/investor-data-room") && r.request().method() === "POST", { timeout: 45_000 }),
      panel.getByTestId("investor-share-mint").click(),
    ]);
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string; url?: string; dataRoomId?: string; expiresAt?: string; error?: string };
    await evidence(testInfo, "POST /api/investor-data-room", { status: res.status(), ok: body.ok, urlHost: body.url ? new URL(body.url).host : null, dataRoomId: body.dataRoomId, expiresAt: body.expiresAt, error: body.error });
    expect(res.status()).toBe(200);
    expect(body.token).toBeTruthy();
    expect(body.url ?? "").toMatch(/^https:\/\/blockid\.au\/s\/dr\//); // F3 regression: never the upstream bind address
    setScratch("dataRoom.token", body.token!);
    setScratch("dataRoom.url", body.url!);
    await expect(panel.getByTestId("investor-share-list")).toContainText(INVESTOR.name, { timeout: 30_000 });
    const list = await get<{ ok: boolean; links: Link[] }>(api, "/api/investor-data-room");
    const mine = list.body.links.find((l) => l.url.endsWith(body.token!));
    expect(mine?.state).toBe("active");
    expect(mine?.investorEmail).toBe(INVESTOR.email);
  });

  test("switch on NDA click-wrap and per-investor watermark (PUT /api/data-room/settings)", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const { roomId } = requireLink();
    await visit("/workspace/data-room");
    const trust = page.getByTestId("room-trust-settings");
    await expect(trust).toBeVisible({ timeout: 30_000 });
    if (await trust.getByTestId("trust-locked").count()) {
      await evidence(testInfo, "locked", { text: await trust.innerText() });
      throw new Error("trust settings locked on Growth — investor_links.premium should be entitled (Starter+)");
    }
    const nda = trust.getByTestId("trust-nda-toggle");
    const wm = trust.getByTestId("trust-watermark-toggle");
    if (!(await nda.isChecked())) {
      await Promise.all([page.waitForResponse((r) => r.url().includes("/api/data-room/settings") && r.request().method() === "PUT", { timeout: 30_000 }), nda.click()]);
    }
    if (!(await wm.isChecked())) {
      await Promise.all([page.waitForResponse((r) => r.url().includes("/api/data-room/settings") && r.request().method() === "PUT", { timeout: 30_000 }), wm.click()]);
    }
    const s = await get<{ ok: boolean; settings: Settings }>(api, `/api/data-room/settings?dataRoomId=${roomId}`);
    await evidence(testInfo, "GET /api/data-room/settings", s.body);
    expect(s.status).toBe(200);
    expect(s.body.settings.ndaRequired).toBe(true);
    expect(s.body.settings.watermarkEnabled).toBe(true);
    setScratch("dataRoom.ndaVersion", s.body.settings.ndaVersion);
    // Validation shape — nothing changes.
    const bad = await put(api, "/api/data-room/settings", { dataRoomId: roomId, ndaRequired: "yes" });
    expect(bad.status).toBe(400);
  });
});

test.describe("Data room — anonymous investor", () => {
  test("NDA click-wrap gate blocks the documents, PDF endpoint is 403 nda_required, acceptance persists across a reload", async ({ browser, qa }, testInfo) => {
    const { token, url } = requireLink();
    const { ctx, page } = await anonBrowser(browser);
    const anon = await anonRequest(qa.baseURL);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const gate = page.getByTestId("nda-gate");
      await expect(gate).toBeVisible({ timeout: 30_000 });
      await expect(gate).toContainText(/Confidentiality terms before you continue/);
      expect(await page.getByTestId("doc-pdf-link").count(), "no document links behind the gate").toBe(0);
      const blocked = await get(anon, `/api/data-room/share/${token}/pdf?doc=${PLACEHOLDER_DOC}`);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toBe("nda_required");

      await gate.locator("#nda-email").fill(INVESTOR.email);
      await gate.locator("#nda-agree").check();
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/data-room/nda") && r.request().method() === "POST", { timeout: 30_000 }),
        gate.getByTestId("nda-agree-button").click(),
      ]);
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; version?: number };
      await evidence(testInfo, "POST /api/data-room/nda", { status: res.status(), body, blocked: blocked.body });
      expect(res.status()).toBe(200);
      expect(body.status).toBe("accepted");
      await expect(page.getByTestId("nda-gate")).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByText(/Confidentiality terms accepted/)).toBeVisible({ timeout: 30_000 });

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("nda-gate")).toHaveCount(0);
      await expect(page.getByText(/Confidentiality terms accepted/)).toBeVisible({ timeout: 30_000 });
      const docLinks = await page.getByTestId("doc-pdf-link").evaluateAll((els) => els.map((a) => (a as HTMLAnchorElement).getAttribute("href")));
      setScratch("dataRoom.docLink", docLinks[0] ?? null);
      await evidence(testInfo, "after acceptance", { docLinks: docLinks.length, first: docLinks[0] ?? null });
      const again = await post(anon, "/api/data-room/nda", { token, version: getScratch<number>("dataRoom.ndaVersion") ?? 1 });
      expect(again.status).toBe(200); // already signed → still accepted, idempotent
    } finally {
      await anon.dispose();
      await ctx.close();
    }
  });

  test("a document PDF downloaded through the link is stamped 'Prepared for <investor>'", async ({ qa }, testInfo) => {
    requireLink();
    const href = getScratch<string | null>("dataRoom.docLink");
    test.skip(!href, "the fresh room has no document with content behind a PDF link — watermark not exercisable");
    const anon = await anonRequest(qa.baseURL);
    try {
      const res = await anon.get(href!, { maxRedirects: 0 });
      const buf = await res.body();
      const text = res.status() === 200 && res.headers()["content-type"]?.includes("application/pdf") ? await pdfText(buf).catch(() => "") : "";
      await evidence(testInfo, "watermarked pdf", { href, status: res.status(), type: res.headers()["content-type"], watermarkHeader: res.headers()["x-blockid-watermark"] ?? null, bytes: buf.length, preparedFor: /Prepared for [^\n·]+/.exec(text)?.[0] ?? null });
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toMatch(/application\/pdf/);
      expect(res.headers()["x-blockid-watermark"]).toBe("1");
      expect(text).toContain(`Prepared for ${INVESTOR.name}`);
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("Data room — engagement, follow-up, revoke", () => {
  test("founder sees the investor's open in the engagement analytics and heatmap", async ({ page, visit, growth, api }, testInfo) => {
    void growth;
    const { roomId, token } = requireLink();
    await expect
      .poll(async () => (await get<{ ok: boolean; analytics: { totalViews: number } }>(api, `/api/data-room/engage?roomId=${roomId}`)).body.analytics?.totalViews ?? 0, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    const analytics = await get<{ ok: boolean; analytics: { totalViews: number; totalEvents: number; links: Array<{ id: string; label: string; ndaSignedAt: string | null }> } }>(api, `/api/data-room/engage?roomId=${roomId}`);
    const links = await get<{ ok: boolean; links: Link[] }>(api, "/api/investor-data-room");
    const mine = links.body.links.find((l) => l.url.endsWith(token));
    await evidence(testInfo, "engagement", { totalViews: analytics.body.analytics.totalViews, totalEvents: analytics.body.analytics.totalEvents, links: analytics.body.analytics.links, link: mine });
    expect(mine?.views ?? 0).toBeGreaterThanOrEqual(1);
    expect(mine?.ndaSignedAt, "NDA acceptance recorded on the link").toBeTruthy();
    await visit("/workspace/data-room");
    const heat = page.getByTestId("engagement-heatmap");
    await expect(heat).toBeVisible({ timeout: 30_000 });
    await expect(heat).toContainText(INVESTOR.name, { timeout: 30_000 });
  });

  test("PATCH /api/investor-data-room autoFollowUp round-trips (true → GET → false) and rejects a non-boolean", async ({ growth, api }, testInfo) => {
    void growth;
    const { token } = requireLink();
    const on = await patch<{ ok: boolean; autoFollowUp: boolean }>(api, "/api/investor-data-room", { token, autoFollowUp: true });
    const readOn = await get<{ ok: boolean; links: Link[] }>(api, "/api/investor-data-room");
    const off = await patch<{ ok: boolean; autoFollowUp: boolean }>(api, "/api/investor-data-room", { token, autoFollowUp: false });
    const readOff = await get<{ ok: boolean; links: Link[] }>(api, "/api/investor-data-room");
    const bad = await patch(api, "/api/investor-data-room", { token, autoFollowUp: "yes" });
    await evidence(testInfo, "autoFollowUp", { on: on.body, readOn: readOn.body.links.find((l) => l.url.endsWith(token))?.autoFollowUp, off: off.body, readOff: readOff.body.links.find((l) => l.url.endsWith(token))?.autoFollowUp, bad: bad.body });
    expect(on.status).toBe(200);
    expect(on.body.autoFollowUp).toBe(true);
    expect(readOn.body.links.find((l) => l.url.endsWith(token))?.autoFollowUp).toBe(true);
    expect(off.status).toBe(200);
    expect(readOff.body.links.find((l) => l.url.endsWith(token))?.autoFollowUp).toBe(false);
    expect(bad.status).toBe(400);
  });

  test("revoke the link → the anonymous page is the 404 'not available' page and the founder list shows Revoked", async ({ browser, growth, api }, testInfo) => {
    void growth;
    const { token, url } = requireLink();
    const revoke = await del(api, `/api/investor-data-room?token=${encodeURIComponent(token)}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.revoked).toBe(true);
    const { ctx, page } = await anonBrowser(browser);
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/This data room link is not available/, { timeout: 30_000 });
      const links = await get<{ ok: boolean; links: Link[] }>(api, "/api/investor-data-room");
      const mine = links.body.links.find((l) => l.url.endsWith(token));
      await evidence(testInfo, "revoked", { status: res?.status(), state: mine?.state });
      expect(res?.status()).toBe(404);
      expect(mine?.state).toBe("revoked");
      const again = await del(api, `/api/investor-data-room?token=${encodeURIComponent(token)}`);
      expect([200, 404]).toContain(again.status); // idempotent or already gone — never a 500
    } finally {
      await ctx.close();
    }
  });
});
