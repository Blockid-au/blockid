// Colocated vitest for the previously-untested DOCX generator at
// `web/src/lib/docx/svi-report-docx.ts`. The module owns a single public
// export `generateSVIDocx(report, images?)` which the SVI report pipeline
// calls to produce the paid founder-facing Word deliverable (see
// `web/src/app/api/reports/[orderId]/route.ts:299` and
// `web/src/app/api/svi/docx/route.ts:208`) — a silent regression here breaks
// a paid surface, so this suite pins the visible contract.
//
// The generator is 847 lines but exports only one function; every helper
// (cover page, TOC, markdown → paragraphs, inline formatter, table parser,
// score badge, quality summary, disclaimer, header/footer) is exercised
// through the public contract by feeding fixture reports whose content
// carries a token we then observe in the emitted DOCX. Since a DOCX is a
// ZIP of XML parts, we unzip via JSZip (already a docx runtime dep) and
// grep `word/document.xml` / `word/header*.xml` / `word/footer*.xml`. This
// keeps the tests behavioural — internals are not exported by design.

import { describe, expect, it, beforeAll } from "vitest";
import JSZip from "jszip";
import { generateSVIDocx } from "./svi-report-docx";
import type {
  AssembledReport,
  ReportSection,
} from "@/lib/report-pipeline/types";
import { AGENT_ROLES } from "@/lib/report-pipeline/types";

// 1×1 red PNG so ImageRun has a valid payload to embed.
const RED_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function emptyAgentContributions(): AssembledReport["agentContributions"] {
  const acc = {} as AssembledReport["agentContributions"];
  for (const role of AGENT_ROLES) {
    acc[role] = { criteria: [], wordCount: 0 };
  }
  return acc;
}

function makeSection(overrides: Partial<ReportSection> = {}): ReportSection {
  return {
    id: "s1",
    title: "Section One",
    agentRole: "ceo",
    content: "Plain paragraph.",
    visuals: [],
    wordCount: 2,
    ...overrides,
  };
}

function makeReport(overrides: Partial<AssembledReport> = {}): AssembledReport {
  return {
    id: "r1",
    title: "Acme SVI Report",
    tier: "premium",
    sections: [makeSection()],
    charts: [],
    executiveSummary: "",
    qualityScore: 88,
    totalWords: 1234,
    consistencyIssues: [],
    agentContributions: emptyAgentContributions(),
    markdown: "",
    createdAt: "2026-08-06T12:00:00.000Z",
    ...overrides,
  };
}

async function unzip(buffer: Buffer): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(buffer);
  const out: Record<string, string> = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir) out[name] = await entry.async("string");
  }
  return out;
}

/**
 * Concatenate every `<w:t>` run in document.xml, delimited by `|` so
 * individual runs remain searchable without cross-run collision.
 */
function textOf(files: Record<string, string>): string {
  const xml = files["word/document.xml"] ?? "";
  const runs: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) runs.push(m[1]);
  return runs.join("|");
}

let base: { buffer: Buffer; files: Record<string, string>; text: string };

beforeAll(async () => {
  const buffer = await generateSVIDocx(makeReport());
  const files = await unzip(buffer);
  base = { buffer, files, text: textOf(files) };
});

// ── 1. Public contract ────────────────────────────────────────────────────

describe("generateSVIDocx — public contract", () => {
  it("is an async function", () => {
    expect(typeof generateSVIDocx).toBe("function");
    expect(generateSVIDocx.constructor.name).toBe("AsyncFunction");
  });

  it("resolves to a Node Buffer", () => {
    expect(Buffer.isBuffer(base.buffer)).toBe(true);
  });

  it("produces a non-trivial payload (>4 KB)", () => {
    expect(base.buffer.byteLength).toBeGreaterThan(4096);
  });

  it("starts with the ZIP local-file-header magic (PK\\x03\\x04)", () => {
    expect(base.buffer.slice(0, 4).toString("hex")).toBe("504b0304");
  });

  it("unzips to a valid OOXML package containing word/document.xml", () => {
    expect(base.files["word/document.xml"]).toBeTruthy();
    expect(base.files["word/document.xml"]).toMatch(/<w:document/);
  });

  it("emits [Content_Types].xml required by the OOXML spec", () => {
    expect(base.files["[Content_Types].xml"]).toMatch(
      /Content_Types|word\/document/,
    );
  });

  it("includes at least one header and one footer part", () => {
    const names = Object.keys(base.files);
    expect(names.some((n) => /word\/header/.test(n))).toBe(true);
    expect(names.some((n) => /word\/footer/.test(n))).toBe(true);
  });
});

