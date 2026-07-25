// Pure branch-matrix tests for `detectEsicMarketing`.
// Contract: docs/plans/atlassian-standard-mapping-goal.md
//           §1 phase 9 P0 "auto-firing gate on marketed rounds"
//           tracked as P9-esic-round-marketing-gate.

import { describe, it, expect } from "vitest";

import {
  detectEsicMarketing,
  ESIC_MARKETING_DISCLAIMER,
} from "./esic-marketing-gate";

describe("detectEsicMarketing", () => {
  it("returns marketed=false + empty signals when no metadata is supplied", () => {
    const r = detectEsicMarketing({});
    expect(r.marketed).toBe(false);
    expect(r.signals).toEqual([]);
    expect(r.disclaimer).toBe(ESIC_MARKETING_DISCLAIMER);
  });

  it("fires on explicit marketedAsEsic=true", () => {
    const r = detectEsicMarketing({ marketedAsEsic: true });
    expect(r.marketed).toBe(true);
    expect(r.signals).toContain("explicit_marketed_flag");
  });

  it("fires on explicit pitchClaimsEsic=true", () => {
    const r = detectEsicMarketing({ pitchClaimsEsic: true });
    expect(r.marketed).toBe(true);
    expect(r.signals).toContain("explicit_pitch_flag");
  });

  it("does NOT fire on marketedAsEsic=false (unset intent, not an assertion)", () => {
    const r = detectEsicMarketing({ marketedAsEsic: false, pitchClaimsEsic: false });
    expect(r.marketed).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it("fires on round name containing 'ESIC' (case-insensitive)", () => {
    const r = detectEsicMarketing({ roundName: "Seed round (esic-qualifying)" });
    expect(r.marketed).toBe(true);
    expect(r.signals).toContain("round_name_mentions_esic");
  });

  it("fires on pitch description containing 'early-stage innovation company'", () => {
    const r = detectEsicMarketing({
      pitchDescription: "We are an Early-Stage Innovation Company under Div 360.",
    });
    expect(r.marketed).toBe(true);
    expect(r.signals).toContain("pitch_description_mentions_esic");
  });

  it("fires on pitch description containing '20% offset'", () => {
    const r = detectEsicMarketing({
      pitchDescription: "Investors receive the 20% offset and CGT exemption.",
    });
    expect(r.marketed).toBe(true);
    expect(r.signals).toContain("pitch_description_mentions_offset");
  });

  it("fires on pitch description containing '10-year CGT'", () => {
    const r = detectEsicMarketing({
      pitchDescription: "Includes the 10-year CGT concession under Div 360.",
    });
    expect(r.marketed).toBe(true);
    expect(r.signals).toContain("pitch_description_mentions_offset");
  });

  it("does NOT false-fire on unrelated round names or descriptions", () => {
    const r = detectEsicMarketing({
      roundName: "Series A priced round",
      pitchDescription:
        "AU$5M raise from institutional investors to accelerate go-to-market in APAC.",
    });
    expect(r.marketed).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it("fires when any tag mentions ESIC", () => {
    const r = detectEsicMarketing({
      tags: ["priced-round", "esic-qualifying", "sophisticated-investors"],
    });
    expect(r.marketed).toBe(true);
    expect(r.signals).toContain("tag_mentions_esic");
  });

  it("collects multiple signals when several fire together", () => {
    const r = detectEsicMarketing({
      marketedAsEsic: true,
      roundName: "ESIC seed",
      pitchDescription: "Qualifies for the 20% offset",
    });
    expect(r.marketed).toBe(true);
    expect(r.signals).toContain("explicit_marketed_flag");
    expect(r.signals).toContain("round_name_mentions_esic");
    expect(r.signals).toContain("pitch_description_mentions_offset");
  });

  it("is defensive against null / undefined string fields", () => {
    const r = detectEsicMarketing({
      roundName: null,
      pitchDescription: undefined,
      tags: undefined,
    });
    expect(r.marketed).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it("ignores non-string tags without throwing", () => {
    // Simulate a mistyped client that forwards non-string tag entries.
    const r = detectEsicMarketing({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tags: [null as any, 42 as any, undefined as any, "not-marketed"],
    });
    expect(r.marketed).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it("attaches the s1041H / s923B disclaimer to every result", () => {
    const empty = detectEsicMarketing({});
    const positive = detectEsicMarketing({ marketedAsEsic: true });
    expect(empty.disclaimer).toBe(ESIC_MARKETING_DISCLAIMER);
    expect(positive.disclaimer).toBe(ESIC_MARKETING_DISCLAIMER);
    expect(ESIC_MARKETING_DISCLAIMER).toMatch(/s1041H/);
    expect(ESIC_MARKETING_DISCLAIMER).toMatch(/s923B/);
  });
});
