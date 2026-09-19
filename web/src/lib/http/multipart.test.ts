import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { multipartBoundary, parseMultipart } from "./multipart";

function build(parts: Array<{ name: string; value: Buffer | string; filename?: string; type?: string }>, boundary = "----WebKitFormBoundaryabc123") {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename !== undefined) head += `; filename="${p.filename}"`;
    head += "\r\n";
    if (p.type) head += `Content-Type: ${p.type}\r\n`;
    head += "\r\n";
    chunks.push(Buffer.from(head), Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value), Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe("multipartBoundary", () => {
  it("reads bare and quoted boundaries; null otherwise", () => {
    expect(multipartBoundary("multipart/form-data; boundary=abc")).toBe("abc");
    expect(multipartBoundary('multipart/form-data; boundary="a b"')).toBe("a b");
    expect(multipartBoundary("application/json")).toBeNull();
    expect(multipartBoundary(null)).toBeNull();
  });
});

describe("parseMultipart", () => {
  it("fields + a file with its bytes, filename and content type", () => {
    const bytes = randomBytes(4096);
    const { body, contentType } = build([
      { name: "tier", value: "free" },
      { name: "text", value: "héllo — unicode" },
      { name: "file", value: bytes, filename: "deck.pdf", type: "application/pdf" },
    ]);
    const out = parseMultipart(body, contentType);
    expect(out.fields).toEqual({ tier: "free", text: "héllo — unicode" });
    expect(out.files).toHaveLength(1);
    expect(out.files[0]).toMatchObject({ name: "file", filename: "deck.pdf", mimeType: "application/pdf" });
    expect(out.files[0]!.buffer.equals(bytes)).toBe(true);
  });

  it("a 20 MB random file round-trips byte-for-byte (the size the runtime parser choked on)", () => {
    const bytes = randomBytes(20 * 1024 * 1024);
    const { body, contentType } = build([{ name: "file", value: bytes, filename: "big.pdf", type: "application/pdf" }]);
    const out = parseMultipart(body, contentType);
    expect(out.files[0]!.buffer.length).toBe(bytes.length);
    expect(out.files[0]!.buffer.equals(bytes)).toBe(true);
  });

  it("file content that happens to contain CRLF and dashes is not mis-split", () => {
    const bytes = Buffer.from("line1\r\n--not-the-boundary\r\n\r\n--\r\nline2");
    const { body, contentType } = build([{ name: "file", value: bytes, filename: "x.txt", type: "text/plain" }]);
    expect(parseMultipart(body, contentType).files[0]!.buffer.equals(bytes)).toBe(true);
  });

  it("empty file part and empty field are preserved", () => {
    const { body, contentType } = build([
      { name: "url", value: "" },
      { name: "file", value: Buffer.alloc(0), filename: "empty.pdf", type: "application/pdf" },
    ]);
    const out = parseMultipart(body, contentType);
    expect(out.fields.url).toBe("");
    expect(out.files[0]!.buffer.length).toBe(0);
  });

  it("throws on a missing boundary or a body that is not multipart", () => {
    expect(() => parseMultipart(Buffer.from("x"), "application/json")).toThrow(/boundary/);
    expect(() => parseMultipart(Buffer.from("not multipart"), "multipart/form-data; boundary=abc")).toThrow(/boundary/);
  });
});
