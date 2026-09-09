import { describe, expect, it } from "vitest";

import { pdfPageCount, pdfPageCountsAgree } from "./page-count";

/** The smallest thing that looks like the bit of a PDF we read. */
function fakePdf(pages: number, extra = ""): Buffer {
  const objects = Array.from(
    { length: pages },
    (_, i) => `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n`,
  ).join("");
  return Buffer.from(
    `%PDF-1.3\n2 0 obj\n<< /Type /Pages /Count ${pages} >>\nendobj\n${objects}${extra}`,
    "latin1",
  );
}

describe("pdfPageCount", () => {
  it("counts a one-page document", () => {
    expect(pdfPageCount(fakePdf(1))).toBe(1);
  });

  it("counts a five-page document", () => {
    expect(pdfPageCount(fakePdf(5))).toBe(5);
  });

  it("does not mistake the /Type /Pages tree node for a page", () => {
    // fakePdf writes exactly one /Type /Pages node; if it were counted the
    // three-page document would read as four.
    expect(pdfPageCount(fakePdf(3))).toBe(3);
  });

  it("ignores an outline /Count larger than nothing but smaller than the tree", () => {
    const buf = fakePdf(5, "\n9 0 obj\n<< /Type /Outlines /Count 2 >>\nendobj\n");
    expect(pdfPageCount(buf)).toBe(5);
  });

  it("returns 0 for something that is not a PDF", () => {
    expect(pdfPageCount(Buffer.from("not a pdf at all"))).toBe(0);
  });

  it("returns 0 for an empty buffer", () => {
    expect(pdfPageCount(Buffer.alloc(0))).toBe(0);
  });

  it("accepts a Uint8Array as well as a Buffer", () => {
    expect(pdfPageCount(new Uint8Array(fakePdf(2)))).toBe(2);
  });
});

describe("pdfPageCountsAgree", () => {
  it("is true when the objects and the page tree tell the same story", () => {
    expect(pdfPageCountsAgree(fakePdf(5))).toBe(true);
  });

  it("is false when the page tree over-counts", () => {
    const broken = Buffer.from(
      "%PDF-1.3\n2 0 obj\n<< /Type /Pages /Count 9 >>\nendobj\n3 0 obj\n<< /Type /Page >>\nendobj\n",
      "latin1",
    );
    expect(pdfPageCountsAgree(broken)).toBe(false);
  });

  it("is false for a non-PDF", () => {
    expect(pdfPageCountsAgree(Buffer.from("nope"))).toBe(false);
  });
});
