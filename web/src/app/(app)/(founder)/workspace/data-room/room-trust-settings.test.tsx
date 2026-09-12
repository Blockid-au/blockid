// Colocated render test for the founder trust settings panel (S21-A).
//
// Pins the three states: editable for an entitled owner/admin; disabled with
// the view-only line for a viewer/editor; disabled with the upgrade line for
// a Free owner. Also the acceptance ledger rendering.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomTrustSettings, type TrustSettings } from "./room-trust-settings";

const SETTINGS: TrustSettings = {
  dataRoomId: "room-1",
  ndaRequired: true,
  ndaText: "Keep it secret.",
  ndaVersion: 2,
  watermarkEnabled: false,
  defaultNdaText: "Mutual confidentiality. …",
  entitled: true,
  feature: "investor_links.premium",
  canEdit: true,
  role: "owner",
};

const ACCEPTANCES = [
  { id: "a1", linkId: "l1", version: 2, viewerEmail: "jane@bb.vc", uaFamily: "chrome", acceptedAt: "2026-09-11T03:00:00Z" },
];

describe("RoomTrustSettings", () => {
  it("renders nothing without a room id", () => {
    expect(renderToStaticMarkup(<RoomTrustSettings dataRoomId={null} />)).toBe("");
  });

  it("entitled owner: live controls reflecting the stored values, the clause, the version, and the not-legal-advice line", () => {
    const html = renderToStaticMarkup(
      <RoomTrustSettings dataRoomId="room-1" initial={{ settings: SETTINGS, acceptances: [] }} />,
    );
    expect(html).toContain('data-testid="trust-nda-toggle"');
    expect(html).toMatch(/id="trust-nda"[^>]*checked=""/);
    expect(html).not.toMatch(/id="trust-nda"[^>]*disabled=""/);
    expect(html).toContain("Keep it secret.");
    expect(html).toContain("Version 2.");
    expect(html).toContain("does not constitute legal advice");
    expect(html).toContain('data-testid="trust-nda-bump"');
    expect(html).toContain('data-testid="trust-watermark-toggle"');
    expect(html).not.toContain('data-testid="trust-locked"');
    expect(html).not.toContain('data-testid="trust-readonly"');
  });

  it("viewer on a shared project: every control disabled and the view-only line names the role", () => {
    const html = renderToStaticMarkup(
      <RoomTrustSettings
        dataRoomId="room-1"
        readOnly
        initial={{ settings: { ...SETTINGS, canEdit: false, role: "viewer" }, acceptances: [] }}
      />,
    );
    expect(html).toContain('data-testid="trust-readonly"');
    expect(html).toContain("You have viewer access");
    expect(html).toMatch(/id="trust-nda"[^>]*disabled=""/);
    expect(html).toMatch(/id="trust-nda-text"[^>]*disabled=""/);
    expect(html).toMatch(/id="trust-watermark"[^>]*disabled=""/);
  });

  it("server says canEdit:false even without the readOnly prop → still disabled (server is the authority)", () => {
    const html = renderToStaticMarkup(
      <RoomTrustSettings dataRoomId="room-1" initial={{ settings: { ...SETTINGS, canEdit: false, role: "editor" }, acceptances: [] }} />,
    );
    expect(html).toMatch(/id="trust-nda"[^>]*disabled=""/);
    expect(html).toContain("You have editor access");
  });

  it("Free owner: controls disabled, upgrade line links to pricing with the feature key, stored values still shown", () => {
    const html = renderToStaticMarkup(
      <RoomTrustSettings dataRoomId="room-1" initial={{ settings: { ...SETTINGS, entitled: false }, acceptances: [] }} />,
    );
    expect(html).toContain('data-testid="trust-locked"');
    expect(html).toContain("/pricing?feature=investor_links.premium");
    expect(html).toContain("Starter and above");
    expect(html).toMatch(/id="trust-nda"[^>]*disabled=""/);
    expect(html).toContain("Keep it secret.");
  });

  it("lists NDA acceptances with the link's name, version, time and browser family", () => {
    const html = renderToStaticMarkup(
      <RoomTrustSettings
        dataRoomId="room-1"
        initial={{ settings: SETTINGS, acceptances: ACCEPTANCES }}
        linkLabels={{ l1: "Jane · Blackbird" }}
      />,
    );
    expect(html).toContain('data-testid="trust-acceptances"');
    expect(html).toContain("Jane · Blackbird");
    expect(html).toContain("jane@bb.vc");
    expect(html).toContain("v2 ·");
    expect(html).toContain("· chrome");
  });
});
