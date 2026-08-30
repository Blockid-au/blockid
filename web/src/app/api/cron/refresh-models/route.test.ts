// Colocated vitest for POST /api/cron/refresh-models — P9-refresh-models-route-test.
//
// Daily cron that discovers the strongest free AI models across OpenRouter +
// OpenAI-compatible providers, ranks them, and writes ai-free-models.json.
// ai-client.ts merges that file ahead of the curated defaults with a 5-min
// TTL, so a bad refresh directly degrades the AI fallback chain for every
// SVI analysis and every agent call. Two invariants must never regress:
// (1) auth-gated by Bearer CRON_SECRET (a public bypass would let anyone
// spam the file with attacker-chosen model ids); (2) never write an empty
// config (would erase the discovered models and break the fallback until
// the next cron tick).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  // CRON_SECRET is captured at module load — must be set before route imports.
  process.env.CRON_SECRET = "test_cron_secret";
  return {
    fetchJsonMock: vi.fn<(
      url: string,
      headers?: Record<string, string>,
    ) => Promise<unknown[]>>(),
    filterFreeOpenRouterMock: vi.fn<(rows: unknown[]) => unknown[]>(),
    rankMock: vi.fn<(rows: unknown[], n: number) => string[]>(),
    getSupabaseAdminMock: vi.fn<() => unknown | null>(),
    writeFileMock: vi.fn<(path: string, data: string) => void>(),
    mkdirMock: vi.fn<(path: string, opts: { recursive: boolean }) => void>(),
  };
});

vi.mock("@/lib/ai-client", () => ({
  FREE_MODELS_CONFIG: "/tmp/test-free-models.json",
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/model-discovery", () => ({
  fetchJson: (url: string, headers?: Record<string, string>) =>
    mocks.fetchJsonMock(url, headers),
  filterFreeOpenRouter: (rows: unknown[]) => mocks.filterFreeOpenRouterMock(rows),
  rank: (rows: unknown[], n: number) => mocks.rankMock(rows, n),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    writeFileSync: (p: string, d: string) => mocks.writeFileMock(p, d),
    mkdirSync: (p: string, opts: { recursive: boolean }) => mocks.mkdirMock(p, opts),
  };
});

// Route import MUST come after mocks are registered.
import { POST, dynamic } from "./route";

