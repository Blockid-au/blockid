// Unit tests for GET /api/templates/legal/[slug] — P9-templates-legal-route-test.
//
// The route is the public (unauthenticated) served-markdown endpoint that
// backs every founder-facing "download template" link for the AU legal
// pack (constitution, ESOP scheme rules, SAFE, employment contract, IP
// assignment deeds, founder agreement, LOI, ESIC self-assessment…). It is
// wired into the P1_dataroom_map exit criterion of the atlassian-standard-
// mapping goal — the founder-facing counterpart to /api/dataroom/template
// (which serves DATA_ROOM_STRUCTURE `templateContent` bodies) and covers
// the legal-template registry at web/src/lib/templates/legal-templates.ts.
// The route was previously untested — this suite pins:
//
//   - `dynamic = "force-dynamic"` + `runtime = "nodejs"` — a Next static
//     shell would freeze legal-template bodies across marketing edits;
//     Edge runtime cannot resolve `node:fs/promises` for the disk read;
//   - 404 for an unknown slug — the caller of a broken link must see a
//     JSON error, not a 500 from a missing file;
//   - 500 when the template body cannot be read (readTemplateRaw → null)
//     — pins the "getTemplate exists but disk read failed" branch (e.g.
//     someone deleted the .md file but forgot to drop it from the registry);
//   - 200 happy-path envelope: text/markdown; charset=utf-8 + Cache-Control
//     public max-age=300 — a founder hitting the same link twice in one
//     session should hit the CDN, not the disk;
//   - Content-Disposition attachment is set iff `?download=1` — not on
//     `?download=0`, `?download=true`, absent param, or empty value; the
//     preview surface on /guide/legal-templates fetches without download=1
//     and must NOT trigger a save-file dialog;
//   - filename uses `${tpl.slug}.md` verbatim (no re-sanitisation — the
//     slugs are already kebab-case) — a rewrite that ran a sanitiser here
//     would double-hyphen the download name;
//   - `?values=` JSON path: object with string/number/boolean values →
//     substituted through `applySubstitutions`, unknown tokens preserved;
//     array / non-object / malformed JSON → raw body returned (never 400);
//     the "fall back to raw body" contract is critical because a sloppy
//     query string from a stale bookmark must still return a usable doc;
//   - Section blocks `{{#variant_cap_only}}…{{/variant_cap_only}}` toggle
//     on the exact truthy strings the applySubstitutions helper accepts
//     ("true" / "1" / "yes" / "on") — a rewrite that widens truthy to any
//     non-empty string would silently render every SAFE variant;
//   - Analytics is fire-and-forget: `emitEvent()` is called once per
//     request with `{slug, category, substituted, download}` params + a
//     `source: "server"` marker so the funnel can distinguish these from
//     client-fired page_view events; a rejecting emitter must NEVER fail
//     the request (the route intentionally `.catch(() => undefined)`s it);
//   - Every shipped LEGAL_TEMPLATES row resolves 200 — a taxonomy edit
//     that adds a slug without shipping the .md file lights this up;
//   - Public endpoint contract — a request with no cookies still 200s
//     (the route intentionally has no auth wiring per its top-of-file
//     comment). A future refactor that adds a gate would break the
//     public-preview flow the marketing site links to.

import { beforeEach, describe, expect, it, vi } from "vitest";

// Fire-and-forget analytics — mocked so the fire-and-forget contract can
// be inspected without a live Supabase / GA4 round-trip.
const emitEventMock = vi.fn<(input: unknown) => Promise<void>>();
vi.mock("@/lib/analytics/server", () => ({
  emitEvent: (input: unknown) => emitEventMock(input),
}));

import { GET, dynamic, runtime } from "./route";
import { LEGAL_TEMPLATES } from "@/lib/templates/legal-templates";
import * as legalTemplates from "@/lib/templates/legal-templates";

function makeReq(url: string): Request {
  return new Request(url);
}

async function call(url: string, slug: string) {
  return GET(makeReq(url), { params: Promise.resolve({ slug }) });
}

beforeEach(() => {
  emitEventMock.mockReset();
  emitEventMock.mockResolvedValue();
  vi.restoreAllMocks();
});

describe("GET /api/templates/legal/[slug] — route exports", () => {
  it("exports dynamic = 'force-dynamic' so Next never prerenders legal-template bodies", () => {
    // Legal templates get amended by counsel out-of-band with app builds
    // (a rewording of the s708 disclosure, a Div 83A citation update).
    // A static-shell fallback would serve stale bodies to the next raise.
    expect(dynamic).toBe("force-dynamic");
  });

  it("exports runtime = 'nodejs' so the fs read for the .md body is available", () => {
    // Edge runtime cannot resolve node:fs/promises — readTemplateRaw
    // would throw at import time on Edge.
    expect(runtime).toBe("nodejs");
  });
});

