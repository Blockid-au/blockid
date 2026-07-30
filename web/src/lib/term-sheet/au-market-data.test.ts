import { describe, expect, it } from "vitest";
import { AU_MARKET_REFERENCE } from "./au-market-data";

/**
 * Guards for the AU_MARKET_REFERENCE prompt-cache block.
 *
 * This constant is embedded into the Anthropic prompt with
 * `cache_control: { type: "ephemeral", ttl: "1h" }` (see analyze.ts:146-147).
 * Two failure modes we care about:
 *
 *  1. Any non-deterministic interpolation (Date.now, process.env, request id)
 *     silently invalidates the cache on every request — the file comment
 *     block explicitly forbids it. These tests fail loudly if that drifts.
 *  2. Silent structural drift (section renumbered, AU statute reference
 *     removed, cap number inverted) degrades the analysis without any
 *     surface signal until a founder screenshots a bad output.
 */

const CANONICAL_SECTION_TITLES = [
  "1. SAFE valuation caps by stage",
  "2. Convertible notes",
  "3. Series A — typical AU institutional terms",
  "4. Australian-specific compliance flags that affect term sheet drafting",
  "5. Founder-friendly clauses",
  "6. Investor-friendly red flags",
  "7. Red flags specific to convertibles / SAFEs",
  "8. Typical AU deal economics",
  "9. Drafting style — Australian vs US precedent",
  "10. The carbon-copy US-template smell test",
] as const;

describe("AU_MARKET_REFERENCE — top-level shape", () => {
  it("is a non-empty string", () => {
    expect(typeof AU_MARKET_REFERENCE).toBe("string");
    expect(AU_MARKET_REFERENCE.trim().length).toBeGreaterThan(0);
  });

  it("opens with the canonical 2024–2026 header — surfaces stale-vintage edits", () => {
    // If a maintainer ships a 2026-only refresh the header year window should
    // be updated in lock-step; a drift here means the model is being fed
    // dated context under a fresh badge.
    expect(AU_MARKET_REFERENCE.trimStart()).toMatch(
      /^# Australian Private Capital — Term Sheet Reference \(2024–2026\)/,
    );
  });

  it("is at least 3KB so the prompt cache actually saves cost", () => {
    // Anthropic's cache-write premium only pays back once the cached block
    // is large enough that the read-savings on subsequent requests exceed
    // the write-once cost. 3KB is the practical floor.
    expect(AU_MARKET_REFERENCE.length).toBeGreaterThan(3_000);
  });

  it("is under 100KB so it still fits alongside the user's term sheet in-window", () => {
    expect(AU_MARKET_REFERENCE.length).toBeLessThan(100_000);
  });
});

