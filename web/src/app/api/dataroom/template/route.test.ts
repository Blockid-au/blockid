// Unit tests for GET /api/dataroom/template — P1_dataroom_map.
//
// Route lives at src/app/api/dataroom/template/route.ts. It is a public
// (unauthenticated) reference-material endpoint that serves the shipped
// data-room template bodies from DATA_ROOM_STRUCTURE as .md attachments.
// The route is directly wired to the P1_dataroom_map exit criterion of
// the atlassian-standard-mapping goal — every founder-facing "download
// template" link on /guide/data-room and /dataroom/[folder] resolves
// through this route. Route was previously untested — these tests pin:
//
//   - the ?name= presence guard (null vs "" both 400) so a missing
//     query-string param never leaks a 500 to a founder,
//   - the exact-name lookup contract (case-sensitive, no fuzzy match,
//     no trim) — a slug drift on the caller side must 404 loudly, not
//     silently serve the wrong template,
//   - the type='template' filter so an `upload` / `connect` / `auto`
//     document (e.g. "Pitch Deck", "Register of Members") returns 404
//     even though the name exists in the taxonomy,
//   - the response envelope (status/headers/body) for the happy path —
//     text/markdown; charset=utf-8, attachment Content-Disposition, and
//     the templateContent shipped verbatim (no re-encoding, no wrapping),
//   - the filename sanitisation rule (`[^a-zA-Z0-9\s-]` stripped then
//     `\s+` → `-`, `-template.md` suffix) exactly as coded so a rewrite
//     of the sanitiser can't silently break the download filename UX,
//   - every shipped templateContent doc (13 as of 2026-08-01) resolves —
//     drops any template row in a future edit and this test lights up.

import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import { GET, dynamic } from "./route";
import { DATA_ROOM_STRUCTURE } from "@/lib/data-room-templates";

function makeReq(url: string): NextRequest {
  // The route only reads `req.url`, so a plain Fetch Request casts safely.
  return new Request(url) as unknown as NextRequest;
}

function templateNames(): string[] {
  const names: string[] = [];
  for (const folder of DATA_ROOM_STRUCTURE) {
    for (const doc of folder.documents) {
      if (doc.type === "template" && doc.templateContent) names.push(doc.name);
    }
  }
  return names;
}

