import { describe, expect, it } from "vitest";
import {
  COMMISSION_TRIGGERING_KINDS,
  LEDGER_DRIFT_WINDOW_DAYS,
  computeLedgerDriftByReseller,
  formatWeeklyDigestLedgerDriftSection,
  isCommissionTriggeringKind,
  type CommissionDriftRow,
  type LedgerDriftRow,
  type RevenueEventDriftRow,
} from "./ledger-drift-events";

function rev(
  reseller_id: string | null,
  stripe_event_id: string | null,
  kind: string | null,
  ts = "2026-07-24T00:00:00Z",
): RevenueEventDriftRow {
  return { reseller_id, stripe_event_id, kind, ts };
}

function com(
  reseller_id: string,
  stripe_event_id: string,
  created_at = "2026-07-24T00:00:00Z",
): CommissionDriftRow {
  return { reseller_id, stripe_event_id, created_at };
}

describe("COMMISSION_TRIGGERING_KINDS", () => {
  it("locks the revenue-kind set the drift check treats as accrual-generating", () => {
    expect([...COMMISSION_TRIGGERING_KINDS]).toEqual([
      "subscribe",
      "renewal",
      "upgrade",
      "downgrade",
      "trial_convert",
    ]);
  });

  it("LEDGER_DRIFT_WINDOW_DAYS is the 7-day plan default", () => {
    expect(LEDGER_DRIFT_WINDOW_DAYS).toBe(7);
  });
});

describe("isCommissionTriggeringKind", () => {
  it("returns true for each canonical kind", () => {
    for (const k of COMMISSION_TRIGGERING_KINDS) {
      expect(isCommissionTriggeringKind(k)).toBe(true);
    }
  });

  it("returns false for non-triggering kinds", () => {
    for (const k of ["trial_start", "trial_end_no_payment", "refund", "chargeback", "credit_pack"]) {
      expect(isCommissionTriggeringKind(k)).toBe(false);
    }
  });

  it("returns false for null/undefined/empty", () => {
    expect(isCommissionTriggeringKind(null)).toBe(false);
    expect(isCommissionTriggeringKind(undefined)).toBe(false);
    expect(isCommissionTriggeringKind("")).toBe(false);
  });
});

