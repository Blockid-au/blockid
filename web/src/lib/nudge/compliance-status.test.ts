import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeComplianceMissing } from "./compliance-status";

// Colocated vitest for the I/O-fronted compliance snapshot resolver
// (docs/plans/atlassian-standard-mapping-goal.md §P3_nudge_engine_impl —
// this file is the AU-compliance data-source half of the nudge engine).
// Pins the four-table read matrix (compliance_esic_assessments /
// compliance_s708_certs / compliance_gst_status / compliance_rd_registrations)
// and the daysBetween arithmetic so a schema rename in migration 0108 or a
// new not_applicable status enum surfaces here instead of silently corrupting
// the founder-facing missing[] array.
//
// Table-driven fake Supabase — every eq filter is captured and applied to
// the fixture row set; order/limit/maybeSingle are honoured so the "latest
// ESIC row wins" contract holds. The four compliance tables can carry
// distinct row sets in one state.

interface FakeRow {
  [col: string]: unknown;
}
interface FakeState {
  tables: Record<string, FakeRow[]>;
  fail: Record<string, string>;
}

function makeState(seed: Partial<Record<string, FakeRow[]>> = {}): FakeState {
  const tables: Record<string, FakeRow[]> = {
    compliance_esic_assessments: [],
    compliance_s708_certs: [],
    compliance_gst_status: [],
    compliance_rd_registrations: [],
  };
  for (const [k, v] of Object.entries(seed)) {
    if (v) tables[k] = v;
  }
  return { tables, fail: {} };
}

type Resolved = { data: unknown; error: { message: string } | null };

