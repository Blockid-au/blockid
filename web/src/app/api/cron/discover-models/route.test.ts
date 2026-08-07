// Colocated vitest for POST /api/cron/discover-models — P9-discover-models-route-test.
//
// Emergency on-demand augmentation: when ai-client.ts hits rate-limit events
// it fires this route to prepend NEW strong free models to
// ai-free-models.json. Complements /api/cron/refresh-models (daily full
// refresh). Two hard invariants: (1) never grow the list past MAX_LIST_LEN
// (bounded memory + cache TTL churn); (2) deduplicate by model id when
// prepending (a model already in the list must not shift down and appear
// twice).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.CRON_SECRET = "test_cron_secret";
  return {
    fetchJsonMock: vi.fn<(
      url: string,
      headers?: Record<string, string>,
    ) => Promise<unknown[]>>(),
    filterFreeOpenRouterMock: vi.fn<(rows: unknown[]) => unknown[]>(),
    rankMock: vi.fn<(rows: unknown[], n: number, exclude?: Set<string>) => string[]>(),
    getSupabaseAdminMock: vi.fn<() => unknown | null>(),
    readFileMock: vi.fn<(path: string, enc: string) => string>(),
    writeFileMock: vi.fn<(path: string, data: string) => void>(),
    mkdirMock: vi.fn<(path: string, opts: { recursive: boolean }) => void>(),
  };
});

vi.mock("@/lib/ai-client", () => ({
  FREE_MODELS_CONFIG: "/tmp/test-discover-models.json",
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/model-discovery", () => ({
  fetchJson: (url: string, headers?: Record<string, string>) =>
    mocks.fetchJsonMock(url, headers),
  filterFreeOpenRouter: (rows: unknown[]) => mocks.filterFreeOpenRouterMock(rows),
  rank: (rows: unknown[], n: number, exclude?: Set<string>) =>
    mocks.rankMock(rows, n, exclude),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    readFileSync: (p: string, enc: string) => mocks.readFileMock(p, enc),
    writeFileSync: (p: string, d: string) => mocks.writeFileMock(p, d),
    mkdirSync: (p: string, opts: { recursive: boolean }) => mocks.mkdirMock(p, opts),
  };
});

