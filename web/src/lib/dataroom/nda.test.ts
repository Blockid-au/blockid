// Colocated suite for the NDA click-wrap rules (S21-A).

import { describe, expect, it } from "vitest";
import {
  DEFAULT_NDA_TEXT,
  NDA_NOT_LEGAL_ADVICE,
  NDA_TEXT_MAX_CHARS,
  ndaAllowsDocuments,
  ndaGate,
  normaliseNdaVersion,
  parseNdaAcceptBody,
  parseNdaSettingsBody,
  resolveNdaText,
} from "./nda";

const ROOM = { ndaRequired: true, ndaText: null, ndaVersion: 3 };
const FRESH = { ndaRequired: false, ndaSignedAt: null, ndaSignedVersion: null };

describe("ndaGate", () => {
  it("is not_required when neither the room nor the link asks", () => {
    const g = ndaGate({ ...ROOM, ndaRequired: false }, FRESH, true);
    expect(g.status).toBe("not_required");
    expect(ndaAllowsDocuments(g)).toBe(true);
  });

  it("is not_required for a Free room even when nda_required is set — plan gating collapses the gate", () => {
    const g = ndaGate(ROOM, FRESH, false);
    expect(g.status).toBe("not_required");
    expect(ndaAllowsDocuments(g)).toBe(true);
  });

  it("is pending (reason never) for a fresh link on a Starter+ room", () => {
    const g = ndaGate(ROOM, FRESH, true);
    expect(g).toMatchObject({ status: "pending", reason: "never", version: 3 });
    expect(ndaAllowsDocuments(g)).toBe(false);
    expect(g.text).toBe(DEFAULT_NDA_TEXT);
  });

  it("is accepted when the link signed the current version", () => {
    const g = ndaGate(ROOM, { ndaRequired: false, ndaSignedAt: "2026-09-10T00:00:00Z", ndaSignedVersion: 3 }, true);
    expect(g.status).toBe("accepted");
    expect(ndaAllowsDocuments(g)).toBe(true);
  });

  it("re-prompts (reason stale_version) after the founder bumps the version", () => {
    const g = ndaGate(ROOM, { ndaRequired: false, ndaSignedAt: "2026-09-10T00:00:00Z", ndaSignedVersion: 2 }, true);
    expect(g).toMatchObject({ status: "pending", reason: "stale_version", version: 3 });
    expect(ndaAllowsDocuments(g)).toBe(false);
  });

  it("a signed_at with no version (pre-0339 row) counts as never signed the current version", () => {
    const g = ndaGate(ROOM, { ndaRequired: false, ndaSignedAt: "2026-01-01T00:00:00Z", ndaSignedVersion: null }, true);
    expect(g.status).toBe("pending");
    expect(g.reason).toBe("stale_version");
  });

  it("honours a per-link nda_required when the room does not ask", () => {
    const g = ndaGate({ ...ROOM, ndaRequired: false }, { ...FRESH, ndaRequired: true }, true);
    expect(g.status).toBe("pending");
  });

  it("uses the founder's clause when set, the default otherwise, always trimmed and capped", () => {
    expect(ndaGate({ ...ROOM, ndaText: "  Custom.  " }, FRESH, true).text).toBe("Custom.");
    expect(ndaGate({ ...ROOM, ndaText: "   " }, FRESH, true).text).toBe(DEFAULT_NDA_TEXT);
    expect(resolveNdaText("x".repeat(NDA_TEXT_MAX_CHARS + 50)).length).toBe(NDA_TEXT_MAX_CHARS);
  });

  it("normalises a junk version to 1", () => {
    expect(normaliseNdaVersion(undefined)).toBe(1);
    expect(normaliseNdaVersion(0)).toBe(1);
    expect(normaliseNdaVersion("4")).toBe(4);
    expect(normaliseNdaVersion(2.9)).toBe(2);
  });
});

describe("default clause", () => {
  it("is plain-English, mutual, and carries the not-legal-advice line", () => {
    expect(DEFAULT_NDA_TEXT).toMatch(/^Mutual confidentiality\./);
    expect(DEFAULT_NDA_TEXT).toContain("The founder agrees");
    expect(DEFAULT_NDA_TEXT).not.toMatch(/whereas|hereinafter|indemnif/i);
    expect(NDA_NOT_LEGAL_ADVICE).toContain("does not constitute legal advice");
    expect(NDA_NOT_LEGAL_ADVICE).toContain("ACN 659 615 111");
  });
});

describe("parseNdaAcceptBody", () => {
  const token = "t".repeat(32);
  it("accepts a token + version, with an optional lower-cased email", () => {
    expect(parseNdaAcceptBody({ token, version: 2, email: "Jane@Fund.VC" })).toEqual({ ok: true, token, version: 2, email: "jane@fund.vc" });
    expect(parseNdaAcceptBody({ token, version: "3" })).toEqual({ ok: true, token, version: 3, email: null });
    expect(parseNdaAcceptBody({ token, version: 1, email: "" })).toMatchObject({ ok: true, email: null });
  });
  it("refuses a short token, a bad version, a bad email, a non-object", () => {
    expect(parseNdaAcceptBody({ token: "short", version: 1 })).toMatchObject({ ok: false });
    expect(parseNdaAcceptBody({ token, version: 0 })).toMatchObject({ ok: false });
    expect(parseNdaAcceptBody({ token, version: 1.5 })).toMatchObject({ ok: false });
    expect(parseNdaAcceptBody({ token, version: 1, email: "nope" })).toMatchObject({ ok: false, error: "email is not a valid address" });
    expect(parseNdaAcceptBody(null)).toMatchObject({ ok: false });
    expect(parseNdaAcceptBody("str")).toMatchObject({ ok: false });
  });
});

describe("parseNdaSettingsBody", () => {
  it("maps camelCase fields to the data_rooms columns and reads bumpVersion", () => {
    expect(parseNdaSettingsBody({ ndaRequired: true, watermarkEnabled: false, ndaText: " Hi ", bumpVersion: true })).toEqual({
      ok: true,
      patch: { nda_required: true, watermark_enabled: false, nda_text: "Hi" },
      bumpVersion: true,
    });
  });
  it("empty / null text clears the clause back to the default", () => {
    expect(parseNdaSettingsBody({ ndaText: "" })).toEqual({ ok: true, patch: { nda_text: null }, bumpVersion: false });
    expect(parseNdaSettingsBody({ ndaText: null })).toEqual({ ok: true, patch: { nda_text: null }, bumpVersion: false });
  });
  it("refuses wrong types, over-long text, and a no-op body", () => {
    expect(parseNdaSettingsBody({ ndaRequired: "yes" })).toMatchObject({ ok: false });
    expect(parseNdaSettingsBody({ watermarkEnabled: 1 })).toMatchObject({ ok: false });
    expect(parseNdaSettingsBody({ ndaText: 42 })).toMatchObject({ ok: false });
    expect(parseNdaSettingsBody({ ndaText: "x".repeat(NDA_TEXT_MAX_CHARS + 1) })).toMatchObject({ ok: false });
    expect(parseNdaSettingsBody({})).toMatchObject({ ok: false, error: "Nothing to update" });
    expect(parseNdaSettingsBody({ unrelated: 1 })).toMatchObject({ ok: false });
  });
});