// ── 2. Cover page copy ────────────────────────────────────────────────────

describe("generateSVIDocx — cover page copy", () => {
  it("stamps the BLOCKID.AU brand mark", () => {
    expect(base.text).toContain("BLOCKID.AU");
  });

  it("stamps the Startup Value Index subtitle", () => {
    expect(base.text).toContain("Startup Value Index — Enhanced Report");
  });

  it("prints the report title verbatim", () => {
    expect(base.text).toContain("Acme SVI Report");
  });

  it("prints the cover quality-score badge", () => {
    expect(base.text).toContain("Quality Score: 88/100");
  });

  it("prints the word count using the runtime's localeString formatter", async () => {
    const totalWords = 5678;
    const buffer = await generateSVIDocx(makeReport({ totalWords }));
    const text = textOf(await unzip(buffer));
    expect(text).toContain(`${totalWords.toLocaleString()} words`);
  });

  it("prints the section count on the cover", () => {
    expect(base.text).toContain("1 sections");
  });

  it("prints the createdAt date in AU long form", async () => {
    const createdAt = "2026-08-06T12:00:00.000Z";
    const expected = new Date(createdAt).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const buffer = await generateSVIDocx(makeReport({ createdAt }));
    const text = textOf(await unzip(buffer));
    expect(text).toContain(expected);
  });

  it("stamps the Auschain legal entity + ACN on the cover", () => {
    expect(base.text).toContain("Auschain PTY LTD  |  ACN 659 615 111");
  });
});

// ── 3. Tier badges ───────────────────────────────────────────────────────

describe("generateSVIDocx — tier badges", () => {
  it("renders 'Standard Report' for the standard tier", async () => {
    const buffer = await generateSVIDocx(makeReport({ tier: "standard" }));
    expect(textOf(await unzip(buffer))).toContain("Standard Report");
  });

  it("renders 'Premium Report' for the premium tier", () => {
    expect(base.text).toContain("Premium Report");
  });

  it("renders 'Investor Memo' for the investor_memo tier", async () => {
    const buffer = await generateSVIDocx(makeReport({ tier: "investor_memo" }));
    expect(textOf(await unzip(buffer))).toContain("Investor Memo");
  });
});

// ── 4. Table of contents + section rendering ─────────────────────────────

