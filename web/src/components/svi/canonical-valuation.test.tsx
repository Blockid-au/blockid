import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CanonicalValuation } from "./canonical-valuation";
it("renders consensus and exact scenario points without inventing per-scenario ranges", () => {
  const html = renderToStaticMarkup(<CanonicalValuation valuation={{ currency: "AUD", consensus: { lowAud: 11000000, midAud: 12000000, highAud: 13000000, confidence: .7 }, scenarios: { bear: 9000000, base: 12000000, bull: 15000000 } }} />);
  for (const text of ["A$11M", "A$12M", "A$13M", "A$9M", "A$15M", "Bear", "Base", "Bull", "70%", "report estimate"]) expect(html).toContain(text);
  expect(html.match(/ – /g)).toHaveLength(1);
  expect(html).not.toContain("pre-money");
});