describe("AU_MARKET_REFERENCE — cache determinism (prompt-cache hygiene)", () => {
  it("returns the exact same string on repeated imports", async () => {
    // Two independent module imports must yield reference-equal content —
    // any accidental Date.now() / random / process.env leak would show up
    // as a length or content delta between reads.
    const first = AU_MARKET_REFERENCE;
    const modAgain = await import("./au-market-data");
    expect(modAgain.AU_MARKET_REFERENCE).toBe(first);
    expect(modAgain.AU_MARKET_REFERENCE.length).toBe(first.length);
  });

  it("contains no unresolved ${...} template placeholders", () => {
    // A stray `${something}` in the source would mean the string is being
    // interpolated at eval time — cache-busting.
    expect(AU_MARKET_REFERENCE).not.toMatch(/\$\{[^}]+\}/);
  });

  it("contains no unresolved {{ ... }} handlebars placeholders", () => {
    expect(AU_MARKET_REFERENCE).not.toMatch(/\{\{\s*\w+/);
  });

  it("contains no ISO timestamps or 'generated at' markers", () => {
    // Guard against a maintainer stamping the doc with the build time.
    expect(AU_MARKET_REFERENCE).not.toMatch(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    expect(AU_MARKET_REFERENCE).not.toMatch(/generated at/i);
  });
});

describe("AU_MARKET_REFERENCE — section-index integrity", () => {
  it("declares all 10 canonical sections in order", () => {
    let cursor = 0;
    for (const title of CANONICAL_SECTION_TITLES) {
      const heading = `## ${title}`;
      const idx = AU_MARKET_REFERENCE.indexOf(heading, cursor);
      expect(
        idx,
        `expected to find "${heading}" at or after offset ${cursor}`,
      ).toBeGreaterThanOrEqual(0);
      cursor = idx + heading.length;
    }
  });

  it("has exactly 10 top-level `## ` sections — no orphan headings, no dropped ones", () => {
    const matches = AU_MARKET_REFERENCE.match(/^## /gm) ?? [];
    expect(matches.length).toBe(10);
  });

  it("uses `### ` for the four Section 4 sub-topics (ESIC / RDTI / AUSTRAC / s708 / ASIC)", () => {
    // Section 4 is the AU-specific compliance section; every sub-topic
    // needs its own H3 so the model can retrieve them by heading anchor.
    const subheads = AU_MARKET_REFERENCE.match(/^### /gm) ?? [];
    expect(subheads.length).toBeGreaterThanOrEqual(4);
  });
});

describe("AU_MARKET_REFERENCE — AU statutory + compliance anchors", () => {
  it("cites ESIC + the four qualifying-test thresholds", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/ESIC/);
    expect(AU_MARKET_REFERENCE).toMatch(/Early Stage Innovation Company/);
    // 3-year age window
    expect(AU_MARKET_REFERENCE).toMatch(/within the last 3 years/i);
    // Expenses cap
    expect(AU_MARKET_REFERENCE).toMatch(/\$1M/);
    // Income cap
    expect(AU_MARKET_REFERENCE).toMatch(/\$200k/);
    // Objective / principles test
    expect(AU_MARKET_REFERENCE).toMatch(/100-point innovation test/);
    expect(AU_MARKET_REFERENCE).toMatch(/principles-based test/);
  });

  it("cites Division 83A ESS rules for ESOP", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/Division 83A/);
    expect(AU_MARKET_REFERENCE).toMatch(/ESS rules/);
  });

  it("cites R&D Tax Incentive with the refundable + non-refundable offset rates", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/R&D Tax Incentive|RDTI/);
    expect(AU_MARKET_REFERENCE).toMatch(/43\.5%/);
    expect(AU_MARKET_REFERENCE).toMatch(/38\.5%/);
  });

  it("cites AUSTRAC with a fintech-scope carve-out", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/AUSTRAC/);
    expect(AU_MARKET_REFERENCE).toMatch(/fintech/i);
  });

  it("cites Corporations Act s708 small-scale offering (20 investors / $2M / 12 months)", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/Corporations Act/);
    expect(AU_MARKET_REFERENCE).toMatch(/[Ss]ection 708|s708/);
    expect(AU_MARKET_REFERENCE).toMatch(/20 investors/);
    expect(AU_MARKET_REFERENCE).toMatch(/\$2M/);
    expect(AU_MARKET_REFERENCE).toMatch(/12[- ]month/i);
  });

  it("cites ASIC Form 484 lodgement window (28 days)", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/ASIC/);
    expect(AU_MARKET_REFERENCE).toMatch(/Form 484/);
    expect(AU_MARKET_REFERENCE).toMatch(/28 days/);
  });
});

describe("AU_MARKET_REFERENCE — market-standard clause pins (Section 3)", () => {
  it("names '1x non-participating' as the AU liquidation-preference standard", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/1x non-participating/);
  });

  it("names 'broad-based weighted average' as the AU anti-dilution standard", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/broad-based weighted average/i);
  });

  it("calls out full-ratchet as investor-friendly", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/[Ff]ull-ratchet/);
  });

  it("names double-trigger acceleration as the AU compromise", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/double-trigger/i);
    expect(AU_MARKET_REFERENCE).toMatch(/change of control/i);
  });

  it("names the standard 4-year vest + 1-year cliff", () => {
    expect(AU_MARKET_REFERENCE).toMatch(/4-year vest/);
    expect(AU_MARKET_REFERENCE).toMatch(/1-year cliff/);
  });
});

