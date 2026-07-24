import { describe, expect, it } from "vitest";
import { isScannablePath, maskMatch, PATTERNS, scanContent } from "./docs-plans-secrets";

const F = "docs/plans/example.md";

describe("PATTERNS", () => {
  it("stays in lockstep with audit-secrets.mjs (>= 10 core patterns)", () => {
    // Guardrail — if a pattern is removed from audit-secrets.mjs the docs
    // scanner should be trimmed in the same commit.
    expect(PATTERNS.length).toBeGreaterThanOrEqual(10);
  });

  it("covers gitlab PATs (see .claude/settings.local.json exposure risk)", () => {
    const names = PATTERNS.map((p) => p.name);
    expect(names).toContain("gitlab-pat");
  });
});

describe("maskMatch", () => {
  it("keeps only the first 8 chars and appends the redaction marker", () => {
    expect(maskMatch("sk_test_ABCDEFGHIJKLMNOP")).toBe("sk_test_****redacted****");
  });
});

describe("scanContent", () => {
  it("returns empty for clean prose", () => {
    const src = "# Plan\n\nSome prose about the reseller module. No secrets.";
    expect(scanContent(F, src)).toEqual([]);
  });

  it("flags stripe live keys", () => {
    const src = "See key sk_live_ABCDEFGHIJKLMNOP1234 embedded above.";
    const hits = scanContent(F, src);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      file: F,
      pattern: "stripe-live",
      severity: "error",
    });
    expect(hits[0].masked).toContain("****redacted****");
    expect(hits[0].masked).not.toContain("MNOP1234"); // tail redacted
  });

  it("flags gitlab PATs (the exposure pattern in .claude/settings.local.json)", () => {
    const src =
      "PRIVATE-TOKEN: glpat-4E9lBvYECmIbI6LgSRvX3G86MQp1OjEH.01.0w07d02zv line two";
    const hits = scanContent(F, src);
    expect(hits).toHaveLength(1);
    expect(hits[0].pattern).toBe("gitlab-pat");
    expect(hits[0].line).toBe(1);
  });

  it("reports the correct line number for multi-line docs", () => {
    const src = ["# Header", "", "Some prose.", "ghp_" + "a".repeat(36)].join("\n");
    const hits = scanContent(F, src);
    expect(hits).toHaveLength(1);
    expect(hits[0].pattern).toBe("github-pat-classic");
    expect(hits[0].line).toBe(4);
  });

  it("suppresses hits on lines carrying the gitleaks:ignore marker", () => {
    const src =
      "Sample key sk_live_ABCDEFGHIJKLMNOP1234 documented for reference. gitleaks:ignore";
    expect(scanContent(F, src)).toEqual([]);
  });

  it("catches multiple distinct secret types in one blob", () => {
    const src = [
      "Stripe: sk_test_ABCDEFGHIJKLMNOPQR",
      "AWS: AKIAABCDEFGHIJKLMNOP",
      "Slack: xoxb-1234567890-abcdefgh",
    ].join("\n");
    const hits = scanContent(F, src);
    const names = new Set(hits.map((h) => h.pattern));
    expect(names.has("stripe-test")).toBe(true);
    expect(names.has("aws-access-key")).toBe(true);
    expect(names.has("slack-bot")).toBe(true);
  });

  it("skips content over 2MB to protect the scanner from megablobs", () => {
    const src = "sk_live_AAAAAAAAAAAAAAAA" + "x".repeat(2_100_000);
    expect(scanContent(F, src)).toEqual([]);
  });
});

describe("isScannablePath", () => {
  it("accepts docs/plans markdown", () => {
    expect(isScannablePath("docs/plans/reseller-module-plan.md")).toBe(true);
  });

  it("accepts docs/plans/reviews markdown", () => {
    expect(isScannablePath("docs/plans/reviews/plan-review-cmo.md")).toBe(true);
  });

  it("rejects files outside docs/plans", () => {
    expect(isScannablePath("docs/roadmap.md")).toBe(false);
    expect(isScannablePath("web/src/index.ts")).toBe(false);
  });

  it("rejects binary attachments even inside docs/plans", () => {
    expect(isScannablePath("docs/plans/attachment.pdf")).toBe(false);
    expect(isScannablePath("docs/plans/diagram.png")).toBe(false);
  });
});
