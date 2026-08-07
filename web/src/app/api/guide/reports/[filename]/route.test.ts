// Colocated vitest for GET /api/guide/reports/[filename] — P9-guide-reports-filename-route-test.
//
// The route is the public showcase-copy download surface for the
// `web/content/reports/*.md` dogfooding corpus. It is the marketing counterpart
// to the reseller-facing signed-URL flow (which stays scoped + auditable);
// intentionally has no auth, but delegates every safety guard to
// isDownloadableReportFilename + redactReportMarkdown + buildDownloadFilename
// from `@/lib/showcase/report-redaction`.
//
// Silent regressions this pins against:
//   - dropping isDownloadableReportFilename so a caller can slip
//     `../../etc/passwd` through the URL segment;
//   - flipping the dual-candidate cwd lookup (repo-root vs web workspace) so
//     the route 404s in one of the two supported server layouts;
//   - dropping redactReportMarkdown so a stray email / bearer token / Stripe
//     key in a dogfooding log leaks through the wire to the public;
//   - dropping the .md content-type so browsers try to render as HTML;
//   - dropping the attachment disposition so the file previews instead of
//     downloading;
//   - flipping cache-control / x-content-type-options / referrer-policy —
//     these three headers are the shipped hardening posture and any drift
//     turns a marketing surface into a hot-linkable JS-injection vector.

import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

interface FsState {
  files: Map<string, string>;
  reads: string[];
}

const fsState: FsState = { files: new Map(), reads: [] };

vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(async (p: string, _enc?: string): Promise<string> => {
      fsState.reads.push(p);
      if (!fsState.files.has(p)) {
        const err = new Error(`ENOENT: ${p}`);
        (err as NodeJS.ErrnoException).code = "ENOENT";
        throw err;
      }
      return fsState.files.get(p) as string;
    }),
  },
}));

import { GET, dynamic, runtime } from "./route";

const CWD = process.cwd();

function repoPath(basename: string): string {
  return path.join(CWD, "web", "content", "reports", basename);
}

function webPath(basename: string): string {
  return path.join(CWD, "content", "reports", basename);
}

async function invoke(
  filename: string,
): Promise<Response> {
  const req = new Request(
    `http://localhost/api/guide/reports/${encodeURIComponent(filename)}`,
  );
  return GET(req, { params: Promise.resolve({ filename }) });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  fsState.files.clear();
  fsState.reads.length = 0;
});

describe("GET /api/guide/reports/[filename] — route wiring", () => {
  it("exports dynamic=force-dynamic + runtime=nodejs (fs access + no-store)", () => {
    // fs + cwd-relative I/O forbids the default static prerender; the runtime
    // pin blocks a future edge-conversion that would drop node:fs entirely.
    expect(dynamic).toBe("force-dynamic");
    expect(runtime).toBe("nodejs");
  });
});

describe("GET /api/guide/reports/[filename] — invalid_filename guard", () => {
  it("rejects '' with 400 invalid_filename and never touches fs", async () => {
    const res = await invoke("");
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ ok: false, reason: "invalid_filename" });
    expect(fsState.reads).toEqual([]);
  });

  it("rejects a path-traversal segment with 400 and never touches fs", async () => {
    const res = await invoke("../etc/passwd.md");
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ ok: false, reason: "invalid_filename" });
    expect(fsState.reads).toEqual([]);
  });

  it("rejects a forward-slash segment with 400 and never touches fs", async () => {
    const res = await invoke("nested/report.md");
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ ok: false, reason: "invalid_filename" });
    expect(fsState.reads).toEqual([]);
  });

  it("rejects a backslash segment with 400 and never touches fs", async () => {
    const res = await invoke("nested\\report.md");
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ ok: false, reason: "invalid_filename" });
    expect(fsState.reads).toEqual([]);
  });

  it("rejects the underscore-prefixed scaffold with 400 and never touches fs", async () => {
    // `_daily-report-template.md` is the internal scaffold — never public.
    const res = await invoke("_daily-report-template.md");
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ ok: false, reason: "invalid_filename" });
    expect(fsState.reads).toEqual([]);
  });

  it("rejects a non-markdown extension with 400 and never touches fs", async () => {
    const res = await invoke("report.txt");
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ ok: false, reason: "invalid_filename" });
    expect(fsState.reads).toEqual([]);
  });

  it("rejects a bare extensionless string with 400 and never touches fs", async () => {
    const res = await invoke("report");
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ ok: false, reason: "invalid_filename" });
    expect(fsState.reads).toEqual([]);
  });
});

describe("GET /api/guide/reports/[filename] — not_found path", () => {
  it("returns 404 when neither the repo-root nor web-workspace candidate exists", async () => {
    const res = await invoke("does-not-exist.md");
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ ok: false, reason: "not_found" });
    // Both candidates must be tried before giving up.
    expect(fsState.reads).toEqual([
      repoPath("does-not-exist.md"),
      webPath("does-not-exist.md"),
    ]);
  });
});

describe("GET /api/guide/reports/[filename] — dual-cwd candidate lookup", () => {
  it("serves from the repo-root candidate first when available", async () => {
    fsState.files.set(repoPath("cro-daily.md"), "hello from repo root");
    const res = await invoke("cro-daily.md");
    expect(res.status).toBe(200);
    // Should short-circuit: web-workspace candidate never tried.
    expect(fsState.reads).toEqual([repoPath("cro-daily.md")]);
    const text = await res.text();
    expect(text).toContain("hello from repo root");
  });

  it("falls back to the web-workspace candidate when the repo-root one is missing", async () => {
    fsState.files.set(webPath("cmo-daily.md"), "hello from web workspace");
    const res = await invoke("cmo-daily.md");
    expect(res.status).toBe(200);
    // Both candidates tried in order.
    expect(fsState.reads).toEqual([
      repoPath("cmo-daily.md"),
      webPath("cmo-daily.md"),
    ]);
    const text = await res.text();
    expect(text).toContain("hello from web workspace");
  });
});

