/**
 * report-order-state.test.ts — full transition matrix for the paywall state
 * machine. Colocated per Stage 3 Batch A sub-task A3.
 *
 * Coverage strategy:
 *   1. Snapshot the enum shape so a stray addition to the DB CHECK constraint
 *      lands here as a red test rather than a silent drift.
 *   2. Assert every legal transition documented in report-order-state.ts
 *      returns the expected target state.
 *   3. Assert a curated list of illegal transitions returns null — the five
 *      required by the sub-task plus a handful of common bugs (e.g., trying
 *      to re-open a terminal state).
 *   4. Assert terminal-state predicates.
 */

import { describe, it, expect } from "vitest";
import {
  REPORT_ORDER_STATES,
  REPORT_ORDER_TRANSITIONS,
  ReportOrderStateSchema,
  ReportOrderTransitionSchema,
  nextState,
  isTerminalState,
  legalTransitions,
} from "./report-order-state";

describe("report-order-state — enum shape", () => {
  it("exposes exactly the 10 states the migration allows", () => {
    // If this fails, migrations/0270_report_orders.sql CHECK clause and the
    // Zod enum have drifted apart. Fix both together.
    expect([...REPORT_ORDER_STATES].sort()).toEqual(
      [
        "NOT_PURCHASED",
        "CHECKOUT_INITIATED",
        "PAYMENT_PENDING",
        "PAID",
        "GENERATING",
        "READY",
        "SHARED",
        "EXPIRED",
        "FAILED",
        "REFUNDED",
      ].sort(),
    );
  });

  it("parses every enum member via the Zod schema", () => {
    for (const s of REPORT_ORDER_STATES) {
      expect(ReportOrderStateSchema.parse(s)).toBe(s);
    }
  });

  it("rejects unknown state strings", () => {
    expect(() => ReportOrderStateSchema.parse("PURGATORY")).toThrow();
    expect(() => ReportOrderStateSchema.parse("paid")).toThrow(); // case-sensitive
  });

  it("exposes the documented transition vocabulary", () => {
    expect(new Set(REPORT_ORDER_TRANSITIONS)).toEqual(
      new Set([
        "checkout_created",
        "payment_pending",
        "payment_settled",
        "credit_debited",
        "checkout_failed",
        "queue_picked",
        "generation_succeeded",
        "generation_failed",
        "share_link_minted",
        "expiry_reached",
        "refund_issued",
      ]),
    );
  });

  it("parses every transition via the Zod schema", () => {
    for (const t of REPORT_ORDER_TRANSITIONS) {
      expect(ReportOrderTransitionSchema.parse(t)).toBe(t);
    }
  });
});

describe("report-order-state — nextState (valid transitions)", () => {
  // Table-driven so adding a new transition is one row, not a new `it`.
  const validCases: ReadonlyArray<[
    Parameters<typeof nextState>[0],
    Parameters<typeof nextState>[1],
    ReturnType<typeof nextState>,
  ]> = [
    // NOT_PURCHASED
    ["NOT_PURCHASED", "checkout_created", "CHECKOUT_INITIATED"],
    ["NOT_PURCHASED", "credit_debited", "PAID"],
    // CHECKOUT_INITIATED
    ["CHECKOUT_INITIATED", "payment_pending", "PAYMENT_PENDING"],
    ["CHECKOUT_INITIATED", "payment_settled", "PAID"],
    ["CHECKOUT_INITIATED", "checkout_failed", "FAILED"],
    // PAYMENT_PENDING
    ["PAYMENT_PENDING", "payment_settled", "PAID"],
    ["PAYMENT_PENDING", "checkout_failed", "FAILED"],
    // PAID
    ["PAID", "queue_picked", "GENERATING"],
    ["PAID", "refund_issued", "REFUNDED"],
    // GENERATING
    ["GENERATING", "generation_succeeded", "READY"],
    ["GENERATING", "generation_failed", "FAILED"],
    // READY
    ["READY", "share_link_minted", "SHARED"],
    ["READY", "expiry_reached", "EXPIRED"],
    // SHARED
    ["SHARED", "expiry_reached", "EXPIRED"],
    // FAILED
    ["FAILED", "refund_issued", "REFUNDED"],
  ];

  it.each(validCases)(
    "nextState(%s, %s) → %s",
    (from, transition, expected) => {
      expect(nextState(from, transition)).toBe(expected);
    },
  );
});

describe("report-order-state — nextState (illegal transitions)", () => {
  // Curated illegal set — at least 5 per the sub-task brief, but we cover
  // more because these are the ones a mis-wired webhook would actually hit.
  const illegalCases: ReadonlyArray<[
    Parameters<typeof nextState>[0],
    Parameters<typeof nextState>[1],
  ]> = [
    // Cannot skip CHECKOUT_INITIATED straight to GENERATING
    ["NOT_PURCHASED", "queue_picked"],
    // Cannot reopen a terminal state
    ["EXPIRED", "share_link_minted"],
    ["REFUNDED", "queue_picked"],
    // Cannot re-generate a READY report by pretending it was picked
    ["READY", "queue_picked"],
    // A GENERATING order cannot mint a share link — must land READY first
    ["GENERATING", "share_link_minted"],
    // A PAID order cannot be marked FAILED without going through GENERATING
    ["PAID", "generation_failed"],
    // Bogus: PAID cannot re-emit payment_settled
    ["PAID", "payment_settled"],
  ];

  it.each(illegalCases)(
    "nextState(%s, %s) → null",
    (from, transition) => {
      expect(nextState(from, transition)).toBeNull();
    },
  );

  it("returns null for the same illegal transition even if called twice", () => {
    // Idempotency guard — helps if a caller decides to retry-on-null.
    expect(nextState("EXPIRED", "share_link_minted")).toBeNull();
    expect(nextState("EXPIRED", "share_link_minted")).toBeNull();
  });
});

describe("report-order-state — terminal predicates", () => {
  it("flags EXPIRED and REFUNDED as terminal", () => {
    expect(isTerminalState("EXPIRED")).toBe(true);
    expect(isTerminalState("REFUNDED")).toBe(true);
  });

  it("flags in-flight states as non-terminal", () => {
    for (const s of [
      "NOT_PURCHASED",
      "CHECKOUT_INITIATED",
      "PAYMENT_PENDING",
      "PAID",
      "GENERATING",
      "READY",
      "SHARED",
      "FAILED",
    ] as const) {
      expect(isTerminalState(s)).toBe(false);
    }
  });

  it("legalTransitions() lists exactly the outgoing transitions", () => {
    expect(legalTransitions("PAID").sort()).toEqual(
      ["queue_picked", "refund_issued"].sort(),
    );
    expect(legalTransitions("EXPIRED")).toEqual([]);
    expect(legalTransitions("REFUNDED")).toEqual([]);
  });
});
