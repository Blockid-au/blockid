/**
 * Every /insights manifest entry must resolve to a real article file, and none
 * may carry prompt placeholders.
 *
 * Both failures were live at once. The publisher writes manifest.json from
 * unvalidated model output, so it accumulated:
 *
 *   * slug "kebab-case-slug", title "Title Under 70 Chars" — the prompt's own
 *     example, published twice; and
 *   * slug "...", title "..." — an entry with no article file behind it, which
 *     still rendered on the /insights index and 404'd when clicked.
 *
 * The index renders from the manifest, so a bad entry is a broken link in front
 * of every visitor. validateTopic() now stops these at the source; this is the
 * backstop that catches anything already on disk.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "content", "insights");

type Article = { slug?: unknown; title?: unknown; category?: unknown };

function articles(): Article[] {
  const raw = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
  return Array.isArray(raw) ? raw : raw.articles;
}

// lib/insights resolves `${slug}.md` or `${slug}.mdx`.
const resolves = (slug: string) =>
  existsSync(join(DIR, `${slug}.md`)) || existsSync(join(DIR, `${slug}.mdx`));

describe("insights manifest", () => {
  it("has entries at all (a silently empty manifest must not pass)", () => {
    expect(articles().length).toBeGreaterThan(50);
  });

  it("every entry resolves to an article file", () => {
    const dead = articles()
      .map((a) => String(a.slug ?? ""))
      .filter((slug) => !resolves(slug));
    expect(
      dead,
      `These manifest entries have no .md/.mdx file. They render on the ` +
        `/insights index and 404 when clicked:\n  ${dead.join("\n  ")}`,
    ).toEqual([]);
  });

  it("no entry carries a prompt placeholder", () => {
    const PLACEHOLDERS = ["...", "kebab-case-slug", "Title Under 70 Chars", "CTA Label"];
    const bad: string[] = [];
    for (const a of articles()) {
      const slug = String(a.slug ?? "");
      const blob = JSON.stringify(a);
      if (PLACEHOLDERS.includes(slug)) bad.push(`${slug}: slug is a placeholder`);
      else if (PLACEHOLDERS.includes(String(a.title ?? ""))) bad.push(`${slug}: title is a placeholder`);
      // category must be one choice, never the pipe-joined list of options
      else if (String(a.category ?? "").includes("|")) bad.push(`${slug}: category is the option list`);
      else if (blob.includes("keyword1") || blob.includes("/tools/xxx")) bad.push(`${slug}: prompt fragment`);
    }
    expect(bad, bad.join("\n  ")).toEqual([]);
  });
});
