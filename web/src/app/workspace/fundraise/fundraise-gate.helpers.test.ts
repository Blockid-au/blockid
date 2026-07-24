// Unit tests for the wholesale-only fundraise gate helpers (P6b-test).
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md
//   §P6b — wholesale-only fundraise UI
//   §P6b-test — pin the fetch-response → banner-state branch matrix.
//
// The client (fundraise-client.tsx) is "use client" + React hooks +
// window.fetch so we cover its wiring end-to-end in the sibling
// Playwright specs. Everything deterministic (envelope parsing, warn
// dedupe, block classification, body assembly) lives here.

import { describe, expect, it } from "vitest";
import {
  buildFundraisePostBody,
  classifyFundraiseResponse,
  GATE_BLOCK_HEADING,
  parseGateBlock,
  parseGateWarn,
} from "./fundraise-gate.helpers";

describe("parseGateWarn", () => {
  it("keeps required + optional fields", () => {
    const parsed = parseGateWarn({
      reason: "esic_missing",
      message: "Run the ESIC self-assessment",
      url_to_fix: "/compliance/esic",
    });
    expect(parsed).toEqual({
      reason: "esic_missing",
      message: "Run the ESIC self-assessment",
      url_to_fix: "/compliance/esic",
    });
  });

  it("returns null when the payload is not an object", () => {
    expect(parseGateWarn(null)).toBeNull();
    expect(parseGateWarn(undefined)).toBeNull();
    expect(parseGateWarn("esic_missing")).toBeNull();
    expect(parseGateWarn(42)).toBeNull();
    expect(parseGateWarn([])).toBeNull();
  });

  it("returns null when reason is missing / blank / non-string", () => {
    expect(parseGateWarn({})).toBeNull();
    expect(parseGateWarn({ reason: "" })).toBeNull();
    expect(parseGateWarn({ reason: 12 })).toBeNull();
  });

  it("defaults message + url_to_fix to empty strings when absent", () => {
    expect(parseGateWarn({ reason: "esic_stale" })).toEqual({
      reason: "esic_stale",
      message: "",
      url_to_fix: "",
    });
  });
});

describe("parseGateBlock", () => {
  it("accepts esic_gate_blocked", () => {
    const block = parseGateBlock({
      error: "esic_gate_blocked",
      reason: "no_assessment",
      message: "Complete the ESIC self-assessment first.",
      url_to_fix: "/compliance/esic",
      disclaimer: "General information only, not personal advice.",
    });
    expect(block).not.toBeNull();
    expect(block?.error).toBe("esic_gate_blocked");
    expect(block?.url_to_fix).toBe("/compliance/esic");
    expect(block?.disclaimer).toContain("General information only");
  });

  it("accepts div83a_gate_blocked", () => {
    const block = parseGateBlock({
      error: "div83a_gate_blocked",
      reason: "grants_ineligible",
      message: "One or more active grants failed the Div 83A gate.",
      url_to_fix: "/compliance/div83a",
      disclaimer: "General information only.",
    });
    expect(block?.error).toBe("div83a_gate_blocked");
    expect(block?.url_to_fix).toBe("/compliance/div83a");
  });

  it("rejects unknown error strings", () => {
    expect(
      parseGateBlock({ error: "some_other_error", reason: "x" }),
    ).toBeNull();
  });

  it("rejects payloads without a string error", () => {
    expect(parseGateBlock(null)).toBeNull();
    expect(parseGateBlock({})).toBeNull();
    expect(parseGateBlock({ error: 12 })).toBeNull();
  });

  it("defaults missing message / url / disclaimer to empty strings", () => {
    const block = parseGateBlock({ error: "esic_gate_blocked" });
    expect(block).toEqual({
      error: "esic_gate_blocked",
      reason: "",
      message: "",
      url_to_fix: "",
      disclaimer: "",
    });
  });
});

