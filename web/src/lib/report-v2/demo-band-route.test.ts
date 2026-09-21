import { describe, expect, it } from "vitest";
import { DEMO_BANDS, demoBandHref, demoBandParams, demoBandPath, demoBandRewriteTarget, normaliseDemoBand } from "./demo-band-route";

const sp = (q: string) => new URLSearchParams(q);

describe("demoBandRewriteTarget()", () => {
  it("only /tbr/demo with a valid band is rewritten", () => {
    expect(demoBandRewriteTarget("/tbr/demo", sp(""))).toBeNull();
    expect(demoBandRewriteTarget("/tbr/demo", sp("utm_source=x"))).toBeNull();
    expect(demoBandRewriteTarget("/tbr/demo", sp("band="))).toBeNull();
    expect(demoBandRewriteTarget("/tbr/demo", sp("band=E"))).toBeNull();
    expect(demoBandRewriteTarget("/tbr/demo", sp("band=AB"))).toBeNull();
    expect(demoBandRewriteTarget("/tbr/demo/band/A", sp("band=B"))).toBeNull();
    expect(demoBandRewriteTarget("/tbr/xyz", sp("band=A"))).toBeNull();
  });

  it("A–D (any case, trimmed) → /tbr/demo/band/<BAND>", () => {
    expect(demoBandRewriteTarget("/tbr/demo", sp("band=A"))).toBe("/tbr/demo/band/A");
    expect(demoBandRewriteTarget("/tbr/demo", sp("band=d"))).toBe("/tbr/demo/band/D");
    expect(demoBandRewriteTarget("/tbr/demo", sp("band=%20c%20"))).toBe("/tbr/demo/band/C");
  });
});

describe("band helpers", () => {
  it("normalise, params, href and path agree on the four bands", () => {
    expect(DEMO_BANDS).toEqual(["A", "B", "C", "D"]);
    expect(demoBandParams()).toEqual([{ band: "A" }, { band: "B" }, { band: "C" }, { band: "D" }]);
    expect(normaliseDemoBand("b")).toBe("B");
    expect(normaliseDemoBand(undefined)).toBeNull();
    expect(demoBandHref("C")).toBe("/tbr/demo?band=C");
    expect(demoBandPath("C")).toBe("/tbr/demo/band/C");
  });
});
