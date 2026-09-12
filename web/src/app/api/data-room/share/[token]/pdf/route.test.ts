// Colocated vitest for GET /api/data-room/share/[token]/pdf (S21-A).
//
// Pins the server-side half of the NDA gate and the watermark:
//   - bad / revoked / expired / orphaned token and a bad doc id → 404;
//   - NDA pending on a Starter+ room → 403 nda_required, no render;
//   - the document lookup is scoped to the LINK's room (never just the id);
//   - watermark_enabled + entitled → the PDF carries "Prepared for <recipient>",
//     recipient from data_room_access_tokens.watermark first, then name/firm/email,
//     then the NDA-ledger email, then `link <id8>` (P2-3) — never a clean PDF
//     while the page says "watermarked for you";
//   - watermark off, or a Free owner → clean PDF, no X-BlockID-Watermark;
//   - a document_download engagement row is written.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { PDFParse } from "pdf-parse";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  ownerTrustEntitled: vi.fn<() => Promise<boolean>>(async () => true),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/dataroom/nda-server", async () => {
  const real = await vi.importActual<typeof import("@/lib/dataroom/nda-server")>("@/lib/dataroom/nda-server");
  return { ...real, ownerTrustEntitled: () => mocks.ownerTrustEntitled() };
});

import { GET } from "./route";

const TOKEN = "p".repeat(32);
const DOC_ID = "11111111-2222-4333-8444-555555555555";

const LINK = {
  id: "link-1",
  data_room_id: "room-1",
  account_id: "owner-1",
  investor_name: "Jane Chen",
  investor_firm: "Blackbird",
  investor_email: "jane@bb.vc",
  watermark: null as string | null,
  is_active: true,
  revoked_at: null,
  expires_at: null,
  nda_required: false,
  nda_signed_at: null as string | null,
  nda_signed_version: null as number | null,
};
const ROOM = {
  id: "room-1",
  user_id: "owner-1",
  name: "Acme Investor Data Room",
  startup_name: "Acme",
  nda_required: false,
  nda_text: null,
  nda_version: 1,
  watermark_enabled: true,
};
const DOC = {
  id: DOC_ID,
  folder: "3. Financial Projections",
  document_name: "Financial projections",
  template_content: "# Projections\n\nRevenue grows.\n\n- FY27 A$1.2M\n- FY28 A$3.4M",
  status: "complete",
};

let sb: FakeSupabase;
function setup(
  link: Record<string, unknown> | null = LINK,
  room: Record<string, unknown> | null = ROOM,
  doc: Record<string, unknown> | null = DOC,
  acceptances: Record<string, unknown>[] = [],
) {
  sb = fakeSupabase({
    data_room_access_tokens: link ? [link] : [],
    data_rooms: room ? [room] : [],
    data_room_documents: doc ? [doc] : [],
    data_room_nda_acceptances: acceptances,
  });
  mocks.sb = sb;
}

function call(token = TOKEN, doc: string | null = DOC_ID) {
  const url = `http://localhost/api/data-room/share/${token}/pdf${doc ? `?doc=${doc}` : ""}`;
  const req = new Request(url, { headers: { "user-agent": "Mozilla/5.0 Chrome/120" } }) as unknown as NextRequest;
  return GET(req, { params: Promise.resolve({ token }) });
}

async function textOf(res: Response): Promise<string> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(Buffer.from(bytes.subarray(0, 4)).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: bytes });
  try {
    return (await parser.getText()).text.replace(/\s+/g, " ");
  } finally {
    await parser.destroy();
  }
}

beforeEach(() => {
  mocks.ownerTrustEntitled.mockReset();
  mocks.ownerTrustEntitled.mockResolvedValue(true);
  setup();
});

