// comparables-admin (S-R5) — review body validation, the UPDATE patch, the
// queue loader and the decision flow over an in-memory table.

import { describe, expect, it } from "vitest";
import { comparablesCounts, invalidateComparablesCache, setComparablesForTests, type ComparableRaiseRow } from "./comparables-repo";
import { loadComparablesQueue, reviewComparable, reviewUpdate, validateReviewBody, type ComparablesAdminDb } from "./comparables-admin";

const ID = "11111111-2222-4333-8444-555555555555";

function row(p: Partial<ComparableRaiseRow> = {}): ComparableRaiseRow {
  return {
    id: ID,
    name: "Evatto",
    sector: "SaaS",
    stage: "pre-seed",
    round_date: "2026-09-16",
    round_label: "Pre-seed",
    amount_aud: 1_020_000,
    post_money_aud: null,
    arr_aud: null,
    arr_multiple: null,
    ebitda_multiple: null,
    founded_year: null,
    notable: false,
    note: "confidence 0.9",
    source_name: "startup-daily",
    source_url: "https://www.startupdaily.net/x",
    source_date: "2026-09-16",
    status: "pending",
    verified_by: null,
    verified_at: null,
    review_note: null,
    created_at: "2026-09-16T10:00:00Z",
    updated_at: "2026-09-16T10:00:00Z",
    ...p,
  };
}