function makeSupabase(state: FakeState): SupabaseClient {
  function makeChain(table: string) {
    const filters: Array<{ col: string; val: unknown }> = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;

    function resolveNow(single: boolean): Resolved {
      if (state.fail[table]) {
        return { data: null, error: { message: state.fail[table] } };
      }
      let rows = (state.tables[table] ?? []).filter((r) =>
        filters.every((f) => r[f.col] === f.val),
      );
      if (orderCol) {
        const col = orderCol;
        rows = [...rows].sort((a, b) => {
          const av = String(a[col] ?? "");
          const bv = String(b[col] ?? "");
          return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (limitN !== null) rows = rows.slice(0, limitN);
      if (single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        filters.push({ col, val });
        return chain;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = opts?.ascending !== false;
        return chain;
      },
      limit(n: number) {
        limitN = n;
        return chain;
      },
      maybeSingle() {
        return Promise.resolve(resolveNow(true));
      },
      then(resolve: (v: Resolved) => void) {
        resolve(resolveNow(false));
      },
    };
    return chain;
  }

  function from(table: string) {
    return {
      select(_cols: string) {
        return makeChain(table);
      },
    };
  }
  return { from } as unknown as SupabaseClient;
}

const UID = "u-1";
const PID = "p-1";
const NOW = new Date("2026-07-30T12:00:00Z");

describe("computeComplianceMissing — default (empty state)", () => {
  it("returns all-false / null defaults when no rows exist for the caller", async () => {
    const s = makeState();
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasEsicAssessment).toBe(false);
    expect(r.hasValidOrExpiringS708).toBe(false);
    expect(r.hasGstAssessment).toBe(false);
    expect(r.rdMinDaysUntilDeadline).toBeNull();
    expect(r.rdMinDeadlineFy).toBeNull();
    expect(r.rdHasOverdue).toBe(false);
    expect(r.isEsic).toBeUndefined();
    expect(r.gstUrgency).toBeUndefined();
    expect(r.gstRegistered).toBeUndefined();
  });

  it("filters out rows belonging to another user or project", async () => {
    const s = makeState({
      compliance_esic_assessments: [
        {
          user_id: "u-other",
          project_id: PID,
          is_esic: true,
          assessed_at: "2026-07-01",
        },
        {
          user_id: UID,
          project_id: "p-other",
          is_esic: true,
          assessed_at: "2026-07-01",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasEsicAssessment).toBe(false);
  });
});

describe("computeComplianceMissing — ESIC branch", () => {
  it("hasEsicAssessment=true + isEsic=true when latest row has is_esic=true", async () => {
    const s = makeState({
      compliance_esic_assessments: [
        {
          user_id: UID,
          project_id: PID,
          is_esic: true,
          assessed_at: "2026-07-20",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasEsicAssessment).toBe(true);
    expect(r.isEsic).toBe(true);
  });

  it("isEsic=false when the latest row has is_esic=false", async () => {
    const s = makeState({
      compliance_esic_assessments: [
        {
          user_id: UID,
          project_id: PID,
          is_esic: false,
          assessed_at: "2026-07-20",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasEsicAssessment).toBe(true);
    expect(r.isEsic).toBe(false);
  });

  it("Boolean-coerces is_esic=null to isEsic=false but still records the assessment", async () => {
    const s = makeState({
      compliance_esic_assessments: [
        {
          user_id: UID,
          project_id: PID,
          is_esic: null,
          assessed_at: "2026-07-20",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasEsicAssessment).toBe(true);
    expect(r.isEsic).toBe(false);
  });

  it("picks the latest ESIC row by assessed_at DESC when multiple exist", async () => {
    const s = makeState({
      compliance_esic_assessments: [
        {
          user_id: UID,
          project_id: PID,
          is_esic: false,
          assessed_at: "2026-05-01",
        },
        {
          user_id: UID,
          project_id: PID,
          is_esic: true,
          assessed_at: "2026-07-20",
        },
        {
          user_id: UID,
          project_id: PID,
          is_esic: false,
          assessed_at: "2026-06-15",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.isEsic).toBe(true);
  });

  it("no-ops gracefully when the ESIC SELECT errors (does not throw)", async () => {
    const s = makeState();
    s.fail.compliance_esic_assessments = "boom-esic";
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasEsicAssessment).toBe(false);
    expect(r.isEsic).toBeUndefined();
  });
});

describe("computeComplianceMissing — s708(8) certs branch", () => {
  it("hasValidOrExpiringS708=true when a cert expires in the future", async () => {
    const s = makeState({
      compliance_s708_certs: [
        { user_id: UID, project_id: PID, expiry_date: "2026-10-01" },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasValidOrExpiringS708).toBe(true);
  });

  it("hasValidOrExpiringS708=true when a cert expires exactly today (0-day boundary)", async () => {
    const s = makeState({
      compliance_s708_certs: [
        { user_id: UID, project_id: PID, expiry_date: "2026-07-30" },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasValidOrExpiringS708).toBe(true);
  });

  it("hasValidOrExpiringS708=false when the only cert already expired", async () => {
    const s = makeState({
      compliance_s708_certs: [
        { user_id: UID, project_id: PID, expiry_date: "2026-01-01" },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasValidOrExpiringS708).toBe(false);
  });

  it("skips certs with null expiry_date", async () => {
    const s = makeState({
      compliance_s708_certs: [
        { user_id: UID, project_id: PID, expiry_date: null },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasValidOrExpiringS708).toBe(false);
  });

  it("returns true when any single cert in a mixed set is still valid", async () => {
    const s = makeState({
      compliance_s708_certs: [
        { user_id: UID, project_id: PID, expiry_date: "2025-06-01" },
        { user_id: UID, project_id: PID, expiry_date: null },
        { user_id: UID, project_id: PID, expiry_date: "2027-03-15" },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasValidOrExpiringS708).toBe(true);
  });
});

describe("computeComplianceMissing — GST snapshot branch", () => {
  it("hasGstAssessment=true + gstUrgency='ok' + gstRegistered=true when latest row is clean", async () => {
    const s = makeState({
      compliance_gst_status: [
        {
          user_id: UID,
          project_id: PID,
          urgency: "ok",
          registered_for_gst: true,
          computed_at: "2026-07-20T00:00:00Z",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasGstAssessment).toBe(true);
    expect(r.gstUrgency).toBe("ok");
    expect(r.gstRegistered).toBe(true);
  });

  it("propagates 'warning' and 'critical' urgency verbatim", async () => {
    for (const urgency of ["warning", "critical"] as const) {
      const s = makeState({
        compliance_gst_status: [
          {
            user_id: UID,
            project_id: PID,
            urgency,
            registered_for_gst: false,
            computed_at: "2026-07-20T00:00:00Z",
          },
        ],
      });
      const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
      expect(r.gstUrgency).toBe(urgency);
    }
  });

  it("defaults gstUrgency to 'ok' when the persisted urgency column is null", async () => {
    const s = makeState({
      compliance_gst_status: [
        {
          user_id: UID,
          project_id: PID,
          urgency: null,
          registered_for_gst: null,
          computed_at: "2026-07-20T00:00:00Z",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.gstUrgency).toBe("ok");
    expect(r.gstRegistered).toBe(false);
  });

  it("picks the latest GST row by computed_at DESC when multiple exist", async () => {
    const s = makeState({
      compliance_gst_status: [
        {
          user_id: UID,
          project_id: PID,
          urgency: "critical",
          registered_for_gst: false,
          computed_at: "2026-01-01T00:00:00Z",
        },
        {
          user_id: UID,
          project_id: PID,
          urgency: "ok",
          registered_for_gst: true,
          computed_at: "2026-07-20T00:00:00Z",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.gstUrgency).toBe("ok");
    expect(r.gstRegistered).toBe(true);
  });
});

describe("computeComplianceMissing — R&D calendar branch", () => {
  it("rdMinDaysUntilDeadline picks the nearest upcoming deadline; rdMinDeadlineFy carries its fy_label", async () => {
    const s = makeState({
      compliance_rd_registrations: [
        {
          user_id: UID,
          project_id: PID,
          fy_label: "2025-26",
          registration_deadline: "2027-04-30",
          registration_status: "pending",
        },
        {
          user_id: UID,
          project_id: PID,
          fy_label: "2024-25",
          registration_deadline: "2026-08-30",
          registration_status: "pending",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.rdMinDeadlineFy).toBe("2024-25");
    // 2026-07-30 → 2026-08-30 = 31 days
    expect(r.rdMinDaysUntilDeadline).toBe(31);
    expect(r.rdHasOverdue).toBe(false);
  });

  it("skips rows with registration_status='registered' from the minimum-days calc", async () => {
    const s = makeState({
      compliance_rd_registrations: [
        {
          user_id: UID,
          project_id: PID,
          fy_label: "2024-25",
          registration_deadline: "2026-08-30",
          registration_status: "registered",
        },
        {
          user_id: UID,
          project_id: PID,
          fy_label: "2025-26",
          registration_deadline: "2027-04-30",
          registration_status: "pending",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.rdMinDeadlineFy).toBe("2025-26");
  });

  it("skips rows with registration_status='not_applicable'", async () => {
    const s = makeState({
      compliance_rd_registrations: [
        {
          user_id: UID,
          project_id: PID,
          fy_label: "2024-25",
          registration_deadline: "2026-08-30",
          registration_status: "not_applicable",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.rdMinDaysUntilDeadline).toBeNull();
    expect(r.rdMinDeadlineFy).toBeNull();
  });

  it("flips rdHasOverdue=true when any pending row has an overdue deadline (and does NOT double-count in minDays)", async () => {
    const s = makeState({
      compliance_rd_registrations: [
        {
          user_id: UID,
          project_id: PID,
          fy_label: "2023-24",
          registration_deadline: "2025-04-30",
          registration_status: "pending",
        },
        {
          user_id: UID,
          project_id: PID,
          fy_label: "2024-25",
          registration_deadline: "2026-10-30",
          registration_status: "pending",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.rdHasOverdue).toBe(true);
    expect(r.rdMinDeadlineFy).toBe("2024-25");
    // 2026-07-30 → 2026-10-30 = 92 days (Aug 31 + Sep 30 + Oct 30 - 30 buffer)
    expect(r.rdMinDaysUntilDeadline).toBe(92);
  });

  it("returns nulls when every pending row is already overdue (rdHasOverdue still fires)", async () => {
    const s = makeState({
      compliance_rd_registrations: [
        {
          user_id: UID,
          project_id: PID,
          fy_label: "2023-24",
          registration_deadline: "2025-04-30",
          registration_status: "pending",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.rdHasOverdue).toBe(true);
    expect(r.rdMinDaysUntilDeadline).toBeNull();
    expect(r.rdMinDeadlineFy).toBeNull();
  });

  it("skips rows with null registration_deadline (no throw, no NaN)", async () => {
    const s = makeState({
      compliance_rd_registrations: [
        {
          user_id: UID,
          project_id: PID,
          fy_label: "2025-26",
          registration_deadline: null,
          registration_status: "pending",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.rdMinDaysUntilDeadline).toBeNull();
    expect(r.rdHasOverdue).toBe(false);
  });

  it("carries fy_label=null through the min-slot when the winning row's fy_label is null", async () => {
    const s = makeState({
      compliance_rd_registrations: [
        {
          user_id: UID,
          project_id: PID,
          fy_label: null,
          registration_deadline: "2026-08-30",
          registration_status: "pending",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.rdMinDeadlineFy).toBeNull();
    expect(r.rdMinDaysUntilDeadline).toBe(31);
  });
});

describe("computeComplianceMissing — cross-branch composition", () => {
  it("independently populates all four branches in a single call when every table has a matching row", async () => {
    const s = makeState({
      compliance_esic_assessments: [
        {
          user_id: UID,
          project_id: PID,
          is_esic: true,
          assessed_at: "2026-07-20",
        },
      ],
      compliance_s708_certs: [
        { user_id: UID, project_id: PID, expiry_date: "2026-12-01" },
      ],
      compliance_gst_status: [
        {
          user_id: UID,
          project_id: PID,
          urgency: "warning",
          registered_for_gst: true,
          computed_at: "2026-07-20T00:00:00Z",
        },
      ],
      compliance_rd_registrations: [
        {
          user_id: UID,
          project_id: PID,
          fy_label: "2025-26",
          registration_deadline: "2027-04-30",
          registration_status: "pending",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID, NOW);
    expect(r.hasEsicAssessment).toBe(true);
    expect(r.isEsic).toBe(true);
    expect(r.hasValidOrExpiringS708).toBe(true);
    expect(r.hasGstAssessment).toBe(true);
    expect(r.gstUrgency).toBe("warning");
    expect(r.gstRegistered).toBe(true);
    expect(r.rdMinDeadlineFy).toBe("2025-26");
    expect(r.rdMinDaysUntilDeadline).not.toBeNull();
    expect(r.rdHasOverdue).toBe(false);
  });

  it("uses the default `now = new Date()` when the caller omits the argument (no throw, shape stable)", async () => {
    const s = makeState();
    const r = await computeComplianceMissing(makeSupabase(s), UID, PID);
    expect(r.hasEsicAssessment).toBe(false);
    expect(r.hasValidOrExpiringS708).toBe(false);
    expect(r.hasGstAssessment).toBe(false);
    expect(r.rdMinDaysUntilDeadline).toBeNull();
  });

  it("scopes the ESIC lookup to project_id=null when the caller passes null", async () => {
    const s = makeState({
      compliance_esic_assessments: [
        {
          user_id: UID,
          project_id: null,
          is_esic: true,
          assessed_at: "2026-07-20",
        },
        {
          user_id: UID,
          project_id: PID,
          is_esic: false,
          assessed_at: "2026-07-25",
        },
      ],
    });
    const r = await computeComplianceMissing(makeSupabase(s), UID, null, NOW);
    expect(r.isEsic).toBe(true);
  });
});
