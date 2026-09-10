/**
 * The auto-research prompt shows an example JSON object to pin the shape, and
 * `JSON.parse(cleaned) as TopicItem` checked nothing at runtime. A weaker model
 * answered by echoing the example back, so the placeholders were written to
 * topic-queue.json and published as a real article — twice.
 *
 * /insights/kebab-case-slug went live titled "Title Under 70 Chars", with
 * category "valuation|cap-table|fundraising|..." (the list of options rather
 * than a choice), a CTA pointing at "/tools/xxx or /score or /", a description
 * offering a "keyword1-focused guide", and two 404 wp-content image URLs. It
 * was in the sitemap and listed on the /insights index.
 *
 * These cases are the exact published values, so a regression is caught by the
 * thing that actually happened rather than by a paraphrase of it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
  join(process.cwd(), "src/app/api/cron/publish-insight/route.ts"),
  "utf8",
);

describe("publish-insight guards against publishing its own prompt example", () => {
  it("validates the auto-researched topic before persisting or publishing", () => {
    expect(SOURCE).toContain("validateTopic(JSON.parse(cleaned))");
    // The rejected topic must not be pushed to the queue — a topic that reaches
    // the queue is published on the next run without being re-checked.
    const parseIdx = SOURCE.indexOf("validateTopic(JSON.parse(cleaned))");
    const pushIdx = SOURCE.indexOf("queue.topics.push(topic)");
    expect(parseIdx).toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(parseIdx);
    expect(SOURCE.slice(parseIdx, pushIdx)).toContain("candidate.ok");
  });

  it("re-validates a topic taken from the queue", () => {
    // Earlier runs wrote unvalidated topics to the file; trusting it republishes them.
    expect(SOURCE).toContain("const queued = validateTopic(topic)");
  });

  it("rejects each specific placeholder that reached production", () => {
    for (const marker of [
      '"kebab-case-slug"',
      "title under",
      "keyword",
      "xxx",
      "cta label",
    ]) {
      expect(SOURCE.toLowerCase()).toContain(marker.toLowerCase());
    }
  });

  it("falls back instead of crashing when the SEO agent returns nothing", () => {
    // `articleKeywords.join(", ")` threw "Cannot read properties of undefined
    // (reading 'join')" and 500'd every run.
    expect(SOURCE).toContain("seo?.expandedKeywords");
    expect(SOURCE).toContain("nextTopic.keywords");
  });
});

describe("published content carries no prompt placeholders", () => {
  it("manifest, queue and article files are clean", () => {
    const root = join(process.cwd(), "content/insights");
    const manifest = readFileSync(join(root, "manifest.json"), "utf8");
    const queue = readFileSync(join(root, "topic-queue.json"), "utf8");
    for (const [name, blob] of [["manifest", manifest], ["topic-queue", queue]] as const) {
      expect(blob, `${name} contains a prompt placeholder`).not.toContain("kebab-case-slug");
      expect(blob, `${name} contains a prompt placeholder`).not.toContain("Title Under 70 Chars");
      expect(blob, `${name} contains a prompt placeholder`).not.toContain("/tools/xxx");
      // The category field must be a single choice, never the pipe-joined list.
      expect(blob).not.toContain("valuation|cap-table|fundraising");
    }
  });
});
