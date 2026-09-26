import { describe, expect, it } from "vitest";
import { reportRevisionHash } from "./revision-hash";

describe("reportRevisionHash", () => {
  it("is stable across the key reordering jsonb applies on read-back", () => {
    const written = { schemaVersion: "2.0", meta: { tier: "free", id: "a" }, rows: [{ z: 1, a: 2 }] };
    const readBack = { meta: { id: "a", tier: "free" }, rows: [{ a: 2, z: 1 }], schemaVersion: "2.0" };
    expect(JSON.stringify(written)).not.toBe(JSON.stringify(readBack));
    expect(reportRevisionHash(readBack)).toBe(reportRevisionHash(written));
  });

  it("changes when a value changes and keeps array order significant", () => {
    const base = reportRevisionHash({ rows: [1, 2], score: 40 });
    expect(reportRevisionHash({ rows: [1, 2], score: 41 })).not.toBe(base);
    expect(reportRevisionHash({ rows: [2, 1], score: 40 })).not.toBe(base);
  });
});
