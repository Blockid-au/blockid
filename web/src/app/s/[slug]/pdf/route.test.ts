// Colocated vitest for GET /s/[slug]/pdf — P9-slug-pdf-route-test.
//
// The route streams an application/pdf rendering of a founder's Investor-Ready
// Score. Anonymous visitors hit it directly from the shared /s/[slug] page and
// from the score-report widget "Download PDF" button, so a silent regression
// (e.g. dropping the `demo-` slug branch and 500ing every showcase link when
// Supabase is misconfigured; dropping the `!isSupabaseConfigured()` env-degrade
// short-circuit and 500ing preview deploys; dropping the `!row` 404 branch and
// serving the demo PDF for unknown slugs so a founder linking a typo'd id
// still gets a plausible-looking PDF; dropping the `scores` table `.eq("id",
// slug)` filter so anyone can fetch any founder's score row; dropping the
// `content-type: application/pdf` header and serving raw bytes as text/html
// so browsers render the PDF as garbage; dropping the `content-disposition`
// header and losing the download filename UX; dropping the sub_scores default
// coalesce and 500ing on legacy rows without a `financials` column) breaks
// the founder-facing score-download flow every /s/[slug] visitor depends on.
//
// Route lives at src/app/s/[slug]/pdf/route.ts. Previously untested; sibling
// routes /api/dataroom/template + /api/actions carry the current shape for
// route-level colocated tests.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE the route import) ---------------------------

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const renderScorePdfMock = vi.fn<(data: unknown) => Promise<Buffer>>();
vi.mock("@/lib/pdf/score-pdf", () => ({
  renderScorePdf: (data: unknown) => renderScorePdfMock(data),
}));

// Route import MUST come after mocks are registered.
import { GET, dynamic } from "./route";

// --- Fake supabase --------------------------------------------------------
//
// The route hits exactly one shape:
//   supabase.from("scores").select("*").eq("id", slug).maybeSingle()
// so the fake captures one call worth of state and returns a scripted
// {data, error} response per test.

interface ScoresCall {
  table: string;
  select: string | null;
  eqCol: string | null;
  eqVal: unknown;
}

interface FakeState {
  scoresResponse: { data: Record<string, unknown> | null; error: unknown };
  calls: ScoresCall[];
}

function makeFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      const call: ScoresCall = {
        table,
        select: null,
        eqCol: null,
        eqVal: null,
      };
      state.calls.push(call);
      const chain = {
        select(cols: string) {
          call.select = cols;
          return chain;
        },
        eq(col: string, val: unknown) {
          call.eqCol = col;
          call.eqVal = val;
          return chain;
        },
        async maybeSingle() {
          return state.scoresResponse;
        },
      };
      return chain;
    },
  };
}

function makeCtx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const PDF_BYTES = Buffer.from("%PDF-1.7\nfake\n%%EOF\n", "utf-8");

