// markdown-lite (G22-C): the dialect docs/api/institutional.md is written in
// renders to token-only HTML — title captured, h2/h3 with slug ids + toc,
// pipe tables, fenced code (escaped, never inline-processed), bullet lists
// with continuation lines, inline code / bold / links — and nothing a
// document can carry becomes markup (HTML escaped, unsafe hrefs dropped).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderInline, renderMarkdownLite, slugify } from "./lite";

const DOC = readFileSync(resolve(__dirname, "../../../../docs/api/institutional.md"), "utf8");

describe("renderMarkdownLite — the institutional API document", () => {
  const r = renderMarkdownLite(DOC);

  it("captures the H1 as the title and does not emit it; every `##` becomes an h2 with a slug id in the toc", () => {
    expect(r.title).toMatch(/^Institutional API/);
    expect(r.html).not.toContain("<h1");
    const h2s = [...DOC.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());
    expect(h2s.length).toBeGreaterThanOrEqual(8);
    expect(r.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual(h2s.map((t) => t.replace(/`/g, "")));
    for (const h of r.headings) expect(r.html).toContain(`<h${h.level} id="${h.id}" class="scroll-mt-24">`);
    expect(r.headings.find((h) => h.text === "Who it is for")?.id).toBe("who-it-is-for");
    expect(new Set(r.headings.map((h) => h.id)).size).toBe(r.headings.length);
  });

  it("renders the endpoint and status tables as real tables, the three code fences as <pre><code>, the bullet lists as <ul>", () => {
    expect((r.html.match(/<table>/g) ?? []).length).toBe((DOC.match(/^\|---/gm) ?? []).length);
    expect(r.html).toContain("<th scope=\"col\">Method</th>");
    expect((r.html.match(/<pre /g) ?? []).length).toBe((DOC.match(/^```[a-z]*$/gm) ?? []).length / 2);
    expect(r.html).toContain('data-lang="sh"');
    expect(r.html).toContain("Authorization: Bearer $BLOCKID_API_KEY");
    expect(r.html).toContain("<ul><li>");
    // no leftover markdown syntax in the output text
    expect(r.html).not.toMatch(/\*\*[^<]/);
    expect(r.html).not.toMatch(/^\|/m);
    expect(r.html).not.toContain("```");
  });

  it("uses token classes only (no raw hex, no bg-white / text-ink-*) and keeps wide content scrollable", () => {
    expect(r.html).not.toMatch(/#[0-9a-f]{6}\b/i);
    expect(r.html).not.toMatch(/bg-white|text-ink-|text-gray-|bg-gray-/);
    expect(r.html).toContain("overflow-x-auto");
    expect(r.html).toContain("[overflow-wrap:anywhere]");
  });
});

describe("renderInline + safety", () => {
  it("code spans keep their literal content (no bold/link processing inside) and obfuscate @", () => {
    expect(renderInline("see `**not bold**` and `a@b.c`")).toContain("<code");
    expect(renderInline("see `**not bold**`")).toContain("**not bold**");
    expect(renderInline("see `**not bold**`")).not.toContain("<strong>");
    expect(renderInline("`a@b.c`")).toContain("a&#64;b.c");
  });

  it("links: relative, anchor, https (rel=noopener) and mailto survive; javascript: is dropped to plain text", () => {
    expect(renderInline("[docs](/developers/api)")).toBe('<a href="/developers/api">docs</a>');
    expect(renderInline("[x](https://blockid.au/)")).toContain('rel="noopener"');
    expect(renderInline("[m](mailto:a@b.c)")).toContain('href="mailto:a@b.c"');
    expect(renderInline("[x](javascript:alert)")).toBe("x");
    expect(renderInline("[x](javascript:alert(1))")).not.toContain("href");
  });

  it("escapes HTML in paragraphs, cells and fences", () => {
    const r = renderMarkdownLite("para <script>x</script>\n\n| a | b |\n|---|---|\n| <b>1</b> | 2 |\n\n```\n<img src=x onerror=1>\n```\n");
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain("&lt;b&gt;1&lt;/b&gt;");
    expect(r.html).toContain("&lt;img src=x onerror=1&gt;");
  });

  it("bullet continuation lines join the item; a bare `---` is a rule; duplicate headings get unique ids", () => {
    const r = renderMarkdownLite("- first line\n  continues here\n- second\n\n---\n\n## Same\n\n## Same\n");
    expect(r.html).toContain("<li>first line continues here</li><li>second</li>");
    expect(r.html).toContain("<hr ");
    expect(r.headings.map((h) => h.id)).toEqual(["same", "same-2"]);
    expect(slugify("Benchmarks: the n-rules")).toBe("benchmarks-the-n-rules");
  });
});
