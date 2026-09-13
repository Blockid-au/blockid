// Colocated render test for the board-resolution button (S26-B): idle
// button (editor) / nothing (viewer without a PDF), the show-cost-first
// preview card (title, company, directors or the blank-lines note, "1
// credit" vs "included", Generate / Cancel), and the ready state (PDF link
// with the watermark recipient, Save to data room for editors only).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardResolutionButton, KIND_LABEL, type ResolutionPreview } from "./board-resolution-button";

const PREVIEW: ResolutionPreview = {
  cost: 1,
  included: false,
  balance: 9,
  creditNote: "Charged to your credits.",
  company: { name: "Acme Robotics Pty Ltd", acn: "123 456 789", abn: null },
  directors: [{ name: "Jane Founder" }, { name: "Raj Cofounder" }],
  soleDirector: false,
  title: "Circulating resolution of the directors — issue of shares",
  facts: [{ label: "Allottee", value: "Seed Investor Pty Ltd" }, { label: "Number of shares", value: "400,000" }],
  existing: null,
};

describe("BoardResolutionButton", () => {
  it("idle: an editor sees the button, a viewer without a PDF sees nothing", () => {
    const editor = renderToStaticMarkup(<BoardResolutionButton kind="share-issue" recordId="r-1" canGenerate />);
    expect(editor).toContain('data-testid="board-resolution-start"');
    expect(editor).toContain("Board resolution");
    const viewer = renderToStaticMarkup(<BoardResolutionButton kind="share-issue" recordId="r-1" canGenerate={false} />);
    expect(viewer).toBe("");
  });

  it("preview: title, company, directors, cost before anything is charged, Generate / Cancel", () => {
    const html = renderToStaticMarkup(<BoardResolutionButton kind="share-issue" recordId="r-1" canGenerate initial={{ preview: PREVIEW }} />);
    expect(html).toContain('data-testid="board-resolution-preview"');
    expect(html).toContain("Circulating resolution of the directors — issue of shares");
    expect(html).toContain("Acme Robotics Pty Ltd · ACN 123 456 789 · circulating resolution (s 248A)");
    expect(html).toContain("Signature blocks: Jane Founder, Raj Cofounder");
    expect(html).toContain("Cost: 1 credit · balance 9 · Charged to your credits. Re-downloads are free.");
    expect(html).toContain("Generate (1 credit)");
    expect(html).toContain('data-testid="board-resolution-cancel"');
    expect(html).toContain("Allottee:");
    expect(html).toContain("400,000");
  });

  it("preview with no directors + included plan + sole director wording", () => {
    const html = renderToStaticMarkup(<BoardResolutionButton kind="esop" recordId="r-1" canGenerate initial={{ preview: { ...PREVIEW, directors: [], cost: 0, included: true, soleDirector: true } }} />);
    expect(html).toContain("No directors stored on the cap table");
    expect(html).toContain("blank signature lines");
    expect(html).toContain("sole director (s 248B)");
    expect(html).toContain("Generate (included in your plan)");
    expect(html).not.toContain("balance");
  });

  it("ready: PDF link, watermark recipient + Save to data room for editors; link only for viewers", () => {
    const editor = renderToStaticMarkup(<BoardResolutionButton kind="dividend" recordId="r-1" canGenerate initial={{ pdfUrl: "/api/board-resolutions/dividend/r-1/pdf" }} />);
    expect(editor).toContain('data-testid="board-resolution-ready"');
    expect(editor).toContain('href="/api/board-resolutions/dividend/r-1/pdf"');
    expect(editor).toContain("Prepared for (optional)");
    expect(editor).toContain('data-testid="board-resolution-dataroom"');
    const viewer = renderToStaticMarkup(<BoardResolutionButton kind="dividend" recordId="r-1" canGenerate={false} initial={{ pdfUrl: "/api/board-resolutions/dividend/r-1/pdf" }} />);
    expect(viewer).toContain("Resolution PDF");
    expect(viewer).not.toContain("Save to data room");
    expect(KIND_LABEL.esop).toBe("ESOP adoption");
  });

  it("S27-A ready + stale: Regenerate for editors, the stale hint, previous versions with versioned (superseded) links; viewers get neither button", () => {
    const versions = [
      { id: "br-2", version: 2, current: true, issuedAt: "2026-09-14T00:00:00Z", supersededAt: null, pdfUrl: "/api/board-resolutions/esop/r-1/pdf" },
      { id: "br-1", version: 1, current: false, issuedAt: "2026-09-13T00:00:00Z", supersededAt: "2026-09-14T00:00:00Z", pdfUrl: "/api/board-resolutions/esop/r-1/pdf?version=1" },
    ];
    const editor = renderToStaticMarkup(<BoardResolutionButton kind="esop" recordId="r-1" canGenerate initial={{ pdfUrl: "/api/board-resolutions/esop/r-1/pdf", stale: true, versions }} />);
    expect(editor).toContain('data-stale="1"');
    expect(editor).toContain('data-testid="board-resolution-regenerate"');
    expect(editor).toContain("The record changed after this resolution was generated");
    expect(editor).toContain('data-testid="board-resolution-versions"');
    expect(editor).toContain('href="/api/board-resolutions/esop/r-1/pdf?version=1"');
    expect(editor).toContain("v1");
    expect(editor).toContain("superseded 14 Sept 2026");
    expect(editor).not.toContain("v2</a>"); // the current version is the main PDF link, not a "previous" one
    const viewer = renderToStaticMarkup(<BoardResolutionButton kind="esop" recordId="r-1" canGenerate={false} initial={{ pdfUrl: "/api/board-resolutions/esop/r-1/pdf", stale: true, versions }} />);
    expect(viewer).not.toContain('data-testid="board-resolution-regenerate"');
    expect(viewer).toContain('data-testid="board-resolution-versions"');
  });

  it("S27-A regenerate preview: says the current version is superseded, the next version number, and the cost before the click", () => {
    const html = renderToStaticMarkup(<BoardResolutionButton kind="esop" recordId="r-1" canGenerate initial={{ pdfUrl: "/api/board-resolutions/esop/r-1/pdf", preview: { ...PREVIEW, regenerate: true, nextVersion: 2, existing: { pdfUrl: "/api/board-resolutions/esop/r-1/pdf", issuedAt: "2026-09-13T00:00:00Z" } } }} />);
    expect(html).toContain('data-testid="board-resolution-preview"');
    expect(html).toContain('data-testid="board-resolution-regenerate-note"');
    expect(html).toContain("Regenerating as v2");
    expect(html).toContain("marked SUPERSEDED");
    expect(html).toContain("Regenerate (1 credit)");
    expect(html).toContain("Cost: 1 credit · balance 9");
  });
});
