// Colocated vitest for lib/fundraise/commitments (S26-A) — the pure half of
// the fundraise tracker. Pins: input validation (required name, positive
// bounded amount, status / instrument enums, email shape, uuid tie, partial
// PATCH semantics), the round status ladder, the milestone-date stamping,
// and the roll-up maths the progress bar and the round row depend on.

import { describe, expect, it } from "vitest";
import {
  canTransitionRound,
  formatAud,
  MAX_COMMITMENT_AUD,
  parseCommitmentInput,
  progressSegments,
  roundTotalsFromSummary,
  stampStatusDates,
  summariseCommitments,
} from "./commitments";

const UUID = "9f1c2e6a-1b2c-4d3e-8f90-123456789abc";

describe("parseCommitmentInput — POST", () => {
  it("accepts a full body, normalises whitespace / email case, defaults status + instrument", () => {
    const r = parseCommitmentInput({
      investorName: "  Blackbird   Ventures ",
      investorEmail: "Sam@Blackbird.VC",
      investorOrg: "Blackbird",
      amountAud: "250,000",
      notes: " lead ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      investorName: "Blackbird Ventures",
      investorEmail: "sam@blackbird.vc",
      investorOrg: "Blackbird",
      amountAud: 250000,
      status: "soft",
      instrument: "safe",
      notes: "lead",
      accessTokenId: null,
    });
  });

  it("rejects a missing name, a non-positive / oversized / NaN amount, a bad email, bad enums, a bad uuid", () => {
    const base = { investorName: "A", amountAud: 10 };
    expect(parseCommitmentInput({ amountAud: 10 })).toMatchObject({ ok: false, error: "investorName is required" });
    expect(parseCommitmentInput({ ...base, amountAud: 0 }).ok).toBe(false);
    expect(parseCommitmentInput({ ...base, amountAud: -5 }).ok).toBe(false);
    expect(parseCommitmentInput({ ...base, amountAud: MAX_COMMITMENT_AUD + 1 }).ok).toBe(false);
    expect(parseCommitmentInput({ ...base, amountAud: "lots" }).ok).toBe(false);
    expect(parseCommitmentInput({ ...base, investorEmail: "not-an-email" }).ok).toBe(false);
    expect(parseCommitmentInput({ ...base, status: "maybe" }).ok).toBe(false);
    expect(parseCommitmentInput({ ...base, instrument: "handshake" }).ok).toBe(false);
    expect(parseCommitmentInput({ ...base, accessTokenId: "abc" }).ok).toBe(false);
    expect(parseCommitmentInput(null).ok).toBe(false);
    expect(parseCommitmentInput([]).ok).toBe(false);
  });

  it("accepts every status / instrument and a uuid tie; caps text length", () => {
    const r = parseCommitmentInput({
      investorName: "x".repeat(500),
      amountAud: 1,
      status: "funded",
      instrument: "priced_equity",
      accessTokenId: UUID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.investorName?.length).toBe(200);
    expect(r.value.status).toBe("funded");
    expect(r.value.instrument).toBe("priced_equity");
    expect(r.value.accessTokenId).toBe(UUID);
  });
});

describe("parseCommitmentInput — PATCH (partial)", () => {
  it("returns only the keys sent and rejects an empty patch", () => {
    const r = parseCommitmentInput({ status: "committed" }, { partial: true });
    expect(r).toEqual({ ok: true, value: { status: "committed" } });
    expect(parseCommitmentInput({}, { partial: true })).toMatchObject({ ok: false, error: "Nothing to update" });
  });

  it("still validates the keys it is given", () => {
    expect(parseCommitmentInput({ amountAud: 0 }, { partial: true }).ok).toBe(false);
    expect(parseCommitmentInput({ investorName: "   " }, { partial: true }).ok).toBe(false);
    expect(parseCommitmentInput({ investorEmail: null }, { partial: true })).toEqual({ ok: true, value: { investorEmail: null } });
  });
});

describe("round status ladder", () => {
  it("draft → active → closed only; closed is terminal; unknown statuses never move", () => {
    expect(canTransitionRound("draft", "active")).toBe(true);
    expect(canTransitionRound("active", "closed")).toBe(true);
    expect(canTransitionRound("draft", "closed")).toBe(false);
    expect(canTransitionRound("active", "draft")).toBe(false);
    expect(canTransitionRound("closed", "active")).toBe(false);
    expect(canTransitionRound("closed", "closed")).toBe(false);
    expect(canTransitionRound("bogus", "active")).toBe(false);
    expect(canTransitionRound("draft", "bogus")).toBe(false);
  });
});

describe("stampStatusDates", () => {
  const now = new Date("2026-09-13T10:00:00Z");
  const iso = now.toISOString();

  it("stamps each milestone once on the way up and keeps earlier stamps", () => {
    const c = stampStatusDates(null, "committed", now);
    expect(c).toEqual({ committed_at: iso, signed_at: null, funded_at: null, withdrawn_at: null });
    const later = new Date("2026-09-20T00:00:00Z");
    const s = stampStatusDates(c, "signed", later);
    expect(s.committed_at).toBe(iso);
    expect(s.signed_at).toBe(later.toISOString());
    const f = stampStatusDates(s, "funded", later);
    expect(f).toEqual({ committed_at: iso, signed_at: later.toISOString(), funded_at: later.toISOString(), withdrawn_at: null });
  });

  it("moving down clears the milestones above the new status; withdrawn keeps history", () => {
    const f = stampStatusDates(null, "funded", now);
    expect(stampStatusDates(f, "committed", now)).toEqual({ committed_at: iso, signed_at: null, funded_at: null, withdrawn_at: null });
    expect(stampStatusDates(f, "soft", now)).toEqual({ committed_at: null, signed_at: null, funded_at: null, withdrawn_at: null });
    expect(stampStatusDates(f, "withdrawn", now)).toEqual({ ...f, withdrawn_at: iso });
  });
});

describe("summariseCommitments", () => {
  const rows = [
    { amount_aud: 100_000, status: "soft" },
    { amount_aud: "150000", status: "committed" },
    { amount_aud: 50_000, status: "signed" },
    { amount_aud: 200_000, status: "funded" },
    { amount_aud: 75_000, status: "withdrawn" },
    { amount_aud: 999, status: "not-a-status" },
  ];

  it("rolls soft / committed(+signed) / funded / withdrawn up and derives hard, pipeline, remaining, pct, counts", () => {
    const s = summariseCommitments(rows, 500_000);
    expect(s.targetAud).toBe(500_000);
    expect(s.softAud).toBe(100_000);
    expect(s.committedAud).toBe(200_000);
    expect(s.signedAud).toBe(50_000);
    expect(s.fundedAud).toBe(200_000);
    expect(s.withdrawnAud).toBe(75_000);
    expect(s.hardAud).toBe(400_000);
    expect(s.pipelineAud).toBe(500_000);
    expect(s.remainingAud).toBe(100_000);
    expect(s.pct).toEqual({ soft: 20, committed: 40, funded: 40, hard: 80, pipeline: 100 });
    expect(s.counts).toEqual({ soft: 1, committed: 1, signed: 1, funded: 1, withdrawn: 1 });
    expect(s.investors).toBe(4);
    expect(roundTotalsFromSummary(s)).toEqual({ soft_aud: 100_000, committed_aud: 200_000, funded_aud: 200_000 });
  });

  it("handles no rows, a null / zero target (pct 0, no division), and over-subscription (> 100 %)", () => {
    const empty = summariseCommitments([], null);
    expect(empty.pct.pipeline).toBe(0);
    expect(empty.remainingAud).toBe(0);
    const over = summariseCommitments([{ amount_aud: 600_000, status: "funded" }], 500_000);
    expect(over.pct.funded).toBe(120);
    expect(over.remainingAud).toBe(0);
  });
});

describe("progressSegments", () => {
  it("orders funded → committed → soft and clamps the stack to 100 %", () => {
    const s = summariseCommitments(
      [
        { amount_aud: 300_000, status: "funded" },
        { amount_aud: 150_000, status: "committed" },
        { amount_aud: 200_000, status: "soft" },
      ],
      500_000,
    );
    const seg = progressSegments(s);
    expect(seg.map((x) => x.key)).toEqual(["funded", "committed", "soft"]);
    expect(seg.map((x) => x.pct)).toEqual([60, 30, 10]);
    expect(seg.reduce((a, x) => a + x.pct, 0)).toBe(100);
  });

  it("is all-zero without a target", () => {
    const seg = progressSegments(summariseCommitments([{ amount_aud: 10, status: "funded" }], 0));
    expect(seg.every((x) => x.pct === 0)).toBe(true);
  });
});

describe("formatAud", () => {
  it("renders whole-dollar AUD and tolerates NaN", () => {
    expect(formatAud(250_000)).toBe("$250,000");
    expect(formatAud(Number.NaN)).toBe("$0");
  });
});
