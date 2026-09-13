// S27-C — manual proposal validation, the side-by-side table, and the
// approve / reject state machine (status flips, rollback, race, cache bust).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanReviewNote, currentMultiplesFor, currentMultiplesTable, isPublicHttpUrl, validateManualProposal } from "./multiples-admin";
import { reviewOverride, type ReviewClient } from "./multiples-admin-review";
import { getSectorMultiples, primeSectorMultiples, setSectorMultiplesOverridesForTests, type SectorMultipleOverride } from "./sector-multiples";
import { SECTOR_KEYS } from "./sector-multiples-static";

const TODAY = "2026-09-13";

const BODY = {
  sector: "SaaS",
  arr_low: "6.5",
  arr_mid: 7.4,
  arr_high: "8.2x",
  source_url: "https://www.saas-capital.com/the-saas-capital-index/",
  source_title: "  SaaS Capital Index ",
  source_published_at: "2026-08-31",
  source_excerpt: "the SaaS Capital Index median EV/ARR multiple was 7.4x",
};

function row(p: Partial<SectorMultipleOverride> & { id: string }): SectorMultipleOverride {
  return {
    sector: "saas",
    arr_low: 5,
    arr_mid: 8,
    arr_high: 11,
    effective_from: "2026-07-01",
    source_url: "https://example.com/x",
    source_title: "Example",
    source_published_at: null,
    source_excerpt: "median 8.0x",
    status: "proposed",
    proposed_by: "cron",
    proposed_by_user_id: null,
    approved_by: null,
    approved_at: null,
    rejected_at: null,
    review_note: null,
    created_at: "2026-07-01T03:00:00Z",
    ...p,
  };
}

afterEach(() => setSectorMultiplesOverridesForTests(null));

describe("validateManualProposal", () => {
  it("normalises a good body: sector lower-cased, numeric strings parsed, title trimmed, effective_from defaults to today", () => {
    const v = validateManualProposal(BODY, TODAY);
    expect(v).toEqual({
      ok: true,
      value: {
        sector: "saas",
        arr_low: 6.5,
        arr_mid: 7.4,
        arr_high: 8.2,
        effective_from: TODAY,
        source_url: BODY.source_url,
        source_title: "SaaS Capital Index",
        source_published_at: "2026-08-31",
        source_excerpt: BODY.source_excerpt,
      },
    });
  });

  it("honours an explicit effective_from and a blank published_at", () => {
    const v = validateManualProposal({ ...BODY, effective_from: "2026-10-01", source_published_at: "" }, TODAY);
    expect(v).toMatchObject({ ok: true, value: { effective_from: "2026-10-01", source_published_at: null } });
  });

  it("rejects each bad field with its own error", () => {
    expect(validateManualProposal(null, TODAY)).toEqual({ ok: false, error: "invalid_body" });
    expect(validateManualProposal({ ...BODY, sector: "crypto" }, TODAY)).toEqual({ ok: false, error: "bad_sector" });
    expect(validateManualProposal({ ...BODY, arr_low: 9 }, TODAY)).toEqual({ ok: false, error: "bad_numbers" });
    expect(validateManualProposal({ ...BODY, arr_mid: "" }, TODAY)).toEqual({ ok: false, error: "bad_numbers" });
    expect(validateManualProposal({ ...BODY, arr_high: 201 }, TODAY)).toEqual({ ok: false, error: "bad_numbers" });
    expect(validateManualProposal({ ...BODY, effective_from: "2026-13-01" }, TODAY)).toEqual({ ok: false, error: "bad_effective_from" });
    expect(validateManualProposal({ ...BODY, source_url: "ftp://x.com/a" }, TODAY)).toEqual({ ok: false, error: "bad_source_url" });
    expect(validateManualProposal({ ...BODY, source_url: "http://localhost/a" }, TODAY)).toEqual({ ok: false, error: "bad_source_url" });
    expect(validateManualProposal({ ...BODY, source_url: "http://169.254.169.254/latest" }, TODAY)).toEqual({ ok: false, error: "bad_source_url" });
    expect(validateManualProposal({ ...BODY, source_title: " " }, TODAY)).toEqual({ ok: false, error: "bad_source_title" });
    expect(validateManualProposal({ ...BODY, source_title: "t".repeat(201) }, TODAY)).toEqual({ ok: false, error: "bad_source_title" });
    expect(validateManualProposal({ ...BODY, source_published_at: "Aug 2026" }, TODAY)).toEqual({ ok: false, error: "bad_published_at" });
    expect(validateManualProposal({ ...BODY, source_excerpt: "7.4x" }, TODAY)).toEqual({ ok: false, error: "bad_excerpt" });
    expect(validateManualProposal({ ...BODY, source_excerpt: "e".repeat(501) }, TODAY)).toEqual({ ok: false, error: "bad_excerpt" });
  });

  it("isPublicHttpUrl / cleanReviewNote", () => {
    expect(isPublicHttpUrl("https://carta.com/data/")).toBe(true);
    expect(isPublicHttpUrl("https://[::1]/x")).toBe(false);
    expect(isPublicHttpUrl("https://intranet/x")).toBe(false);
    expect(isPublicHttpUrl(42)).toBe(false);
    expect(cleanReviewNote("  ok ")).toBe("ok");
    expect(cleanReviewNote("")).toBeNull();
    expect(cleanReviewNote(7)).toBeNull();
    expect(cleanReviewNote("n".repeat(1500))).toHaveLength(1000);
  });
});

