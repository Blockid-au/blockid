// Colocated render test for the founder engagement heatmap (S21-A).
//
// Pins the dataviz contract: a one-hue sequential ramp with the value printed
// on every cell (colour never the only carrier), a scale legend beside the
// grid, a table twin with a caption, a screen-reader summary sentence, and
// honest empty states.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EngagementHeatmap, HEAT_STEPS, cellStyle, summarise } from "./engagement-heatmap";
import type { HeatmapModel } from "@/lib/dataroom/engagement";

const MODEL: HeatmapModel = {
  sections: ["Team", "Financials"],
  rows: [
    {
      linkId: "l1",
      label: "Jane · Blackbird",
      opens: 2,
      downloads: 1,
      totalDwellMs: 90_000,
      lastSeen: "2026-09-11T03:00:00Z",
      cells: [
        { linkId: "l1", section: "Team", views: 3, dwellMs: 80_000 },
        { linkId: "l1", section: "Financials", views: 1, dwellMs: 10_000 },
      ],
    },
    {
      linkId: "l2",
      label: "Anonymous link",
      opens: 0,
      downloads: 0,
      totalDwellMs: 0,
      lastSeen: null,
      cells: [
        { linkId: "l2", section: "Team", views: 0, dwellMs: 0 },
        { linkId: "l2", section: "Financials", views: 0, dwellMs: 0 },
      ],
    },
  ],
  maxDwellMs: 80_000,
  maxViews: 3,
  totalEvents: 7,
};

describe("EngagementHeatmap", () => {
  it("renders nothing without a room id", () => {
    expect(renderToStaticMarkup(<EngagementHeatmap dataRoomId={null} />)).toBe("");
  });

  it("grid: every opened cell prints its views and dwell, empty cells are marked, and the legend shows the ramp", () => {
    const html = renderToStaticMarkup(<EngagementHeatmap dataRoomId="room-1" initialModel={MODEL} />);
    expect(html).toContain('data-testid="engagement-heatmap"');
    expect(html).toContain("Jane · Blackbird");
    expect(html).toContain("2 opens · 1 download");
    // Darkest cell = Team for Jane (80s of 80s max → bucket 4).
    expect(html).toContain(`data-bucket="4"`);
    expect(html).toContain(`background-color:${HEAT_STEPS[3]}`);
    expect(html).toContain("1m 20s");
    // Financials for Jane: 10/80 = 12.5% → bucket 1 (lightest).
    expect(html).toContain(`data-bucket="1"`);
    // Not-opened cells are bucket 0 with a visible marker, not colour.
    expect(html).toContain(`data-bucket="0"`);
    expect(html).toContain('aria-label="not opened"');
    // Scale legend with every ramp step and the max.
    for (const hex of HEAT_STEPS) expect(html).toContain(`background-color:${hex}`);
    expect(html).toContain("1m 20s (longest)");
    // Screen-reader summary.
    expect(html).toContain("Longest read: Jane · Blackbird on Team, 1m 20s.");
  });

  it("cellStyle: dark text on the light steps, white on the dark ones, nothing for bucket 0", () => {
    expect(cellStyle(0)).toEqual({});
    expect(cellStyle(1)).toEqual({ backgroundColor: HEAT_STEPS[0], color: "#0f172a" });
    expect(cellStyle(2)).toEqual({ backgroundColor: HEAT_STEPS[1], color: "#0f172a" });
    expect(cellStyle(3)).toEqual({ backgroundColor: HEAT_STEPS[2], color: "#ffffff" });
    expect(cellStyle(4)).toEqual({ backgroundColor: HEAT_STEPS[3], color: "#ffffff" });
  });

  it("offers a table twin toggle when there is data", () => {
    const html = renderToStaticMarkup(<EngagementHeatmap dataRoomId="room-1" initialModel={MODEL} />);
    expect(html).toContain('aria-label="Heatmap view"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Grid");
    expect(html).toContain("Table");
  });

  it("empty states say what to do next, and never draw an empty grid", () => {
    const noLinks = renderToStaticMarkup(
      <EngagementHeatmap dataRoomId="room-1" initialModel={{ ...MODEL, rows: [], sections: [], totalEvents: 0 }} />,
    );
    expect(noLinks).toContain("No investor links yet");
    expect(noLinks).not.toContain("data-bucket");
    const noReads = renderToStaticMarkup(<EngagementHeatmap dataRoomId="room-1" initialModel={{ ...MODEL, totalEvents: 0 }} />);
    expect(noReads).toContain("No reads yet");
    expect(noReads).not.toContain("data-bucket");
  });

  it("summarise: one sentence with the longest read, or an honest nothing", () => {
    expect(summarise(MODEL)).toBe("2 investor links across 2 sections. Longest read: Jane · Blackbird on Team, 1m 20s.");
    expect(summarise({ ...MODEL, rows: [], totalEvents: 0 })).toBe("No engagement recorded yet.");
    expect(
      summarise({
        ...MODEL,
        rows: MODEL.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, dwellMs: 0 })) })),
      }),
    ).toBe("2 investor links, 7 events, no dwell recorded yet.");
  });
});
