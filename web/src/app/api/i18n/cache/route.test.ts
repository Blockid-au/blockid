// Colocated vitest for GET + POST /api/i18n/cache — P9-i18n-cache-route-test.
//
// Route is the admin-only reverse-lookup + override surface for the disk-backed
// EN→VI translation cache (T-1403.12). Two entry points share a single guard:
//   • GET  — read the audit JSONL, dedupe by EN (last-write-wins), reverse for
//            newest-first, cap at MAX_LIST=500.
//   • POST — validate {locale, en, vi} strictly, then write through
//            `cacheSetMany` which also appends to the same audit file.
//
// The guard is a leak-guard, not a real auth check: unset env → 404, missing /
// wrong header → 404. It must never distinguish "no auth needed" from "wrong
// key" — a 401 would advertise the endpoint's existence.
//
// Silent regressions this suite pins against:
//   • dropping / loosening the guard (env-unset OR header-mismatch must 404
//     with the exact "Not found" body, no JSON envelope, no snapshot leak);
//   • flipping the GET fallback so an unknown locale silently uses "en"
//     instead of the shipped "vi" default (breaks the /admin i18n tile which
//     always requests the VI reverse-lookup);
//   • dropping the last-write-wins dedup on the audit — the founder-facing
//     override history depends on the last {en,vi} pair winning;
//   • dropping the MAX_LIST cap — a 10k-line audit would blow the response
//     budget the /admin tile expects (~500 rows);
//   • flipping the reverse — the tile lists newest first and drift would
//     surface a stale seed row above yesterday's override;
//   • dropping the length / non-empty guards on POST — an empty EN string is
//     `hashKey("")` which is a valid sha, silently poisoning the cache with a
//     "translation of nothing" row;
//   • dropping the 4000-char upper bound — the cache is a flat JSON blob and
//     a caller pasting a novel would balloon the on-disk file;
//   • forgetting to swallow bad JSON in the audit stream — one corrupt line
//     from a partial write would 500 the whole tile;
//   • leaking `cacheSetMany` calls into the 404 / 400 paths — writes must
//     only happen behind the guard AND after every validator passes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FsState {
  files: Map<string, string>;
  reads: string[];
}

const fsState: FsState = { files: new Map(), reads: [] };

vi.mock("node:fs", () => ({
  existsSync: (p: string): boolean => fsState.files.has(p),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (p: string, _enc?: string): Promise<string> => {
    fsState.reads.push(p);
    const v = fsState.files.get(p);
    if (v === undefined) {
      const err = new Error(`ENOENT: ${p}`);
      (err as NodeJS.ErrnoException).code = "ENOENT";
      throw err;
    }
    return v;
  }),
}));

const cacheSetManyMock =
  vi.fn<(locale: string, pairs: Record<string, string>) => Promise<void>>();
const hashKeyMock = vi.fn<(en: string) => string>();

vi.mock("@/lib/i18n/translate-cache", () => ({
  cacheSetMany: (locale: string, pairs: Record<string, string>) =>
    cacheSetManyMock(locale, pairs),
  hashKey: (en: string) => hashKeyMock(en),
}));

import { GET, POST, dynamic, runtime } from "./route";
import { LOCALES } from "@/lib/i18n/locales";
import { join } from "node:path";

const AUDIT = (locale: string): string =>
  join(process.cwd(), "content", "i18n", `${locale}-audit.jsonl`);

function getReq(
  url: string = "http://local.test/api/i18n/cache",
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { headers });
}

function postReq(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  const init: RequestInit = { method: "POST", headers };
  if (typeof body === "string") {
    init.body = body;
  } else {
    init.body = JSON.stringify(body);
  }
  return new Request("http://local.test/api/i18n/cache", init);
}

const originalAdminKey = process.env.INTERNAL_ADMIN_KEY;

beforeEach(() => {
  fsState.files.clear();
  fsState.reads.length = 0;
  cacheSetManyMock.mockReset();
  cacheSetManyMock.mockResolvedValue(undefined);
  hashKeyMock.mockReset();
  hashKeyMock.mockImplementation((en: string) => `sha:${en.length}:${en.slice(0, 4)}`);
  delete process.env.INTERNAL_ADMIN_KEY;
});

afterEach(() => {
  if (originalAdminKey === undefined) delete process.env.INTERNAL_ADMIN_KEY;
  else process.env.INTERNAL_ADMIN_KEY = originalAdminKey;
});

