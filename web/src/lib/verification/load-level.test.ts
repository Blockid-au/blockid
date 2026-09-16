import { describe, expect, it } from "vitest";
import { loadVerificationLevel } from "./load-level";

function dbReturning(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
  } as never;
}

describe("loadVerificationLevel — read-only, never throws", () => {
  it("returns the clamped level for a project row", async () => {
    expect(await loadVerificationLevel(dbReturning({ data: { verification_level: 3 }, error: null }), "p1")).toBe(3);
    expect(await loadVerificationLevel(dbReturning({ data: { verification_level: 9 }, error: null }), "p1")).toBe(5);
  });

  it("null for a missing project, a null column, a DB error, no client or no id", async () => {
    expect(await loadVerificationLevel(dbReturning({ data: null, error: null }), "p1")).toBeNull();
    expect(await loadVerificationLevel(dbReturning({ data: { verification_level: null }, error: null }), "p1")).toBeNull();
    expect(await loadVerificationLevel(dbReturning({ data: null, error: { message: "boom" } }), "p1")).toBeNull();
    expect(await loadVerificationLevel(null, "p1")).toBeNull();
    expect(await loadVerificationLevel(dbReturning({ data: { verification_level: 2 }, error: null }), null)).toBeNull();
  });

  it("swallows a client that throws (mocked clients without the projects table)", async () => {
    const throwing = { from: () => { throw new Error("unexpected table projects"); } } as never;
    expect(await loadVerificationLevel(throwing, "p1")).toBeNull();
  });
});
