// S31-D — hash sources read from Next's prerendered documents.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  prerenderHtmlDir,
  prerenderHtmlPath,
  prerenderScriptHashes,
  resetPrerenderScriptHashCache,
} from "./prerender-script-hashes";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
const doc = (...scripts: string[]) =>
  `<!DOCTYPE html><html><head><script src="/_next/static/chunks/x.js"></script></head><body>${scripts
    .map((s) => `<script>${s}</script>`)
    .join("")}<script type="application/ld+json">{}</script></body></html>`;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "blockid-prerender-"));
  resetPrerenderScriptHashCache();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("prerenderHtmlPath()", () => {
  it("maps pathnames onto <dir>/<route>.html and refuses anything unsafe", () => {
    expect(prerenderHtmlPath("/", "/d")).toBe("/d/index.html");
    expect(prerenderHtmlPath("/pricing", "/d")).toBe("/d/pricing.html");
    expect(prerenderHtmlPath("/funding/grants/state/NSW", "/d")).toBe("/d/funding/grants/state/NSW.html");
    for (const bad of ["", "pricing", "/pricing/", "/a//b", "/../etc/passwd", "/a/../../x", "/a%2Fb", "/a b", "/a?x=1", `/${"a".repeat(600)}`, "/./x"]) {
      expect(prerenderHtmlPath(bad, "/d"), bad).toBeNull();
    }
  });

  it("defaults to <cwd>/.next/server/app and honours BLOCKID_PRERENDER_HTML_DIR", () => {
    expect(prerenderHtmlDir({})).toBe(join(process.cwd(), ".next", "server", "app"));
    expect(prerenderHtmlDir({ BLOCKID_PRERENDER_HTML_DIR: "/tmp/x" })).toBe("/tmp/x");
  });
});

describe("prerenderScriptHashes()", () => {
  it("returns null when there is no document (dynamic route / never rendered)", () => {
    expect(prerenderScriptHashes("/pricing", { dir })).toBeNull();
    mkdirSync(join(dir, "pricing"));
    expect(prerenderScriptHashes("/pricing", { dir })).toBeNull(); // a directory, not a file
  });

  it("hashes every executable inline script of the document and memoises by mtime + size", () => {
    writeFileSync(join(dir, "index.html"), doc("a()", "self.__next_f.push([0])"));
    const first = prerenderScriptHashes("/", { dir, now: 1_000 });
    expect(first).toEqual([sha("a()"), sha("self.__next_f.push([0])")]);
    // Same file → same array instance (no re-read).
    expect(prerenderScriptHashes("/", { dir, now: 2_000 })).toBe(first);
  });

  it("after a regeneration the policy carries new ∪ previous hashes for the grace window, then only the new ones", () => {
    const file = join(dir, "pricing.html");
    writeFileSync(file, doc("old()"));
    utimesSync(file, 1, 1);
    expect(prerenderScriptHashes("/pricing", { dir, now: 0 })).toEqual([sha("old()")]);

    writeFileSync(file, doc("new()"));
    utimesSync(file, 2, 2);
    const t1 = 10_000;
    expect(prerenderScriptHashes("/pricing", { dir, now: t1 })).toEqual([sha("new()"), sha("old()")]);
    // Still inside the 10-minute grace window.
    expect(prerenderScriptHashes("/pricing", { dir, now: t1 + 9 * 60 * 1000 })).toEqual([sha("new()"), sha("old()")]);
    // Past it: previous set dropped.
    expect(prerenderScriptHashes("/pricing", { dir, now: t1 + 11 * 60 * 1000 })).toEqual([sha("new()")]);
  });

  it("keeps at most three superseded sets", () => {
    const file = join(dir, "about.html");
    for (let i = 0; i < 6; i++) {
      writeFileSync(file, doc(`v${i}()`));
      utimesSync(file, 100 + i, 100 + i);
      prerenderScriptHashes("/about", { dir, now: i });
    }
    const all = prerenderScriptHashes("/about", { dir, now: 10 })!;
    expect(all).toEqual([sha("v5()"), sha("v4()"), sha("v3()"), sha("v2()")]);
  });

  it("forgets a document that disappears", () => {
    const file = join(dir, "gone.html");
    writeFileSync(file, doc("x()"));
    expect(prerenderScriptHashes("/gone", { dir })).toEqual([sha("x()")]);
    rmSync(file);
    expect(prerenderScriptHashes("/gone", { dir })).toBeNull();
  });
});