describe("computeLedgerDriftByReseller", () => {
  it("returns zeros when both lists are empty", () => {
    const out = computeLedgerDriftByReseller(["r1"], [], []);
    expect(out.get("r1")).toEqual({
      missing_commission_count: 0,
      orphan_commission_count: 0,
      total_drift_count: 0,
    });
  });

  it("counts revenue events with no matching commission as missing_commission", () => {
    const out = computeLedgerDriftByReseller(
      ["r1"],
      [rev("r1", "evt_1", "subscribe"), rev("r1", "evt_2", "renewal")],
      [],
    );
    expect(out.get("r1")).toEqual({
      missing_commission_count: 2,
      orphan_commission_count: 0,
      total_drift_count: 2,
    });
  });

  it("does not count revenue events that have a matching commission row", () => {
    const out = computeLedgerDriftByReseller(
      ["r1"],
      [rev("r1", "evt_1", "subscribe")],
      [com("r1", "evt_1")],
    );
    expect(out.get("r1")!.missing_commission_count).toBe(0);
    expect(out.get("r1")!.total_drift_count).toBe(0);
  });

  it("counts commission rows with no matching revenue event as orphan_commission", () => {
    const out = computeLedgerDriftByReseller(
      ["r1"],
      [],
      [com("r1", "evt_1"), com("r1", "evt_2")],
    );
    expect(out.get("r1")).toEqual({
      missing_commission_count: 0,
      orphan_commission_count: 2,
      total_drift_count: 2,
    });
  });

  it("counts both drift buckets independently in the same call", () => {
    const out = computeLedgerDriftByReseller(
      ["r1"],
      [rev("r1", "evt_missing", "subscribe")],
      [com("r1", "evt_orphan")],
    );
    expect(out.get("r1")).toEqual({
      missing_commission_count: 1,
      orphan_commission_count: 1,
      total_drift_count: 2,
    });
  });

  it("skips revenue events whose kind is not commission-triggering", () => {
    const out = computeLedgerDriftByReseller(
      ["r1"],
      [
        rev("r1", "evt_start", "trial_start"),
        rev("r1", "evt_refund", "refund"),
        rev("r1", "evt_end", "trial_end_no_payment"),
        rev("r1", "evt_pack", "credit_pack"),
      ],
      [],
    );
    expect(out.get("r1")!.missing_commission_count).toBe(0);
  });

  it("skips revenue events whose reseller_id is null", () => {
    const out = computeLedgerDriftByReseller(
      ["r1"],
      [rev(null, "evt_1", "subscribe")],
      [],
    );
    expect(out.get("r1")!.missing_commission_count).toBe(0);
  });

  it("skips revenue events whose stripe_event_id is null or blank", () => {
    const out = computeLedgerDriftByReseller(
      ["r1"],
      [rev("r1", null, "subscribe"), rev("r1", "", "subscribe")],
      [],
    );
    expect(out.get("r1")!.missing_commission_count).toBe(0);
  });

  it("skips commission rows whose stripe_event_id is blank", () => {
    const out = computeLedgerDriftByReseller(
      ["r1"],
      [],
      [{ reseller_id: "r1", stripe_event_id: "", created_at: null }],
    );
    expect(out.get("r1")!.orphan_commission_count).toBe(0);
  });

  it("isolates drift per reseller", () => {
    const out = computeLedgerDriftByReseller(
      ["r1", "r2"],
      [rev("r1", "evt_r1_miss", "subscribe"), rev("r2", "evt_r2_ok", "renewal")],
      [com("r2", "evt_r2_ok"), com("r2", "evt_r2_orphan")],
    );
    expect(out.get("r1")).toEqual({
      missing_commission_count: 1,
      orphan_commission_count: 0,
      total_drift_count: 1,
    });
    expect(out.get("r2")).toEqual({
      missing_commission_count: 0,
      orphan_commission_count: 1,
      total_drift_count: 1,
    });
  });

  it("preserves zero-drift resellers in the output map", () => {
    const out = computeLedgerDriftByReseller(["r1", "r2"], [], []);
    expect(out.has("r1")).toBe(true);
    expect(out.has("r2")).toBe(true);
    expect(out.get("r2")).toEqual({
      missing_commission_count: 0,
      orphan_commission_count: 0,
      total_drift_count: 0,
    });
  });

  it("drops commission rows for resellers not in the requested set", () => {
    const out = computeLedgerDriftByReseller(
      ["r1"],
      [],
      [com("r_unknown", "evt_x")],
    );
    expect(out.size).toBe(1);
    expect(out.has("r_unknown")).toBe(false);
    expect(out.get("r1")!.orphan_commission_count).toBe(0);
  });

  it("counts a matched event exactly once (no double-count when both sides present twice)", () => {
    // Even if revenue_events emitted two rows sharing the same stripe_event_id
    // (which the UNIQUE constraint on revenue_events.stripe_event_id forbids at
    // the DB level but we still want defensive behaviour), each matches the
    // commission set membership check so neither counts as missing.
    const out = computeLedgerDriftByReseller(
      ["r1"],
      [rev("r1", "evt_dup", "subscribe"), rev("r1", "evt_dup", "subscribe")],
      [com("r1", "evt_dup")],
    );
    expect(out.get("r1")!.missing_commission_count).toBe(0);
    expect(out.get("r1")!.orphan_commission_count).toBe(0);
  });
});

