// Colocated vitest for the /s/dr/[token] read path.
//
// This is the only surface on BlockID where an unauthenticated stranger reads
// a founder's private data. The token IS the credential, so the rules are
// absolute and pinned here:
//
//   - every failure returns null, and the page turns null into notFound().
//     A bad token, a revoked token, an expired token, and a token whose room
//     was deleted must be INDISTINGUISHABLE — anything else makes the URL a
//     token-existence oracle;
//   - `data_rooms.is_public` is never consulted. Consent is the founder having
//     minted a link, full stop. Migration 0122 added investor_visible to
//     `scores` for exactly this reason; the data room must not regress it;
//   - the room is looked up by the link's data_room_id, never by anything the
//     viewer supplies.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

import {
  loadSharedDataRoom,
  recordShareView,
  extractHeadlines,
  groupDocuments,
  countDocuments,
  stageLabel,
  type SharedRoomDocument,
} from "./load";

type Reply = { data: unknown; error?: unknown };

interface FakeState {
  from: string[];
  eq: Array<{ table: string; col: string; val: unknown }>;
  selects: Array<{ table: string; cols?: string }>;
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  updates: Array<{ table: string; payload: Record<string, unknown> }>;
  replies: Reply[];
}

let state: FakeState;
const fresh = (): FakeState => ({
  from: [],
  eq: [],
  selects: [],
  inserts: [],
  updates: [],
  replies: [],
});
const next = (): Reply => state.replies.shift() ?? { data: null };

