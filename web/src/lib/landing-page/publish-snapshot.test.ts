import { describe, expect, it } from "vitest";
import {
  PUBLISH_SNAPSHOT_DISCLAIMER,
  PUBLISH_SNAPSHOT_HOSTNAME,
  PUBLISH_SNAPSHOT_MAX_SLUG_LENGTH,
  PUBLISH_SNAPSHOT_MIN_SLUG_LENGTH,
  buildPublishSnapshot,
  canonicaliseSlug,
} from "./publish-snapshot";
import type { LandingPageInput } from "./preview";

const validInput: LandingPageInput = {
  headline: "Auschain — the Australian equity data-room",
  subheadline: "Give investors what they ask for before they ask for it.",
  bullets: [
    "Data-room built to the S-1 standard",
    "SVI score in under 10 minutes",
    "Div 83A eligibility check built in",
  ],
  cta_label: "Start the SVI",
  cta_href: "https://blockid.au/svi",
  ga4_measurement_id: "G-ABCDE12345",
  brand_name: "Auschain",
};

describe("canonicaliseSlug", () => {
  it("lowercases, replaces non-alnum runs, dedupes dashes", () => {
    expect(canonicaliseSlug("  My Startup!! v2  ")).toBe("my-startup-v2");
    expect(canonicaliseSlug("---A___B---")).toBe("a-b");
    expect(canonicaliseSlug("cafe—naïve")).toBe("cafe-na-ve");
  });

  it("returns empty string for null/empty/all-symbols input", () => {
    expect(canonicaliseSlug(null)).toBe("");
    expect(canonicaliseSlug(undefined)).toBe("");
    expect(canonicaliseSlug("")).toBe("");
    expect(canonicaliseSlug("---")).toBe("");
    expect(canonicaliseSlug("!@#$%")).toBe("");
  });
});

describe("buildPublishSnapshot — refusal branches", () => {
  it("refuses when landing-page input is invalid", () => {
    const res = buildPublishSnapshot(
      { ...validInput, headline: "" },
      { slug: "acme-inc", publishedAt: new Date("2026-07-25T00:00:00Z") },
    );
    expect(res.status).toBe("refused");
    if (res.status === "refused") {
      expect(res.reasons).toContain("invalid_landing_page_input");
      expect(res.validation?.valid).toBe(false);
    }
  });

  it("refuses when slug is empty or symbols-only", () => {
    const empty = buildPublishSnapshot(validInput, { slug: "  " });
    expect(empty.status).toBe("refused");
    if (empty.status === "refused") expect(empty.reasons).toContain("slug_empty");

    const symbols = buildPublishSnapshot(validInput, { slug: "!!!" });
    expect(symbols.status).toBe("refused");
    if (symbols.status === "refused") expect(symbols.reasons).toContain("slug_invalid_charset");
  });

  it("refuses when canonical slug is too short or too long", () => {
    const tooShort = buildPublishSnapshot(validInput, { slug: "ab" });
    expect(tooShort.status).toBe("refused");
    if (tooShort.status === "refused") expect(tooShort.reasons).toContain("slug_too_short");
    expect(PUBLISH_SNAPSHOT_MIN_SLUG_LENGTH).toBe(3);

    const tooLong = buildPublishSnapshot(validInput, {
      slug: "a".repeat(PUBLISH_SNAPSHOT_MAX_SLUG_LENGTH + 1),
    });
    expect(tooLong.status).toBe("refused");
    if (tooLong.status === "refused") expect(tooLong.reasons).toContain("slug_too_long");
  });

  it("collects multiple refusal reasons in one pass", () => {
    const res = buildPublishSnapshot(
      { ...validInput, headline: "" },
      { slug: "ab" },
    );
    expect(res.status).toBe("refused");
    if (res.status === "refused") {
      expect(res.reasons).toContain("slug_too_short");
      expect(res.reasons).toContain("invalid_landing_page_input");
    }
  });
});

describe("buildPublishSnapshot — publish branch", () => {
  it("returns a content-addressed snapshot with canonical url + disclaimer", () => {
    const publishedAt = new Date("2026-07-25T12:00:00Z");
    const res = buildPublishSnapshot(validInput, { slug: "Acme Inc.", publishedAt });
    expect(res.status).toBe("published");
    if (res.status !== "published") return;
    const { snapshot } = res;
    expect(snapshot.canonical_slug).toBe("acme-inc");
    expect(snapshot.canonical_url).toBe(`https://acme-inc.${PUBLISH_SNAPSHOT_HOSTNAME}/`);
    expect(snapshot.published_at).toBe("2026-07-25T12:00:00.000Z");
    expect(snapshot.content_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.size_bytes).toBeGreaterThan(0);
    expect(snapshot.html).toContain("<!doctype html>");
    expect(snapshot.validation.valid).toBe(true);
    expect(snapshot.disclaimer).toBe(PUBLISH_SNAPSHOT_DISCLAIMER);
  });

  it("hash is deterministic for identical input", () => {
    const publishedAt = new Date("2026-07-25T12:00:00Z");
    const a = buildPublishSnapshot(validInput, { slug: "acme", publishedAt });
    const b = buildPublishSnapshot(validInput, { slug: "acme", publishedAt });
    expect(a.status).toBe("published");
    expect(b.status).toBe("published");
    if (a.status === "published" && b.status === "published") {
      expect(a.snapshot.content_sha256).toBe(b.snapshot.content_sha256);
    }
  });

  it("hash changes when a bullet changes", () => {
    const publishedAt = new Date("2026-07-25T12:00:00Z");
    const a = buildPublishSnapshot(validInput, { slug: "acme", publishedAt });
    const b = buildPublishSnapshot(
      { ...validInput, bullets: [...validInput.bullets, "Extra bullet"] },
      { slug: "acme", publishedAt },
    );
    if (a.status === "published" && b.status === "published") {
      expect(a.snapshot.content_sha256).not.toBe(b.snapshot.content_sha256);
    }
  });

  it("respects custom hostname override", () => {
    const res = buildPublishSnapshot(validInput, {
      slug: "acme",
      hostname: "founder.example.com",
    });
    if (res.status === "published") {
      expect(res.snapshot.canonical_url).toBe("https://acme.founder.example.com/");
    }
  });

  it("disclaimer cites founder responsibility + APP 1 / APP 5", () => {
    expect(PUBLISH_SNAPSHOT_DISCLAIMER).toContain("founder");
    expect(PUBLISH_SNAPSHOT_DISCLAIMER).toContain("APP 1");
    expect(PUBLISH_SNAPSHOT_DISCLAIMER).toContain("APP 5");
  });
});
