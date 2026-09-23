import { describe, expect, it } from "vitest";
import { createBusinessInputSnapshot } from "./input-snapshot";

const base = {
  inputKind: "website" as const,
  actorId: "actor-fixture",
  businessId: "business-fixture",
  createdAt: "2026-09-23T00:00:00.000Z",
  sources: [
    { id: "home", kind: "page" as const, locator: "https://example.com", status: "available" as const, text: "Home product claim" },
    { id: "pricing", kind: "page" as const, locator: "https://example.com/pricing", status: "available" as const, text: "A$50 per month" },
    { id: "customers", kind: "page" as const, locator: "https://example.com/customers", status: "timeout" as const },
  ],
};

describe("createBusinessInputSnapshot", () => {
  it("keeps page-level lineage and hashes without retaining source text", () => {
    const snapshot = createBusinessInputSnapshot(base);
    expect(snapshot.sourceUnits).toHaveLength(3);
    expect(snapshot.sourceUnits[1]).toMatchObject({ id: "pricing", status: "available", chars: 14 });
    expect(snapshot.sourceUnits[2]).toMatchObject({ id: "customers", status: "timeout", textSha256: null, chars: 0 });
    expect(JSON.stringify(snapshot)).not.toContain("A$50 per month");
    expect(snapshot.retention).toEqual({ authorized: false, grantId: null });
  });

  it("changes the content and snapshot digests when a child page changes", () => {
    const before = createBusinessInputSnapshot(base);
    const after = createBusinessInputSnapshot({
      ...base,
      sources: base.sources.map((source) => source.id === "pricing" ? { ...source, text: "A$80 per month" } : source),
    });
    expect(after.contentSha256).not.toBe(before.contentSha256);
    expect(after.digestSha256).not.toBe(before.digestSha256);
  });

  it("requires a grant before marking retention authorised", () => {
    expect(() => createBusinessInputSnapshot({ ...base, retention: { authorized: true } })).toThrow("business_input_retention_grant_required");
    expect(createBusinessInputSnapshot({ ...base, retention: { authorized: true, grantId: "grant-fixture" } }).retention).toEqual({
      authorized: true,
      grantId: "grant-fixture",
    });
  });

  it("rejects duplicate ids and content attached to failed fetches", () => {
    expect(() => createBusinessInputSnapshot({ ...base, sources: [base.sources[0], base.sources[0]] })).toThrow("business_input_source_id_invalid");
    expect(() => createBusinessInputSnapshot({
      ...base,
      sources: [{ id: "blocked", kind: "page", locator: "http://private", status: "blocked", text: "must not survive" }],
    })).toThrow("business_input_unavailable_source_has_text");
  });
});