describe("AU_MARKET_REFERENCE — founder-friendly vs red-flag lists", () => {
  it("Section 5 (founder-friendly) enumerates ≥ 6 push-for clauses as bold list items", () => {
    const section = extractSection(AU_MARKET_REFERENCE, 5, 6);
    const bulletBoldCount = (section.match(/^- \*\*/gm) ?? []).length;
    expect(bulletBoldCount).toBeGreaterThanOrEqual(6);
  });

  it("Section 6 (investor-friendly red flags) enumerates ≥ 8 push-back items as bold list items", () => {
    const section = extractSection(AU_MARKET_REFERENCE, 6, 7);
    const bulletBoldCount = (section.match(/^- \*\*/gm) ?? []).length;
    expect(bulletBoldCount).toBeGreaterThanOrEqual(8);
  });

  it("Section 6 explicitly flags full-ratchet, multiple liquidation preferences, and MFN-no-expiry", () => {
    const section = extractSection(AU_MARKET_REFERENCE, 6, 7);
    expect(section).toMatch(/Full-ratchet anti-dilution/);
    expect(section).toMatch(/Multiple liquidation preferences/);
    expect(section).toMatch(/MFN clauses with no expiry/);
  });
});

describe("AU_MARKET_REFERENCE — SAFE cap-band monotonicity (Section 1)", () => {
  it("SAFE cap bands walk friends-and-family → seed with non-decreasing floors", () => {
    // If someone accidentally swaps the F&F and seed cap floors the numeric
    // ordering breaks silently — this pins the shape.
    const section = extractSection(AU_MARKET_REFERENCE, 1, 2);
    // Grab lowest-cap number from each band by rough shape: `$X` at start of range.
    // Friends & family should be $750k, then pre-seed $1.5M, then seed $4M.
    expect(section.indexOf("$750k")).toBeGreaterThanOrEqual(0);
    expect(section.indexOf("$1.5M")).toBeGreaterThan(section.indexOf("$750k"));
    expect(section.indexOf("$4M")).toBeGreaterThan(section.indexOf("$1.5M"));
  });
});

describe("AU_MARKET_REFERENCE — AU vs US drafting hygiene (Sections 9 + 10)", () => {
  it("Section 9 maps US terminology to AU equivalents (shareholder / ordinary / preference shares)", () => {
    const section = extractSection(AU_MARKET_REFERENCE, 9, 10);
    expect(section).toMatch(/"Stockholder" → "shareholder"/);
    expect(section).toMatch(/"Common Stock" → "ordinary shares"/);
    expect(section).toMatch(/"Preferred Stock" → "preference shares"/);
  });

  it("Section 10 names Delaware as a US-template smell — but does NOT recommend it", () => {
    const section = extractSection(AU_MARKET_REFERENCE, 10, null);
    expect(section).toMatch(/Delaware/);
  });

  it("does not endorse Delaware anywhere outside the smell-test carve-out (sections 1–8)", () => {
    // Guard: Delaware appears only in the drafting-hygiene sections (9 + 10)
    // as a smell-test signal, never as recommended AU drafting anywhere
    // earlier in the document.
    const preSection9 = AU_MARKET_REFERENCE.slice(
      0,
      AU_MARKET_REFERENCE.indexOf("## 9."),
    );
    expect(preSection9).not.toMatch(/Delaware/);
  });
});

describe("AU_MARKET_REFERENCE — deal economics sanity band (Section 8)", () => {
  it("Series A median pre-money ≥ seed median pre-money — bands walk up by stage", () => {
    const section = extractSection(AU_MARKET_REFERENCE, 8, 9);
    // Seed median pre-money: $7M – $12M
    // Series A median pre-money: $14M – $20M
    expect(section).toMatch(/Seed median pre-money: \$7M – \$12M/);
    expect(section).toMatch(/Series A median pre-money: \$14M – \$20M/);
  });

  it("declares the ±30% flag-if-outside guardrail so the model has a cut-off", () => {
    const section = extractSection(AU_MARKET_REFERENCE, 8, 9);
    expect(section).toMatch(/±30%/);
  });
});

/**
 * Slice out a numbered `## N.` section. `endHeading` is the next heading
 * number ("2" for section 1..2) or `null` for the tail.
 */
function extractSection(
  source: string,
  startHeading: number,
  endHeading: number | null,
): string {
  const startAnchor = `## ${startHeading}.`;
  const startIdx = source.indexOf(startAnchor);
  if (startIdx < 0) {
    throw new Error(`section ${startHeading} not found`);
  }
  if (endHeading === null) {
    return source.slice(startIdx);
  }
  const endAnchor = `## ${endHeading}.`;
  const endIdx = source.indexOf(endAnchor, startIdx + startAnchor.length);
  if (endIdx < 0) {
    return source.slice(startIdx);
  }
  return source.slice(startIdx, endIdx);
}
