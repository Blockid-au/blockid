// Unit tests for POST /api/landing-page/publish — P4a-publish-route.
//
// Asserts the seven contract branches from route.ts:
//   1. Unauthenticated → 401.
//   2. Non-JSON / non-object body → 400 invalid_json / invalid_body.
//   3. Invalid landing-page input → 400 publish_refused with reasons[].
//   4. Invalid slug → 400 publish_refused with slug_* reasons[].
//   5. Valid input + dry_run=true → 200, persisted=false, no supabase insert.
//   6. Valid input first publish → 201 with dataroom_file_id + persisted=true.
//   7. Second publish of identical content → 200 persisted=false, existing=true
//      (file_name-embedded content_sha256 fingerprint means the natural key
//      collides on identical HTML — a re-publish is a no-op by design).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

interface FakeRow {
  id: string;
  user_id: string;
  file_name: string;
  drive_file_url: string;
  file_size_bytes: number;
  mime_type: string;
  status: string;
  template_slug: string;
  template_version: string;
  svi_dimension: string;
  email: string;
}

const fakeStore: { rows: FakeRow[]; nextId: number } = { rows: [], nextId: 1 };

function makeSupabase() {
  return {
    from(table: string) {
      if (table !== "dataroom_files") throw new Error(`unexpected table ${table}`);
      const state: {
        filters: Record<string, unknown>;
        insertPayload: Record<string, unknown> | null;
      } = { filters: {}, insertPayload: null };

      const api: Record<string, unknown> = {};
      api.select = vi.fn().mockReturnValue(api);
      api.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
        state.filters[col] = val;
        return api;
      });
      api.maybeSingle = vi.fn().mockImplementation(async () => {
        const row = fakeStore.rows.find(
          (r) =>
            r.user_id === state.filters.user_id &&
            r.file_name === state.filters.file_name,
        );
        return row ? { data: row, error: null } : { data: null, error: null };
      });
      api.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        state.insertPayload = payload;
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.single = vi.fn().mockImplementation(async () => {
          const row: FakeRow = {
            id: `row_${fakeStore.nextId++}`,
            user_id: String(payload.user_id),
            file_name: String(payload.file_name),
            drive_file_url: String(payload.drive_file_url),
            file_size_bytes: Number(payload.file_size_bytes),
            mime_type: String(payload.mime_type),
            status: String(payload.status),
            template_slug: String(payload.template_slug),
            template_version: String(payload.template_version),
            svi_dimension: String(payload.svi_dimension),
            email: String(payload.email),
          };
          fakeStore.rows.push(row);
          return { data: { id: row.id }, error: null };
        });
        return chain;
      });
      return api;
    },
  };
}

const getSupabaseAdminMock = vi.fn(makeSupabase);
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { POST } from "./route";

function jsonReq(body: unknown): Request {
  return new Request("http://x/api/landing-page/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_INPUT = {
  headline: "One-click compliance for AU founders",
  subheadline: "Ship an investor-ready data-room in a week, not a quarter.",
  bullets: [
    "12-folder / 102-item data-room seeded from Atlassian's S-1",
    "AU-flavoured SAFE + Pty Ltd constitution templates",
    "ESIC + Div 83A eligibility gates built in",
  ],
  cta_label: "Start free",
  cta_href: "https://blockid.au/svi",
  ga4_measurement_id: "G-ABCD1234",
  brand_name: "BlockID.au",
};

beforeEach(() => {
  fakeStore.rows = [];
  fakeStore.nextId = 1;
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockClear();
  getSupabaseAdminMock.mockImplementation(makeSupabase);
});

describe("POST /api/landing-page/publish", () => {
  it("401s when no session cookie is present", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(
      jsonReq({ input: VALID_INPUT, slug: "acme-inc" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("400s on non-JSON body", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "a@b.co" });
    const res = await POST(jsonReq("<not json>"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });

  it("400s on JSON that is not an object", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "a@b.co" });
    const res = await POST(jsonReq(["not", "an", "object"]));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("refuses (400) when landing-page input is invalid", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "a@b.co" });
    const res = await POST(
      jsonReq({
        input: { ...VALID_INPUT, headline: "" },
        slug: "acme-inc",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("publish_refused");
    expect(body.reasons).toContain("invalid_landing_page_input");
    expect(body.validation.valid).toBe(false);
  });

  it("refuses (400) when the slug is too short", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "a@b.co" });
    const res = await POST(
      jsonReq({ input: VALID_INPUT, slug: "a" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("publish_refused");
    expect(body.reasons).toContain("slug_too_short");
  });

  it("dry_run=true returns snapshot without persisting", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "a@b.co" });
    const res = await POST(
      jsonReq({
        input: VALID_INPUT,
        slug: "acme-inc",
        dry_run: true,
        published_at: "2026-07-25T00:00:00Z",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(false);
    expect(body.dry_run).toBe(true);
    expect(body.snapshot.canonical_slug).toBe("acme-inc");
    expect(body.snapshot.content_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.file_name).toMatch(/^landing-page-acme-inc-[0-9a-f]{12}\.html$/);
    expect(fakeStore.rows).toHaveLength(0);
  });

  it("first publish inserts a dataroom_files row and returns 201", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "founder@x.co" });
    const res = await POST(
      jsonReq({
        input: VALID_INPUT,
        slug: "acme-inc",
        published_at: "2026-07-25T00:00:00Z",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.existing).toBe(false);
    expect(body.dataroom_file_id).toBe("row_1");
    expect(body.snapshot.canonical_url).toBe("https://acme-inc.landing.blockid.au/");
    expect(fakeStore.rows).toHaveLength(1);
    const [row] = fakeStore.rows;
    expect(row.user_id).toBe("u1");
    expect(row.email).toBe("founder@x.co");
    expect(row.svi_dimension).toBe("product");
    expect(row.mime_type).toBe("text/html");
    expect(row.status).toBe("present");
    expect(row.template_slug).toBe("landing-page-publish");
    expect(row.template_version).toBe("v1");
    expect(row.drive_file_url).toBe("https://acme-inc.landing.blockid.au/");
    expect(row.file_name).toBe(body.file_name);
  });

  it("re-publishing identical content is a no-op (returns existing row)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "founder@x.co" });
    const first = await POST(
      jsonReq({
        input: VALID_INPUT,
        slug: "acme-inc",
        published_at: "2026-07-25T00:00:00Z",
      }),
    );
    expect(first.status).toBe(201);
    expect(fakeStore.rows).toHaveLength(1);

    const second = await POST(
      jsonReq({
        input: VALID_INPUT,
        slug: "acme-inc",
        published_at: "2026-07-26T00:00:00Z", // different timestamp; content_sha256 same
      }),
    );
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(false);
    expect(body.existing).toBe(true);
    expect(body.existing_id).toBe("row_1");
    expect(fakeStore.rows).toHaveLength(1);
  });

  it("changing the content produces a fresh row (different sha12)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "founder@x.co" });
    const first = await POST(
      jsonReq({ input: VALID_INPUT, slug: "acme-inc" }),
    );
    expect(first.status).toBe(201);

    const second = await POST(
      jsonReq({
        input: { ...VALID_INPUT, headline: "New headline" },
        slug: "acme-inc",
      }),
    );
    expect(second.status).toBe(201);
    expect(fakeStore.rows).toHaveLength(2);
    expect(fakeStore.rows[0].file_name).not.toBe(fakeStore.rows[1].file_name);
  });
});