import { POST, dynamic } from "./route";

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/cron/discover-models", {
    method: "POST",
    headers,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  process.env.CRON_SECRET = "test_cron_secret";
  delete process.env.GROQ_API_KEY;
  delete process.env.CEREBRAS_API_KEY;
  delete process.env.SAMBANOVA_API_KEY;
  mocks.fetchJsonMock.mockReset().mockResolvedValue([]);
  mocks.filterFreeOpenRouterMock.mockReset().mockReturnValue([]);
  mocks.rankMock.mockReset().mockReturnValue([]);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(null);
  mocks.readFileMock.mockReset().mockImplementation(() => {
    throw new Error("ENOENT");
  });
  mocks.writeFileMock.mockReset();
  mocks.mkdirMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("POST /api/cron/discover-models — module invariants", () => {
  it("exports dynamic='force-dynamic'", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Auth gate
// -----------------------------------------------------------------------------

describe("POST /api/cron/discover-models — auth gate", () => {
  it("returns 401 without Bearer header", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("returns 401 for a wrong Bearer token", async () => {
    const res = await POST(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("MUST NOT read the current model list when auth fails", async () => {
    await POST(req());
    expect(mocks.readFileMock).not.toHaveBeenCalled();
  });

  it("MUST NOT fetch upstream catalogues when auth fails", async () => {
    await POST(req());
    expect(mocks.fetchJsonMock).not.toHaveBeenCalled();
  });

  it("MUST NOT write the file when auth fails", async () => {
    await POST(req());
    expect(mocks.writeFileMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// No-change branch (early return)
// -----------------------------------------------------------------------------

describe("POST /api/cron/discover-models — no change", () => {
  it("returns noChange:true when discovery finds no new models", async () => {
    // Default mocks return empty from every source.
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.noChange).toBe(true);
    expect(String(body.reason)).toMatch(/no new/i);
  });

  it("MUST NOT write the file when nothing new is discovered", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.writeFileMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// OpenRouter discovery — dedup + prepend
// -----------------------------------------------------------------------------

describe("POST /api/cron/discover-models — OpenRouter discovery", () => {
  it("passes the current list as `exclude` set to rank() (dedup)", async () => {
    mocks.readFileMock.mockReturnValue(
      JSON.stringify({ openrouter: ["existing/1", "existing/2"] }),
    );
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "new/1" }]);
    mocks.rankMock.mockReturnValue(["new/1"]);
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const rankCall = mocks.rankMock.mock.calls.find(
      (c) => c[2] instanceof Set && (c[2] as Set<string>).has("existing/1"),
    );
    expect(rankCall).toBeDefined();
    expect((rankCall?.[2] as Set<string>).has("existing/2")).toBe(true);
  });

  it("prepends new models in FRONT of existing entries", async () => {
    mocks.readFileMock.mockReturnValue(
      JSON.stringify({ openrouter: ["old/1", "old/2"] }),
    );
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "new/1" }]);
    mocks.rankMock.mockReturnValue(["new/1"]);
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const [, payload] = mocks.writeFileMock.mock.calls[0] ?? [];
    const parsed = JSON.parse(payload as string) as { openrouter: string[] };
    expect(parsed.openrouter[0]).toBe("new/1");
    expect(parsed.openrouter).toContain("old/1");
    expect(parsed.openrouter).toContain("old/2");
  });

  it("caps the merged list at MAX_LIST_LEN=15", async () => {
    // 5 new + 20 existing should still cap at 15.
    const existing = Array.from({ length: 20 }, (_, i) => `old/${i}`);
    mocks.readFileMock.mockReturnValue(JSON.stringify({ openrouter: existing }));
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "new/x" }]);
    mocks.rankMock.mockReturnValue(["new/1", "new/2", "new/3"]);
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const [, payload] = mocks.writeFileMock.mock.calls[0] ?? [];
    const parsed = JSON.parse(payload as string) as { openrouter: string[] };
    expect(parsed.openrouter.length).toBe(15);
  });

  it("requests only 3 top-strongest NEW models per provider", async () => {
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "x" }]);
    mocks.rankMock.mockReturnValue(["new/1"]);
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const rankCall = mocks.rankMock.mock.calls[0];
    expect(rankCall?.[1]).toBe(3);
  });

  it("dedupes even when the same model id appears in both fresh + existing", async () => {
    // If ranker somehow returns an id already in existing, prependDedupCap
    // must not emit two copies.
    mocks.readFileMock.mockReturnValue(JSON.stringify({ openrouter: ["a"] }));
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "a" }, { id: "b" }]);
    mocks.rankMock.mockReturnValue(["a", "b"]);
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const [, payload] = mocks.writeFileMock.mock.calls[0] ?? [];
    const parsed = JSON.parse(payload as string) as { openrouter: string[] };
    const aCount = parsed.openrouter.filter((x) => x === "a").length;
    expect(aCount).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// OpenAI-compatible providers
// -----------------------------------------------------------------------------

describe("POST /api/cron/discover-models — OpenAI-compat providers", () => {
  it("skips groq when GROQ_API_KEY and DB key are both absent", async () => {
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "or" }]);
    mocks.rankMock.mockReturnValue(["or"]);
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const urls = mocks.fetchJsonMock.mock.calls.map((c) => c[0]);
    expect(urls).not.toContain("https://api.groq.com/openai/v1/models");
  });

  it("uses GROQ_API_KEY from env when set", async () => {
    process.env.GROQ_API_KEY = "env_groq_key";
    mocks.filterFreeOpenRouterMock.mockReturnValue([]);
    mocks.fetchJsonMock.mockImplementation(async (url) =>
      url.includes("groq") ? [{ id: "groq/x" }] : [],
    );
    mocks.rankMock.mockImplementation((rows) =>
      Array.isArray(rows) && rows.length > 0 ? ["groq/x"] : [],
    );
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const groqCall = mocks.fetchJsonMock.mock.calls.find((c) =>
      String(c[0]).includes("groq"),
    );
    expect(groqCall?.[1]).toEqual({ Authorization: "Bearer env_groq_key" });
  });
});

// -----------------------------------------------------------------------------
// File write
// -----------------------------------------------------------------------------

describe("POST /api/cron/discover-models — file write", () => {
  beforeEach(() => {
    mocks.filterFreeOpenRouterMock.mockReturnValue([{ id: "new/1" }]);
    mocks.rankMock.mockReturnValue(["new/1"]);
  });

  it("writes updatedAt on the merged payload", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const [, payload] = mocks.writeFileMock.mock.calls[0] ?? [];
    const parsed = JSON.parse(payload as string) as { updatedAt: string };
    expect(parsed.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("creates the parent directory (recursive) before writing", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.mkdirMock).toHaveBeenCalledWith("/tmp", { recursive: true });
  });

  it("returns 500 when writeFileSync throws", async () => {
    mocks.writeFileMock.mockImplementation(() => {
      throw new Error("EROFS");
    });
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(String(body.error)).toContain("Write failed");
  });

  it("returns 200 with added summary when new models were discovered", async () => {
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.added).toMatchObject({ openrouter: ["new/1"] });
  });

  it("returns totalListSizes for every provider (0 when absent)", async () => {
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    const body = await json(res);
    const sizes = body.totalListSizes as Record<string, number>;
    expect(sizes.openrouter).toBeGreaterThan(0);
    expect(sizes.groq).toBe(0);
    expect(sizes.cerebras).toBe(0);
    expect(sizes.sambanova).toBe(0);
  });
});
