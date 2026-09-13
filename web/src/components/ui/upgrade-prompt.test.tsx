import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PLANS_V2 } from "@/lib/plans-v2";

vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  // useState(true) so the banner is visible in the static render
  return { ...actual, useState: (init: unknown) => [typeof init === "boolean" ? true : init, () => {}] };
});

import { UpgradePrompt } from "./upgrade-prompt";

describe("UpgradePrompt copy tracks the plan ladder (live QA 2026-09-13)", () => {
  it("prints Growth's live monthly price and credit allowance, never the stale A$99 / 100", () => {
    const growth = PLANS_V2.find((p) => p.id === "founder_growth")!;
    const html = renderToStaticMarkup(<UpgradePrompt />);
    expect(html).toContain(`A$${growth.monthly_aud}/mo`);
    expect(html).toContain("45 credits");
    expect(html).not.toContain("A$99");
    expect(html).not.toContain("100 credits");
  });
});
