import { describe, expect, it } from "vitest";
import { loadEvidenceReviewQueue } from "./review-queue";

type Result = { data: unknown; error: unknown };

function db(opts: { pending: Result; recent: Result; projects?: Result }) {
  const chain = (res: Result) => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "order", "limit"]) c[k] = () => c;
    c.then = (resolve: (v: Result) => void) => resolve(res);
    return c;
  };
  return {
    from: (table: string) => {
      if (table === "projects") return chain(opts.projects ?? { data: [], error: null });
      let calls = 0;
      return {
        select: () => ({
          eq: () => chain(opts.pending),
          in: () => {
            calls += 1;
            return chain(calls === 1 ? opts.recent : opts.recent);
          },
        }),
      };
    },
  } as never;
}

describe("loadEvidenceReviewQueue", () => {
  it("lists pending rows (with project names) and counts the recent decisions", async () => {
    const q = await loadEvidenceReviewQueue(
      db({
        pending: { data: [{ id: "e1", project_id: "p1", dimension: "lco", evidence_type: "abn_registration", evidence_label: "ABN", confidence_level: "document_uploaded", is_verified: false, review_status: "pending", created_at: "2026-09-16T00:00:00Z" }], error: null },
        recent: {
          data: [
            { id: "e2", project_id: "p1", dimension: "tre", evidence_type: "revenue_proof", confidence_level: "third_party_verified", is_verified: true, review_status: "approved" },
            { id: "e3", project_id: "p2", dimension: "ftv", evidence_type: "founder_bio", confidence_level: "document_uploaded", is_verified: false, review_status: "rejected", review_note: "blurry" },
          ],
          error: null,
        },
        projects: { data: [{ id: "p1", name: "Acme" }], error: null },
      }),
    );
    expect(q.error).toBeNull();
    expect(q.pending).toHaveLength(1);
    expect(q.pending[0]).toMatchObject({ id: "e1", project_name: "Acme", review_status: "pending", evidence_label: "ABN" });
    expect(q.recent.map((r) => r.id)).toEqual(["e2", "e3"]);
    expect(q.counts).toEqual({ pending: 1, approved: 1, rejected: 1 });
    expect(q.recent[1].project_name).toBeNull();
  });

  it("42703 (0407 not applied) reads as migration_pending, other errors as their message", async () => {
    const missing = await loadEvidenceReviewQueue(db({ pending: { data: null, error: { code: "42703", message: "column review_status does not exist" } }, recent: { data: [], error: null } }));
    expect(missing).toMatchObject({ pending: [], error: "migration_pending" });
    const other = await loadEvidenceReviewQueue(db({ pending: { data: [], error: null }, recent: { data: null, error: { message: "boom" } } }));
    expect(other.error).toBe("boom");
  });
});
