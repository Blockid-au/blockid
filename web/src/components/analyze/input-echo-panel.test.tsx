// Colocated spec for InputEchoPanel (S32-B). Static render: every row shows
// its value + source, or "Not provided" + the hint; the count line; slide
// chips; warnings.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { InputEchoPanel } from "./input-echo-panel";
import { buildInputEcho } from "@/lib/analyses/input-echo";

describe("InputEchoPanel", () => {
  it("shows found facts with their source and missing ones as 'Not provided' with a hint", () => {
    const slides = ["Ferrous\nRecycled steel marketplace for builders", "Traction\n1,200 users on the waitlist"];
    const echo = buildInputEcho(
      { inputKind: "pitch_deck", rawText: slides.join("\n\n"), structured: { slides }, signals: { sector: "marketplace" }, context: { stage: 1 }, warnings: ["PDF looked scanned"] },
      { filename: "deck.pdf" },
    );
    const html = renderToStaticMarkup(<InputEchoPanel echo={echo} />);
    expect(html).toContain("What we read");
    expect(html).toContain(`${echo.provided} of ${echo.total} facts found`);
    expect(html).toContain("1,200 users");
    expect(html).toContain("from slide 2");
    expect(html).toContain("Marketplace / Platform");
    expect(html).toContain("Not provided");
    expect(html).toContain("How much you are raising and what it funds.");
    expect(html).toContain('data-testid="analyze-echo-slides"');
    expect(html).toContain("PDF looked scanned");
    expect(html).toContain('data-testid="analyze-echo-claims-toggle"');
  });

  it("renders an all-missing echo without throwing", () => {
    const echo = buildInputEcho({ inputKind: "idea_text", rawText: "", structured: {}, signals: {} });
    const html = renderToStaticMarkup(<InputEchoPanel echo={echo} />);
    expect(html).toContain("0 of 10 facts found");
    expect((html.match(/Not provided/g) ?? []).length).toBe(10);
  });
});
