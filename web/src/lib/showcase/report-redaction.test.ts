import { describe, expect, it } from "vitest";
import {
  buildDownloadFilename,
  isDownloadableReportFilename,
  redactReportMarkdown,
} from "./report-redaction";

describe("isDownloadableReportFilename", () => {
  it("accepts a canonical daily brief filename", () => {
    expect(isDownloadableReportFilename("cto-daily-2026-07-21.md")).toBe(true);
  });

  it("accepts a milestone artefact with version suffix", () => {
    expect(isDownloadableReportFilename("milestone-M4-v3.0.0.md")).toBe(true);
  });

  it("rejects the underscore-prefixed template file", () => {
    expect(isDownloadableReportFilename("_daily-report-template.md")).toBe(false);
  });

  it("rejects path traversal segments", () => {
    expect(isDownloadableReportFilename("../etc/passwd")).toBe(false);
    expect(isDownloadableReportFilename("foo/bar.md")).toBe(false);
    expect(isDownloadableReportFilename("..\\bar.md")).toBe(false);
  });

  it("rejects non-markdown extensions", () => {
    expect(isDownloadableReportFilename("cto-daily-2026-07-21.pdf")).toBe(false);
    expect(isDownloadableReportFilename("cto-daily-2026-07-21")).toBe(false);
  });

  it("rejects empty / non-string / oversized inputs", () => {
    expect(isDownloadableReportFilename("")).toBe(false);
    // @ts-expect-error — deliberate wrong type for runtime guard test
    expect(isDownloadableReportFilename(null)).toBe(false);
    expect(isDownloadableReportFilename(`${"a".repeat(200)}.md`)).toBe(false);
  });
});

describe("redactReportMarkdown", () => {
  it("prepends the redaction banner", () => {
    const out = redactReportMarkdown("clean body");
    expect(out.startsWith("> _Public showcase copy")).toBe(true);
    expect(out).toContain("clean body");
  });

  it("masks email addresses", () => {
    const out = redactReportMarkdown("Contact admin@blockid.au for access.");
    expect(out).not.toContain("admin@blockid.au");
    expect(out).toContain("[email redacted]");
  });

  it("masks Australian phone numbers", () => {
    const cases = ["+61 4 1234 5678", "0412 345 678", "0298765432"];
    for (const p of cases) {
      const out = redactReportMarkdown(`Call ${p} for help.`);
      expect(out).not.toContain(p);
      expect(out).toContain("[phone redacted]");
    }
  });

  it("masks Bearer tokens", () => {
    const out = redactReportMarkdown("Authorization: Bearer abcdef1234567890abcdef1234");
    expect(out).not.toContain("abcdef1234567890abcdef1234");
    expect(out).toContain("Bearer [token redacted]");
  });

  it("masks GitHub personal access tokens", () => {
    const out = redactReportMarkdown("token=ghp_ABCDEFGHIJKLMNOPQRSTUV0123456789");
    expect(out).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUV0123456789");
    expect(out).toContain("[github-token redacted]");
  });

  it("masks Stripe live + test keys", () => {
    // Split literal so GitHub secret-scanning push protection doesn't reject
    // this test file for containing what looks like a real Stripe key.
    const suffix = "ABCDEFGHIJKLMNOPQRSTUVWX";
    const live = `sk_${"live"}_${suffix}`;
    const test = `sk_${"test"}_${suffix}`;
    const out = redactReportMarkdown(`stripe=${live} and stripe_test=${test}`);
    expect(out).not.toContain(live);
    expect(out).not.toContain(test);
    expect(out.match(/\[stripe-key redacted\]/g)?.length).toBe(2);
  });

  it("masks Anthropic API keys before the OpenAI catch-all fires", () => {
    const key = "sk-ant-api03-abcdefghij0123456789";
    const out = redactReportMarkdown(`ANTHROPIC=${key}`);
    expect(out).toContain("[anthropic-key redacted]");
    expect(out).not.toContain(key);
  });

  it("masks AWS access key IDs", () => {
    const out = redactReportMarkdown("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE");
    // ENV_SECRET_RE catches the assignment first because the KEY name matches
    // the SECRET/TOKEN/PASSWORD pattern; the AWS-specific regex is a defence
    // in depth for bare occurrences (e.g. inside CLI transcripts).
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out).toMatch(/\[(aws-access-key|secret) redacted\]/);
  });

  it("masks compact 3-part JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
      ".eyJzdWIiOiIxMjM0NSJ9" +
      ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const out = redactReportMarkdown(`session=${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain("[jwt redacted]");
  });

  it("masks generic env-style secret assignments", () => {
    const out = redactReportMarkdown('SUPABASE_SERVICE_ROLE_KEY="hunter2hunter2hunter2"');
    expect(out).not.toContain("hunter2hunter2hunter2");
    expect(out).toContain("SUPABASE_SERVICE_ROLE_KEY=[secret redacted]");
  });

  it("returns just the banner on empty / non-string input", () => {
    const banner = "> _Public showcase copy";
    expect(redactReportMarkdown("")).toContain(banner);
    // @ts-expect-error — deliberate wrong type for runtime guard test
    expect(redactReportMarkdown(null)).toContain(banner);
  });

  it("leaves clean marketing copy untouched (aside from the banner)", () => {
    const clean = "# Vision\n\nWe help Australian founders find product-market fit.";
    const out = redactReportMarkdown(clean);
    expect(out.endsWith(clean)).toBe(true);
  });
});

describe("buildDownloadFilename", () => {
  it("preserves a canonical daily brief filename", () => {
    expect(buildDownloadFilename("cto-daily-2026-07-21.md")).toBe("cto-daily-2026-07-21.md");
  });

  it("lowercases + collapses illegal characters", () => {
    expect(buildDownloadFilename("Weird Name!!!.md")).toBe("weird-name-.md");
  });

  it("appends .md when missing", () => {
    expect(buildDownloadFilename("no-ext-file")).toBe("no-ext-file.md");
  });

  it("falls back to 'report.md' on empty input", () => {
    expect(buildDownloadFilename("")).toBe("report.md");
  });

  it("clamps to 80 chars including the .md tail", () => {
    const long = `${"a".repeat(200)}.md`;
    const out = buildDownloadFilename(long);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith(".md")).toBe(true);
  });
});