beforeEach(() => {
  isSupabaseConfiguredMock.mockReset();
  getSupabaseAdminMock.mockReset();
  renderScorePdfMock.mockReset();
  renderScorePdfMock.mockResolvedValue(PDF_BYTES);
  // NEXT_PUBLIC_SITE_URL is read via siteUrl() — force a stable default so
  // the shareUrl assertion below doesn't depend on the ambient env.
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /s/[slug]/pdf", () => {
  it("exports dynamic = 'force-dynamic' so Next never caches a founder's PDF", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("serves the demo PDF for demo-* slugs without touching Supabase", async () => {
    // Force Supabase 'configured' so we prove the demo-* branch short-circuits
    // BEFORE isSupabaseConfigured() would send us into the DB path.
    isSupabaseConfiguredMock.mockReturnValue(true);
    const req = new Request("http://x/s/demo-acme/pdf");
    const res = await GET(req, makeCtx("demo-acme"));
    expect(res.status).toBe(200);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(renderScorePdfMock).toHaveBeenCalledTimes(1);
    // The demo data must be forwarded with slug + shareUrl stamped in.
    const arg = renderScorePdfMock.mock.calls[0]?.[0] as {
      slug: string;
      shareUrl: string;
      companyName: string;
      totalScore: number;
    };
    expect(arg.slug).toBe("demo-acme");
    expect(arg.shareUrl).toBe("http://localhost:3000/s/demo-acme");
    expect(arg.companyName).toBe("Acme Co Pty Ltd");
    expect(arg.totalScore).toBe(82);
  });

  it("serves the demo PDF when Supabase is not configured (preview / env-degraded)", async () => {
    // Pin the env-degrade short-circuit: even a non-demo slug must render
    // the demo PDF rather than 500ing when supabase is unreachable.
    isSupabaseConfiguredMock.mockReturnValue(false);
    const req = new Request("http://x/s/real-slug/pdf");
    const res = await GET(req, makeCtx("real-slug"));
    expect(res.status).toBe(200);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(renderScorePdfMock).toHaveBeenCalledTimes(1);
    const arg = renderScorePdfMock.mock.calls[0]?.[0] as {
      slug: string;
      shareUrl: string;
    };
    expect(arg.slug).toBe("real-slug");
  });

  it("honours NEXT_PUBLIC_SITE_URL and strips a trailing slash from shareUrl", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au/";
    isSupabaseConfiguredMock.mockReturnValue(false);
    const req = new Request("http://x/s/demo-acme/pdf");
    const res = await GET(req, makeCtx("demo-acme"));
    expect(res.status).toBe(200);
    const arg = renderScorePdfMock.mock.calls[0]?.[0] as { shareUrl: string };
    // Trailing slash must be stripped BEFORE the /s/[slug] suffix is appended,
    // otherwise every share URL doubles up on '/' and the resolver fails.
    expect(arg.shareUrl).toBe("https://blockid.au/s/demo-acme");
  });

  it("returns 200 with a real scores row projected into ScorePdfData", async () => {
    const state: FakeState = {
      scoresResponse: {
        data: {
          total_score: 91,
          score_version: "2.1.0",
          confidence_score: 84,
          company_name: "Real Co",
          email: "founder@real.au",
          sub_scores: {
            financials: 88,
            capTable: 90,
            governance: 82,
            founder: 95,
            documentation: 87,
          },
          missing_inputs: ["Board minutes"],
          action_plan: [
            { title: "Do X", detail: "why", impact: "high" as const },
          ],
          benchmark: {
            label: "seed · SAAS",
            medianScore: 71,
            band: "above",
            rationale: "n=42",
          },
          inputs: { sector: "saas" },
          created_at: "2026-08-08T00:00:00.000Z",
        },
        error: null,
      },
      calls: [],
    };
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state));
    const req = new Request("http://x/s/abc123/pdf");
    const res = await GET(req, makeCtx("abc123"));
    expect(res.status).toBe(200);
    // Pin the DB call shape — table, select, filter, single-row terminal.
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toEqual({
      table: "scores",
      select: "*",
      eqCol: "id",
      eqVal: "abc123",
    });
    const arg = renderScorePdfMock.mock.calls[0]?.[0] as {
      slug: string;
      totalScore: number;
      companyName: string;
      subScores: { label: string; value: number }[];
      benchmark: { label: string } | null;
      inputs: Record<string, unknown>;
    };
    expect(arg.slug).toBe("abc123");
    expect(arg.totalScore).toBe(91);
    expect(arg.companyName).toBe("Real Co");
    // subScores must be projected in the fixed 5-row order the PDF layout
    // depends on — a re-order would visually break the score card.
    expect(arg.subScores.map((s) => s.label)).toEqual([
      "Financials",
      "Cap Table Hygiene",
      "Governance",
      "Founder Background",
      "Documentation",
    ]);
    expect(arg.subScores.map((s) => s.value)).toEqual([88, 90, 82, 95, 87]);
    expect(arg.benchmark?.label).toBe("seed · SAAS");
    expect(arg.inputs).toEqual({ sector: "saas" });
  });

  it("coalesces missing sub_scores fields to 0 (legacy row schema)", async () => {
    // Pre-migration rows may lack a specific sub-score key (e.g.
    // `documentation`). The route must degrade to 0 not throw, otherwise
    // every /s/[slug]/pdf on a legacy row 500s.
    const state: FakeState = {
      scoresResponse: {
        data: {
          total_score: 60,
          score_version: null,
          confidence_score: null,
          company_name: "Legacy Co",
          email: "founder@legacy.au",
          sub_scores: { financials: 55 },
          missing_inputs: null,
          action_plan: null,
          benchmark: null,
          inputs: {},
          created_at: "2026-08-08T00:00:00.000Z",
        },
        error: null,
      },
      calls: [],
    };
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state));
    const res = await GET(new Request("http://x/s/legacy/pdf"), makeCtx("legacy"));
    expect(res.status).toBe(200);
    const arg = renderScorePdfMock.mock.calls[0]?.[0] as {
      subScores: { label: string; value: number }[];
      scoreVersion: string | null;
      missingInputs: string[];
      actionPlan: unknown[];
      benchmark: unknown;
    };
    expect(arg.subScores.map((s) => s.value)).toEqual([55, 0, 0, 0, 0]);
    // scoreVersion defaults to "1.0.0" when the DB column is null.
    expect(arg.scoreVersion).toBe("1.0.0");
    // missingInputs / actionPlan default to [] not null.
    expect(arg.missingInputs).toEqual([]);
    expect(arg.actionPlan).toEqual([]);
    expect(arg.benchmark).toBeNull();
  });

  it("returns 500 with error envelope when the scores fetch errors", async () => {
    const state: FakeState = {
      scoresResponse: { data: null, error: { message: "conn refused" } },
      calls: [],
    };
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state));
    const res = await GET(new Request("http://x/s/abc/pdf"), makeCtx("abc"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "Internal error" });
    // PDF renderer must NOT run on the fetch-error path — a founder facing
    // a broken DB should see a JSON error, not a PDF with garbage in it.
    expect(renderScorePdfMock).not.toHaveBeenCalled();
  });

  it("returns 404 with error envelope when no scores row matches the slug", async () => {
    const state: FakeState = {
      scoresResponse: { data: null, error: null },
      calls: [],
    };
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state));
    const res = await GET(new Request("http://x/s/nope/pdf"), makeCtx("nope"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "Not found" });
    // Critical: a 404 must NOT quietly render the demo PDF — a typo'd link
    // must surface as "not found" so the founder catches the mistake.
    expect(renderScorePdfMock).not.toHaveBeenCalled();
  });

  it("sets the correct PDF response headers on the happy path", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(
      new Request("http://x/s/demo-acme/pdf"),
      makeCtx("demo-acme"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="blockid-score-demo-acme.pdf"',
    );
    // no-store keeps a founder's PDF out of shared caches (CDN + browser).
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    // Content-Length must equal the buffer size — a mismatch causes some
    // clients to truncate the download or hang waiting for more bytes.
    expect(res.headers.get("content-length")).toBe(String(PDF_BYTES.length));
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBe(PDF_BYTES.length);
    // First 4 bytes of the response body must be the "%PDF" magic — proves
    // we're returning the renderer's bytes verbatim, not a re-encoded JSON.
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });

  it("uses the slug in the download filename (spaces + specials preserved as-is)", async () => {
    // The route interpolates the slug into `filename="blockid-score-${slug}.pdf"`
    // without sanitisation — pin this as the shipped contract so a slug
    // rewriter change surfaces here. Note: [slug] param values are captured
    // pre-URL-decode by Next, so an actual "%20" comes through literally.
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(
      new Request("http://x/s/abc-XYZ_123/pdf"),
      makeCtx("abc-XYZ_123"),
    );
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="blockid-score-abc-XYZ_123.pdf"',
    );
  });
});
