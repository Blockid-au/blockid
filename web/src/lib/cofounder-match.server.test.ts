import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CofounderProfileInput } from "./cofounder-match";

// Colocated vitest for the previously-untested server-only
// `cofounder-match.server.ts` — the Supabase adapter that (a) reads
// directory-visible cofounder profiles for /tools/cofounder-match and
// (b) inserts a new profile from the API route behind the client form.
// The sibling `cofounder-match.ts` (schema + enums + anonymizeName) is
// already pinned by `cofounder-match.test.ts`; this file covers the
// remaining server surface so a silent drift can no longer:
//   (a) leak a stored full_name to the directory (missing
//       `anonymizeName` call in the map),
//   (b) surface every profile including flagged / private rows (a
//       dropped `.eq("visibility","directory")` / `.is("flagged_at", null)`
//       filter),
//   (c) return the wrong ordering / oversized page (broken
//       `.order("created_at", {ascending:false})` / `.limit(limit)`),
//   (d) crash the /api/lead flow when Supabase isn't configured
//       (Phase-1 graceful degradation contract cited in the module
//        header — both helpers must degrade gracefully, not throw),
//   (e) miscolumn the insert payload (any of the snake_case columns
//       flipping name silently persists the wrong row against the
//       0004 migration column set).

interface CapturedEq { col: string; val: unknown }
interface CapturedIs { col: string; val: unknown }
interface CapturedOrder { col: string; opts: Record<string, unknown> | null }

interface CapturedCall {
  table: string;
  selectCols: string | null;
  insertPayload: unknown;
  eqs: CapturedEq[];
  is: CapturedIs | null;
  order: CapturedOrder | null;
  limit: number | null;
  terminal: "single" | "await" | null;
}

interface FakeState {
  adminConfigured: boolean;
  queue: Array<{ data?: unknown; error?: unknown }>;
  calls: CapturedCall[];
}

const state: FakeState = { adminConfigured: true, queue: [], calls: [] };

function nextResponse(): { data: unknown; error: unknown } {
  const next = state.queue.shift() ?? {};
  return { data: next.data ?? null, error: next.error ?? null };
}

function makeChain(table: string) {
  const op: CapturedCall = {
    table,
    selectCols: null,
    insertPayload: null,
    eqs: [],
    is: null,
    order: null,
    limit: null,
    terminal: null,
  };
  state.calls.push(op);

  const chain: Record<string, unknown> = {};
  chain.select = (cols?: string) => {
    op.selectCols = cols ?? null;
    return chain;
  };
  chain.insert = (payload: unknown) => {
    op.insertPayload = payload;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqs.push({ col, val });
    return chain;
  };
  chain.is = (col: string, val: unknown) => {
    op.is = { col, val };
    return chain;
  };
  chain.order = (col: string, opts?: Record<string, unknown>) => {
    op.order = { col, opts: opts ?? null };
    return chain;
  };
  chain.limit = (n: number) => {
    op.limit = n;
    return chain;
  };
  chain.single = () => {
    op.terminal = "single";
    return Promise.resolve(nextResponse());
  };
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    op.terminal = op.terminal ?? "await";
    return Promise.resolve(nextResponse()).then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return { from: (table: string) => makeChain(table) };
  },
}));

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

beforeEach(() => {
  vi.resetModules();
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
  errorSpy.mockClear();
  warnSpy.mockClear();
});

// ---------------------------------------------------------------------------
// fetchRecentDirectoryProfiles — graceful degradation
// ---------------------------------------------------------------------------

