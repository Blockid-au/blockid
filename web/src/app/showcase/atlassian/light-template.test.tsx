// G26-M — the Atlassian walkthrough pages render on the light template.
// Before G26 they carried dark cards (`bg-black/40`, `border-white/10`,
// `text-ink-50…300`) on a white page: 1.05:1 body contrast on /data-room.
// This suite renders each static page and pins: no dark surface, no `dark:`
// variant, no light-on-dark text class, one h1.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, refresh: () => {} }),
  usePathname: () => "/showcase/atlassian",
  useSearchParams: () => new URLSearchParams(),
}));

import { expectLightSurfaces } from "@/test/light-surface";
import AgentsPage from "./agents/page";
import DataRoomPage from "./data-room/page";
import ValuationPage from "./valuation/page";
import DashboardPage from "./dashboard/page";
import GrowthPhasesPage from "./growth-phases/page";
import SviReportPage from "./svi-report/page";
import SummaryPage from "./summary/page";

const PAGES: Array<[string, () => React.ReactElement]> = [
  ["agents", AgentsPage],
  ["data-room", DataRoomPage],
  ["valuation", ValuationPage],
  ["dashboard", DashboardPage],
  ["growth-phases", GrowthPhasesPage],
  ["svi-report", SviReportPage],
  ["summary", SummaryPage],
];

const LIGHT_ON_DARK_TEXT = /class="[^"]*\btext-(?:ink-(?:50|100|200|300)|slate-(?:100|200|300|400))\b/;

describe.each(PAGES)("/showcase/atlassian/%s — light template (G26)", (slug, Page) => {
  const html = renderToStaticMarkup(<Page />);

  it("paints no dark surface and no dark: variant", () => {
    expectLightSurfaces(html, `/showcase/atlassian/${slug}`, { whole: true });
    expect(html).not.toMatch(/\bdark:/);
  });

  it("never sets light-on-dark text classes on a light card", () => {
    expect(html).not.toMatch(LIGHT_ON_DARK_TEXT);
  });

  it("renders exactly one h1", () => {
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
  });
});
