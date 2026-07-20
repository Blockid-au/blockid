/**
 * Smoke — API contracts.
 *
 * No browser needed — these hit the JSON/CSV endpoints directly through
 * Playwright's request fixture. Keeps the contracts pinned so the frontend
 * assumptions (dataset page, pricing experiments, idea-clarify tool)
 * don't silently drift.
 */

import { test, expect } from "@playwright/test";

test.describe("Smoke — API contracts", () => {
  test.setTimeout(30_000);

  test("GET /api/index/svi?bucket=overall returns aggregate JSON", async ({ request }) => {
    const res = await request.get("/api/index/svi?bucket=overall");
    expect(res.status()).toBe(200);
    const body = await res.json();
    const data = body.data ?? body;
    expect(typeof data.count).toBe("number");
    expect(typeof data.medianSvi).toBe("number");
    expect(typeof data.p10).toBe("number");
    expect(typeof data.p25).toBe("number");
    expect(typeof data.p50).toBe("number");
    expect(typeof data.p75).toBe("number");
    expect(typeof data.p90).toBe("number");
    expect(typeof body.disclaimer).toBe("string");
    expect(body.disclaimer.length).toBeGreaterThan(0);
  });

  test("GET /api/index/svi?bucket=sector&format=csv returns CSV with expected header", async ({ request }) => {
    const res = await request.get("/api/index/svi?bucket=sector&format=csv");
    expect(res.status()).toBe(200);
    const text = await res.text();
    const firstLine = text.split(/\r?\n/, 1)[0].trim();
    expect(firstLine).toBe("sector,count,median_svi,p25,p75,median_stage");
  });

  test("GET /api/pricing-test/assign is deterministic per bucket", async ({ request }) => {
    const url =
      "/api/pricing-test/assign?experiment=hero-cta-2026-07&bucket=e2e-test-bucket";
    const first = await request.get(url);

    // Experiment may not be seeded in every environment — fail loudly with
    // a helpful body dump rather than silently passing.
    if (first.status() !== 200) {
      const body = await first.text();
      throw new Error(
        `hero-cta-2026-07 not returning 200 (status=${first.status()}). ` +
          `Body: ${body}. Seed with scripts/seed-pricing-experiments.mjs.`,
      );
    }

    const firstJson = await first.json();
    expect(firstJson.ok).toBe(true);
    expect(typeof firstJson.variantKey).toBe("string");
    expect(firstJson.payload).toBeTruthy();

    const second = await request.get(url);
    expect(second.status()).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.variantKey).toBe(firstJson.variantKey);
  });

  test("POST /api/idea-questions (no answers) returns 5–7 questions", async ({ request }) => {
    const res = await request.post("/api/idea-questions", {
      data: { ideaText: "AI SaaS for accountants that automates BAS preparation." },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.questions.length).toBeGreaterThanOrEqual(5);
    expect(body.questions.length).toBeLessThanOrEqual(7);
  });

  test("POST /api/idea-questions (with answers) returns a recommendation", async ({ request }) => {
    const res = await request.post("/api/idea-questions", {
      data: {
        ideaText: "AI SaaS for accountants that automates BAS preparation.",
        answers: {
          customer: "SMBs",
          problem: "Manual BAS is slow",
          monetization: "Per-BAS subscription",
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.recommendation).toBeTruthy();
    expect(typeof body.recommendation.primaryFeature).toBe("string");
    expect(body.recommendation.primaryFeature.length).toBeGreaterThan(0);
    expect(typeof body.recommendation.primaryFeatureHref).toBe("string");
    expect(body.recommendation.primaryFeatureHref.length).toBeGreaterThan(0);
    expect(Array.isArray(body.recommendation.secondaryFeatures)).toBe(true);
    expect(body.recommendation.secondaryFeatures.length).toBeGreaterThanOrEqual(1);
  });
});
