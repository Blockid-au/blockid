// G24 UI lane: the demo banner's first action is quiet (neutral secondary);
// only the confirm step carries the danger tone. Both buttons keep the 44 px
// hit area and a focus ring.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { LoadDemoCohortButton, RemoveDemoCohortButton } from "./DemoCohortActions";

describe("DemoCohortActions (G24-C)", () => {
  it("Remove demo cohort opens as a neutral secondary button, not a red one", () => {
    const html = renderToStaticMarkup(<RemoveDemoCohortButton />);
    const btn = html.match(/<button[^>]*data-testid="remove-demo-cohort"[^>]*>/)?.[0] ?? "";
    expect(btn).toContain("min-h-11");
    expect(btn).toContain("focus-visible:ring-2");
    expect(btn).toContain("text-primary");
    expect(btn).not.toContain("text-bear");
  });

  it("Load a demo cohort is a 44 px secondary button with a focus ring", () => {
    const html = renderToStaticMarkup(<LoadDemoCohortButton />);
    const btn = html.match(/<button[^>]*data-testid="load-demo-cohort"[^>]*>/)?.[0] ?? "";
    expect(btn).toContain("min-h-11");
    expect(btn).toContain("focus-visible:ring-2");
  });
});
