// Unit tests for /api/investor-pack/preview — GET + POST route contract
// (P5-investor-pack-preview-route-test).
//
// The preview route is the T-1201 founder-facing "render my current investor
// pack" surface — it composes an `InvestorPackData` payload from the current
// workspace state (best-effort projects + app_users lookups), renders it via
// `renderInvestorPack()`, and streams the PDF binary back with either an
// `inline` (browser preview) or `attachment` (?download=1) disposition.
//
// A silent regression here would corrupt the founder-facing preview flow
// pinned by the P5_investor_readiness_score exit criteria — e.g. dropping
// the 401 gate would leak the preview to anonymous callers; letting a
// supabase throw escape the try/catch would 500 the whole tick when a
// project row is missing; skipping the `name.trim()` guard on the projects
// row would let a whitespace-only name overwrite the email-prefix default;
// dropping the SVI_13_CRITERIA seed rows would make the SVI table paint
// as a blank stub even when the founder has real evidence rows waiting.
//
// Assertions pin:
//   1. GET 401 when getCurrentUser returns null (no supabase / render call).
//   2. POST 401 when getCurrentUser returns null (same short-circuit).
//   3. GET happy path: 200 with Content-Type: application/pdf,
//      Cache-Control: no-store, X-Investor-Pack-Version: v2-preview, and
//      inline disposition using the sanitized filename.
//   4. GET with ?download=1 → attachment disposition.
//   5. POST happy path also honours ?download=1.
//   6. Filename sanitization: strip non-word non-space non-hyphen (spaces
//      collapsed to hyphens after trim), lowercased, capped at 60 chars,
//      falls back to "startup" when the sanitised body collapses to empty.
//   7. Default startup name derives from the email local-part when no
//      project row is found.
//   8. project.name populates startup.name — only when trim() is truthy,
//      otherwise falls back to the email-prefix default.
//   9. project.description populates the tagline — only when trim() is
//      truthy.
//  10. project.industry populates the sector — only when trim() is truthy.
//  11. app_users.display_name populates tagline as "Prepared by {name}"
//      only when the project did NOT already supply one.
//  12. When project.description IS set, app_users lookup does NOT overwrite
//      the tagline (project wins).
//  13. Supabase null degrade — renderInvestorPack still called with the
//      email-prefix defaults; no from() calls.
//  14. Supabase throws on the projects lookup — caught, falls through to
//      defaults, app_users lookup still fires.
//  15. Supabase throws on the app_users lookup — caught, tagline stays
//      undefined (or whatever project supplied).
//  16. Missing projectId (null from getProjectIdFromRequest) — projects
//      table is not queried; app_users lookup still fires.
//  17. renderInvestorPack throws → 500 { ok:false, error: "PDF preview
//      failed" } response envelope.
//  18. renderInvestorPack receives the full SVI_13_CRITERIA seed with
//      `score: NaN` per row and `grade: "—"` / `score: 0` on the envelope.
//  19. asOfDate is today's ISO date (YYYY-MM-DD, UTC).
//  20. The rendered PDF buffer body byte-equals what renderInvestorPack
//      returned (proves we don't accidentally re-encode or wrap the body).
//  21. Both GET and POST call the same underlying handler (single source
//      of truth for the branch matrix).

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── auth ────────────────────────────────────────────────────
const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── projects (getProjectIdFromRequest) ──────────────────────
const getProjectIdFromRequestMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => getProjectIdFromRequestMock(),
}));

// ── supabase admin ──────────────────────────────────────────
type MaybeSingleFn = () => Promise<{ data: Record<string, unknown> | null }>;
type ChainCall = { table: string; columns?: string; eqCol?: string; eqVal?: unknown };
const supabaseCalls: ChainCall[] = [];
let projectsResponse: { data: Record<string, unknown> | null } | Error = { data: null };
let appUsersResponse: { data: Record<string, unknown> | null } | Error = { data: null };

function buildChain(table: string) {
  const call: ChainCall = { table };
  supabaseCalls.push(call);
  const selfSelect = {
    select(cols: string) {
      call.columns = cols;
      return {
        eq(col: string, val: unknown) {
          call.eqCol = col;
          call.eqVal = val;
          const maybeSingle: MaybeSingleFn = async () => {
            const resp =
              table === "projects" ? projectsResponse : appUsersResponse;
            if (resp instanceof Error) throw resp;
            return resp;
          };
          return { maybeSingle };
        },
      };
    },
  };
  return selfSelect;
}

