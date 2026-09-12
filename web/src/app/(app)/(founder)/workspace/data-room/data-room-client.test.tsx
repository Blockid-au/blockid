// S18-B review P2-2 — DataRoomClient for a read-only viewer must not offer
// the paid / mutating CTAs at all ("Create Data Room in Google Drive",
// "Generate Data Room", AI Fill). The API routes already refuse a viewer;
// this pins the UI so the buttons are not rendered only to toast on click.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./investor-share-panel", () => ({ InvestorSharePanel: () => null }));

import { DataRoomClient } from "./data-room-client";

const ITEMS = [
  { id: "pitch", category: "Company", label: "Pitch deck", description: "d", dimension: "FTV" },
];
const FOLDERS = [
  {
    name: "01 Corporate",
    section: "corporate",
    stage: "idea" as const,
    priority: "P0" as const,
    description: "Formation documents",
    investorImpact: "critical" as const,
    documents: [{ name: "Constitution", type: "template" as const, description: "d", priority: "P0" as const }],
  },
];

function render(readOnly: boolean) {
  return renderToStaticMarkup(
    <DataRoomClient items={ITEMS} categories={["Company"]} initialStates={[]} templateStructure={FOLDERS} readOnly={readOnly} />,
  );
}

describe("DataRoomClient readOnly (S18-B P2-2)", () => {
  it("editable: Drive setup + one-click generator cards render", () => {
    const out = render(false);
    expect(out).toContain('data-testid="dataroom-drive-setup"');
    expect(out).toContain("Create Data Room in Google Drive");
    expect(out).toContain('data-testid="dataroom-generate"');
    expect(out).toContain("Generate Data Room");
  });

  it("readOnly: Drive setup, generator and upload CTAs are not rendered; the checklist still is", () => {
    const out = render(true);
    expect(out).not.toContain('data-testid="dataroom-drive-setup"');
    expect(out).not.toContain("Create Data Room in Google Drive");
    expect(out).not.toContain('data-testid="dataroom-generate"');
    expect(out).not.toContain("Generate Data Room");
    expect(out).not.toContain(">Upload<");
    expect(out).toContain("Pitch deck");
    expect(out).toContain("01 Corporate");
  });
});