describe("GET /api/templates/legal/[slug] — unknown-slug + read-failure branches", () => {
  it("returns 404 with a JSON error when the slug is not in LEGAL_TEMPLATES", async () => {
    const res = await call("http://x/api/templates/legal/not-a-template", "not-a-template");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not found/i);
    // A 404 must never emit an analytics event — the surface being 404'd
    // is a stale bookmark / mistyped URL, not a fetch of a real template.
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("returns 500 with a JSON error when the template file cannot be read", async () => {
    // The registry claims a slug exists but the file on disk is gone
    // (or unreadable) — the route's `if (raw == null)` branch fires.
    vi.spyOn(legalTemplates, "readTemplateRaw").mockResolvedValueOnce(null);
    const res = await call("http://x/api/templates/legal/au-safe", "au-safe");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/could not be read/i);
    // Same as 404 — no analytics on a broken-registry error path.
    expect(emitEventMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/templates/legal/[slug] — happy-path envelope", () => {
  it("returns 200 text/markdown; charset=utf-8 with a Cache-Control max-age=300 header", async () => {
    const res = await call("http://x/api/templates/legal/au-safe", "au-safe");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    // 5 minutes — long enough to survive a page revisit, short enough to
    // let a counsel edit propagate through the CDN within a lunch break.
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("returns the raw template body verbatim when ?values= is absent", async () => {
    // Distinctive marker from the shipped au-safe.md — a JSON wrap, a
    // gzip, or a "template hidden until signed in" gate would break this.
    const res = await call("http://x/api/templates/legal/au-safe", "au-safe");
    const text = await res.text();
    expect(text).toContain("Simple Agreement for Future Equity");
    // Placeholders remain untouched — the raw path never substitutes.
    expect(text).toContain("{{company_name}}");
  });

  it("does NOT set Content-Disposition when ?download is absent (preview path)", async () => {
    const res = await call("http://x/api/templates/legal/au-safe", "au-safe");
    // /guide/legal-templates renders inline — no save-file dialog.
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("sets Content-Disposition attachment with `${slug}.md` when ?download=1", async () => {
    const res = await call(
      "http://x/api/templates/legal/au-safe?download=1",
      "au-safe",
    );
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="au-safe.md"',
    );
  });

  it("does NOT set Content-Disposition on ?download=0", async () => {
    // The route checks `download === "1"` strictly — 0 must be falsy.
    const res = await call(
      "http://x/api/templates/legal/au-safe?download=0",
      "au-safe",
    );
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("does NOT set Content-Disposition on ?download=true (only '1' triggers)", async () => {
    // A caller passing "true" is a common footgun — the route is strict.
    const res = await call(
      "http://x/api/templates/legal/au-safe?download=true",
      "au-safe",
    );
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("does NOT set Content-Disposition on ?download= (empty value)", async () => {
    const res = await call(
      "http://x/api/templates/legal/au-safe?download=",
      "au-safe",
    );
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("filename mirrors the slug verbatim (kebab-case, no re-sanitisation)", async () => {
    // The slug 'au-ip-assignment-deed-founder' already contains hyphens.
    // A rewrite that ran the DATA_ROOM_STRUCTURE sanitiser here would
    // produce 'au-ip-assignment-deed-founder-template.md' by accident.
    const res = await call(
      "http://x/api/templates/legal/au-ip-assignment-deed-founder?download=1",
      "au-ip-assignment-deed-founder",
    );
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="au-ip-assignment-deed-founder.md"',
    );
  });
});

describe("GET /api/templates/legal/[slug] — ?values= substitution branches", () => {
  it("substitutes {{token}} placeholders when values is a valid JSON object", async () => {
    const values = JSON.stringify({
      company_name: "Auschain",
      acn: "659 615 111",
      registered_office_address: "Sydney NSW",
    });
    const res = await call(
      `http://x/api/templates/legal/au-pty-ltd-constitution?values=${encodeURIComponent(values)}`,
      "au-pty-ltd-constitution",
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    // Substituted tokens must render the value literally — no HTML escaping.
    expect(text).toContain("Constitution of Auschain Pty Ltd");
    expect(text).toContain("**ACN:** 659 615 111");
    // Placeholders not passed remain as {{token}} literals so the founder
    // sees exactly what still needs filling in on the downloaded doc.
    expect(text).toContain("{{adoption_date}}");
  });

  it("coerces number + boolean values into strings before substitution", async () => {
    // JSON.parse ish — the route accepts {n: 42, b: true} and renders them.
    // Pins the `typeof v === "number" || typeof v === "boolean"` branch.
    const values = JSON.stringify({ company_name: 123, acn: true });
    const res = await call(
      `http://x/api/templates/legal/au-pty-ltd-constitution?values=${encodeURIComponent(values)}`,
      "au-pty-ltd-constitution",
    );
    const text = await res.text();
    expect(text).toContain("Constitution of 123 Pty Ltd");
    expect(text).toContain("**ACN:** true");
  });

  it("ignores non-string / non-number / non-boolean values in the JSON object (arrays, nulls, objects)", async () => {
    const values = JSON.stringify({
      company_name: "Auschain",
      acn: null, // dropped
      registered_office_address: [1, 2, 3], // dropped
      adoption_date: { nested: "x" }, // dropped
    });
    const res = await call(
      `http://x/api/templates/legal/au-pty-ltd-constitution?values=${encodeURIComponent(values)}`,
      "au-pty-ltd-constitution",
    );
    const text = await res.text();
    // Only the string value slotted; the others fell through as placeholders.
    expect(text).toContain("Constitution of Auschain Pty Ltd");
    expect(text).toContain("{{acn}}");
    expect(text).toContain("{{registered_office_address}}");
    expect(text).toContain("{{adoption_date}}");
  });

  it("returns the RAW body when ?values= is a JSON array (route guards on non-array objects only)", async () => {
    // The route explicitly rejects arrays even though `typeof [] === "object"`.
    const values = JSON.stringify([{ company_name: "Auschain" }]);
    const res = await call(
      `http://x/api/templates/legal/au-pty-ltd-constitution?values=${encodeURIComponent(values)}`,
      "au-pty-ltd-constitution",
    );
    const text = await res.text();
    // Placeholder untouched — array branch skipped applySubstitutions entirely.
    expect(text).toContain("{{company_name}}");
    // And analytics reports substituted=false for this branch.
    expect(emitEventMock).toHaveBeenCalledTimes(1);
    const call0 = emitEventMock.mock.calls[0][0] as {
      params: { substituted: boolean };
    };
    expect(call0.params.substituted).toBe(false);
  });

  it("returns the RAW body when ?values= is a JSON primitive (string / number / null)", async () => {
    const res = await call(
      `http://x/api/templates/legal/au-pty-ltd-constitution?values=%22hi%22`,
      "au-pty-ltd-constitution",
    );
    const text = await res.text();
    expect(text).toContain("{{company_name}}");
  });

  it("returns the RAW body when ?values= is malformed JSON — never 400", async () => {
    // A sloppy query string ("{not_json") must still yield a usable doc —
    // the route intentionally swallows the parse error (see comment at
    // route.ts:63) so a broken bookmark isn't a 400.
    const res = await call(
      `http://x/api/templates/legal/au-pty-ltd-constitution?values=%7Bnot_json`,
      "au-pty-ltd-constitution",
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("{{company_name}}");
  });

  it("toggles {{#variant_cap_only}} sections when the value is the literal string 'true'", async () => {
    // Section blocks accept only "true"/"1"/"yes"/"on" as truthy — the
    // applySubstitutions contract in legal-templates.ts:1057.
    const values = JSON.stringify({ variant_cap_only: "true" });
    const res = await call(
      `http://x/api/templates/legal/au-safe?values=${encodeURIComponent(values)}`,
      "au-safe",
    );
    const text = await res.text();
    // Kept: the SAFE Price line only.
    expect(text).toContain("the **SAFE Price**");
    // Stripped: discount-only + cap+discount blocks.
    expect(text).not.toContain("{{#variant_discount_only}}");
    expect(text).not.toContain("the **Discount Price**");
  });

  it("strips {{#variant_cap_only}} sections when the value is boolean true (not the string 'true')", async () => {
    // Coercion: `true` (bool) → "true" (string) via String(v), so the
    // section toggle fires. Pins the boolean → truthy-section chain.
    const values = JSON.stringify({ variant_cap_only: true });
    const res = await call(
      `http://x/api/templates/legal/au-safe?values=${encodeURIComponent(values)}`,
      "au-safe",
    );
    const text = await res.text();
    expect(text).toContain("the **SAFE Price**");
  });

  it("strips {{#variant_cap_only}} sections when the value is any string other than 'true'/'1'/'yes'/'on'", async () => {
    // Common footgun — a caller passing "yes please" thinks they enabled
    // the section. Route + lib strictly require one of the four tokens.
    const values = JSON.stringify({ variant_cap_only: "yes please" });
    const res = await call(
      `http://x/api/templates/legal/au-safe?values=${encodeURIComponent(values)}`,
      "au-safe",
    );
    const text = await res.text();
    // Section stripped entirely — the SAFE Price line is inside it.
    expect(text).not.toContain("the **SAFE Price**");
  });
});

describe("GET /api/templates/legal/[slug] — analytics (fire-and-forget)", () => {
  it("emits `legal_template_fetched` with slug + category on the happy path", async () => {
    await call("http://x/api/templates/legal/au-safe", "au-safe");
    expect(emitEventMock).toHaveBeenCalledTimes(1);
    const arg = emitEventMock.mock.calls[0][0] as {
      name: string;
      params: {
        slug: string;
        category: string;
        substituted: boolean;
        download: boolean;
      };
      source: string;
    };
    expect(arg.name).toBe("legal_template_fetched");
    expect(arg.source).toBe("server");
    expect(arg.params.slug).toBe("au-safe");
    expect(arg.params.category).toBe("fundraising");
    expect(arg.params.substituted).toBe(false);
    expect(arg.params.download).toBe(false);
  });

  it("stamps `substituted=true` when a valid values object triggered substitution", async () => {
    const values = JSON.stringify({ company_name: "Auschain" });
    await call(
      `http://x/api/templates/legal/au-pty-ltd-constitution?values=${encodeURIComponent(values)}`,
      "au-pty-ltd-constitution",
    );
    const arg = emitEventMock.mock.calls[0][0] as {
      params: { substituted: boolean };
    };
    expect(arg.params.substituted).toBe(true);
  });

  it("stamps `download=true` when the caller passed ?download=1", async () => {
    await call(
      "http://x/api/templates/legal/au-safe?download=1",
      "au-safe",
    );
    const arg = emitEventMock.mock.calls[0][0] as {
      params: { download: boolean };
    };
    expect(arg.params.download).toBe(true);
  });

  it("does NOT fail the request when emitEvent rejects (fire-and-forget contract)", async () => {
    emitEventMock.mockRejectedValueOnce(new Error("Supabase down"));
    const res = await call("http://x/api/templates/legal/au-safe", "au-safe");
    // The `.catch(() => undefined)` at route.ts:79 must swallow it. If a
    // future refactor `await`s emitEvent (or drops the catch), a supabase
    // outage would 500 every legal-template download.
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("GET /api/templates/legal/[slug] — taxonomy invariants", () => {
  it("resolves every shipped LEGAL_TEMPLATES slug to a 200 markdown response", async () => {
    // A registry entry without a corresponding .md file on disk would
    // 500 here — the read-failure branch above proves the 500 shape;
    // this test proves the shipped registry is internally consistent.
    for (const tpl of LEGAL_TEMPLATES) {
      const res = await call(
        `http://x/api/templates/legal/${tpl.slug}`,
        tpl.slug,
      );
      expect(res.status, `slug "${tpl.slug}" must resolve`).toBe(200);
      const text = await res.text();
      // Every AU legal template must ship the required short-form
      // disclaimer at the top — a paste bug on a new template that
      // dropped the disclaimer would break the AFSL-safe promise the
      // /guide/legal-templates page makes.
      expect(text).toMatch(/TEMPLATE ONLY/i);
    }
  });

  it("returns a distinct body for every shipped slug (no accidental duplicates)", async () => {
    // A copy-paste bug that pointed two registry rows at the same .md
    // file would break the "SAFE and constitution" download flow.
    const bodies = new Set<string>();
    for (const tpl of LEGAL_TEMPLATES) {
      const res = await call(
        `http://x/api/templates/legal/${tpl.slug}`,
        tpl.slug,
      );
      const text = await res.text();
      bodies.add(text);
    }
    expect(bodies.size).toBe(LEGAL_TEMPLATES.length);
  });
});

describe("GET /api/templates/legal/[slug] — public endpoint contract", () => {
  it("does not require any auth cookies or headers — request with no cookies still 200s", async () => {
    // The route intentionally has no auth wiring per its top-of-file
    // comment. A future refactor that adds a gate would break the
    // public /guide/legal-templates preview flow the marketing site
    // links directly into.
    const res = await GET(new Request("http://x/api/templates/legal/au-safe"), {
      params: Promise.resolve({ slug: "au-safe" }),
    });
    expect(res.status).toBe(200);
  });
});