describe("formatWeeklyDigestLedgerDriftSection", () => {
  it("returns empty string on empty input", () => {
    expect(formatWeeklyDigestLedgerDriftSection([])).toBe("");
  });

  it("renders a header naming the window", () => {
    const rows: LedgerDriftRow[] = [
      {
        reseller_id: "r1",
        reseller_code: "R1",
        reseller_display_name: "One",
        drift: { missing_commission_count: 0, orphan_commission_count: 0, total_drift_count: 0 },
      },
    ];
    const html = formatWeeklyDigestLedgerDriftSection(rows);
    expect(html).toContain("Ledger drift events");
    expect(html).toContain(`last ${LEDGER_DRIFT_WINDOW_DAYS} days`);
  });

  it("renders column headers for both drift buckets + total", () => {
    const rows: LedgerDriftRow[] = [
      {
        reseller_id: "r1",
        reseller_code: "R1",
        reseller_display_name: "One",
        drift: { missing_commission_count: 3, orphan_commission_count: 1, total_drift_count: 4 },
      },
    ];
    const html = formatWeeklyDigestLedgerDriftSection(rows);
    expect(html).toContain(">Missing commission<");
    expect(html).toContain(">Orphan commission<");
    expect(html).toContain(">Total drift<");
  });

  it("sorts rows by reseller_code", () => {
    const rows: LedgerDriftRow[] = [
      {
        reseller_id: "r_beta",
        reseller_code: "BETA",
        reseller_display_name: "Beta",
        drift: { missing_commission_count: 1, orphan_commission_count: 0, total_drift_count: 1 },
      },
      {
        reseller_id: "r_alpha",
        reseller_code: "ALPHA",
        reseller_display_name: "Alpha",
        drift: { missing_commission_count: 2, orphan_commission_count: 0, total_drift_count: 2 },
      },
    ];
    const html = formatWeeklyDigestLedgerDriftSection(rows);
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("BETA"));
  });

  it("HTML-escapes display_name", () => {
    const rows: LedgerDriftRow[] = [
      {
        reseller_id: "r1",
        reseller_code: "R1",
        reseller_display_name: '<script>alert("x")</script>',
        drift: { missing_commission_count: 0, orphan_commission_count: 0, total_drift_count: 0 },
      },
    ];
    const html = formatWeeklyDigestLedgerDriftSection(rows);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a Total footer row summing missing + orphan + grand total", () => {
    const rows: LedgerDriftRow[] = [
      {
        reseller_id: "r1",
        reseller_code: "R1",
        reseller_display_name: "One",
        drift: { missing_commission_count: 3, orphan_commission_count: 1, total_drift_count: 4 },
      },
      {
        reseller_id: "r2",
        reseller_code: "R2",
        reseller_display_name: "Two",
        drift: { missing_commission_count: 2, orphan_commission_count: 5, total_drift_count: 7 },
      },
    ];
    const html = formatWeeklyDigestLedgerDriftSection(rows);
    expect(html).toContain("<tfoot>");
    expect(html).toMatch(/<strong>5<\/strong>/); // total missing
    expect(html).toMatch(/<strong>6<\/strong>/); // total orphan
    expect(html).toMatch(/<strong>11<\/strong>/); // grand total
  });

  it("renders zeroed rows so partners with clean ledgers stay visible", () => {
    const rows: LedgerDriftRow[] = [
      {
        reseller_id: "r_clean",
        reseller_code: "CLEAN",
        reseller_display_name: "Clean",
        drift: { missing_commission_count: 0, orphan_commission_count: 0, total_drift_count: 0 },
      },
    ];
    const html = formatWeeklyDigestLedgerDriftSection(rows);
    expect(html).toContain("CLEAN");
  });

  it("renders exactly 5 body cells per row (code, display, missing, orphan, total)", () => {
    const rows: LedgerDriftRow[] = [
      {
        reseller_id: "r1",
        reseller_code: "R1",
        reseller_display_name: "One",
        drift: { missing_commission_count: 3, orphan_commission_count: 1, total_drift_count: 4 },
      },
    ];
    const html = formatWeeklyDigestLedgerDriftSection(rows);
    const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(bodyMatch).not.toBeNull();
    const tdCount = (bodyMatch![1].match(/<td/g) ?? []).length;
    expect(tdCount).toBe(5);
  });
});
