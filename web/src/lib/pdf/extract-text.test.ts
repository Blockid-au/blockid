// extract-text (S-R5) — pdf-parse v2 path over a real (fixture) PDF, the
// byte-scan fallback, and the empty-buffer guard.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { byteScanText, extractPdfTextFromBuffer } from "./extract-text";

describe("extractPdfTextFromBuffer", () => {
  it("reads a real PDF through pdf-parse v2", async () => {
    const buf = readFileSync(path.join(process.cwd(), "test-fixtures", "linkedin", "jane-doe.pdf"));
    const r = await extractPdfTextFromBuffer(buf);
    expect(r.engine).toBe("pdf-parse-v2");
    expect(r.pages).toBe(1);
    expect(r.pageTexts?.[0]).toMatchObject({ page: 1, text: expect.stringContaining("Jane Doe") });
    expect(r.text).toContain("Jane Doe");
    expect(r.text).toContain("Acme Health");
  }, 30_000);

  it("non-PDF bytes stay empty unless a diagnostic byte view is explicitly requested", async () => {
    const junk = Buffer.from("plain text pretending to be a PDF");
    expect((await extractPdfTextFromBuffer(junk)).engine).toBe("none");
    expect((await extractPdfTextFromBuffer(junk, { byteScanFallback: true })).engine).toBe("byte-scan");
    expect((await extractPdfTextFromBuffer(junk, { byteScanFallback: false })).text).toBe("");
    expect(byteScanText(Buffer.concat([Buffer.from("abc"), Buffer.from([1, 2]), Buffer.from("def")]))).toBe("abc def");
  });

  it("empty buffer → none", async () => {
    expect(await extractPdfTextFromBuffer(Buffer.alloc(0))).toEqual({ text: "", pages: 0, engine: "none" });
  });
});