describe("GET /api/dataroom/template", () => {
  it("exports dynamic = 'force-dynamic' so Next never caches the download", () => {
    // Templates evolve out-of-band with app builds (marketing updates
    // shipped without redeploying), so the route must never be prerendered.
    expect(dynamic).toBe("force-dynamic");
  });

  it("returns 400 with a helpful error when ?name= is missing entirely", async () => {
    const res = await GET(makeReq("http://x/api/dataroom/template"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/name/i);
  });

  it("returns 400 when ?name= is present but empty (`?name=` with no value)", async () => {
    // URL.searchParams.get("name") returns "" for "?name=". The route's
    // `if (!name)` guard treats "" as missing — pin this so an accidental
    // switch to `if (name === null)` doesn't 200 an empty template lookup.
    const res = await GET(makeReq("http://x/api/dataroom/template?name="));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown template name", async () => {
    const res = await GET(makeReq("http://x/api/dataroom/template?name=Nope"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Nope");
  });

  it("returns 404 when the name matches an `upload` doc that has no templateContent", async () => {
    // "Pitch Deck" is a real DATA_ROOM_STRUCTURE row but type='upload' —
    // it must NOT be served through the template endpoint.
    const res = await GET(
      makeReq("http://x/api/dataroom/template?name=Pitch+Deck"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the name matches a `connect` doc (Register of Members)", async () => {
    // "Register of Members (Share Register)" is a `connect` type — served
    // via the cap-table wiring, not the markdown template endpoint.
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Register of Members (Share Register)")}`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it("is case-sensitive — 'executive summary' 404s even though 'Executive Summary' exists", async () => {
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("executive summary")}`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it("does not trim the query — trailing whitespace 404s", async () => {
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Executive Summary ")}`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it("serves Executive Summary as text/markdown with UTF-8 charset", async () => {
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Executive Summary")}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
  });

  it("sets Content-Disposition attachment with a sanitised filename ending in -template.md", async () => {
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Executive Summary")}`,
      ),
    );
    const cd = res.headers.get("content-disposition");
    expect(cd).toBe(`attachment; filename="Executive-Summary-template.md"`);
  });

  it("returns the raw templateContent body verbatim (no wrapping, no re-encoding)", async () => {
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Executive Summary")}`,
      ),
    );
    const text = await res.text();
    // Pin the shipped template's opening line — a rewrite of the route
    // that JSON-wraps or gzips the body would break this.
    expect(text.startsWith("# Executive Summary — [STARTUP_NAME]")).toBe(true);
    // And a distinctive marker from the shipped body must be present.
    expect(text).toContain("[ABN]");
  });

  it("strips punctuation from the filename — Market Size Analysis (TAM/SAM/SOM)", async () => {
    // Sanitiser: `[^a-zA-Z0-9\s-]` stripped, then `\s+` collapsed to `-`.
    //   "Market Size Analysis (TAM/SAM/SOM)"
    //   → "Market Size Analysis TAMSAMSOM"      (parens + slashes gone)
    //   → "Market-Size-Analysis-TAMSAMSOM"      (spaces collapsed)
    //   → "Market-Size-Analysis-TAMSAMSOM-template.md"
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Market Size Analysis (TAM/SAM/SOM)")}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="Market-Size-Analysis-TAMSAMSOM-template.md"`,
    );
  });

  it("preserves hyphens in the source name — Go-to-Market Strategy", async () => {
    // Hyphens are inside the sanitiser's whitelist so they survive.
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Go-to-Market Strategy")}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="Go-to-Market-Strategy-template.md"`,
    );
  });

  it("strips the ampersand from Founder Agreements & Vesting Schedules — but that row is `upload`, so 404", async () => {
    // Sanity — "Founder Agreements & Vesting Schedules" is upload-only.
    // Confirms the type filter runs before the response headers are set
    // (otherwise a 200 with a bad body would leak).
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Founder Agreements & Vesting Schedules")}`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it("collapses the double-space from Customer / User List into a single dash", async () => {
    // "Customer / User List"
    //   → "Customer  User List"   ("/" gone, adjacent spaces remain)
    //   → "Customer-User-List"    (\s+ collapses runs)
    // Pins that `\s+` is greedy (uses `+`, not a single-space replace).
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Customer / User List")}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="Customer-User-List-template.md"`,
    );
  });

  it("404s the Cap Table row even though it has a templateContent — type='connect' filter wins", async () => {
    // "Cap Table (Current + Post-raise)" is type='connect' but happens to
    // carry a templateContent (used by the /dataroom/[folder] preview
    // pane). The route's `doc.type === "template"` filter must reject it
    // so the connect-flow contract (upload via the cap-table wiring) is
    // never bypassed by a curl-and-download hack.
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Cap Table (Current + Post-raise)")}`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it("404s the Traction Dashboard row — type='auto' is not servable via this endpoint", async () => {
    // "Traction Dashboard" is type='auto' (populated by the metrics
    // pipeline) but ships a templateContent for the preview pane. Same
    // filter contract as Cap Table above — auto-populated rows must not
    // be downloadable as blank templates.
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Traction Dashboard")}`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it("resolves every shipped template (regression against silent taxonomy edits)", async () => {
    // As of 2026-08-01 there are exactly 10 rows with type='template' AND
    // a truthy templateContent. Three other rows (Cap Table / Traction
    // Dashboard / Due Diligence Checklist) also ship templateContent for
    // their preview pane but are type=connect/auto so the route rejects
    // them (see the two 404 tests above). Any drop or add must be a
    // conscious PR — the constant here forces a code review.
    const names = templateNames();
    expect(names.length).toBe(10);
    for (const name of names) {
      const res = await GET(
        makeReq(
          `http://x/api/dataroom/template?name=${encodeURIComponent(name)}`,
        ),
      );
      expect(res.status, `template "${name}" must be servable`).toBe(200);
    }
  });

  it("returns a distinct non-empty body for every shipped template", async () => {
    // A copy-paste bug that pointed two shipped rows at the same shared
    // template constant would break the founder's "here's my exec summary
    // AND my cap table" download flow. Ship-blocker sanity check.
    const bodies = new Set<string>();
    for (const name of templateNames()) {
      const res = await GET(
        makeReq(
          `http://x/api/dataroom/template?name=${encodeURIComponent(name)}`,
        ),
      );
      const text = await res.text();
      expect(text.length).toBeGreaterThan(0);
      bodies.add(text);
    }
    expect(bodies.size).toBe(templateNames().length);
  });

  it("does not include an auth guard — the endpoint is public", async () => {
    // The route intentionally has no auth wiring (see route comment).
    // If a future refactor adds `getCurrentUser()`, this test won't
    // notice — but a request with NO cookies must still 200 today.
    const res = await GET(
      makeReq(
        `http://x/api/dataroom/template?name=${encodeURIComponent("Executive Summary")}`,
      ),
    );
    expect(res.status).toBe(200);
  });
});
