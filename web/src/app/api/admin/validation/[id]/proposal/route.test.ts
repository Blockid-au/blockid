// Colocated vitest for GET /api/admin/validation/[id]/proposal (G23-B). Pins
// the admin gate (401 anon / 403 non-admin — never a render, never a stamp),
// 400 on a malformed id or applicants, 404 on an unknown entry, and the 200
// application/pdf path: Content-Disposition slugged from the organisation,
// ?applicants steering the SKU header, the entry's proposal_generated_at
// stamp landing in the ledger, and the audit row. Supabase is absent (the
// audit helper is mocked); the react-pdf render is mocked to a tiny PDF so
// the file stays in the unit project — the real template is pinned by
// lib/pdf/pilot-proposal-pdf.test.tsx on the pdf project.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), logUserAction: vi.fn(async () => ({ ok: true })) }));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser(), ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/audit/log", () => ({ logUserAction: (i: unknown) => mocks.logUserAction(i as never), extractIp: () => "1.1.1.1", extractUserAgent: () => "test" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/pdf/pilot-proposal-pdf", () => ({
  renderPilotProposalPdf: async (proposal: { meta: { sku: string } }) => ({ buffer: Buffer.from(`%PDF-1.4 fake ${proposal.meta.sku}`), pages: 4 }),
}));

import { GET, PROPOSALS_PER_HOUR } from "./route";
import { createEntry, readValidationLedger } from "@/lib/validation/ledger";
import { PILOT_SKUS } from "@/lib/pricing/pilot-skus";

const ADMIN = { id: "admin-1", email: "admin@blockid.au", role: "admin", plan: null };
const FOUNDER = { id: "u-9", email: "founder@x.io", role: "user", plan: "free" };
const ENTRY = { organisation: "Harbour Accelerator", contact_role: "Program manager", date: "2026-09-18", level: 3 as const, outcome: "booked" as const, objection: "Two hours per application and reviewers still disagree.", objection_answered: false, next_step: "Send the proposal", note: "Next intake is 40 startups." };

let root: string;
let entryId: string;
beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "validation-proposal-route-"));
  process.env.BLOCKID_WEB_DIR = root;
  const r = await createEntry(root, ENTRY);
  if (!r.ok) throw new Error(r.message);
  entryId = r.value.id;
});
afterAll(() => {
  delete process.env.BLOCKID_WEB_DIR;
  rmSync(root, { recursive: true, force: true });
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(ADMIN);
});

const call = (id: string, query = "") => GET(new Request(`http://localhost/api/admin/validation/${id}/proposal${query}`), { params: Promise.resolve({ id }) });

describe("GET /api/admin/validation/[id]/proposal", () => {
  it("401 anonymous / 403 non-admin — nothing rendered, nothing stamped", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await call(entryId)).status).toBe(401);
    mocks.getCurrentUser.mockResolvedValue(FOUNDER);
    expect((await call(entryId)).status).toBe(403);
    const ledger = await readValidationLedger(root);
    expect(ledger.entries[0]?.proposal_generated_at).toBeUndefined();
    expect(mocks.logUserAction).not.toHaveBeenCalled();
  });

  it("400 malformed id / applicants, 404 unknown entry", async () => {
    expect((await call("nope!")).status).toBe(400);
    expect((await call(entryId, "?applicants=abc")).status).toBe(400);
    expect((await call(entryId, "?applicants=0")).status).toBe(400);
    expect((await call("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("200 application/pdf: filename from the organisation, SKU from the entry text (40 → the 50 pilot), stamp + audit", async () => {
    const res = await call(entryId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="blockid-pilot-proposal-harbour-accelerator-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-proposal-sku")).toBe("cohort_pilot_50");
    expect(Number(res.headers.get("x-proposal-pages"))).toBeLessThanOrEqual(4);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(String(body.length)).toBe(res.headers.get("content-length"));

    const ledger = await readValidationLedger(root);
    const entry = ledger.entries.find((e) => e.id === entryId)!;
    expect(entry.proposal_generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry).toMatchObject({ level: 3, outcome: "booked", organisation: "Harbour Accelerator" });
    expect(mocks.logUserAction).toHaveBeenCalledWith(expect.objectContaining({ action: "validation.proposal_generated", userId: "admin-1", subjectId: entryId, fields: expect.objectContaining({ sku: "cohort_pilot_50", applicants: PILOT_SKUS.cohort_pilot_50.applicantsCap }) }));
  });

  it("?applicants=12 books the 25 pilot", async () => {
    const res = await call(entryId, "?applicants=12");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-proposal-sku")).toBe("cohort_pilot_25");
  });

  it("429 after PROPOSALS_PER_HOUR renders by the same admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ADMIN, id: "admin-rl" });
    let last: Response | null = null;
    for (let i = 0; i < PROPOSALS_PER_HOUR + 1; i += 1) last = await call("00000000-0000-4000-8000-000000000000");
    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).toMatch(/^\d+$/);
  });
});
