// Colocated vitest for the /admin/funding PATCH validator (T0239).

import { describe, expect, it } from "vitest";
import { parseFundingKind, validateFundingAdminPatch } from "./admin-patch";

const TODAY = new Date("2026-09-10T03:00:00Z");

describe("parseFundingKind", () => {
  it("accepts grants|programs case-insensitively and rejects the rest", () => {
    expect(parseFundingKind("grants")).toBe("grants");
    expect(parseFundingKind("Programs")).toBe("programs");
    expect(parseFundingKind("au_grants")).toBeNull();
    expect(parseFundingKind(undefined)).toBeNull();
  });
});

describe("validateFundingAdminPatch", () => {
  it("rejects non-object bodies and empty patches", () => {
    expect(validateFundingAdminPatch("grants", null)).toMatchObject({ ok: false });
    expect(validateFundingAdminPatch("grants", [])).toMatchObject({ ok: false });
    expect(validateFundingAdminPatch("grants", {})).toEqual({ ok: false, error: "nothing to update" });
  });

  it("stamps verified_by=human + last_verified_at=today on every accepted patch", () => {
    const r = validateFundingAdminPatch("grants", { status: "closed" }, TODAY);
    expect(r).toEqual({
      ok: true,
      update: { status: "closed", verified_by: "human", last_verified_at: "2026-09-10" },
    });
  });

  it("accepts `verified: true` alone as a no-change verification", () => {
    const r = validateFundingAdminPatch("programs", { verified: true }, TODAY);
    expect(r).toEqual({ ok: true, update: { verified_by: "human", last_verified_at: "2026-09-10" } });
  });

  it("validates status / status_confidence enums", () => {
    expect(validateFundingAdminPatch("grants", { status: "live" })).toMatchObject({ ok: false });
    expect(validateFundingAdminPatch("grants", { status_confidence: "sure" })).toMatchObject({ ok: false });
    const r = validateFundingAdminPatch("grants", { status: " Paused ", status_confidence: "HIGH" }, TODAY);
    expect(r).toMatchObject({ ok: true, update: { status: "paused", status_confidence: "high" } });
  });

  it("grants: closes_at must be ISO date or null; maps next_round_note / lodgement_deadline", () => {
    expect(validateFundingAdminPatch("grants", { closes_at: "Nov 2026" })).toMatchObject({ ok: false });
    const r = validateFundingAdminPatch(
      "grants",
      { closes_at: "2027-04-30", next_round_note: "  Round 4 opens Feb  ", lodgement_deadline: "" },
      TODAY,
    );
    expect(r).toMatchObject({
      ok: true,
      update: { closes_at: "2027-04-30", next_round_note: "Round 4 opens Feb", lodgement_deadline: null },
    });
    expect(validateFundingAdminPatch("grants", { closes_at: null }, TODAY)).toMatchObject({
      ok: true,
      update: { closes_at: null },
    });
  });

  it("programs: closes_at aliases applications_close (free text) and accepts cohort fields", () => {
    const r = validateFundingAdminPatch(
      "programs",
      { closes_at: "Nov 2026", next_cohort_start: "2027-01-25", applications_open: null },
      TODAY,
    );
    expect(r).toMatchObject({
      ok: true,
      update: { applications_close: "Nov 2026", next_cohort_start: "2027-01-25", applications_open: null },
    });
    expect("closes_at" in (r as { update: Record<string, unknown> }).update).toBe(false);
  });

  it("rejects fields that belong to the other kind and unknown fields", () => {
    expect(validateFundingAdminPatch("programs", { next_round_note: "x" })).toEqual({
      ok: false,
      error: "next_round_note is not a programs field",
    });
    expect(validateFundingAdminPatch("grants", { next_cohort_start: "x" })).toMatchObject({ ok: false });
    expect(validateFundingAdminPatch("grants", { status: "open", official_url: "https://evil" })).toEqual({
      ok: false,
      error: "unknown field(s): official_url",
    });
  });

  it("rejects non-string text and over-long notes", () => {
    expect(validateFundingAdminPatch("grants", { next_round_note: 42 })).toMatchObject({ ok: false });
    expect(validateFundingAdminPatch("grants", { next_round_note: "x".repeat(2001) })).toMatchObject({ ok: false });
  });
});