const ORIGINAL_ENV = { ...process.env };

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/cron/refresh-models", {
    method: "POST",
    headers,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: "test_cron_secret" };
  // Reset every mock — set default happy-path returns.
  mocks.fetchJsonMock.mockReset().mockResolvedValue([]);
  mocks.filterFreeOpenRouterMock.mockReset().mockReturnValue([]);
  mocks.rankMock.mockReset().mockReturnValue([]);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(null);
  mocks.writeFileMock.mockReset();
  mocks.mkdirMock.mockReset();

  // Clear provider env keys so tests explicitly opt-in.
  delete process.env.GROQ_API_KEY;
  delete process.env.CEREBRAS_API_KEY;
  delete process.env.SAMBANOVA_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("POST /api/cron/refresh-models — module invariants", () => {
  it("exports dynamic='force-dynamic' (cron endpoint, never cached)", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Auth gate (401)
// -----------------------------------------------------------------------------

describe("POST /api/cron/refresh-models — auth gate", () => {
  it("returns 401 without the Bearer header", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("returns 401 for a wrong Bearer token", async () => {
    const res = await POST(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("accepts the exact Bearer <CRON_SECRET> header", async () => {
    // Fixture returns [] so we'll actually get 502 — but the auth gate passed.
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(502);
  });

  it("MUST NOT call fetchJson when the auth gate refuses", async () => {
    await POST(req());
    expect(mocks.fetchJsonMock).not.toHaveBeenCalled();
  });

  it("MUST NOT write the config file when the auth gate refuses", async () => {
    await POST(req());
    expect(mocks.writeFileMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Empty-discovery guard (502)
// -----------------------------------------------------------------------------

describe("POST /api/cron/refresh-models — empty discovery", () => {
  it("returns 502 when no provider yields any model", async () => {
    // All discoveries empty → config would be empty → refuse to overwrite.
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(502);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toMatch(/no models/i);
  });

  it("MUST NOT write an empty config file (would erase the fallback chain)", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.writeFileMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// OpenRouter discovery
// -----------------------------------------------------------------------------

describe("POST /api/cron/refresh-models — OpenRouter", () => {
  beforeEach(() => {
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "openrouter/free-1" }]);
    mocks.rankMock.mockReturnValue(["openrouter/free-1", "openrouter/free-2"]);
  });

  it("fetches the OpenRouter public catalogue", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const call = mocks.fetchJsonMock.mock.calls.find(
      (c) => String(c[0]).includes("openrouter"),
    );
    expect(call?.[0]).toBe("https://openrouter.ai/api/v1/models");
  });

  it("returns 200 and includes openrouter in the discovered summary", async () => {
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.discovered).toMatchObject({ openrouter: 2 });
  });

  it("writes an openrouter list into the config payload", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.writeFileMock).toHaveBeenCalledTimes(1);
    const [, payload] = mocks.writeFileMock.mock.calls[0] ?? [];
    const parsed = JSON.parse(payload as string) as { openrouter: string[] };
    expect(parsed.openrouter).toEqual(["openrouter/free-1", "openrouter/free-2"]);
  });

  it("ranks the top-12 openrouter models (breadth budget)", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.rankMock).toHaveBeenCalledWith(expect.any(Array), 12);
  });

  it("emits openrouterTop5 in the response (first 5 of the discovered list)", async () => {
    mocks.rankMock.mockReturnValue(["a", "b", "c", "d", "e", "f", "g", "h"]);
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    const body = await json(res);
    expect(body.openrouterTop5).toEqual(["a", "b", "c", "d", "e"]);
  });
});

// -----------------------------------------------------------------------------
// OpenAI-compatible providers
// -----------------------------------------------------------------------------

describe("POST /api/cron/refresh-models — OpenAI-compat providers", () => {
  it("skips a provider that has no env key and no DB key", async () => {
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "or" }]);
    mocks.rankMock.mockReturnValue(["or"]);
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    // Only openrouter was fetched — no groq / cerebras / sambanova calls.
    const urls = mocks.fetchJsonMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain("https://openrouter.ai/api/v1/models");
    expect(urls).not.toContain("https://api.groq.com/openai/v1/models");
  });

  it("fetches groq when GROQ_API_KEY is set and stamps the Bearer header", async () => {
    process.env.GROQ_API_KEY = "groq_key_1";
    mocks.filterFreeOpenRouterMock.mockReturnValue([]);
    mocks.rankMock.mockImplementation((rows: unknown[]) => {
      if (Array.isArray(rows) && rows.length > 0) return ["groq/model"];
      return [];
    });
    mocks.fetchJsonMock.mockImplementation(async (url: string) => {
      if (url.includes("groq")) return [{ id: "groq/model" }];
      return [];
    });
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const groqCall = mocks.fetchJsonMock.mock.calls.find((c) =>
      String(c[0]).includes("groq"),
    );
    expect(groqCall).toBeDefined();
    expect(groqCall?.[1]).toEqual({ Authorization: "Bearer groq_key_1" });
  });

  it("skips a provider when rank() returns []", async () => {
    process.env.GROQ_API_KEY = "groq_key_1";
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "or" }]);
    mocks.rankMock.mockImplementation((rows: unknown[]) => {
      // openrouter returns models; groq returns none
      return Array.isArray(rows) && rows.length > 0 ? ["or"] : [];
    });
    mocks.fetchJsonMock.mockImplementation(async (url: string) => {
      if (url.includes("groq")) return [];
      return [];
    });
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const [, payload] = mocks.writeFileMock.mock.calls[0] ?? [];
    const parsed = JSON.parse(payload as string) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("groq");
  });
});

// -----------------------------------------------------------------------------
// File write
// -----------------------------------------------------------------------------

describe("POST /api/cron/refresh-models — file write", () => {
  beforeEach(() => {
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "or" }]);
    mocks.rankMock.mockReturnValue(["or"]);
  });

  it("writes to the FREE_MODELS_CONFIG path (mocked here as /tmp/test-free-models.json)", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const [path] = mocks.writeFileMock.mock.calls[0] ?? [];
    expect(path).toBe("/tmp/test-free-models.json");
  });

  it("creates the parent directory (recursive=true) before writing", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.mkdirMock).toHaveBeenCalledWith("/tmp", { recursive: true });
  });

  it("stamps updatedAt (ISO string) in the payload", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const [, payload] = mocks.writeFileMock.mock.calls[0] ?? [];
    const parsed = JSON.parse(payload as string) as { updatedAt: string };
    expect(parsed.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("writes JSON with 2-space indentation (human-readable)", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const [, payload] = mocks.writeFileMock.mock.calls[0] ?? [];
    expect(payload as string).toContain('\n  ');
  });

  it("returns 500 when writeFileSync throws", async () => {
    mocks.writeFileMock.mockImplementation(() => {
      throw new Error("EROFS: read-only fs");
    });
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(String(body.error)).toContain("Write failed");
  });
});