/** In-memory table with the query shapes comparables-admin uses. */
function makeDb(initial: ComparableRaiseRow[], opts: { selectError?: string; updateError?: string } = {}) {
  const rows = [...initial];
  const db: ComparablesAdminDb = {
    from: () => ({
      select: () => ({
        eq: (col: string, v: string) => ({
          order: () => ({ limit: async () => (opts.selectError ? { data: null, error: { message: opts.selectError } } : { data: rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === v), error: null }) }),
          maybeSingle: async () => (opts.selectError ? { data: null, error: { message: opts.selectError } } : { data: rows.find((r) => (r as unknown as Record<string, unknown>)[col] === v) ?? null, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => ({
          select: () => ({
            maybeSingle: async () => {
              if (opts.updateError) return { data: null, error: { message: opts.updateError } };
              const i = rows.findIndex((r) => r.id === id);
              if (i < 0) return { data: null, error: null };
              rows[i] = { ...rows[i], ...(patch as Partial<ComparableRaiseRow>) };
              return { data: rows[i], error: null };
            },
          }),
        }),
      }),
    }),
  };
  return { db, rows };
}

describe("validateReviewBody", () => {
  it("accepts approve / reject with optional note + edits, normalising numbers", () => {
    const v = validateReviewBody({ decision: "approve", note: "  checked source ", edits: { sector: "HealthTech", stage: "seed", post_money_aud: "20000000", arr_aud: 1500000, founded_year: "2023", notable: true } });
    expect(v).toEqual({ ok: true, body: { decision: "approve", note: "checked source", edits: { sector: "HealthTech", stage: "seed", post_money_aud: 20_000_000, arr_aud: 1_500_000, founded_year: 2023, notable: true } } });
    expect(validateReviewBody({ decision: "reject" })).toEqual({ ok: true, body: { decision: "reject", note: undefined, edits: undefined } });
  });

  it("lists every problem", () => {
    const v = validateReviewBody({ decision: "maybe", note: 5, edits: { sector: "Crypto", stage: "series-z", arr_multiple: -1, round_date: "16/09/2026", founded_year: 1800, notable: "yes", name: "" } });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors).toEqual(expect.arrayContaining([expect.stringMatching(/decision/), expect.stringMatching(/note must be a string/), expect.stringMatching(/sector/), expect.stringMatching(/stage/), expect.stringMatching(/arr_multiple/), expect.stringMatching(/round_date/), expect.stringMatching(/founded_year/), expect.stringMatching(/notable/), expect.stringMatching(/name/)]));
    }
    expect(validateReviewBody(null)).toEqual({ ok: false, errors: ["body must be an object"] });
  });
});

describe("reviewUpdate", () => {
  const now = new Date("2026-09-17T00:00:00Z");
  it("approve → verified + verified_by/at + edits; arr_multiple derived from post-money ÷ ARR when not typed", () => {
    const patch = reviewUpdate({ decision: "approve", note: "ok", edits: { post_money_aud: 20_000_000, arr_aud: 1_500_000, sector: "SaaS" } }, "admin@blockid.au", now);
    expect(patch).toEqual({ status: "verified", review_note: "ok", updated_at: now.toISOString(), verified_by: "admin@blockid.au", verified_at: now.toISOString(), post_money_aud: 20_000_000, arr_aud: 1_500_000, sector: "SaaS", arr_multiple: 13.3 });
  });
  it("reject → rejected, verification cleared; a typed arr_multiple wins", () => {
    expect(reviewUpdate({ decision: "reject" }, "a", now)).toMatchObject({ status: "rejected", verified_by: null, verified_at: null, review_note: null });
    expect(reviewUpdate({ decision: "approve", edits: { post_money_aud: 20, arr_aud: 2, arr_multiple: 9 } }, "a", now).arr_multiple).toBe(9);
  });
});

describe("loadComparablesQueue", () => {
  it("splits by status and counts verified / with-multiples", async () => {
    const { db } = makeDb([
      row({ id: "a", status: "pending" }),
      row({ id: "b", status: "verified", arr_multiple: 12 }),
      row({ id: "c", status: "verified", post_money_aud: 30, arr_aud: 3 }),
      row({ id: "d", status: "verified" }),
      row({ id: "e", status: "rejected" }),
    ]);
    const q = await loadComparablesQueue(db);
    expect(q.error).toBeNull();
    expect(q.pending.map((r) => r.id)).toEqual(["a"]);
    expect(q.counts).toEqual({ pending: 1, verified: 3, rejected: 1, withMultiples: 2 });
  });
  it("surfaces a query error (0402 not applied) instead of throwing", async () => {
    const q = await loadComparablesQueue(makeDb([], { selectError: 'relation "au_comparable_raises" does not exist' }).db);
    expect(q.error).toMatch(/does not exist/);
    expect(q.pending).toEqual([]);
  });
});

describe("reviewComparable", () => {
  it("approve flips pending → verified with edits and invalidates the repo cache", async () => {
    setComparablesForTests(null);
    invalidateComparablesCache();
    const { db, rows } = makeDb([row()]);
    const r = await reviewComparable(db, ID, { decision: "approve", edits: { sector: "HealthTech", arr_multiple: 8 } }, { reviewer: "admin@blockid.au", now: new Date("2026-09-17T00:00:00Z") });
    expect(r).toMatchObject({ ok: true, rollback: false, row: { id: ID, status: "verified", sector: "HealthTech", arr_multiple: 8, verified_by: "admin@blockid.au" } });
    expect(rows[0].status).toBe("verified");
    expect(comparablesCounts().source).toBe("static"); // cache dropped → static until re-primed (no client under vitest)
  });

  it("rejecting a verified row is a rollback; re-approving a verified row or re-rejecting a rejected one is 409-style", async () => {
    const { db } = makeDb([row({ status: "verified" })]);
    const r = await reviewComparable(db, ID, { decision: "reject", note: "wrong company" }, { reviewer: "a" });
    expect(r).toMatchObject({ ok: true, rollback: true, row: { status: "rejected", verified_by: null, review_note: "wrong company" } });
    expect(await reviewComparable(makeDb([row({ status: "verified" })]).db, ID, { decision: "approve" }, { reviewer: "a" })).toEqual({ ok: false, reason: "already_decided" });
    expect(await reviewComparable(makeDb([row({ status: "rejected" })]).db, ID, { decision: "reject" }, { reviewer: "a" })).toEqual({ ok: false, reason: "already_decided" });
  });

  it("not_found / query_failed / update_failed", async () => {
    expect(await reviewComparable(makeDb([]).db, ID, { decision: "approve" }, { reviewer: "a" })).toEqual({ ok: false, reason: "not_found" });
    expect(await reviewComparable(makeDb([], { selectError: "boom" }).db, ID, { decision: "approve" }, { reviewer: "a" })).toMatchObject({ ok: false, reason: "query_failed" });
    expect(await reviewComparable(makeDb([row()], { updateError: "locked" }).db, ID, { decision: "approve" }, { reviewer: "a" })).toMatchObject({ ok: false, reason: "update_failed", error: "locked" });
  });
});