describe("classifyFundraiseResponse", () => {
  it("classifies 412 + esic_gate_blocked as { kind: 'block' }", () => {
    const outcome = classifyFundraiseResponse(412, {
      ok: false,
      error: "esic_gate_blocked",
      reason: "no_assessment",
      message: "Complete ESIC first",
      url_to_fix: "/compliance/esic",
      disclaimer: "AFSL disclaimer",
    });
    expect(outcome.kind).toBe("block");
    if (outcome.kind === "block") {
      expect(outcome.block.error).toBe("esic_gate_blocked");
      expect(outcome.block.url_to_fix).toBe("/compliance/esic");
    }
  });

  it("classifies 412 + div83a_gate_blocked as { kind: 'block' }", () => {
    const outcome = classifyFundraiseResponse(412, {
      ok: false,
      error: "div83a_gate_blocked",
      reason: "grants_ineligible",
      message: "Div 83A gate failed",
      url_to_fix: "/compliance/div83a",
      disclaimer: "AFSL disclaimer",
    });
    expect(outcome.kind).toBe("block");
    if (outcome.kind === "block") {
      expect(outcome.block.error).toBe("div83a_gate_blocked");
    }
  });

  it("falls back to { kind: 'error' } when 412 body has no recognised error", () => {
    const outcome = classifyFundraiseResponse(412, {
      ok: false,
      error: "unrelated_precondition",
    });
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.message).toBe("unrelated_precondition");
    }
  });

  it("classifies 200 + ok:true with no warns as { kind: 'ok', warns: [] }", () => {
    const outcome = classifyFundraiseResponse(200, {
      ok: true,
      round: { id: "r1" },
    });
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.warns).toEqual([]);
      expect(outcome.data.round).toEqual({ id: "r1" });
    }
  });

  it("surfaces esic_warn + div83a_warn in route order", () => {
    const outcome = classifyFundraiseResponse(200, {
      ok: true,
      round: { id: "r1" },
      esic_warn: {
        reason: "esic_stale",
        message: "Refresh ESIC self-assessment",
        url_to_fix: "/compliance/esic",
      },
      div83a_warn: {
        reason: "grants_unsure",
        message: "Confirm Div 83A eligibility",
        url_to_fix: "/compliance/div83a",
      },
    });
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.warns.map((w) => w.reason)).toEqual([
        "esic_stale",
        "grants_unsure",
      ]);
    }
  });

  it("deduplicates warns by reason", () => {
    const outcome = classifyFundraiseResponse(200, {
      ok: true,
      esic_warn: {
        reason: "same_reason",
        message: "ESIC warn",
        url_to_fix: "/compliance/esic",
      },
      div83a_warn: {
        reason: "same_reason",
        message: "Div 83A warn",
        url_to_fix: "/compliance/div83a",
      },
    });
    if (outcome.kind !== "ok") throw new Error("expected ok");
    expect(outcome.warns.length).toBe(1);
    expect(outcome.warns[0].message).toBe("ESIC warn");
  });

  it("skips malformed warn payloads without failing the response", () => {
    const outcome = classifyFundraiseResponse(200, {
      ok: true,
      esic_warn: "not an object",
      div83a_warn: {
        reason: "grants_stale",
        message: "Recheck Div 83A",
        url_to_fix: "/compliance/div83a",
      },
    });
    if (outcome.kind !== "ok") throw new Error("expected ok");
    expect(outcome.warns.map((w) => w.reason)).toEqual(["grants_stale"]);
  });

  it("classifies 400/500-style responses as { kind: 'error' }", () => {
    const badReq = classifyFundraiseResponse(400, {
      ok: false,
      error: "roundName is required",
    });
    expect(badReq.kind).toBe("error");
    if (badReq.kind === "error") {
      expect(badReq.message).toBe("roundName is required");
    }

    const server = classifyFundraiseResponse(500, {
      ok: false,
      error: "database_unavailable",
    });
    expect(server.kind).toBe("error");
  });

  it("returns a network-error fallback when the body is not an object", () => {
    const outcome = classifyFundraiseResponse(200, null);
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.message).toMatch(/network/i);
    }
  });

  it("uses a default message when ok:false but no error string given", () => {
    const outcome = classifyFundraiseResponse(500, { ok: false });
    if (outcome.kind !== "error") throw new Error("expected error");
    expect(outcome.message).toBe("Failed to calculate round");
  });
});

describe("buildFundraisePostBody", () => {
  const base = {
    roundName: "Seed",
    targetAmount: 500_000,
    preMoneyValuation: 2_000_000,
    safeDiscount: 20,
    safeCap: 5_000_000,
    wholesaleOnly: false,
  } as const;

  it("includes safeDiscount + safeCap for SAFE rounds", () => {
    const wire = buildFundraisePostBody({ ...base, instrumentType: "safe" });
    expect(wire.safeDiscount).toBe(20);
    expect(wire.safeCap).toBe(5_000_000);
    expect(wire.wholesaleOnly).toBe(false);
  });

  it("includes safeDiscount + safeCap for convertible notes", () => {
    const wire = buildFundraisePostBody({
      ...base,
      instrumentType: "convertible_note",
    });
    expect(wire.safeDiscount).toBe(20);
    expect(wire.safeCap).toBe(5_000_000);
  });

  it("omits safeDiscount + safeCap on priced rounds", () => {
    const wire = buildFundraisePostBody({ ...base, instrumentType: "priced" });
    expect(wire.safeDiscount).toBeUndefined();
    expect(wire.safeCap).toBeUndefined();
  });

  it("carries wholesaleOnly=true on every instrument type", () => {
    for (const instrumentType of ["safe", "convertible_note", "priced"] as const) {
      const wire = buildFundraisePostBody({
        ...base,
        instrumentType,
        wholesaleOnly: true,
      });
      expect(wire.wholesaleOnly).toBe(true);
    }
  });
});

describe("GATE_BLOCK_HEADING", () => {
  it("covers both known block error strings with distinct copy", () => {
    expect(GATE_BLOCK_HEADING.esic_gate_blocked).toMatch(/ESIC/i);
    expect(GATE_BLOCK_HEADING.div83a_gate_blocked).toMatch(/Div 83A/i);
    expect(GATE_BLOCK_HEADING.esic_gate_blocked).not.toBe(
      GATE_BLOCK_HEADING.div83a_gate_blocked,
    );
  });
});
