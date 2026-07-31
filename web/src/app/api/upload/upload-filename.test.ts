/**
 * Regression guard for the upload filename/extension contract.
 *
 * Uploads are written into a directory nginx serves publicly, and nginx
 * derives the response Content-Type from the file EXTENSION — not from the
 * MIME the uploader claimed. So the extension is the security boundary
 * here, and it must come from the validated MIME type, never from the
 * client-supplied filename.
 *
 * Before this was fixed, `generateFilename` did
 * `originalName.split(".").pop()`, which let a caller decouple the two:
 * send `Content-Type: application/pdf` so the allowlist passes, name the
 * file `payload.html`, and the bytes land as `.html` and come back as
 * `text/html` from blockid.au — stored XSS on the app's own origin. The
 * same trick reinstated the SVG vector the allowlist deliberately blocks.
 *
 * These tests read the route source rather than importing the handler,
 * because the module pulls in auth + fs at import time. The properties
 * being pinned are structural, so source assertions hold them honestly:
 * a future edit that reintroduces filename-derived extensions fails here.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
  join(process.cwd(), "src/app/api/upload/route.ts"),
  "utf8",
);

/** Every MIME the route accepts, scraped from ALLOWED_TYPES. */
function allowedMimes(): string[] {
  const block = SOURCE.slice(
    SOURCE.indexOf("const ALLOWED_TYPES"),
    SOURCE.indexOf("const ALL_ALLOWED"),
  );
  return [...block.matchAll(/"([a-z]+\/[a-zA-Z0-9.+-]+)"/g)].map((m) => m[1]);
}

/** Every MIME → ext pair, scraped from EXT_BY_MIME. */
function extByMime(): Record<string, string> {
  const block = SOURCE.slice(
    SOURCE.indexOf("const EXT_BY_MIME"),
    SOURCE.indexOf("function getSubdir"),
  );
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/"([a-z]+\/[a-zA-Z0-9.+-]+)":\s*"([a-z0-9]+)"/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

describe("upload filename extension is derived from the validated MIME", () => {
  it("generateFilename takes a mimeType, not the original filename", () => {
    expect(SOURCE).toMatch(/function generateFilename\(mimeType: string\)/);
    expect(SOURCE).not.toMatch(/function generateFilename\(originalName/);
  });

  it("never derives the extension from a caller-supplied name", () => {
    // The exact shape of the old bug.
    expect(SOURCE).not.toMatch(/originalName\s*\.\s*split\("\."\)/);
    // And no other path may reach into file.name for an extension.
    expect(SOURCE).not.toMatch(/file\.name\s*\.\s*split\("\."\)/);
  });

  it("is called with file.type, never file.name", () => {
    expect(SOURCE).toMatch(/generateFilename\(file\.type\)/);
    expect(SOURCE).not.toMatch(/generateFilename\(file\.name\)/);
  });

  it("maps every allowed MIME to an extension", () => {
    const map = extByMime();
    const missing = allowedMimes().filter((m) => !(m in map));
    expect(missing, `MIME(s) with no extension mapping: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("maps no MIME that the allowlist does not accept", () => {
    const allowed = new Set(allowedMimes());
    const extra = Object.keys(extByMime()).filter((m) => !allowed.has(m));
    expect(extra, `extension mapping for non-allowed MIME(s): ${extra.join(", ")}`)
      .toEqual([]);
  });

  it("produces no extension that browsers execute or render as markup", () => {
    // html/htm/svg/xhtml render as markup; js/mjs and the PHP family execute
    // if a handler is ever configured. None may be reachable.
    const dangerous = new Set([
      "html", "htm", "xhtml", "svg", "xml",
      "js", "mjs", "cjs",
      "php", "phtml", "php5",
    ]);
    const bad = Object.entries(extByMime()).filter(([, ext]) => dangerous.has(ext));
    expect(bad, `dangerous extension(s) reachable: ${JSON.stringify(bad)}`)
      .toEqual([]);
  });

  it("keeps SVG out of the allowlist entirely", () => {
    // The allowlist comment says SVG is excluded on purpose; pin it, since
    // adding it back would re-open stored XSS even with this fix in place.
    expect(allowedMimes()).not.toContain("image/svg+xml");
  });
});
