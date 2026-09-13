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
});