describe("generateSVIDocx — TOC + section rendering", () => {
  it("emits a Table of Contents heading", () => {
    expect(base.text).toContain("Table of Contents");
  });

  it("lists each section in the TOC with '(score/100)' when scored", async () => {
    const buffer = await generateSVIDocx(
      makeReport({
        sections: [
          makeSection({ id: "one", title: "Idea Fit", score: 82 }),
          makeSection({ id: "two", title: "Team", score: undefined }),
        ],
      }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("1. Idea Fit  (82/100)");
    expect(text).toContain("2. Team");
    // no "(undefined/100)" or "(NaN/100)" leaks when score is missing
    expect(text).not.toMatch(/\(undefined\/100\)/);
    expect(text).not.toMatch(/\(NaN\/100\)/);
  });

  it("renders the per-section 'Score: X/100' + 'Analyst: ROLE' badge", async () => {
    const buffer = await generateSVIDocx(
      makeReport({
        sections: [
          makeSection({ id: "s1", agentRole: "cto", score: 91, content: "x" }),
        ],
      }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("Score: 91/100");
    expect(text).toContain("Analyst: CTO");
  });

  it("omits the badge when the section has no score", async () => {
    const buffer = await generateSVIDocx(
      makeReport({
        sections: [
          makeSection({ id: "s1", agentRole: "cfo", score: undefined }),
        ],
      }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).not.toMatch(/Score:\s*undefined/);
    expect(text).not.toContain("Analyst: CFO");
  });

  it("skips a section whose id === 'executive' (already on the exec page)", async () => {
    const buffer = await generateSVIDocx(
      makeReport({
        executiveSummary: "The summary body.",
        sections: [
          makeSection({
            id: "executive",
            title: "SHOULD NOT APPEAR",
            content: "duplicate-body",
          }),
          makeSection({ id: "keep", title: "Real Section" }),
        ],
      }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("Executive Summary");
    expect(text).toContain("The summary body.");
    expect(text).not.toContain("duplicate-body");
    expect(text).toContain("Real Section");
  });

  it("skips the executive-summary block when the field is blank", async () => {
    const buffer = await generateSVIDocx(makeReport({ executiveSummary: "" }));
    const text = textOf(await unzip(buffer));
    expect(text).not.toContain("Executive Summary");
  });
});

// ── 5. Quality-summary block ─────────────────────────────────────────────

describe("generateSVIDocx — quality summary block", () => {
  it("emits the 'Report Quality Summary' heading", () => {
    expect(base.text).toContain("Report Quality Summary");
  });

  it("summarises score, words, sections, tier, and consistency-issue count", async () => {
    const contributions = emptyAgentContributions();
    contributions.ceo = { criteria: ["idea", "team"], wordCount: 250 };
    const buffer = await generateSVIDocx(
      makeReport({
        qualityScore: 77,
        totalWords: 2500,
        tier: "standard",
        sections: [makeSection(), makeSection({ id: "s2", title: "Two" })],
        consistencyIssues: [
          { severity: "warning", message: "x" } as unknown as never,
        ],
        agentContributions: contributions,
      }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("Overall Quality Score: 77/100");
    expect(text).toContain(`Total Word Count: ${(2500).toLocaleString()}`);
    expect(text).toContain("Sections: 2");
    expect(text).toContain("Tier: standard");
    expect(text).toContain("Consistency Issues: 1");
    expect(text).toContain("Agent Contributions: CEO: 250 words (2 criteria)");
  });

  it("omits the 'Agent Contributions:' line when no agent has any words", () => {
    // base fixture has every agent at wordCount=0 → filter yields empty summary
    expect(base.text).not.toContain("Agent Contributions:");
  });
});

// ── 6. Disclaimer + running header/footer ────────────────────────────────

describe("generateSVIDocx — disclaimer + running chrome", () => {
  it("emits a mandatory 'Disclaimer:' block", () => {
    expect(base.text).toContain("Disclaimer:");
  });

  it("names Auschain PTY LTD + ACN in the disclaimer body", () => {
    expect(base.text).toContain("Auschain PTY LTD (ACN 659 615 111)");
  });

  it("carries the 'Not financial advice' line in the running footer part", () => {
    const footers = Object.entries(base.files)
      .filter(([n]) => /word\/footer\d*\.xml$/.test(n))
      .map(([, x]) => x)
      .join("\n");
    expect(footers).toMatch(/Generated by BlockID\.au — Not financial advice/);
  });

  it("carries the report title in the running header part", () => {
    const headers = Object.entries(base.files)
      .filter(([n]) => /word\/header\d*\.xml$/.test(n))
      .map(([, x]) => x)
      .join("\n");
    expect(headers).toContain("BlockID.au");
    expect(headers).toContain("Acme SVI Report");
  });
});

// ── 7. Markdown → paragraph converter ────────────────────────────────────

describe("generateSVIDocx — markdown converter", () => {
  it("strips ATX heading markers ('# ', '## ', '### ')", async () => {
    const buffer = await generateSVIDocx(
      makeReport({
        executiveSummary: "# H One\n## H Two\n### H Three\nBody line.",
      }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("H One");
    expect(text).toContain("H Two");
    expect(text).toContain("H Three");
    expect(text).not.toContain("# H One");
    expect(text).not.toContain("## H Two");
    expect(text).not.toContain("### H Three");
  });

  it("emits a Heading1 style for a '# ' line inside a section body", async () => {
    const buffer = await generateSVIDocx(
      makeReport({
        sections: [makeSection({ content: "# body heading" })],
      }),
    );
    const doc = (await unzip(buffer))["word/document.xml"] ?? "";
    expect(doc).toMatch(/Heading1/);
  });

  it("strips '**bold**' delimiters from bold runs", async () => {
    const buffer = await generateSVIDocx(
      makeReport({ executiveSummary: "This is **bold word** here." }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("bold word");
    expect(text).not.toContain("**bold word**");
  });

  it("strips single '*italic*' delimiters from italic runs", async () => {
    const buffer = await generateSVIDocx(
      makeReport({ executiveSummary: "See *the italic word* today." }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("the italic word");
    expect(text).not.toContain("*the italic word*");
  });

  it("strips backticks from inline `code` runs", async () => {
    const buffer = await generateSVIDocx(
      makeReport({ executiveSummary: "Run `npm test` locally." }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("npm test");
    expect(text).not.toContain("`npm test`");
  });

  it("strips '- ', '* ', and '+ ' bullet markers", async () => {
    const buffer = await generateSVIDocx(
      makeReport({
        executiveSummary: "- dash item\n* star item\n+ plus item",
      }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("dash item");
    expect(text).toContain("star item");
    expect(text).toContain("plus item");
    expect(text).not.toContain("- dash item");
    expect(text).not.toContain("+ plus item");
  });

  it("strips '1.'-style ordered-list markers", async () => {
    const buffer = await generateSVIDocx(
      makeReport({ executiveSummary: "1. first item\n2. second item" }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("first item");
    expect(text).toContain("second item");
    expect(text).not.toContain("1. first item");
    expect(text).not.toContain("2. second item");
  });

  it("strips the '> ' blockquote marker", async () => {
    const buffer = await generateSVIDocx(
      makeReport({ executiveSummary: "> quoted line" }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("quoted line");
    expect(text).not.toContain("> quoted line");
  });

  it("collapses '---' and '***' HR tokens to a border paragraph (no glyph)", async () => {
    const buffer = await generateSVIDocx(
      makeReport({ executiveSummary: "before\n---\n***\nafter" }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("before");
    expect(text).toContain("after");
    expect(text).not.toContain("---");
    expect(text).not.toContain("***");
  });

  it("skips blank lines without emitting empty text runs", async () => {
    const buffer = await generateSVIDocx(
      makeReport({ executiveSummary: "one\n\n\ntwo" }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("one");
    expect(text).toContain("two");
    // no run made purely of whitespace from the blanks
    expect(text.split("|").filter((r) => r === "" || /^\s+$/.test(r))).toEqual(
      [],
    );
  });

  it("renders a pipe-delimited markdown table and drops the separator row", async () => {
    const buffer = await generateSVIDocx(
      makeReport({
        executiveSummary:
          "| Col A | Col B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |",
      }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("Col A");
    expect(text).toContain("Col B");
    expect(text).toContain("a1");
    expect(text).toContain("b1");
    expect(text).toContain("a2");
    expect(text).toContain("b2");
    // separator row was filtered — no literal "---" text run
    expect(text).not.toContain("---");
  });

  it("treats a 2-space-indented '- ' line as a nested bullet (preserves content)", async () => {
    const buffer = await generateSVIDocx(
      makeReport({ executiveSummary: "- top\n  - nested" }),
    );
    const text = textOf(await unzip(buffer));
    expect(text).toContain("top");
    expect(text).toContain("nested");
  });
});

// ── 8. Image embedding ───────────────────────────────────────────────────

describe("generateSVIDocx — image embedding", () => {
  it("embeds a section-matched image as a word/media/* part", async () => {
    const images = new Map([
      ["s1", { base64: RED_PNG_BASE64, mimeType: "image/png" }],
    ]);
    const buffer = await generateSVIDocx(makeReport(), images);
    const files = await unzip(buffer);
    const mediaFiles = Object.keys(files).filter((n) =>
      n.startsWith("word/media/"),
    );
    expect(mediaFiles.length).toBeGreaterThan(0);
  });

  it("does not embed anything when the section id is missing from the map", async () => {
    const images = new Map([
      ["nomatch", { base64: RED_PNG_BASE64, mimeType: "image/png" }],
    ]);
    const buffer = await generateSVIDocx(makeReport(), images);
    const files = await unzip(buffer);
    const mediaFiles = Object.keys(files).filter((n) =>
      n.startsWith("word/media/"),
    );
    expect(mediaFiles.length).toBe(0);
  });

  it("still resolves to a valid PK-prefixed buffer when no images arg is passed", () => {
    // base fixture path — asserts the images-optional signature holds
    expect(base.buffer.slice(0, 4).toString("hex")).toBe("504b0304");
  });
});

// ── 9. Multi-section resilience ──────────────────────────────────────────

describe("generateSVIDocx — multi-section resilience", () => {
  it("renders every non-executive section title (TOC + heading)", async () => {
    const buffer = await generateSVIDocx(
      makeReport({
        sections: [
          makeSection({ id: "s1", title: "Alpha" }),
          makeSection({ id: "s2", title: "Beta" }),
          makeSection({ id: "s3", title: "Gamma" }),
        ],
      }),
    );
    const text = textOf(await unzip(buffer));
    for (let i = 0; i < 3; i++) {
      const title = ["Alpha", "Beta", "Gamma"][i];
      // TOC uses "N. Title" in one run; the section heading uses the bare
      // title in another run — both must be present.
      expect(text).toContain(`${i + 1}. ${title}`);
      expect(text.split("|").some((r) => r === title)).toBe(true);
    }
  });

  it("still emits TOC + quality summary + disclaimer when sections[] is empty", async () => {
    const buffer = await generateSVIDocx(makeReport({ sections: [] }));
    expect(Buffer.isBuffer(buffer)).toBe(true);
    const text = textOf(await unzip(buffer));
    expect(text).toContain("Table of Contents");
    expect(text).toContain("Report Quality Summary");
    expect(text).toContain("Disclaimer:");
  });
});
