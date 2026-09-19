import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { freeFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { TbrLockedChapterPreview, firstSentence } from "./locked-preview";

describe("firstSentence", () => {
  it("returns the first sentence only", () => {
    expect(firstSentence("Revenue is early. Two pilots are unpaid. Churn unknown.")).toBe("Revenue is early.");
    expect(firstSentence("  Strong team!  Next: hire. ")).toBe("Strong team!");
  });
  it("falls back to the whole text when there is no terminator, truncating long text with an ellipsis", () => {
    expect(firstSentence("no terminator here")).toBe("no terminator here");
    const long = "a".repeat(300);
    const out = firstSentence(long);
    expect(out.length).toBeLessThanOrEqual(220);
    expect(out.endsWith("…")).toBe(true);
  });
  it("is empty for empty input", () => {
    expect(firstSentence("   ")).toBe("");
  });
});

describe("<TbrLockedChapterPreview>", () => {
  it("renders the first sentence, a skeleton (no svg role=img) and the locked marker", () => {
    const card = freeFixtureReportV2().dimensions.find((d) => d.renderAs === "card")!;
    const html = renderToStaticMarkup(<TbrLockedChapterPreview chapter={card} />);
    expect(html).toContain(`data-tbr-locked="${card.dim}"`);
    expect(html).toContain('data-tbr-skeleton="visual"');
    expect(html).toContain(firstSentence(card.verdict).replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
  });
});