describe("module exports", () => {
  it("marks the route dynamic so Next never caches the reverse-lookup at build", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("pins the node runtime — fs access is not edge-safe", () => {
    expect(runtime).toBe("nodejs");
  });
});

describe("guard() — leak-guarded auth on both verbs", () => {
  it("GET returns 404 'Not found' when INTERNAL_ADMIN_KEY is unset", async () => {
    const res = await GET(getReq(undefined, { "x-admin-key": "anything" }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("GET returns 404 when INTERNAL_ADMIN_KEY is set to empty string (still opt-out)", async () => {
    process.env.INTERNAL_ADMIN_KEY = "";
    const res = await GET(getReq(undefined, { "x-admin-key": "" }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("GET returns 404 when the x-admin-key header is missing entirely", async () => {
    process.env.INTERNAL_ADMIN_KEY = "s3cret";
    const res = await GET(getReq());
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("GET returns 404 when the header value does not match the env exactly", async () => {
    process.env.INTERNAL_ADMIN_KEY = "s3cret";
    const res = await GET(getReq(undefined, { "x-admin-key": "wrong" }));
    expect(res.status).toBe(404);
  });

  it("GET rejects a header that is only a case-mismatch of the env value", async () => {
    process.env.INTERNAL_ADMIN_KEY = "S3cret";
    const res = await GET(getReq(undefined, { "x-admin-key": "s3cret" }));
    expect(res.status).toBe(404);
  });

  it("GET rejects a header that is a prefix of the env (no startsWith trap)", async () => {
    process.env.INTERNAL_ADMIN_KEY = "correct-horse-battery-staple";
    const res = await GET(getReq(undefined, { "x-admin-key": "correct-horse" }));
    expect(res.status).toBe(404);
  });

  it("POST returns 404 when INTERNAL_ADMIN_KEY is unset — never touches cacheSetMany", async () => {
    const res = await POST(
      postReq({ locale: "vi", en: "hi", vi: "chào" }, { "x-admin-key": "anything" }),
    );
    expect(res.status).toBe(404);
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("POST returns 404 when the x-admin-key header is missing", async () => {
    process.env.INTERNAL_ADMIN_KEY = "s3cret";
    const res = await POST(postReq({ locale: "vi", en: "hi", vi: "chào" }));
    expect(res.status).toBe(404);
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/i18n/cache — audit reader", () => {
  beforeEach(() => {
    process.env.INTERNAL_ADMIN_KEY = "k";
  });

  it("defaults to locale=vi when no query param is supplied", async () => {
    fsState.files.set(AUDIT("vi"), "");
    const res = await GET(getReq("http://local.test/api/i18n/cache", { "x-admin-key": "k" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { locale: string };
    expect(body.locale).toBe("vi");
    expect(fsState.reads).toContain(AUDIT("vi"));
  });

  it("falls back to locale=vi when the query param is not a valid Locale (never leaks 'xx' through)", async () => {
    fsState.files.set(AUDIT("vi"), "");
    const res = await GET(
      getReq("http://local.test/api/i18n/cache?locale=xx", { "x-admin-key": "k" }),
    );
    const body = (await res.json()) as { locale: string };
    expect(body.locale).toBe("vi");
    expect(fsState.reads).toContain(AUDIT("vi"));
    expect(fsState.reads).not.toContain(AUDIT("xx"));
  });

  it("accepts a valid en locale param and reads the en audit file", async () => {
    fsState.files.set(AUDIT("en"), "");
    const res = await GET(
      getReq("http://local.test/api/i18n/cache?locale=en", { "x-admin-key": "k" }),
    );
    const body = (await res.json()) as { locale: string };
    expect(body.locale).toBe("en");
    expect(fsState.reads).toContain(AUDIT("en"));
  });

  it("returns count=0 + entries=[] when the audit file does not exist (no throw on ENOENT)", async () => {
    const res = await GET(getReq(undefined, { "x-admin-key": "k" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; entries: unknown[] };
    expect(body.count).toBe(0);
    expect(body.entries).toEqual([]);
    // existsSync short-circuits before readFile is even invoked.
    expect(fsState.reads).toEqual([]);
  });

  it("parses audit lines, dedupes by EN (last-write-wins), and reverses to newest-first", async () => {
    const lines = [
      JSON.stringify({ en: "Hello", vi: "Xin chao", ts: "2026-01-01T00:00:00.000Z" }),
      JSON.stringify({ en: "Bye", vi: "Tam biet", ts: "2026-01-02T00:00:00.000Z" }),
      JSON.stringify({ en: "Hello", vi: "Chào", ts: "2026-01-03T00:00:00.000Z" }),
    ].join("\n");
    fsState.files.set(AUDIT("vi"), lines + "\n");
    const res = await GET(getReq(undefined, { "x-admin-key": "k" }));
    const body = (await res.json()) as {
      count: number;
      entries: Array<{ en: string; vi: string; ts: string }>;
    };
    expect(body.count).toBe(2);
    // last-write-wins on VALUE: the second Hello ("Chào") is what survives dedup.
    const hello = body.entries.find((e) => e.en === "Hello");
    expect(hello?.vi).toBe("Chào");
    // Map preserves original insertion order (set-on-existing-key does not
    // move the entry) so iteration order is [Hello, Bye]; .reverse() flips to
    // [Bye, Hello] — the "newest audit line first" contract in the tile.
    expect(body.entries[0]?.en).toBe("Bye");
    expect(body.entries[1]?.en).toBe("Hello");
  });

  it("skips lines that fail JSON.parse (partial writes must never 500 the tile)", async () => {
    const lines = [
      "{this is not json",
      JSON.stringify({ en: "Ok", vi: "OK", ts: "2026-01-01T00:00:00.000Z" }),
      "{",
    ].join("\n");
    fsState.files.set(AUDIT("vi"), lines);
    const res = await GET(getReq(undefined, { "x-admin-key": "k" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      entries: Array<{ en: string; vi: string }>;
    };
    expect(body.count).toBe(1);
    expect(body.entries[0]?.en).toBe("Ok");
  });

  it("skips entries whose en or vi field is not a string (schema-drift shield)", async () => {
    const lines = [
      JSON.stringify({ en: 42, vi: "n/a", ts: "t" }),
      JSON.stringify({ en: "keep", vi: null, ts: "t" }),
      JSON.stringify({ en: "yes", vi: "yes-vi", ts: "t" }),
      JSON.stringify({}),
    ].join("\n");
    fsState.files.set(AUDIT("vi"), lines);
    const res = await GET(getReq(undefined, { "x-admin-key": "k" }));
    const body = (await res.json()) as {
      count: number;
      entries: Array<{ en: string }>;
    };
    expect(body.count).toBe(1);
    expect(body.entries[0]?.en).toBe("yes");
  });

  it("skips blank lines from a trailing newline / CRLF-normalised write", async () => {
    const lines =
      "\r\n" +
      JSON.stringify({ en: "a", vi: "b", ts: "t" }) +
      "\r\n\r\n" +
      JSON.stringify({ en: "c", vi: "d", ts: "t" }) +
      "\n";
    fsState.files.set(AUDIT("vi"), lines);
    const res = await GET(getReq(undefined, { "x-admin-key": "k" }));
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(2);
  });

  it("caps the response at MAX_LIST=500 rows even when 600 unique EN entries exist", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 600; i++) {
      lines.push(JSON.stringify({ en: `en-${i}`, vi: `vi-${i}`, ts: "t" }));
    }
    fsState.files.set(AUDIT("vi"), lines.join("\n"));
    const res = await GET(getReq(undefined, { "x-admin-key": "k" }));
    const body = (await res.json()) as {
      count: number;
      entries: Array<{ en: string }>;
    };
    expect(body.count).toBe(500);
    expect(body.entries).toHaveLength(500);
    // slice(-MAX_LIST).reverse() → newest first, so index 0 is `en-599`.
    expect(body.entries[0]?.en).toBe("en-599");
    expect(body.entries[499]?.en).toBe("en-100");
  });

  it("populates `ts` with an empty string when a line omits the timestamp field", async () => {
    fsState.files.set(AUDIT("vi"), JSON.stringify({ en: "x", vi: "y" }));
    const res = await GET(getReq(undefined, { "x-admin-key": "k" }));
    const body = (await res.json()) as {
      entries: Array<{ ts: string }>;
    };
    expect(body.entries[0]?.ts).toBe("");
  });
});

describe("POST /api/i18n/cache — validators", () => {
  beforeEach(() => {
    process.env.INTERNAL_ADMIN_KEY = "k";
  });

  it("returns 400 invalid_json when the body is not JSON", async () => {
    const res = await POST(postReq("{not json", { "x-admin-key": "k" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_locale + allowed=LOCALES when locale is missing", async () => {
    const res = await POST(postReq({ en: "hi", vi: "chào" }, { "x-admin-key": "k" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_locale", allowed: [...LOCALES] });
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_locale when the locale is not a shipped Locale value", async () => {
    const res = await POST(
      postReq({ locale: "de", en: "hi", vi: "hallo" }, { "x-admin-key": "k" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; allowed: string[] };
    expect(body.error).toBe("invalid_locale");
    expect(body.allowed).toEqual([...LOCALES]);
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_locale when locale is a number (typeof guard)", async () => {
    const res = await POST(
      postReq({ locale: 42, en: "hi", vi: "chào" }, { "x-admin-key": "k" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("invalid_locale");
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_en when the en field is missing", async () => {
    const res = await POST(postReq({ locale: "vi", vi: "chào" }, { "x-admin-key": "k" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_en" });
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_en on empty string (cache-poisoning shield for hashKey(''))", async () => {
    const res = await POST(
      postReq({ locale: "vi", en: "", vi: "chào" }, { "x-admin-key": "k" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_en" });
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_en when en exceeds 4000 chars (blob-size shield)", async () => {
    const en = "a".repeat(4001);
    const res = await POST(
      postReq({ locale: "vi", en, vi: "b" }, { "x-admin-key": "k" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_en" });
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("accepts en at exactly the 4000-char inclusive upper bound", async () => {
    const en = "a".repeat(4000);
    const res = await POST(
      postReq({ locale: "vi", en, vi: "b" }, { "x-admin-key": "k" }),
    );
    expect(res.status).toBe(200);
    expect(cacheSetManyMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 invalid_vi when vi is missing", async () => {
    const res = await POST(postReq({ locale: "vi", en: "hi" }, { "x-admin-key": "k" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_vi" });
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_vi on empty vi", async () => {
    const res = await POST(
      postReq({ locale: "vi", en: "hi", vi: "" }, { "x-admin-key": "k" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_vi" });
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_vi when vi exceeds 4000 chars", async () => {
    const vi = "b".repeat(4001);
    const res = await POST(
      postReq({ locale: "vi", en: "hi", vi }, { "x-admin-key": "k" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_vi" });
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_vi when vi is a number (typeof guard)", async () => {
    const res = await POST(
      postReq({ locale: "vi", en: "hi", vi: 99 }, { "x-admin-key": "k" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_vi" });
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/i18n/cache — happy path", () => {
  beforeEach(() => {
    process.env.INTERNAL_ADMIN_KEY = "k";
  });

  it("writes through cacheSetMany with { [en]: vi } and returns { ok:true, key }", async () => {
    hashKeyMock.mockReturnValue("hash-hi");
    const res = await POST(
      postReq({ locale: "vi", en: "hi", vi: "chào" }, { "x-admin-key": "k" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, key: "hash-hi" });
    expect(cacheSetManyMock).toHaveBeenCalledTimes(1);
    expect(cacheSetManyMock).toHaveBeenCalledWith("vi", { hi: "chào" });
    expect(hashKeyMock).toHaveBeenCalledWith("hi");
  });

  it("forwards the resolved Locale (not a coerced string) to cacheSetMany", async () => {
    await POST(
      postReq({ locale: "en", en: "one", vi: "one-vi" }, { "x-admin-key": "k" }),
    );
    expect(cacheSetManyMock).toHaveBeenCalledWith("en", { one: "one-vi" });
  });

  it("returns the hash key produced by hashKey() verbatim (no re-derivation)", async () => {
    hashKeyMock.mockReturnValue("SPECIFIC-KEY-42");
    const res = await POST(
      postReq({ locale: "vi", en: "x", vi: "y" }, { "x-admin-key": "k" }),
    );
    const body = (await res.json()) as { key: string };
    expect(body.key).toBe("SPECIFIC-KEY-42");
  });

  it("does not attempt to read the audit file on POST (write-only path)", async () => {
    await POST(
      postReq({ locale: "vi", en: "a", vi: "b" }, { "x-admin-key": "k" }),
    );
    expect(fsState.reads).toEqual([]);
  });
});
