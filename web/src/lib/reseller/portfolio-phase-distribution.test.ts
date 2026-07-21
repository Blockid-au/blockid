import { describe, expect, it } from "vitest";
import { buildPhaseDistribution } from "./portfolio-phase-distribution";

const nCustomers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ user_id: `u${i}` }));

describe("buildPhaseDistribution", () => {
  it("emits all 12 phases with zeros when there are no customers", () => {
    const out = buildPhaseDistribution({ customers: [], svi: [] });
    expect(out).toHaveLength(12);
    expect(out.every((b) => b.count === 0 && !b.suppressed)).toBe(true);
    expect(out[0].phase).toBe(1);
    expect(out[0].label.en).toBe("Vision / Day-0 Idea");
    expect(out[11].phase).toBe(12);
  });

  it("bins score bands into phases 2..6 with per-customer latest score", () => {
    const customers = nCustomers(25);
    const projectsByUser: Record<string, string[]> = {};
    const svi = customers.map((c, i) => {
      const pid = `p${i}`;
      projectsByUser[c.user_id] = [pid];
      const score = 10 + i * 4; // 10, 14, 18, ..., 106
      const day = String((i % 27) + 1).padStart(2, "0");
      return { project_id: pid, score, created_at: `2026-01-${day}T00:00:00Z` };
    });
    const out = buildPhaseDistribution({ customers, svi, projectsByUser, k: 1 });
    // Phase 2 (0-20)  → scores 10, 14, 18 → 3
    // Phase 3 (21-40) → scores 22, 26, 30, 34, 38 → 5
    // Phase 4 (41-60) → scores 42, 46, 50, 54, 58 → 5
    // Phase 5 (61-80) → scores 62, 66, 70, 74, 78 → 5
    // Phase 6 (81-100)→ scores 82, 86, 90, 94, 98 → 5
    // >100 (score 102, 106) → clipped, counted at Phase 1
    expect(out.find((b) => b.phase === 1)?.count).toBe(2);
    expect(out.find((b) => b.phase === 2)?.count).toBe(3);
    expect(out.find((b) => b.phase === 3)?.count).toBe(5);
    expect(out.find((b) => b.phase === 4)?.count).toBe(5);
    expect(out.find((b) => b.phase === 5)?.count).toBe(5);
    expect(out.find((b) => b.phase === 6)?.count).toBe(5);
    expect(out.find((b) => b.phase === 7)?.count).toBe(0);
  });

  it("customers with no scored project fall into Phase 1", () => {
    const out = buildPhaseDistribution({
      customers: nCustomers(6),
      svi: [],
      k: 1,
    });
    expect(out.find((b) => b.phase === 1)?.count).toBe(6);
    for (let p = 2; p <= 12; p += 1) {
      expect(out.find((b) => b.phase === p)?.count).toBe(0);
    }
  });

  it("suppresses buckets under k with count=null, suppressed=true", () => {
    const customers = nCustomers(3);
    const svi = customers.map((c, i) => ({
      project_id: `p${i}`,
      score: 50,
      created_at: "2026-01-01T00:00:00Z",
    }));
    const projectsByUser: Record<string, string[]> = Object.fromEntries(
      customers.map((c, i) => [c.user_id, [`p${i}`]]),
    );
    const out = buildPhaseDistribution({ customers, svi, projectsByUser, k: 5 });
    const p4 = out.find((b) => b.phase === 4);
    expect(p4?.count).toBeNull();
    expect(p4?.suppressed).toBe(true);
    // Empty (zero-count) phases stay unsuppressed
    expect(out.find((b) => b.phase === 7)?.suppressed).toBe(false);
  });

  it("uses the latest SVI score per project when the same project has multiple rows", () => {
    const customers = [{ user_id: "u1" }];
    const svi = [
      { project_id: "p1", score: 10, created_at: "2026-01-01T00:00:00Z" }, // Phase 2
      { project_id: "p1", score: 95, created_at: "2026-06-01T00:00:00Z" }, // Phase 6 — latest wins
    ];
    const out = buildPhaseDistribution({
      customers,
      svi,
      projectsByUser: { u1: ["p1"] },
      k: 1,
    });
    expect(out.find((b) => b.phase === 6)?.count).toBe(1);
    expect(out.find((b) => b.phase === 2)?.count).toBe(0);
  });

  it("picks the highest-phase project when a customer owns multiple", () => {
    const customers = [{ user_id: "u1" }];
    const svi = [
      { project_id: "p1", score: 15, created_at: "2026-01-01T00:00:00Z" }, // Phase 2
      { project_id: "p2", score: 75, created_at: "2026-01-01T00:00:00Z" }, // Phase 5
    ];
    const out = buildPhaseDistribution({
      customers,
      svi,
      projectsByUser: { u1: ["p1", "p2"] },
      k: 1,
    });
    expect(out.find((b) => b.phase === 5)?.count).toBe(1);
    expect(out.find((b) => b.phase === 2)?.count).toBe(0);
  });
});