function makeSupabase() {
  return {
    from(table: string) {
      state.from.push(table);
      const chain: Record<string, unknown> = {
        select(cols?: string) {
          state.selects.push({ table, cols });
          return chain;
        },
        eq(col: string, val: unknown) {
          state.eq.push({ table, col, val });
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        insert(payload: Record<string, unknown>) {
          state.inserts.push({ table, payload });
          return chain;
        },
        update(payload: Record<string, unknown>) {
          state.updates.push({ table, payload });
          return chain;
        },
        maybeSingle: () => Promise.resolve(next()),
        then: (resolve: (v: Reply) => unknown) => Promise.resolve(next()).then(resolve),
      };
      return chain;
    },
  };
}

const LINK = {
  id: "share-1",
  data_room_id: "room-1",
  investor_name: "Jane Chen",
  investor_firm: "Blackbird",
  access_count: 2,
  is_active: true,
  revoked_at: null,
  expires_at: "2099-01-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z",
};

const ROOM = {
  id: "room-1",
  name: "Acme Investor Data Room",
  startup_name: "Acme",
  stage: 4,
  sections: [
    {
      id: "company",
      title: "Company Overview",
      items: [
        { label: "SVI Score", status: "complete", value: "640/1000" },
        { label: "Current Stage", status: "complete", value: "Revenue" },
      ],
    },
    {
      id: "financial",
      title: "Financial",
      items: [{ label: "Valuation Estimate", status: "complete", value: "A$2,500,000" }],
    },
  ],
  completeness_score: 55,
  last_generated_at: "2026-09-08T00:00:00Z",
};

const DOCS = [
  {
    id: "d1",
    section: "corporate",
    folder: "1. Corporate & Legal",
    document_name: "Company Summary",
    document_type: "auto",
    status: "complete",
    priority: "P0",
    template_content: "# Company Summary\n\nReal prose.",
    file_url: null,
    notes: null,
  },
  {
    id: "d2",
    section: "captable",
    folder: "2. Cap Table & Equity",
    document_name: "Shareholders Agreement (executed)",
    document_type: "upload",
    status: "missing",
    priority: "P0",
    template_content: null,
    file_url: null,
    notes: "Upload the signed shareholders agreement.",
  },
];

beforeEach(() => {
  state = fresh();
  mocks.getSupabaseAdminMock.mockReset();
  mocks.getSupabaseAdminMock.mockReturnValue(makeSupabase());
});

describe("loadSharedDataRoom — the 404 surface", () => {
  it("null for an unknown token — the bad-token 404", async () => {
    state.replies = [{ data: null }];
    expect(await loadSharedDataRoom("Zg9UnknownTokenValue0000000000000")).toBeNull();
  });

  it("null for a revoked link, identical to an unknown token", async () => {
    state.replies = [{ data: { ...LINK, is_active: false, revoked_at: "2026-09-02T00:00:00Z" } }];
    expect(await loadSharedDataRoom("tok-revoked-000000000000000000")).toBeNull();
  });

  it("null for an expired link", async () => {
    state.replies = [{ data: { ...LINK, expires_at: "2020-01-01T00:00:00Z" } }];
    expect(await loadSharedDataRoom("tok-expired-000000000000000000")).toBeNull();
  });

  it("null when the link resolves but the room is gone — never renders an orphan", async () => {
    state.replies = [{ data: LINK }, { data: null }];
    expect(await loadSharedDataRoom("tok-orphan-0000000000000000000")).toBeNull();
  });

  it("null (and no DB call) for an implausibly short token — cheap enumeration guard", async () => {
    expect(await loadSharedDataRoom("abc")).toBeNull();
    expect(await loadSharedDataRoom("")).toBeNull();
    expect(state.from).toEqual([]);
  });

  it("null when supabase is unconfigured rather than throwing at an investor", async () => {
    mocks.getSupabaseAdminMock.mockReturnValue(null);
    expect(await loadSharedDataRoom("tok-anything-00000000000000000")).toBeNull();
  });

  it("resolves the room by the LINK's data_room_id and never by anything the viewer supplies", async () => {
    state.replies = [{ data: LINK }, { data: ROOM }, { data: DOCS }];
    await loadSharedDataRoom("tok-good-00000000000000000000000");
    expect(state.eq).toContainEqual({ table: "data_rooms", col: "id", val: "room-1" });
    expect(state.eq).toContainEqual({
      table: "data_room_documents",
      col: "data_room_id",
      val: "room-1",
    });
  });

  it("never selects or filters on data_rooms.is_public — consent is the link, not a flag", async () => {
    state.replies = [{ data: LINK }, { data: ROOM }, { data: DOCS }];
    await loadSharedDataRoom("tok-good-00000000000000000000000");
    expect(state.eq.some((e) => e.col === "is_public")).toBe(false);
    const roomSelect = state.selects.find((s) => s.table === "data_rooms");
    expect(roomSelect?.cols).not.toContain("is_public");
  });
});

describe("loadSharedDataRoom — what the investor gets", () => {
  async function load() {
    state.replies = [{ data: LINK }, { data: ROOM }, { data: DOCS }];
    return (await loadSharedDataRoom("tok-good-00000000000000000000000"))!;
  }

  it("carries startup name, stage, investor label and expiry", async () => {
    const room = await load();
    expect(room.startupName).toBe("Acme");
    expect(room.stage).toBe(4);
    expect(room.investorLabel).toBe("Jane Chen");
    expect(room.expiresAt).toBe("2099-01-01T00:00:00Z");
    expect(room.state).toBe("active");
  });

  it("falls back to the investor firm when no name was given", async () => {
    state.replies = [{ data: { ...LINK, investor_name: null } }, { data: ROOM }, { data: DOCS }];
    const room = (await loadSharedDataRoom("tok-good-00000000000000000000000"))!;
    expect(room.investorLabel).toBe("Blackbird");
  });

  it("recomputes completeness from real content, ignoring the stored score", async () => {
    const room = await load();
    // 1 of 2 documents has content behind it; the stored score said 55.
    expect(room.completeness).toBe(50);
    expect(room.counts).toEqual({ total: 2, complete: 1, pending: 0, missing: 1 });
  });

  it("treats whitespace-only template_content as no content — the empty-checklist regression", async () => {
    state.replies = [
      { data: LINK },
      { data: ROOM },
      { data: [{ ...DOCS[0], template_content: "   \n  " }] },
    ];
    const room = (await loadSharedDataRoom("tok-good-00000000000000000000000"))!;
    expect(room.folders[0]!.documents[0]!.content).toBeNull();
  });

  it("groups documents into folders in numeric folder order", async () => {
    const room = await load();
    expect(room.folders.map((f) => f.folder)).toEqual([
      "1. Corporate & Legal",
      "2. Cap Table & Equity",
    ]);
  });

  it("pulls headline figures out of the persisted sections blob", async () => {
    const room = await load();
    expect(room.headlines).toEqual([
      { label: "SVI score", value: "640/1000" },
      { label: "Stage", value: "Revenue" },
      { label: "Valuation (mid)", value: "A$2,500,000" },
    ]);
  });

  it("falls back to the stored completeness score when the room has no documents", async () => {
    state.replies = [{ data: LINK }, { data: ROOM }, { data: [] }];
    const room = (await loadSharedDataRoom("tok-good-00000000000000000000000"))!;
    expect(room.completeness).toBe(55);
    expect(room.folders).toEqual([]);
  });
});

describe("extractHeadlines — defensive against junk in `sections`", () => {
  it("ignores a non-array sections blob", () => {
    expect(extractHeadlines(null)).toEqual([]);
    expect(extractHeadlines({ a: 1 })).toEqual([]);
    expect(extractHeadlines("nope")).toEqual([]);
  });

  it("ignores the unrelated knowledge-base index shape that one live row actually holds", () => {
    const kb = Array.from({ length: 5 }, (_, i) => ({
      title: `cdo daily ${i}`,
      filename: `cdo-daily-${i}.md`,
      tags: ["agent:cdo"],
    }));
    expect(extractHeadlines(kb)).toEqual([]);
  });

  it("skips items that are not marked complete — no headline without a real value", () => {
    expect(
      extractHeadlines([
        { items: [{ label: "SVI Score", status: "missing", value: "0/1000" }] },
      ]),
    ).toEqual([]);
  });

  it("de-duplicates a label repeated across sections", () => {
    const out = extractHeadlines([
      { items: [{ label: "SVI Score", status: "complete", value: "600/1000" }] },
      { items: [{ label: "SVI Score", status: "complete", value: "999/1000" }] },
    ]);
    expect(out).toEqual([{ label: "SVI score", value: "600/1000" }]);
  });
});

describe("recordShareView — the founder's access log", () => {
  const room = {
    dataRoomId: "room-1",
    shareId: "share-1",
    accessCount: 2,
  } as Parameters<typeof recordShareView>[0]["room"];

  it("writes a data_room_views row attributed to the share link", async () => {
    await recordShareView({ room, ipHash: "h", userAgent: "UA", referer: "https://mail" });
    const ins = state.inserts.find((i) => i.table === "data_room_views")!;
    expect(ins.payload).toMatchObject({
      data_room_id: "room-1",
      access_token_id: "share-1",
      viewer_ip_hash: "h",
      user_agent: "UA",
      referer: "https://mail",
    });
  });

  it("rolls access_count and last_accessed on the link", async () => {
    await recordShareView({ room, ipHash: null, userAgent: null, referer: null });
    const upd = state.updates.find((u) => u.table === "data_room_access_tokens")!;
    expect(upd.payload.access_count).toBe(3);
    expect(typeof upd.payload.last_accessed).toBe("string");
    expect(upd.payload.first_accessed).toBeUndefined();
  });

  it("stamps first_accessed only on the very first open", async () => {
    await recordShareView({
      room: { ...room, accessCount: 0 },
      ipHash: null,
      userAgent: null,
      referer: null,
    });
    const upd = state.updates.find((u) => u.table === "data_room_access_tokens")!;
    expect(typeof upd.payload.first_accessed).toBe("string");
  });

  it("never stores a raw IP — only the caller-supplied hash", async () => {
    await recordShareView({ room, ipHash: "abc123", userAgent: null, referer: null });
    const payload = state.inserts.find((i) => i.table === "data_room_views")!.payload;
    expect(Object.keys(payload)).not.toContain("viewer_ip");
    expect(payload.viewer_ip_hash).toBe("abc123");
  });

  it("truncates a hostile user-agent / referer to 512 chars", async () => {
    await recordShareView({
      room,
      ipHash: null,
      userAgent: "x".repeat(5000),
      referer: "y".repeat(5000),
    });
    const p = state.inserts.find((i) => i.table === "data_room_views")!.payload;
    expect(String(p.user_agent)).toHaveLength(512);
    expect(String(p.referer)).toHaveLength(512);
  });

  it("swallows a logging failure — telemetry must never 500 an investor's page", async () => {
    mocks.getSupabaseAdminMock.mockReturnValue({
      from() {
        throw new Error("db down");
      },
    });
    await expect(
      recordShareView({ room, ipHash: null, userAgent: null, referer: null }),
    ).resolves.toBeUndefined();
  });
});

describe("presentation helpers", () => {
  const doc = (over: Partial<SharedRoomDocument>): SharedRoomDocument => ({
    id: "x",
    section: "s",
    folder: "1. A",
    documentName: "Doc",
    documentType: "auto",
    status: "missing",
    priority: "P1",
    content: null,
    hasFile: false,
    notes: null,
    ...over,
  });

  it("sorts folders numerically so 10. does not precede 2.", () => {
    const out = groupDocuments([
      doc({ id: "a", folder: "10. References & Due Diligence" }),
      doc({ id: "b", folder: "2. Cap Table & Equity" }),
      doc({ id: "c", folder: "1. Corporate & Legal" }),
    ]);
    expect(out.map((f) => f.folder)).toEqual([
      "1. Corporate & Legal",
      "2. Cap Table & Equity",
      "10. References & Due Diligence",
    ]);
  });

  it("orders P0 documents before P1/P2 within a folder", () => {
    const out = groupDocuments([
      doc({ id: "a", priority: "P2", documentName: "Zeta" }),
      doc({ id: "b", priority: "P0", documentName: "Alpha" }),
      doc({ id: "c", priority: "P1", documentName: "Mid" }),
    ]);
    expect(out[0]!.documents.map((d) => d.documentName)).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  it("counts by status", () => {
    expect(
      countDocuments([
        doc({ id: "1", status: "complete" }),
        doc({ id: "2", status: "pending" }),
        doc({ id: "3", status: "missing" }),
        doc({ id: "4", status: "not_applicable" }),
      ]),
    ).toEqual({ total: 4, complete: 1, pending: 1, missing: 1 });
  });

  it("labels stages and degrades gracefully past the known ladder", () => {
    expect(stageLabel(0)).toBe("Idea");
    expect(stageLabel(4)).toBe("Revenue");
    expect(stageLabel(99)).toBe("Stage 99");
  });
});