describe("fetchRecentDirectoryProfiles — Supabase not configured", () => {
  it("returns [] and never touches Supabase when admin client is null", async () => {
    state.adminConfigured = false;
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    const out = await fetchRecentDirectoryProfiles();
    expect(out).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it("degrades silently — no console.error on the null-admin path (that log is reserved for real DB errors)", async () => {
    state.adminConfigured = false;
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    await fetchRecentDirectoryProfiles();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchRecentDirectoryProfiles — chain shape (query contract)
// ---------------------------------------------------------------------------

describe("fetchRecentDirectoryProfiles — Supabase query contract", () => {
  it("targets the cofounder_profiles table", async () => {
    state.queue.push({ data: [] });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    await fetchRecentDirectoryProfiles();
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]!.table).toBe("cofounder_profiles");
  });

  it("selects exactly the 8 columns the DirectoryProfile mapper reads", async () => {
    state.queue.push({ data: [] });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    await fetchRecentDirectoryProfiles();
    const cols = state.calls[0]!.selectCols ?? "";
    const set = new Set(cols.split(",").map((c) => c.trim()).filter(Boolean));
    expect(set).toEqual(
      new Set([
        "id",
        "full_name",
        "location",
        "looking_for",
        "i_am",
        "time_commitment",
        "stage",
        "created_at",
      ]),
    );
  });

  it("filters by visibility = 'directory' (never surfaces private rows)", async () => {
    state.queue.push({ data: [] });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    await fetchRecentDirectoryProfiles();
    expect(state.calls[0]!.eqs).toContainEqual({ col: "visibility", val: "directory" });
  });

  it("filters by flagged_at IS NULL (never surfaces moderated rows)", async () => {
    state.queue.push({ data: [] });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    await fetchRecentDirectoryProfiles();
    expect(state.calls[0]!.is).toEqual({ col: "flagged_at", val: null });
  });

  it("orders by created_at DESC so the newest profiles surface first", async () => {
    state.queue.push({ data: [] });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    await fetchRecentDirectoryProfiles();
    expect(state.calls[0]!.order).toEqual({
      col: "created_at",
      opts: { ascending: false },
    });
  });

  it("uses the default page-size of 12 when no limit is passed", async () => {
    state.queue.push({ data: [] });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    await fetchRecentDirectoryProfiles();
    expect(state.calls[0]!.limit).toBe(12);
  });

  it("honours a caller-supplied limit (e.g. 3) rather than clamping to 12", async () => {
    state.queue.push({ data: [] });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    await fetchRecentDirectoryProfiles(3);
    expect(state.calls[0]!.limit).toBe(3);
  });

  it("passes limit=0 through (edge case — caller controls whether to skip the read)", async () => {
    state.queue.push({ data: [] });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    await fetchRecentDirectoryProfiles(0);
    expect(state.calls[0]!.limit).toBe(0);
  });

  it("awaits the chain (not .single()) so multiple rows come back as an array", async () => {
    state.queue.push({ data: [] });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    await fetchRecentDirectoryProfiles();
    expect(state.calls[0]!.terminal).toBe("await");
  });
});

// ---------------------------------------------------------------------------
// fetchRecentDirectoryProfiles — mapping (row → DirectoryProfile)
// ---------------------------------------------------------------------------

describe("fetchRecentDirectoryProfiles — mapping to DirectoryProfile", () => {
  it("returns [] on a null data payload (Supabase idiom for zero rows)", async () => {
    state.queue.push({ data: null });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    expect(await fetchRecentDirectoryProfiles()).toEqual([]);
  });

  it("returns [] on an empty array without throwing", async () => {
    state.queue.push({ data: [] });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    expect(await fetchRecentDirectoryProfiles()).toEqual([]);
  });

  it("anonymises full_name via 'first + last-initial' — never leaks the raw stored name", async () => {
    state.queue.push({
      data: [
        {
          id: "row-1",
          full_name: "Ada Lovelace",
          location: "Sydney",
          looking_for: ["Technical cofounder"],
          i_am: ["Commercial cofounder"],
          time_commitment: "FT-now",
          stage: "Idea",
          created_at: "2026-07-31T00:00:00Z",
        },
      ],
    });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    const out = await fetchRecentDirectoryProfiles();
    expect(out).toHaveLength(1);
    expect(out[0]!.displayName).toBe("Ada L.");
    // Regression trip-wire: raw last name must not survive the mapper.
    expect(out[0]!.displayName).not.toContain("Lovelace");
  });

  it("preserves id / location / timeCommitment / stage / createdAt verbatim", async () => {
    state.queue.push({
      data: [
        {
          id: "abc-123",
          full_name: "Grace Hopper",
          location: "Melbourne",
          looking_for: ["Design cofounder"],
          i_am: ["Technical cofounder"],
          time_commitment: "PT-now",
          stage: "MVP",
          created_at: "2026-07-30T09:15:00Z",
        },
      ],
    });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    const [row] = await fetchRecentDirectoryProfiles();
    expect(row).toMatchObject({
      id: "abc-123",
      location: "Melbourne",
      timeCommitment: "PT-now",
      stage: "MVP",
      createdAt: "2026-07-30T09:15:00Z",
    });
  });

  it("maps snake_case looking_for + i_am into camelCase arrays on the DTO", async () => {
    state.queue.push({
      data: [
        {
          id: "row-1",
          full_name: "Linus T",
          location: "Brisbane",
          looking_for: ["Commercial cofounder", "Design cofounder"],
          i_am: ["Technical cofounder"],
          time_commitment: "FT-soon",
          stage: "Revenue",
          created_at: "2026-07-01T00:00:00Z",
        },
      ],
    });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    const [row] = await fetchRecentDirectoryProfiles();
    expect(row!.lookingFor).toEqual(["Commercial cofounder", "Design cofounder"]);
    expect(row!.iAm).toEqual(["Technical cofounder"]);
  });

  it("coerces null looking_for / i_am to [] so consumers can always .map() safely", async () => {
    state.queue.push({
      data: [
        {
          id: "row-1",
          full_name: "Solo Founder",
          location: "Sydney",
          looking_for: null,
          i_am: null,
          time_commitment: "PT-now",
          stage: "Idea",
          created_at: "2026-07-01T00:00:00Z",
        },
      ],
    });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    const [row] = await fetchRecentDirectoryProfiles();
    expect(row!.lookingFor).toEqual([]);
    expect(row!.iAm).toEqual([]);
  });

  it("preserves the DB ordering — the mapper does not re-sort", async () => {
    state.queue.push({
      data: [
        {
          id: "second",
          full_name: "B B",
          location: "Sydney",
          looking_for: [],
          i_am: [],
          time_commitment: "FT-now",
          stage: "Idea",
          created_at: "2026-07-30T00:00:00Z",
        },
        {
          id: "first",
          full_name: "A A",
          location: "Sydney",
          looking_for: [],
          i_am: [],
          time_commitment: "FT-now",
          stage: "Idea",
          created_at: "2026-07-31T00:00:00Z",
        },
      ],
    });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    const out = await fetchRecentDirectoryProfiles();
    expect(out.map((r) => r.id)).toEqual(["second", "first"]);
  });

  it("maps every row (contract: no filtering happens client-side)", async () => {
    const rows = Array.from({ length: 5 }).map((_, i) => ({
      id: `row-${i}`,
      full_name: `User ${i}`,
      location: "Sydney",
      looking_for: [],
      i_am: [],
      time_commitment: "FT-now",
      stage: "Idea",
      created_at: `2026-07-${20 + i}T00:00:00Z`,
    }));
    state.queue.push({ data: rows });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    const out = await fetchRecentDirectoryProfiles();
    expect(out).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// fetchRecentDirectoryProfiles — error handling
// ---------------------------------------------------------------------------

describe("fetchRecentDirectoryProfiles — DB error", () => {
  it("logs and returns [] when Supabase returns an error (never throws to /api/lead)", async () => {
    state.queue.push({ error: { message: "network down", code: "PGRST000" } });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    const out = await fetchRecentDirectoryProfiles();
    expect(out).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [tag, err] = errorSpy.mock.calls[0]!;
    expect(String(tag)).toContain("[blockid:cofounder-match]");
    expect(String(tag)).toContain("fetchRecentDirectoryProfiles");
    expect(err).toMatchObject({ message: "network down" });
  });

  it("logs and returns [] even when the error and data are both null-ish (defensive)", async () => {
    state.queue.push({ error: { message: "unknown" } });
    const { fetchRecentDirectoryProfiles } = await import("./cofounder-match.server");
    expect(await fetchRecentDirectoryProfiles()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// insertCofounderProfile — graceful degradation (no Supabase)
// ---------------------------------------------------------------------------

function baseInsertInput(): CofounderProfileInput {
  return {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    location: "Sydney",
    lookingFor: ["Technical cofounder"],
    iAm: ["Commercial cofounder"],
    timeCommitment: "FT-now",
    stage: "Idea",
    visibility: "directory",
  };
}

describe("insertCofounderProfile — Supabase not configured", () => {
  it("returns ok=true with a faux id and warns (Phase-1 graceful degradation)", async () => {
    state.adminConfigured = false;
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      const out = await insertCofounderProfile({
        input: baseInsertInput(),
        ipHash: null,
      });
      expect(out).toEqual({ ok: true, id: "local-1700000000000" });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]![0])).toContain("Supabase not configured");
    } finally {
      nowSpy.mockRestore();
    }
    expect(state.calls).toHaveLength(0);
  });

  it("mints a new faux id per call — never re-uses the previous one", async () => {
    state.adminConfigured = false;
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_700_000_000_000).mockReturnValueOnce(1_700_000_000_500);
    try {
      const a = await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
      const b = await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
      expect(a).toEqual({ ok: true, id: "local-1700000000000" });
      expect(b).toEqual({ ok: true, id: "local-1700000000500" });
    } finally {
      nowSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// insertCofounderProfile — chain shape (insert contract)
// ---------------------------------------------------------------------------

describe("insertCofounderProfile — Supabase insert contract", () => {
  it("targets the cofounder_profiles table", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({ input: baseInsertInput(), ipHash: "abc" });
    expect(state.calls[0]!.table).toBe("cofounder_profiles");
  });

  it("terminates with .single() so a single new row's id can be read", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
    expect(state.calls[0]!.terminal).toBe("single");
  });

  it("asks for only the 'id' column on the .select() following the insert", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
    expect(state.calls[0]!.selectCols).toBe("id");
  });

  it("maps every camelCase input field to its snake_case column verbatim", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({
      input: {
        ...baseInsertInput(),
        skills: "Rust, Postgres",
        ideaPitch: "Fixing pipelines",
        linkedinUrl: "https://linkedin.com/in/ada",
      },
      ipHash: "hashed-ip",
    });
    expect(state.calls[0]!.insertPayload).toEqual({
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      location: "Sydney",
      looking_for: ["Technical cofounder"],
      i_am: ["Commercial cofounder"],
      skills: "Rust, Postgres",
      idea_pitch: "Fixing pipelines",
      time_commitment: "FT-now",
      stage: "Idea",
      linkedin_url: "https://linkedin.com/in/ada",
      visibility: "directory",
      ip_hash: "hashed-ip",
    });
  });

  it("coerces missing skills to null (empty-string / undefined must not persist as '')", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
    const payload = state.calls[0]!.insertPayload as Record<string, unknown>;
    expect(payload.skills).toBeNull();
  });

  it("coerces missing ideaPitch to null", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
    const payload = state.calls[0]!.insertPayload as Record<string, unknown>;
    expect(payload.idea_pitch).toBeNull();
  });

  it("coerces missing linkedinUrl to null (Supabase treats null distinctly from '')", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
    const payload = state.calls[0]!.insertPayload as Record<string, unknown>;
    expect(payload.linkedin_url).toBeNull();
  });

  it("coerces explicit empty-string skills / ideaPitch / linkedinUrl to null", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({
      input: { ...baseInsertInput(), skills: "", ideaPitch: "", linkedinUrl: "" },
      ipHash: null,
    });
    const payload = state.calls[0]!.insertPayload as Record<string, unknown>;
    expect(payload.skills).toBeNull();
    expect(payload.idea_pitch).toBeNull();
    expect(payload.linkedin_url).toBeNull();
  });

  it("persists ip_hash as null when the caller did not compute one", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
    const payload = state.calls[0]!.insertPayload as Record<string, unknown>;
    expect(payload.ip_hash).toBeNull();
  });

  it("persists the caller-supplied ip_hash verbatim (never re-hashes it here)", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({ input: baseInsertInput(), ipHash: "sha256:abcdef" });
    const payload = state.calls[0]!.insertPayload as Record<string, unknown>;
    expect(payload.ip_hash).toBe("sha256:abcdef");
  });

  it("persists visibility='private' when the caller opts out of the directory", async () => {
    state.queue.push({ data: { id: "new-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    await insertCofounderProfile({
      input: { ...baseInsertInput(), visibility: "private" },
      ipHash: null,
    });
    const payload = state.calls[0]!.insertPayload as Record<string, unknown>;
    expect(payload.visibility).toBe("private");
  });
});

// ---------------------------------------------------------------------------
// insertCofounderProfile — happy path + error branches
// ---------------------------------------------------------------------------

describe("insertCofounderProfile — result shape", () => {
  it("returns ok=true + the new row id when Supabase returns { id }", async () => {
    state.queue.push({ data: { id: "generated-uuid-1" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    const out = await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
    expect(out).toEqual({ ok: true, id: "generated-uuid-1" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns ok=false with reason='db_error' when Supabase returns an error", async () => {
    state.queue.push({ error: { message: "unique_violation" } });
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    const out = await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
    expect(out).toEqual({ ok: false, reason: "db_error" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]![0])).toContain("[blockid:cofounder-match]");
  });

  it("returns ok=false with reason='db_error' when Supabase returns neither data nor error", async () => {
    state.queue.push({});
    const { insertCofounderProfile } = await import("./cofounder-match.server");
    const out = await insertCofounderProfile({ input: baseInsertInput(), ipHash: null });
    expect(out).toEqual({ ok: false, reason: "db_error" });
  });
});
