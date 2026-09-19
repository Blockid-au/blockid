// Minimal multipart/form-data parser over a buffered body.
//
// 2026-09-19: Next's bundled `Request.formData()` fails on multipart bodies
// somewhere above ~10 MB in the standalone server ("Failed to parse body
// as FormData"), while plain Node parses the same bytes fine. Pitch decks
// are routinely 10–20 MB, so /api/intake parses the body itself. Handles
// exactly what browsers and curl send: CRLF-delimited parts, one level,
// `Content-Disposition: form-data; name="…"[; filename="…"]`, optional
// `Content-Type`. Fields decode as UTF-8; files keep their bytes.

export interface MultipartFile {
  name: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface MultipartResult {
  fields: Record<string, string>;
  files: MultipartFile[];
}

export function multipartBoundary(contentType: string | null | undefined): string | null {
  if (!contentType) return null;
  const m = /multipart\/form-data\s*;.*?boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const b = (m?.[1] ?? m?.[2] ?? "").trim();
  return b.length > 0 ? b : null;
}

function headerParam(header: string, key: string): string | null {
  const m = new RegExp(`${key}\\s*=\\s*(?:"((?:\\\\.|[^"])*)"|([^;]+))`, "i").exec(header);
  if (!m) return null;
  return (m[1] ?? m[2] ?? "").replace(/\\"/g, '"').trim();
}

/**
 * Parse `body` using the boundary from `contentType`. Throws on a missing
 * boundary or a body that does not start with it — the same failures the
 * runtime parser reports — so callers keep their existing 400 path.
 */
export function parseMultipart(body: Buffer, contentType: string | null | undefined): MultipartResult {
  const boundary = multipartBoundary(contentType);
  if (!boundary) throw new Error("multipart: missing boundary");
  const delim = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];

  let pos = body.indexOf(delim);
  if (pos !== 0) {
    // Tolerate a leading CRLF preamble but nothing else.
    if (pos === -1 || body.subarray(0, pos).toString("latin1").trim() !== "") {
      throw new Error("multipart: body does not start with the boundary");
    }
  }
  pos += delim.length;

  for (;;) {
    // After a delimiter: "--" closes, CRLF opens the next part.
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break;
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;
    else if (body[pos] === 0x0a) pos += 1;
    else throw new Error("multipart: malformed part delimiter");

    const headerEnd = body.indexOf("\r\n\r\n", pos);
    if (headerEnd === -1) throw new Error("multipart: unterminated part headers");
    const rawHeaders = body.subarray(pos, headerEnd).toString("utf8");
    const bodyStart = headerEnd + 4;

    // Part body runs to the CRLF that precedes the next delimiter.
    const next = body.indexOf(delim, bodyStart);
    if (next === -1) throw new Error("multipart: unterminated part");
    let bodyEnd = next;
    if (body[bodyEnd - 2] === 0x0d && body[bodyEnd - 1] === 0x0a) bodyEnd -= 2;
    else if (body[bodyEnd - 1] === 0x0a) bodyEnd -= 1;
    const content = body.subarray(bodyStart, bodyEnd);

    let disposition = "";
    let mimeType = "";
    for (const line of rawHeaders.split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i === -1) continue;
      const k = line.slice(0, i).trim().toLowerCase();
      const v = line.slice(i + 1).trim();
      if (k === "content-disposition") disposition = v;
      else if (k === "content-type") mimeType = v;
    }
    const name = headerParam(disposition, "name") ?? "";
    const filename = headerParam(disposition, "filename");
    if (filename !== null) {
      files.push({ name, filename, mimeType, buffer: Buffer.from(content) });
    } else if (name) {
      fields[name] = content.toString("utf8");
    }

    pos = next + delim.length;
  }

  return { fields, files };
}