describe("side-by-side table", () => {
  it("shows the static row and the override in force for every sector", () => {
    const approved = [row({ id: "a", status: "approved", approved_at: "2026-07-02T00:00:00Z" })];
    const t = currentMultiplesTable(approved, TODAY);
    expect(t).toHaveLength(SECTOR_KEYS.length);
    const saas = t.find((r) => r.sector === "saas")!;
    expect(saas.static).toEqual({ low: 6.0, mid: 6.75, high: 7.5, citation: "Bessemer Venture Partners" });
    expect(saas.current).toMatchObject({ low: 5, mid: 8, high: 11, sourceKind: "override", overrideId: "a" });
    expect(currentMultiplesFor("fintech", approved, TODAY).current).toMatchObject({ sourceKind: "static", overrideId: null });
  });
});

describe("reviewOverride", () => {
  function client(initial: SectorMultipleOverride | null, opts: { raceAway?: boolean; readError?: string; updateError?: string } = {}) {
    let current = initial;
    const calls: { patch: Record<string, unknown>; id: string; status: string }[] = [];
    const c: ReviewClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => (opts.readError ? { data: null, error: { message: opts.readError } } : { data: current, error: null }),
          }),
        }),
        update: (patch) => ({
          eq: (_c, id) => ({
            eq: (_s, status) => ({
              select: () => ({
                maybeSingle: async () => {
                  calls.push({ patch, id, status });
                  if (opts.updateError) return { data: null, error: { message: opts.updateError } };
                  if (opts.raceAway || !current || current.status !== status) return { data: null, error: null };
                  current = { ...current, ...(patch as Partial<SectorMultipleOverride>) };
                  return { data: current, error: null };
                },
              }),
            }),
          }),
        }),
      }),
    };
    return { c, calls, get current() { return current; } };
  }

  it("approve: proposed → approved with approver + timestamp + note; conditional on the status read; cache invalidated", async () => {
    const { c, calls } = client(row({ id: "p1" }));
    const now = new Date("2026-09-13T10:00:00Z");
    const r = await reviewOverride(c, "p1", "approve", { userId: "admin-1", note: "checked the page", now });
    expect(r).toMatchObject({ ok: true, previousStatus: "proposed", sameAdmin: false });
    if (r.ok) {
      expect(r.row).toMatchObject({ status: "approved", approved_by: "admin-1", approved_at: now.toISOString(), review_note: "checked the page" });
    }
    expect(calls[0]).toMatchObject({ id: "p1", status: "proposed", patch: { status: "approved", approved_by: "admin-1" } });
  });

  it("approve flags same-admin when the approver typed the proposal", async () => {
    const { c } = client(row({ id: "p2", proposed_by: "admin", proposed_by_user_id: "admin-1" }));
    const mine = await reviewOverride(c, "p2", "approve", { userId: "admin-1", note: null });
    expect(mine).toMatchObject({ ok: true, sameAdmin: true });
    const { c: c2 } = client(row({ id: "p3", proposed_by: "admin", proposed_by_user_id: "admin-1" }));
    const theirs = await reviewOverride(c2, "p3", "approve", { userId: "admin-2", note: null });
    expect(theirs).toMatchObject({ ok: true, sameAdmin: false });
  });

  it("approve refuses an approved (409 already_approved) or rejected (not_reviewable) row; reject refuses a rejected row", async () => {
    expect(await reviewOverride(client(row({ id: "a", status: "approved" })).c, "a", "approve", { userId: "u", note: null })).toEqual({ ok: false, reason: "already_approved" });
    expect(await reviewOverride(client(row({ id: "r", status: "rejected" })).c, "r", "approve", { userId: "u", note: null })).toEqual({ ok: false, reason: "not_reviewable" });
    expect(await reviewOverride(client(row({ id: "r", status: "rejected" })).c, "r", "reject", { userId: "u", note: null })).toEqual({ ok: false, reason: "already_rejected" });
    expect(await reviewOverride(client(null).c, "x", "reject", { userId: "u", note: null })).toEqual({ ok: false, reason: "not_found" });
  });

  it("reject: proposed → rejected, and approved → rejected is the rollback (previousStatus = approved)", async () => {
    const p = client(row({ id: "p" }));
    const r1 = await reviewOverride(p.c, "p", "reject", { userId: "u", note: "no" });
    expect(r1).toMatchObject({ ok: true, previousStatus: "proposed", row: { status: "rejected", review_note: "no" } });
    expect(p.current?.approved_by).toBeNull();

    const a = client(row({ id: "a", status: "approved", approved_by: "admin-1", approved_at: "2026-07-02T00:00:00Z" }));
    const r2 = await reviewOverride(a.c, "a", "reject", { userId: "u", note: null });
    expect(r2).toMatchObject({ ok: true, previousStatus: "approved", row: { status: "rejected" } });
    if (r2.ok) expect(r2.row.rejected_at).toBeTruthy();
  });

  it("a concurrent flip (0 rows matched the status we read) → raced; DB errors → query_failed / update_failed", async () => {
    expect(await reviewOverride(client(row({ id: "p" }), { raceAway: true }).c, "p", "approve", { userId: "u", note: null })).toEqual({ ok: false, reason: "raced" });
    expect(await reviewOverride(client(row({ id: "p" }), { readError: "down" }).c, "p", "approve", { userId: "u", note: null })).toEqual({ ok: false, reason: "query_failed", error: "down" });
    expect(await reviewOverride(client(row({ id: "p" }), { updateError: "locked" }).c, "p", "reject", { userId: "u", note: null })).toEqual({ ok: false, reason: "update_failed", error: "locked" });
  });

  it("approving invalidates the resolver cache so the next prime re-reads", async () => {
    // Prime with a mocked Supabase module (dynamic import inside the resolver).
    const rows = [row({ id: "live", status: "approved", approved_at: "2026-07-02T00:00:00Z" })];
    vi.doMock("@/lib/supabase", () => ({
      getSupabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }),
          }),
        }),
      }),
    }));
    await primeSectorMultiples({ force: true });
    expect(getSectorMultiples("saas", TODAY).sourceKind).toBe("override");
    // Reject the live row through the review function → cache dropped.
    rows.length = 0;
    const { c } = client(row({ id: "live", status: "approved", approved_at: "2026-07-02T00:00:00Z" }));
    await reviewOverride(c, "live", "reject", { userId: "u", note: null });
    await primeSectorMultiples();
    expect(getSectorMultiples("saas", TODAY).sourceKind).toBe("static");
    vi.doUnmock("@/lib/supabase");
  });
});
