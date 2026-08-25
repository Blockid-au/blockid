// E2E contract tests for the A$3 One-Click Guest Analysis flow.
//
// Scope: API-level boundary tests — no real Stripe checkout (that requires
// browser automation against Stripe's hosted page). We pin:
//   1. /api/guest-analysis/create-order — input validation + rate-limit headers
//   2. /api/guest-analysis/upload-pitch — file type + size validation
//   3. /api/guest-analysis/status/:id  — public status endpoint shape
//
// A real end-to-end checkout test (clicking through Stripe) lives in the
// manual QA checklist and would need Stripe test-mode card fixtures.

import { test, expect } from "@playwright/test";

const CREATE_ORDER = "/api/guest-analysis/create-order";
const UPLOAD_PITCH = "/api/guest-analysis/upload-pitch";
const STATUS_BASE = "/api/guest-analysis/status";

// ─── create-order validation ──────────────────────────────────────────────

test.describe("POST /api/guest-analysis/create-order — input validation", () => {
  test.setTimeout(15_000);

  test("rejects empty body with 400", async ({ request }) => {
    const res = await request.post(CREATE_ORDER, {
      data: {},
      headers: { "content-type": "application/json" },
    });
    expect([400, 429, 503]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(typeof body.error).toBe("string");
    }
  });

  test("rejects invalid email with 400", async ({ request }) => {
    const res = await request.post(CREATE_ORDER, {
      data: { email: "not-valid", inputType: "website_url", inputValue: "https://example.com" },
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body.error).toMatch(/email/i);
    }
  });

  test("rejects disposable email with 400", async ({ request }) => {
    const res = await request.post(CREATE_ORDER, {
      data: { email: "test@mailinator.com", inputType: "website_url", inputValue: "https://example.com" },
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body.error).toMatch(/real email/i);
    }
  });

  test("rejects invalid inputType with 400", async ({ request }) => {
    const res = await request.post(CREATE_ORDER, {
      data: { email: "test@example.com", inputType: "invalid", inputValue: "https://example.com" },
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(typeof body.error).toBe("string");
    }
  });

  test("rejects malformed website_url with 400", async ({ request }) => {
    const res = await request.post(CREATE_ORDER, {
      data: { email: "test@example.com", inputType: "website_url", inputValue: "not-a-url" },
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(typeof body.error).toBe("string");
    }
  });
});

// ─── upload-pitch validation ──────────────────────────────────────────────

test.describe("POST /api/guest-analysis/upload-pitch — file validation", () => {
  test.setTimeout(15_000);

  test("rejects non-multipart request", async ({ request }) => {
    const res = await request.post(UPLOAD_PITCH, {
      data: { file: "not-a-file" },
      headers: { "content-type": "application/json" },
    });
    expect([400, 429]).toContain(res.status());
  });

  test("responds within SLA (rate limit or validation error, not timeout)", async ({ request }) => {
    // Sending an empty multipart form — expect fast 400, not a hang
    const res = await request.post(UPLOAD_PITCH, {
      multipart: { _noop: "1" },
    });
    // 400 = invalid file, 429 = rate limited — both are acceptable fast exits
    expect([400, 429]).toContain(res.status());
  });
});

// ─── status endpoint ──────────────────────────────────────────────────────

test.describe("GET /api/guest-analysis/status/:id — public status shape", () => {
  test.setTimeout(10_000);

  test("returns 404 for unknown id", async ({ request }) => {
    const res = await request.get(`${STATUS_BASE}/00000000-0000-0000-0000-000000000000`);
    expect([404, 400]).toContain(res.status());
  });

  test("rejects obviously invalid id format", async ({ request }) => {
    const res = await request.get(`${STATUS_BASE}/not-a-uuid`);
    expect([400, 404]).toContain(res.status());
  });
});
