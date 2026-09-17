// G14-review (S37 P1): the cap-lifting `linkedin_parser` stamp must be
// backed by the import attestation (or an unchanged, previously stamped
// value) — a client-chosen stamp alone is downgraded to "founder".

import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, type FounderProfile } from "@/lib/founder-profile-types";
import { founderExecutionSignals } from "./execution";
import { resolveExecutionProvenance } from "./execution-provenance";
import { canonicalEmployers, mintLinkedInAttestation, verifyLinkedInAttestation } from "./linkedin-attestation";

const SECRET = "unit-test-secret-at-least-16-chars";
const NOW = Date.parse("2026-09-17T00:00:00Z");

function profile(over: Partial<FounderProfile> = {}): FounderProfile {
  return { ...EMPTY_PROFILE("u-1", "f@x.test"), ...over };
}

describe("linkedin attestation", () => {
  it("round-trips the claims for the same user; another user / a tampered token / expiry fail", () => {
    const tok = mintLinkedInAttestation("u-1", { years_in_domain: 7, prev_employers: ["Stripe", " atlassian "] }, { now: NOW, secret: SECRET })!;
    expect(tok).toBeTruthy();
    const ok = verifyLinkedInAttestation("u-1", tok, { now: NOW + 1000, secret: SECRET });
    expect(ok).toEqual({ ok: true, claims: { years_in_domain: 7, prev_employers: ["atlassian", "stripe"] } });
    expect(verifyLinkedInAttestation("u-2", tok, { now: NOW, secret: SECRET })).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyLinkedInAttestation("u-1", tok.replace(".7.", ".9."), { now: NOW, secret: SECRET })).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyLinkedInAttestation("u-1", tok, { now: NOW + 25 * 60 * 60 * 1000, secret: SECRET })).toEqual({ ok: false, reason: "expired" });
    expect(verifyLinkedInAttestation("u-1", "garbage", { now: NOW, secret: SECRET })).toEqual({ ok: false, reason: "malformed" });
    expect(verifyLinkedInAttestation("u-1", undefined, { now: NOW, secret: SECRET })).toEqual({ ok: false, reason: "malformed" });
  });

  it("no secret → nothing is minted and nothing verifies", () => {
    expect(mintLinkedInAttestation("u-1", { years_in_domain: 3, prev_employers: [] }, { now: NOW, secret: null })).toBeNull();
    expect(verifyLinkedInAttestation("u-1", "1.2.3.4", { secret: null })).toEqual({ ok: false, reason: "no_secret" });
  });

  it("null years + no employers still mints a verifiable token", () => {
    const tok = mintLinkedInAttestation("u-1", { years_in_domain: null, prev_employers: [] }, { now: NOW, secret: SECRET })!;
    expect(verifyLinkedInAttestation("u-1", tok, { now: NOW, secret: SECRET })).toEqual({ ok: true, claims: { years_in_domain: null, prev_employers: [] } });
  });

  it("canonicalEmployers ignores case, whitespace, order and duplicates", () => {
    expect(canonicalEmployers([" Stripe", "stripe ", "Atlassian  Pty", ""])).toEqual(["atlassian pty", "stripe"]);
  });
});

describe("resolveExecutionProvenance", () => {
  it("a client-asserted linkedin_parser stamp with no attestation is downgraded to founder — and the cap stays on", () => {
    const next = profile({ years_in_domain: 12, prev_employers: ["Stripe"], prior_exits: [{ company: "A", year: 2020, type: "acquisition", value_band: "undisclosed" }, { company: "B", year: 2022, type: "ipo", value_band: "undisclosed" }], roles: { ceo: "Ada", cto: "Bob", cpo: null, cfo: null }, full_time_pct: 100, worked_together_before: true });
    const r = resolveExecutionProvenance({ requested: { years_in_domain: "linkedin_parser", prev_employers: "linkedin_parser", prior_exits: "founder" }, next, existing: null, attested: null });
    expect(r.execution_source).toEqual({ years_in_domain: "founder", prev_employers: "founder", prior_exits: "founder" });
    expect(r.downgraded).toEqual(["years_in_domain", "prev_employers"]);
    const exec = founderExecutionSignals({ ...next, execution_source: r.execution_source });
    expect(exec.rawScore).toBeGreaterThan(70);
    expect(exec.capped).toBe(true);
  });

  it("an attested value keeps linkedin_parser; a value that drifted from the attestation does not", () => {
    const attested = { years_in_domain: 7, prev_employers: ["stripe"] };
    const next = profile({ years_in_domain: 7, prev_employers: ["Stripe", "Canva"] });
    const r = resolveExecutionProvenance({ requested: { years_in_domain: "linkedin_parser", prev_employers: "linkedin_parser" }, next, existing: null, attested });
    expect(r.execution_source).toEqual({ years_in_domain: "linkedin_parser", prev_employers: "linkedin_parser" });
    expect(r.downgraded).toEqual([]);

    const drifted = resolveExecutionProvenance({ requested: { years_in_domain: "linkedin_parser", prev_employers: "linkedin_parser" }, next: profile({ years_in_domain: 15, prev_employers: ["Canva"] }), existing: null, attested });
    expect(drifted.execution_source).toEqual({ years_in_domain: "founder", prev_employers: "founder" });
  });

  it("a stamp already on the row survives a re-save while the value is unchanged, and resets when edited", () => {
    const existing = profile({ years_in_domain: 7, execution_source: { years_in_domain: "linkedin_parser" } });
    const same = resolveExecutionProvenance({ requested: { years_in_domain: "linkedin_parser" }, next: profile({ years_in_domain: 7 }), existing, attested: null });
    expect(same.execution_source).toEqual({ years_in_domain: "linkedin_parser" });
    const edited = resolveExecutionProvenance({ requested: { years_in_domain: "linkedin_parser" }, next: profile({ years_in_domain: 20 }), existing, attested: null });
    expect(edited.execution_source).toEqual({ years_in_domain: "founder" });
    expect(edited.downgraded).toEqual(["years_in_domain"]);
  });

  it("evaluator / github stamps can never be minted by the client either; unknown keys are dropped", () => {
    const r = resolveExecutionProvenance({ requested: { prior_exits: "evaluator", github_url: "github", bogus: "linkedin_parser" }, next: profile(), existing: null, attested: { years_in_domain: 3, prev_employers: [] } });
    expect(r.execution_source).toEqual({ prior_exits: "founder", github_url: "founder" });
  });
});
