import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { extractDocumentVisuals } from "./visual-document";
import { extractVisualTranscript } from "./visual-transcript";

vi.mock("./visual-transcript", () => ({ extractVisualTranscript: vi.fn() }));
beforeEach(() => { vi.mocked(extractVisualTranscript).mockReset(); });

describe("Office archive visual reader", () => {
  it.each(["pptx", "docx"])("loads the real unzipper module and reads bounded %s media in memory", async extension => {
    const bytes = Buffer.from("synthetic embedded image bytes");
    const archive = new JSZip();
    const path = `${extension === "pptx" ? "ppt" : "word"}/media/image1.png`;
    archive.file(path, bytes);
    // Stop at the transcript boundary: never invoke OCR or paid inference.
    vi.mocked(extractVisualTranscript).mockRejectedValue(new Error("synthetic transcript unavailable"));
    const result = await extractDocumentVisuals(await archive.generateAsync({ type: "nodebuffer" }), `fixture.${extension}`);
    expect(extractVisualTranscript).toHaveBeenCalledOnce();
    expect(vi.mocked(extractVisualTranscript).mock.calls[0][0]).toEqual(bytes);
    expect(result.units).toEqual([expect.objectContaining({ locator: path, state: "unreadable" })]);
    expect(result.units.some(unit => unit.locator === "document")).toBe(false);
  });
  it("reports malformed archives without invoking transcription", async () => {
    const result = await extractDocumentVisuals(Buffer.from("invalid ZIP"), "fixture.pptx");
    expect(result.units).toEqual([expect.objectContaining({ locator: "document", state: "unsupported" })]);
    expect(extractVisualTranscript).not.toHaveBeenCalled();
  });
});