const supabaseFromMock = vi.fn((table: string) => buildChain(table));
type SupabaseFake = { from: typeof supabaseFromMock } | null;
const getSupabaseAdminMock = vi.fn<() => SupabaseFake>(() => ({ from: supabaseFromMock }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ── investor-pack renderer + criteria ───────────────────────
type RenderCall = Record<string, unknown>;
const renderCalls: RenderCall[] = [];
let renderReturn: Buffer | Error = Buffer.from([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const renderInvestorPackMock = vi.fn(async (data: RenderCall) => {
  renderCalls.push(data);
  if (renderReturn instanceof Error) throw renderReturn;
  return renderReturn;
});

// Actual SVI_13_CRITERIA from the shipped module — re-exported so the
// route's SVI seed builder resolves cleanly under the test-gate. Declared
// via vi.hoisted so both the vi.mock factory (hoisted to top of module)
// and the test body can reference the same fixture without tripping the
// "top-level variables in vi.mock factory" ReferenceError.
const hoisted = vi.hoisted(() => ({
  SVI_13_CRITERIA_FIXTURE: [
    { id: "ftv", label: "Founder & Team Value" },
    { id: "mpc", label: "Market & Problem Clarity" },
    { id: "ptd", label: "Product & Technical Depth" },
    { id: "tre", label: "Traction & Revenue" },
    { id: "cgh", label: "Cap Table & Governance" },
    { id: "iri", label: "Investor Readiness" },
    { id: "lco", label: "Legal & Compliance" },
    { id: "svm", label: "Strategic Vision & Moat" },
    { id: "gtm", label: "Go-to-Market Strategy" },
    { id: "fin", label: "Financial Projections & Unit Economics" },
    { id: "rsk", label: "Risk Landscape" },
    { id: "brd", label: "Brand & Storytelling" },
    { id: "esg", label: "Ethics, Sustainability & Governance" },
  ],
}));
const SVI_13_CRITERIA_FIXTURE = hoisted.SVI_13_CRITERIA_FIXTURE;

vi.mock("@/lib/pdf/investor-pack", () => ({
  renderInvestorPack: (data: RenderCall) => renderInvestorPackMock(data),
  SVI_13_CRITERIA: hoisted.SVI_13_CRITERIA_FIXTURE,
}));

import { GET, POST } from "./route";

const USER = { id: "u-42", email: "founder@example.com" };

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue("proj-1");
  supabaseFromMock.mockClear();
  supabaseCalls.length = 0;
  projectsResponse = { data: null };
  appUsersResponse = { data: null };
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue({ from: supabaseFromMock });
  renderInvestorPackMock.mockClear();
  renderCalls.length = 0;
  renderReturn = Buffer.from([0x25, 0x50, 0x44, 0x46]);
});

function req(url = "https://blockid.au/api/investor-pack/preview"): Request {
  return new Request(url);
}

describe("GET + POST /api/investor-pack/preview", () => {
  it("returns 401 on GET when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/authentication/i);
    expect(supabaseFromMock).not.toHaveBeenCalled();
    expect(renderInvestorPackMock).not.toHaveBeenCalled();
  });

  it("returns 401 on POST when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(renderInvestorPackMock).not.toHaveBeenCalled();
  });

  it("happy path returns 200 with pdf headers + inline disposition + sanitized filename", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Investor-Pack-Version")).toBe("v2-preview");
    const dispo = res.headers.get("Content-Disposition") ?? "";
    expect(dispo.startsWith("inline;")).toBe(true);
    expect(dispo).toContain('filename="investor-pack-founder.pdf"');
    expect(renderInvestorPackMock).toHaveBeenCalledTimes(1);
  });

  it("?download=1 flips disposition to attachment", async () => {
    const res = await GET(req("https://blockid.au/api/investor-pack/preview?download=1"));
    const dispo = res.headers.get("Content-Disposition") ?? "";
    expect(dispo.startsWith("attachment;")).toBe(true);
    expect(dispo).toContain('filename="investor-pack-founder.pdf"');
  });

  it("POST also honours ?download=1", async () => {
    const res = await POST(req("https://blockid.au/api/investor-pack/preview?download=1"));
    const dispo = res.headers.get("Content-Disposition") ?? "";
    expect(dispo.startsWith("attachment;")).toBe(true);
  });

  it("streams the exact bytes returned by renderInvestorPack", async () => {
    renderReturn = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"
    const res = await GET(req());
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBe(8);
    expect(Array.from(bytes)).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  });

  it("default startup name uses the email local-part when no project row is found", async () => {
    await GET(req());
    expect(renderCalls).toHaveLength(1);
    const data = renderCalls[0] as { startup: { name: string } };
    expect(data.startup.name).toBe("founder");
  });

  it("project.name overrides the email-prefix default", async () => {
    projectsResponse = {
      data: { name: "Acme Corp!", description: null, industry: null },
    };
    await GET(req());
    const data = renderCalls[0] as { startup: { name: string } };
    expect(data.startup.name).toBe("Acme Corp!");
    // Filename sanitizer collapses "Acme Corp!" → "acme-corp"
    const res = await GET(req());
    const dispo = res.headers.get("Content-Disposition") ?? "";
    expect(dispo).toContain('filename="investor-pack-acme-corp.pdf"');
  });

  it("project.name whitespace-only falls back to email-prefix", async () => {
    projectsResponse = {
      data: { name: "   ", description: null, industry: null },
    };
    await GET(req());
    const data = renderCalls[0] as { startup: { name: string } };
    expect(data.startup.name).toBe("founder");
  });

  it("project.description populates tagline (only when trim() truthy)", async () => {
    projectsResponse = {
      data: { name: "Acme", description: "AI for tradies", industry: null },
    };
    await GET(req());
    const data = renderCalls[0] as { startup: { tagline?: string } };
    expect(data.startup.tagline).toBe("AI for tradies");
  });

  it("project.description whitespace-only leaves tagline undefined", async () => {
    projectsResponse = {
      data: { name: "Acme", description: "   ", industry: null },
    };
    // app_users lookup still fires — mock it to avoid supplying a tagline
    appUsersResponse = { data: null };
    await GET(req());
    const data = renderCalls[0] as { startup: { tagline?: string } };
    expect(data.startup.tagline).toBeUndefined();
  });

  it("project.industry populates sector (only when trim() truthy)", async () => {
    projectsResponse = {
      data: { name: "Acme", description: null, industry: "SaaS" },
    };
    await GET(req());
    const data = renderCalls[0] as { startup: { sector?: string } };
    expect(data.startup.sector).toBe("SaaS");
  });

  it("project.industry whitespace-only leaves sector undefined", async () => {
    projectsResponse = {
      data: { name: "Acme", description: null, industry: "   " },
    };
    await GET(req());
    const data = renderCalls[0] as { startup: { sector?: string } };
    expect(data.startup.sector).toBeUndefined();
  });

  it("app_users.display_name fills tagline as 'Prepared by X' when project has no description", async () => {
    projectsResponse = {
      data: { name: "Acme", description: null, industry: null },
    };
    appUsersResponse = { data: { display_name: "Ada Founder" } };
    await GET(req());
    const data = renderCalls[0] as { startup: { tagline?: string } };
    expect(data.startup.tagline).toBe("Prepared by Ada Founder");
  });

  it("app_users.display_name does NOT overwrite an existing project tagline", async () => {
    projectsResponse = {
      data: { name: "Acme", description: "AI for tradies", industry: null },
    };
    appUsersResponse = { data: { display_name: "Ada Founder" } };
    await GET(req());
    const data = renderCalls[0] as { startup: { tagline?: string } };
    expect(data.startup.tagline).toBe("AI for tradies");
  });

  it("app_users.display_name whitespace-only does NOT fill tagline", async () => {
    projectsResponse = {
      data: { name: "Acme", description: null, industry: null },
    };
    appUsersResponse = { data: { display_name: "   " } };
    await GET(req());
    const data = renderCalls[0] as { startup: { tagline?: string } };
    expect(data.startup.tagline).toBeUndefined();
  });

  it("supabase null degrade — renderInvestorPack still called with email defaults, no from() calls", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET(req());
    expect(supabaseFromMock).not.toHaveBeenCalled();
    const data = renderCalls[0] as { startup: { name: string; tagline?: string; sector?: string } };
    expect(data.startup.name).toBe("founder");
    expect(data.startup.tagline).toBeUndefined();
    expect(data.startup.sector).toBeUndefined();
  });

  it("supabase throws on projects lookup — swallowed, app_users lookup still runs", async () => {
    projectsResponse = new Error("projects boom");
    appUsersResponse = { data: { display_name: "Ada Founder" } };
    const res = await GET(req());
    expect(res.status).toBe(200);
    const data = renderCalls[0] as { startup: { name: string; tagline?: string } };
    // Falls back to email-prefix + display_name tagline
    expect(data.startup.name).toBe("founder");
    expect(data.startup.tagline).toBe("Prepared by Ada Founder");
  });

  it("supabase throws on app_users lookup — swallowed, tagline stays whatever project supplied", async () => {
    projectsResponse = {
      data: { name: "Acme", description: "AI for tradies", industry: null },
    };
    appUsersResponse = new Error("app_users boom");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const data = renderCalls[0] as { startup: { tagline?: string } };
    expect(data.startup.tagline).toBe("AI for tradies");
  });

  it("missing projectId (null) — projects table not queried; app_users still fires", async () => {
    getProjectIdFromRequestMock.mockResolvedValue(null);
    appUsersResponse = { data: { display_name: "Ada Founder" } };
    await GET(req());
    const tables = supabaseCalls.map((c) => c.table);
    expect(tables).not.toContain("projects");
    expect(tables).toContain("app_users");
    const data = renderCalls[0] as { startup: { name: string; tagline?: string } };
    expect(data.startup.name).toBe("founder");
    expect(data.startup.tagline).toBe("Prepared by Ada Founder");
  });

  it("renderInvestorPack throws → 500 envelope", async () => {
    renderReturn = new Error("pdf boom");
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("PDF preview failed");
  });

  it("renderInvestorPack receives full 13-criterion SVI seed with grade='—', score=0, per-row score=NaN", async () => {
    await GET(req());
    const data = renderCalls[0] as {
      svi: {
        grade: string;
        score: number;
        delta30d?: number;
        criteria: Array<{ id: string; label: string; score: number }>;
      };
    };
    expect(data.svi.grade).toBe("—");
    expect(data.svi.score).toBe(0);
    expect(data.svi.delta30d).toBeUndefined();
    expect(data.svi.criteria).toHaveLength(13);
    for (const row of data.svi.criteria) {
      expect(typeof row.id).toBe("string");
      expect(typeof row.label).toBe("string");
      expect(Number.isNaN(row.score)).toBe(true);
    }
    expect(data.svi.criteria.map((c) => c.id)).toEqual(
      SVI_13_CRITERIA_FIXTURE.map((c) => c.id),
    );
  });

  it("asOfDate is today's UTC ISO date (YYYY-MM-DD)", async () => {
    await GET(req());
    const data = renderCalls[0] as { startup: { asOfDate: string } };
    const today = new Date().toISOString().slice(0, 10);
    expect(data.startup.asOfDate).toBe(today);
    expect(data.startup.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("filename slug caps at 60 chars", async () => {
    const longName = "A".repeat(120);
    projectsResponse = {
      data: { name: longName, description: null, industry: null },
    };
    const res = await GET(req());
    const dispo = res.headers.get("Content-Disposition") ?? "";
    // 60 chars of "a" between the fixed prefix + ".pdf" suffix
    const m = dispo.match(/filename="investor-pack-([a-z0-9-]+)\.pdf"/);
    expect(m).not.toBeNull();
    const slug = m![1]!;
    expect(slug.length).toBe(60);
    expect(slug).toBe("a".repeat(60));
  });

  it("filename falls back to 'startup' when the sanitised body collapses to empty", async () => {
    projectsResponse = {
      data: { name: "!!!@@@$$$", description: null, industry: null },
    };
    const res = await GET(req());
    const dispo = res.headers.get("Content-Disposition") ?? "";
    expect(dispo).toContain('filename="investor-pack-startup.pdf"');
  });

  it("teaser headline mirrors the resolved startup name; oneliner stable string", async () => {
    projectsResponse = {
      data: { name: "Acme Corp", description: null, industry: null },
    };
    await GET(req());
    const data = renderCalls[0] as {
      teaser: { headline: string; oneliner: string };
    };
    expect(data.teaser.headline).toBe("Acme Corp");
    expect(data.teaser.oneliner).toMatch(/BlockID\.au/);
    expect(data.teaser.oneliner).toMatch(/preview render/i);
  });

  it("capTable is undefined and traction.mrrHistory is [] on the preview payload", async () => {
    await GET(req());
    const data = renderCalls[0] as {
      capTable?: unknown;
      traction: { mrrHistory: unknown[] };
    };
    expect(data.capTable).toBeUndefined();
    expect(Array.isArray(data.traction.mrrHistory)).toBe(true);
    expect(data.traction.mrrHistory).toHaveLength(0);
  });
});
