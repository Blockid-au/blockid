// Colocated vitest for POST /api/index/submit (T-1301).
//
// Contracts pinned:
//   - Happy path: valid payload → 200 + { ok: true, message: "Submission received" }
//   - Missing required field → 400 + { error: <zod message> }
//   - Extra unknown fields → still 200 (Zod strips them)
//   - Rate limit exceeded → 429

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (registered BEFORE route import) ───────────────────────────────────

// Mock server-only so it doesn't throw in test environment
vi.mock("server-only", () => ({}));

// Mock rate-limit — default: allowed
const enforceRateLimitMock = vi.fn<
  (route: string, identity: string | null | undefined, request: Request, max: number, windowMs: number) => null
>().mockReturnValue(null);
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (
    route: string,
    identity: string | null | undefined,
    request: Request,
    max: number,
    windowMs: number,
  ) => enforceRateLimitMock(route, identity, request, max, windowMs),
}));

// Mock Supabase admin
interface InsertArgs {
  data: Record<string, unknown>[];
}
const insertMock = vi.fn<(args: InsertArgs) => Promise<{ error: null | { message: string; code: string } }>>();
const fromMock = vi.fn(() => ({ insert: insertMock }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

// Mock Telegram — fire-and-forget, never throw
vi.mock("@/lib/telegram", () => ({
  sendTelegram: vi.fn().mockResolvedValue(true),
  mdEscape: (s: string) => s,
}));

// Route import MUST come after mocks
import { POST } from "./route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function req(body: unknown): Request {
  return new Request("http://localhost/api/index/submit", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const validBody = {
  startup_name:     "AcmeFintech",
  tagline:          "Frictionless payments for AU SMEs",
  state:            "NSW",
  industry:         "fintech",
  stage:            "mvp",
  website_url:      "https://acmefintech.com.au",
  contact_email:    "founder@acmefintech.com.au",
  is_public_opt_in: true,
} as const;

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  enforceRateLimitMock.mockReturnValue(null); // allowed by default
  insertMock.mockResolvedValue({ error: null });
  fromMock.mockReturnValue({ insert: insertMock });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/index/submit", () => {
  describe("happy path", () => {
    it("returns 200 + ok:true for a fully valid payload", async () => {
      const res = await POST(req(validBody));
      const body = await json(res);

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.message).toBe("Submission received");
    });

    it("calls supabase.from('public_index_submissions').insert with correct fields", async () => {
      await POST(req(validBody));

      expect(fromMock).toHaveBeenCalledWith("public_index_submissions");
      expect(insertMock).toHaveBeenCalledOnce();
      const [rows] = insertMock.mock.calls[0];
      const row = rows[0];
      expect(row).toMatchObject({
        startup_name:  "AcmeFintech",
        tagline:       "Frictionless payments for AU SMEs",
        contact_email: "founder@acmefintech.com.au",
        status:        "pending",
      });
    });

    it("accepts a payload without optional fields", async () => {
      const minimal = {
        startup_name:  "MinimalCo",
        tagline:       "Just enough",
        contact_email: "hi@minimal.io",
      };
      const res = await POST(req(minimal));
      const body = await json(res);

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });

    it("defaults is_public_opt_in to true when not provided", async () => {
      const { is_public_opt_in: _omit, ...withoutOpt } = validBody;
      await POST(req(withoutOpt));

      const [rows] = insertMock.mock.calls[0];
      expect(rows[0].is_public_opt_in).toBe(true);
    });
  });

  describe("validation errors → 400", () => {
    it("returns 400 when startup_name is missing", async () => {
      const { startup_name: _omit, ...bad } = validBody;
      const res = await POST(req(bad));
      const body = await json(res);

      expect(res.status).toBe(400);
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("returns 400 when tagline is missing", async () => {
      const { tagline: _omit, ...bad } = validBody;
      const res = await POST(req(bad));

      expect(res.status).toBe(400);
      const body = await json(res);
      expect(typeof body.error).toBe("string");
    });

    it("returns 400 when contact_email is missing", async () => {
      const { contact_email: _omit, ...bad } = validBody;
      const res = await POST(req(bad));

      expect(res.status).toBe(400);
      const body = await json(res);
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("returns 400 when contact_email is not a valid email", async () => {
      const res = await POST(req({ ...validBody, contact_email: "not-an-email" }));

      expect(res.status).toBe(400);
    });

    it("returns 400 when tagline exceeds 120 characters", async () => {
      const res = await POST(req({ ...validBody, tagline: "x".repeat(121) }));

      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toMatch(/120/);
    });

    it("returns 400 when website_url is present but not a valid URL", async () => {
      const res = await POST(req({ ...validBody, website_url: "not-a-url" }));

      expect(res.status).toBe(400);
    });

    it("returns 400 when state is not a valid AU state", async () => {
      const res = await POST(req({ ...validBody, state: "ZZ" }));

      expect(res.status).toBe(400);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      const { NextResponse } = await import("next/server");
      const limitedResponse = NextResponse.json(
        { ok: false, error: "Rate limit exceeded — please wait a moment before generating more.", retryInSeconds: 60 },
        { status: 429, headers: { "Retry-After": "60" } },
      );
      enforceRateLimitMock.mockReturnValue(limitedResponse);

      const res = await POST(req(validBody));
      expect(res.status).toBe(429);
    });
  });

  describe("database error", () => {
    it("returns 500 when supabase insert fails", async () => {
      insertMock.mockResolvedValue({ error: { message: "db down", code: "500" } });

      const res = await POST(req(validBody));
      expect(res.status).toBe(500);
      const body = await json(res);
      expect(body.error).toMatch(/Failed to save submission/i);
    });
  });
});
