// G21-P1-B — founder-facing status vocabulary derivation.

import { describe, expect, it } from "vitest";
import { STATUS_CHIP_LABELS, STATUS_CHIP_ORDER, statusChip, statusOf } from "./status-chip";

describe("statusOf", () => {
  it.each([
    ["self-declared, no review", { level: "self_declared" }, "claimed"],
    ["public URL, no review", { level: "public_url" }, "claimed"],
    ["L2 badge form", { level: "L2" }, "claimed"],
    ["document uploaded", { level: "document_uploaded" }, "evidence_backed"],
    ["connected source", { level: "L4" }, "evidence_backed"],
    ["transaction data", { level: "transaction_data" }, "evidence_backed"],
    ["reviewer signed (is_verified)", { level: "document_uploaded", verified: true }, "verified"],
    ["reviewer signed (verified_at)", { level: "self_declared", verifiedAt: "2026-09-01T00:00:00Z" }, "verified"],
    ["review approved", { level: "self_declared", reviewStatus: "approved" }, "verified"],
    ["third-party verified rung", { level: "third_party_verified" }, "verified"],
    ["review pending", { level: "document_uploaded", reviewStatus: "pending" }, "unverified"],
    ["stale", { level: "connected_source", stale: true }, "unverified"],
    ["review rejected", { level: "document_uploaded", reviewStatus: "rejected" }, "conflicting"],
    ["explicit conflict flag beats a signature", { level: "document_uploaded", verified: true, conflicting: true }, "conflicting"],
    ["unknown level", { level: "whatever" }, "claimed"],
    ["no level", {}, "claimed"],
  ])("%s → %s", (_label, item, expected) => {
    expect(statusOf(item)).toBe(expected);
  });
});

describe("statusChip", () => {
  it("returns the label, a theme-contract text token and a founder hint", () => {
    const chip = statusChip({ level: "document_uploaded" });
    expect(chip).toMatchObject({ status: "evidence_backed", label: "Evidence-backed", tone: "text-action" });
    expect(chip.hint.length).toBeGreaterThan(10);
    expect(chip.border).toMatch(/^border-/);
  });

  it("covers the five-word vocabulary exactly once each", () => {
    expect(STATUS_CHIP_ORDER).toEqual(["claimed", "evidence_backed", "verified", "unverified", "conflicting"]);
    expect(Object.values(STATUS_CHIP_LABELS).sort()).toEqual(["Claimed", "Conflicting", "Evidence-backed", "Unverified", "Verified"]);
  });
});