describe("GET /api/data-room/share/[token]/pdf", () => {
  it("404s a short token or a non-uuid doc id before any lookup", async () => {
    expect((await call("abc")).status).toBe(404);
    expect((await call(TOKEN, null)).status).toBe(404);
    expect((await call(TOKEN, "../etc")).status).toBe(404);
    expect(sb.calls.length).toBe(0);
  });

  it("503s without a database", async () => {
    mocks.sb = null;
    expect((await call()).status).toBe(503);
  });

  it("404s a bad, revoked, expired or orphaned token identically", async () => {
    setup(null);
    expect((await call()).status).toBe(404);
    setup({ ...LINK, is_active: false, revoked_at: "2026-09-01T00:00:00Z" });
    expect((await call()).status).toBe(404);
    setup({ ...LINK, expires_at: "2020-01-01T00:00:00Z" });
    expect((await call()).status).toBe(404);
    setup(LINK, null);
    expect((await call()).status).toBe(404);
  });

  it("403 nda_required when the room's gate is pending — the page is not the only guard", async () => {
    setup(LINK, { ...ROOM, nda_required: true, nda_version: 2 });
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: "nda_required" });
    expect(sb.find("data_room_documents", "select").length).toBe(0);
  });

  it("403 after a version bump even though an older version was accepted", async () => {
    setup({ ...LINK, nda_signed_at: "2026-09-01T00:00:00Z", nda_signed_version: 1 }, { ...ROOM, nda_required: true, nda_version: 2 });
    expect((await call()).status).toBe(403);
  });

  it("serves once the current version is accepted", async () => {
    setup({ ...LINK, nda_signed_at: "2026-09-01T00:00:00Z", nda_signed_version: 2 }, { ...ROOM, nda_required: true, nda_version: 2 });
    expect((await call()).status).toBe(200);
  }, 60_000);

  it("Free room: nda_required is ignored and the PDF is clean", async () => {
    mocks.ownerTrustEntitled.mockResolvedValue(false);
    setup(LINK, { ...ROOM, nda_required: true, watermark_enabled: true });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("X-BlockID-Watermark")).toBeNull();
    expect(await textOf(res)).not.toContain("Prepared for");
  }, 60_000);

  it("scopes the document lookup to the LINK's room and 404s a doc it does not find", async () => {
    setup(LINK, ROOM, null);
    expect((await call()).status).toBe(404);
    expect(sb.hasEq("data_room_documents", "id", DOC_ID)).toBe(true);
    expect(sb.hasEq("data_room_documents", "data_room_id", "room-1")).toBe(true);
  });

  it("404s a document with no written content rather than serving a blank PDF", async () => {
    setup(LINK, ROOM, { ...DOC, template_content: "   " });
    const res = await call();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("no_content");
  });

  it("watermarks with the link's investor name when watermark_enabled, and logs the download", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain('filename="acme-financial-projections.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-BlockID-Watermark")).toBe("1");
    const text = await textOf(res);
    expect(text).toContain("Prepared for Jane Chen");
    expect(text).toContain("BlockID.au");
    expect(text).toContain("Revenue grows");
    // give the fire-and-forget insert a tick
    await new Promise((r) => setTimeout(r, 10));
    const [ev] = sb.find("data_room_engagement", "insert");
    expect(ev.args[0]).toMatchObject({
      data_room_id: "room-1",
      access_token_id: "link-1",
      event_type: "document_download",
      section: "3. Financial Projections",
      document_name: "Financial projections",
    });
    expect((ev.args[0] as { ip_hash: string | null }).ip_hash === null || /^[0-9a-f]{16}$/.test((ev.args[0] as { ip_hash: string }).ip_hash)).toBe(true);
  }, 60_000);

  it("prefers data_room_access_tokens.watermark (the share_packages.watermark mirror) over the investor name", async () => {
    setup({ ...LINK, watermark: "Blackbird Ventures — Fund IV" });
    const text = await textOf(await call());
    expect(text).toContain("Prepared for Blackbird Ventures — Fund IV");
    expect(text).not.toContain("Prepared for Jane Chen");
  }, 60_000);

  it("falls back through firm then email when there is no name", async () => {
    setup({ ...LINK, investor_name: null });
    expect(await textOf(await call())).toContain("Prepared for Blackbird");
    setup({ ...LINK, investor_name: null, investor_firm: null });
    expect(await textOf(await call())).toContain("Prepared for jane@bb.vc");
  }, 60_000);

  it("renders clean when the founder turned the watermark off", async () => {
    setup(LINK, { ...ROOM, watermark_enabled: false });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("X-BlockID-Watermark")).toBeNull();
    expect(await textOf(res)).not.toContain("Prepared for");
  }, 60_000);

  it("stamps `link <id8>` for an anonymous link so the PDF is still traceable (P2-3)", async () => {
    setup({ ...LINK, id: "9f3c2a1b-0000-4000-8000-000000000000", investor_name: null, investor_firm: null, investor_email: null, watermark: null });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("X-BlockID-Watermark")).toBe("1");
    expect(await textOf(res)).toContain("Prepared for link 9f3c2a1b");
  }, 60_000);

  it("uses the NDA-ledger email (acceptance row, never the token row) before the link-id fallback", async () => {
    setup(
      { ...LINK, investor_name: null, investor_firm: null, investor_email: null, watermark: null },
      ROOM,
      DOC,
      [{ viewer_email: "viewer@fund.vc", accepted_at: "2026-09-10T00:00:00Z" }],
    );
    const text = await textOf(await call());
    expect(text).toContain("Prepared for viewer@fund.vc");
    expect(sb.hasEq("data_room_nda_acceptances", "access_token_id", "link-1")).toBe(true);
  }, 60_000);

  it("does not read the ledger when the founder named the link (founder-set identity wins)", async () => {
    setup(LINK, ROOM, DOC, [{ viewer_email: "partner@blackbird.vc", accepted_at: "2026-09-10T00:00:00Z" }]);
    const text = await textOf(await call());
    expect(text).toContain("Prepared for Jane Chen");
    expect(text).not.toContain("blackbird.vc");
    expect(sb.find("data_room_nda_acceptances", "select").length).toBe(0);
  }, 60_000);
});
