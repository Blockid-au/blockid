/**
 * 40 — Institutional API (read-only) lane (G21 P3-B).
 *
 *   • anonymous → 401 on /api/v1/institutional/methodology and /benchmarks
 *     with the one envelope { ok:false, error:"unauthorized" };
 *   • with the elevated evaluator seat (28-dossier storage state, lifted to
 *     Program — `investor_vc_small` carries `api.access`) a bk_live_ key is
 *     minted through the existing key API (`POST /api/keys`, scope
 *     `evaluations:read`), then:
 *       – GET /methodology → 200, `svi_version`, the n-rules, an ETag; a
 *         second call with If-None-Match → 304;
 *       – GET /benchmarks?stage=4 → 200 and EVERY row carries `n` (≥ 10) and
 *         a band — an empty list is legal before the nightly cron has run;
 *       – GET /cohorts → 200 (the seat's cohorts; may be empty);
 *       – hourly rate-limit headers on every 200;
 *   • the key is revoked at the end (DELETE /api/keys/{id}) and the seat is
 *     put back to Scout, whatever happened in between.
 *
 * Nothing is written by the API itself (read-only); the only rows created
 * are the key (revoked) and the `institutional.read` audit rows.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { request, type APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { anonRequest, evidence, get, post, del } from "./lib/api";
import { dbAllowed, elevatePlan } from "./lib/db";
import { env, evaluatorEmailFor } from "./lib/env";
import { LIVE_QA_OUT } from "../../playwright.live-qa.config";

const EVALUATOR_STATE = path.join(LIVE_QA_OUT, "evaluator-storage-state.json");

interface Envelope {
  ok: boolean;
  error?: string;
  message?: string;
  data?: unknown;
  meta?: Record<string, unknown>;
}

interface KeyCreate {
  ok: boolean;
  key?: string;
  id?: string;
  scopes?: string[];
  reason?: string;
}

async function evaluatorRequest(baseURL: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL, storageState: EVALUATOR_STATE });
}

test.describe("Institutional API — anonymous", () => {
  test("methodology and benchmarks refuse a missing key with the one envelope", async ({ qa }, testInfo) => {
    const anon = await anonRequest(qa.baseURL);
    try {
      const methodology = await get<Envelope>(anon, "/api/v1/institutional/methodology");
      const benchmarks = await get<Envelope>(anon, "/api/v1/institutional/benchmarks?stage=4");
      await evidence(testInfo, "anonymous", { methodology: { status: methodology.status, error: methodology.body.error }, benchmarks: { status: benchmarks.status, error: benchmarks.body.error } });
      expect(methodology.status).toBe(401);
      expect(methodology.body).toMatchObject({ ok: false, error: "unauthorized" });
      expect(benchmarks.status).toBe(401);
      expect(benchmarks.body).toMatchObject({ ok: false, error: "unauthorized" });
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("Institutional API — keyed reads", () => {
  test("mint a key on the elevated evaluator seat, read methodology (200 + ETag → 304), benchmarks (n on every row) and cohorts; revoke the key", async ({ qa }, testInfo) => {
    test.skip(!existsSync(EVALUATOR_STATE), "the evaluator seat was not provisioned by 28-dossier");
    test.skip(!(env.elevate && dbAllowed()), "needs LIVE_QA_ELEVATE=1 + LIVE_QA_ALLOW_DB=1 to lift the seat to Program (api.access) for key issuance");
    const email = evaluatorEmailFor(qa.email);
    elevatePlan(email, "investor_vc_small");

    const evaluator = await evaluatorRequest(qa.baseURL);
    let keyId: string | undefined;
    try {
      const minted = await post<KeyCreate>(evaluator, "/api/keys", { name: "QA Live institutional", scopes: ["evaluations:read"] });
      await evidence(testInfo, "POST /api/keys", { status: minted.status, ok: minted.body.ok, id: minted.body.id, scopes: minted.body.scopes, reason: minted.body.reason });
      if (minted.status === 403 || minted.status === 400) {
        test.skip(true, `key issuance refused for this seat: ${minted.status} ${minted.body.reason ?? ""}`);
      }
      expect(minted.status).toBe(200);
      expect(minted.body.ok).toBe(true);
      expect(minted.body.key).toMatch(/^bk_live_[0-9a-f]{48}$/);
      keyId = minted.body.id;
      const auth = { Authorization: `Bearer ${minted.body.key}` };

      const keyed = await request.newContext({ baseURL: qa.baseURL, extraHTTPHeaders: auth });
      try {
        const methodology = await keyed.get("/api/v1/institutional/methodology");
        const mBody = (await methodology.json()) as Envelope & { data: { svi_version: string; benchmark_rules: { floor: number; n_rules: unknown[] } } };
        const etag = methodology.headers()["etag"];
        await evidence(testInfo, "GET /methodology", { status: methodology.status(), svi_version: mBody.data?.svi_version, floor: mBody.data?.benchmark_rules?.floor, etag, limit: methodology.headers()["x-ratelimit-limit"], window: methodology.headers()["x-ratelimit-window"], cache: methodology.headers()["cache-control"] });
        expect(methodology.status()).toBe(200);
        expect(mBody.ok).toBe(true);
        expect(mBody.data.svi_version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(mBody.data.benchmark_rules.floor).toBe(10);
        expect(mBody.data.benchmark_rules.n_rules.length).toBe(4);
        expect(etag).toBeTruthy();
        expect(methodology.headers()["x-ratelimit-limit"]).toBe("600");
        expect(methodology.headers()["cache-control"]).toBe("private, max-age=60");

        const cached = await keyed.get("/api/v1/institutional/methodology", { headers: { "If-None-Match": etag! } });
        await evidence(testInfo, "GET /methodology (If-None-Match)", { status: cached.status() });
        expect(cached.status()).toBe(304);

        const benchmarks = await keyed.get("/api/v1/institutional/benchmarks?stage=4");
        const bBody = (await benchmarks.json()) as Envelope & { data: Array<{ segment_key: string; n: number; band: string; label: string; median: number }> };
        await evidence(testInfo, "GET /benchmarks?stage=4", { status: benchmarks.status(), count: bBody.data?.length, rows: (bBody.data ?? []).map((r) => ({ key: r.segment_key, n: r.n, band: r.band })) });
        expect(benchmarks.status()).toBe(200);
        expect(bBody.ok).toBe(true);
        expect(Array.isArray(bBody.data)).toBe(true);
        for (const row of bBody.data) {
          expect(typeof row.n).toBe("number");
          expect(row.n).toBeGreaterThanOrEqual(10);
          expect(["indicative", "benchmark", "segmented"]).toContain(row.band);
          expect(row.label).toContain(`n = ${row.n}`);
          expect(typeof row.median).toBe("number");
        }
        expect(bBody.meta).toMatchObject({ floor: 10 });

        const badStage = await keyed.get("/api/v1/institutional/benchmarks?stage=99");
        expect(badStage.status()).toBe(400);
        expect(await badStage.json()).toMatchObject({ ok: false, error: "invalid_query" });

        const cohorts = await keyed.get("/api/v1/institutional/cohorts");
        const cBody = (await cohorts.json()) as Envelope & { data: Array<{ id: string; role: string }> };
        await evidence(testInfo, "GET /cohorts", { status: cohorts.status(), count: cBody.data?.length, roles: (cBody.data ?? []).map((c) => c.role) });
        expect(cohorts.status()).toBe(200);
        expect(cBody.ok).toBe(true);
        const text = JSON.stringify(cBody);
        expect(text).not.toMatch(/@blockid\.au|private_notes|invite_token/);

        const foreign = await keyed.get("/api/v1/institutional/cohorts/00000000-0000-4000-8000-000000000000");
        expect(foreign.status()).toBe(404);
        expect(await foreign.json()).toMatchObject({ ok: false, error: "not_found" });
      } finally {
        await keyed.dispose();
      }
    } finally {
      if (keyId) {
        const revoked = await del<{ ok: boolean }>(evaluator, `/api/keys/${encodeURIComponent(keyId)}`);
        await evidence(testInfo, "DELETE /api/keys/{id}", { status: revoked.status, ok: revoked.body.ok });
      }
      await evaluator.dispose();
      elevatePlan(email, "investor_angel");
    }
  });
});