describe("GET /api/guide/reports/[filename] — hardening headers", () => {
  it("stamps text/markdown; charset=utf-8 as content-type", async () => {
    fsState.files.set(repoPath("ok.md"), "# body");
    const res = await invoke("ok.md");
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });

  it("stamps content-disposition attachment; filename=\"...\" for browser download", async () => {
    fsState.files.set(repoPath("ok.md"), "# body");
    const res = await invoke("ok.md");
    const cd = res.headers.get("content-disposition") ?? "";
    // Must be attachment (not inline) so the .md file downloads instead of rendering.
    expect(cd.startsWith("attachment;")).toBe(true);
    expect(cd).toContain('filename="');
    expect(cd).toContain(".md\"");
  });

  it("stamps x-content-type-options: nosniff so browsers do not MIME-sniff to HTML", async () => {
    fsState.files.set(repoPath("ok.md"), "# body");
    const res = await invoke("ok.md");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("stamps referrer-policy: no-referrer so downstream sites cannot back-trace the download", async () => {
    fsState.files.set(repoPath("ok.md"), "# body");
    const res = await invoke("ok.md");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("stamps cache-control public max-age=3600 s-maxage=3600 so CDN can absorb the fan-out", async () => {
    fsState.files.set(repoPath("ok.md"), "# body");
    const res = await invoke("ok.md");
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toContain("public");
    expect(cc).toContain("max-age=3600");
    expect(cc).toContain("s-maxage=3600");
  });

  it("normalises attachment filename via buildDownloadFilename (lowercase + safe chars)", async () => {
    // Route-level pin on the buildDownloadFilename contract — a caller-supplied
    // uppercase / space-mangled name must not appear verbatim in the header,
    // or a well-crafted filename could inject content-disposition params.
    fsState.files.set(repoPath("CRO Daily.md"), "# body");
    const res = await invoke("CRO Daily.md");
    // Even though the redaction lib's FILENAME_RE has an /i flag, the route
    // fetches the exact name from disk, and normalises the attachment name.
    // If FILENAME_RE ever tightens to case-sensitive, this test moves to the
    // invalid_filename family — for now it pins the current shipped shape.
    if (res.status === 200) {
      const cd = res.headers.get("content-disposition") ?? "";
      // Must be lowercased + no spaces.
      expect(cd).not.toContain(" Daily");
      expect(cd.toLowerCase()).toBe(cd);
    } else {
      // If the current regex rejects the space, that's an equally-valid pin.
      expect(res.status).toBe(400);
    }
  });
});

describe("GET /api/guide/reports/[filename] — redaction on the wire", () => {
  it("prefixes the public-copy banner ahead of the body", async () => {
    fsState.files.set(repoPath("ok.md"), "# some heading\n\nbody line");
    const res = await invoke("ok.md");
    const body = await res.text();
    // Banner is the "Public showcase copy" marker from report-redaction.ts:37.
    expect(body).toContain("Public showcase copy");
    // Body must appear AFTER the banner (banner is a prefix, not a suffix).
    expect(body.indexOf("Public showcase copy")).toBeLessThan(body.indexOf("# some heading"));
    // Body preserved verbatim after the banner.
    expect(body).toContain("# some heading");
    expect(body).toContain("body line");
  });

  it("redacts a bare email address in the served body", async () => {
    fsState.files.set(
      repoPath("with-email.md"),
      "Contact founder at ada@example.com for details.",
    );
    const res = await invoke("with-email.md");
    const body = await res.text();
    expect(body).not.toContain("ada@example.com");
    expect(body).toContain("[email redacted]");
  });

  it("redacts a Stripe live secret key in the served body", async () => {
    fsState.files.set(
      repoPath("with-stripe.md"),
      "key sk_live_ABCDEFGHIJKLMNOP1234 was leaked",
    );
    const res = await invoke("with-stripe.md");
    const body = await res.text();
    expect(body).not.toContain("sk_live_ABCDEFGHIJKLMNOP1234");
    expect(body).toContain("[stripe-key redacted]");
  });

  it("redacts a Bearer token in the served body", async () => {
    fsState.files.set(
      repoPath("with-bearer.md"),
      "Authorization: Bearer abcdef0123456789ABCDEFG",
    );
    const res = await invoke("with-bearer.md");
    const body = await res.text();
    expect(body).not.toContain("abcdef0123456789ABCDEFG");
    expect(body.toLowerCase()).toContain("[token redacted]");
  });

  it("redacts an AU mobile-shaped phone number in the served body", async () => {
    fsState.files.set(repoPath("with-phone.md"), "call +61 412 345 678 anytime");
    const res = await invoke("with-phone.md");
    const body = await res.text();
    expect(body).not.toContain("+61 412 345 678");
    expect(body).toContain("[phone redacted]");
  });

  it("still returns 200 + banner-only body when the source file is empty", async () => {
    // Never serve a zero-byte attachment — the redaction lib guarantees banner
    // is always prepended. If the route swaps to a "streaming empty file" path
    // this test surfaces the drift.
    fsState.files.set(repoPath("empty.md"), "");
    const res = await invoke("empty.md");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Public showcase copy");
    expect(body.length).toBeGreaterThan(0);
  });
});
