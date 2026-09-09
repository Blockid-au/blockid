// Colocated spec for the publish store.
//
// The properties pinned here are the ones a browser test cannot see and a
// code review can miss:
//
//   * the read path only ever touches v_published_analysis, so a leak of
//     input_text / input_url / anon_key is structurally impossible;
//   * ownership is checked against a SIGNED-IN user id and a null user_id
//     never authorises anybody;
//   * publish writes the presentation row BEFORE flipping public_visible,
//     and unpublish flips public_visible FIRST — so a half-completed publish
//     is invisible rather than live-and-blank, and a half-completed unpublish
//     is already private;
//   * a republish keeps the URL it already had rather than silently orphaning
//     whatever the founder has already shared.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { method: string; args: unknown[] };

interface Handler {
  select?: unknown;
  selectError?: { message: string } | null;
  upsertError?: { message: string } | null;
  updateError?: { message: string } | null;
}

const state = {
  calls: [] as Call[],
  tables: {} as Record<string, Handler>,
  configured: true,
};

function chain(table: string) {
  const handler = state.tables[table] ?? {};
  const result = {
    data: handler.select ?? null,
    error: handler.selectError ?? null,
  };
  const api: Record<string, unknown> = {};
  const passthrough = (name: string) =>
    (...args: unknown[]) => {
      state.calls.push({ method: `${table}.${name}`, args });
      return api;
    };
  for (const m of ["select", "eq", "order", "limit", "like", "is", "gte"]) {
    api[m] = passthrough(m);
  }
  api.maybeSingle = () => {
    state.calls.push({ method: `${table}.maybeSingle`, args: [] });
    return Promise.resolve(result);
  };
  api.single = api.maybeSingle;
  api.upsert = (...args: unknown[]) => {
    state.calls.push({ method: `${table}.upsert`, args });
    return Promise.resolve({ error: handler.upsertError ?? null });
  };
  api.update = (...args: unknown[]) => {
    state.calls.push({ method: `${table}.update`, args });
    const updateApi: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ error: handler.updateError ?? null }).then(resolve),
    };
    updateApi.eq = (...a: unknown[]) => {
      state.calls.push({ method: `${table}.update.eq`, args: a });
      return updateApi;
    };
    return updateApi;
  };
  // A terminal `await` on the chain (select + order + limit, no maybeSingle).
  api.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return api;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () =>
    state.configured ? { from: (t: string) => chain(t) } : null,
}));

import {
  PUBLISHED_TABLE,
  PUBLISHED_VIEW,
  getPublishState,
  getPublishedBySlug,
  listPublished,
  listPublishedForSitemap,
  publishAnalysis,
  unpublishAnalysis,
} from "./store";
import { SVI_DIMENSION_KEYS } from "./eligibility";

const ID = "aaaaaaaa-1111-1111-1111-111111111111";
const USER = "user-1";

const SVI = {
  version: "2.1.0",
  totalSVI: 118,
  stage: 2,
  stageLabel: "MVP / Prototype",
  summary: "s",
  confidenceMultiplier: 0.5,
  dimensions: Object.fromEntries(SVI_DIMENSION_KEYS.map((k) => [k, 55])),
  nextActions: [
    { priority: "P0", title: "One", detail: "A detail long enough to count." },
    { priority: "P0", title: "Two", detail: "A detail long enough to count." },
    { priority: "P1", title: "Three", detail: "A detail long enough to count." },
  ],
  valuation: {
    low: 1,
    mid: 2,
    high: 3,
    method: "Berkus",
    confidence: 50,
    currency: "AUD",
  },
};

const GOOD_INPUT = {
  companyName: "Corella Health",
  oneLiner:
    "A GP-first triage tool that cuts avoidable emergency-department referrals for regional Australian clinics.",
  sector: "healthtech",
  websiteUrl: "https://corellahealth.com.au",
};

function methods(): string[] {
  return state.calls.map((c) => c.method);
}

beforeEach(() => {
  state.calls = [];
  state.tables = {};
  state.configured = true;
});

describe("read path", () => {
  it("reads live profiles only through the whitelisted view", async () => {
    state.tables[PUBLISHED_VIEW] = { select: { slug: "corella-health" } };
    await getPublishedBySlug("corella-health");
    await listPublished();
    // Never the base tables — the view cannot emit input_text or anon_key.
    expect(methods().every((m) => m.startsWith(`${PUBLISHED_VIEW}.`))).toBe(true);
  });

  it("refuses a slug that could not have been minted here", async () => {
    for (const bad of ["../secrets", "Corella-Health", "ab", ""]) {
      expect(await getPublishedBySlug(bad)).toBeNull();
    }
    expect(state.calls).toHaveLength(0);
  });

  it("degrades to empty rather than throwing when storage is absent", async () => {
    state.configured = false;
    expect(await getPublishedBySlug("corella-health")).toBeNull();
    expect(await listPublished()).toEqual([]);
    expect(await listPublishedForSitemap()).toEqual([]);
  });

  it("hands the sitemap only slugs and timestamps", async () => {
    state.tables[PUBLISHED_VIEW] = {
      select: [
        { slug: "a-co", updated_at: "2026-09-09T00:00:00.000Z", svi: SVI },
      ],
    };
    expect(await listPublishedForSitemap()).toEqual([
      { slug: "a-co", updatedAt: "2026-09-09T00:00:00.000Z" },
    ]);
  });
});

describe("ownership", () => {
  it("returns nothing for an analysis owned by somebody else", async () => {
    state.tables.analyses = { select: { id: ID, user_id: "someone-else", svi: SVI } };
    expect(await getPublishState(ID, USER)).toBeNull();
    expect(
      await publishAnalysis({ analysisId: ID, userId: USER, input: GOOD_INPUT }),
    ).toMatchObject({ ok: false, status: 404 });
  });

  // A run created anonymously has user_id null. Publishing is durable and
  // public; a cleared cookie must not be able to claim a company's name.
  it("returns nothing for an unclaimed anonymous run", async () => {
    state.tables.analyses = { select: { id: ID, user_id: null, svi: SVI } };
    expect(await getPublishState(ID, USER)).toBeNull();
  });
});

describe("publishAnalysis", () => {
  beforeEach(() => {
    state.tables.analyses = {
      select: { id: ID, user_id: USER, public_visible: false, svi: SVI },
    };
  });

  it("refuses an analysis that fails the thinness gate, before writing anything", async () => {
    state.tables.analyses = {
      select: {
        id: ID,
        user_id: USER,
        public_visible: false,
        svi: { ...SVI, confidenceMultiplier: 0.2 },
      },
    };
    const result = await publishAnalysis({
      analysisId: ID,
      userId: USER,
      input: GOOD_INPUT,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(methods()).not.toContain(`${PUBLISHED_TABLE}.upsert`);
    expect(methods()).not.toContain("analyses.update");
  });

  it("refuses invalid founder fields before writing anything", async () => {
    const result = await publishAnalysis({
      analysisId: ID,
      userId: USER,
      input: { ...GOOD_INPUT, oneLiner: "too short" },
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(methods()).not.toContain("analyses.update");
  });

  it("writes the profile row BEFORE flipping public_visible", async () => {
    const result = await publishAnalysis({
      analysisId: ID,
      userId: USER,
      input: GOOD_INPUT,
    });
    expect(result).toMatchObject({ ok: true, slug: "corella-health" });
    const order = methods();
    // A half-completed publish must be invisible, never live-and-blank.
    expect(order.indexOf(`${PUBLISHED_TABLE}.upsert`)).toBeLessThan(
      order.indexOf("analyses.update"),
    );
    const update = state.calls.find((c) => c.method === "analyses.update");
    expect(update?.args[0]).toEqual({ public_visible: true });
  });

  it("keeps the URL a republished profile already had", async () => {
    state.tables[PUBLISHED_TABLE] = {
      select: {
        slug: "corella-health-2",
        company_name: "Old",
        one_liner: "old",
        sector: "saas",
        website_url: null,
        first_published_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
        unpublished_at: "2026-09-05T00:00:00.000Z",
      },
    };
    const result = await publishAnalysis({
      analysisId: ID,
      userId: USER,
      input: GOOD_INPUT,
    });
    expect(result).toMatchObject({ ok: true, slug: "corella-health-2" });
    const upsert = state.calls.find(
      (c) => c.method === `${PUBLISHED_TABLE}.upsert`,
    );
    // Republishing must clear the withdrawal stamp, not leave a live row that
    // the view still filters out.
    expect(upsert?.args[0]).toMatchObject({
      slug: "corella-health-2",
      unpublished_at: null,
    });
  });

  it("never writes anything derived from the founder's input", async () => {
    await publishAnalysis({ analysisId: ID, userId: USER, input: GOOD_INPUT });
    const upsert = state.calls.find(
      (c) => c.method === `${PUBLISHED_TABLE}.upsert`,
    );
    expect(Object.keys(upsert?.args[0] as object).sort()).toEqual([
      "analysis_id",
      "company_name",
      "one_liner",
      "sector",
      "slug",
      "unpublished_at",
      "updated_at",
      "user_id",
      "website_url",
    ]);
  });
});

describe("unpublishAnalysis", () => {
  beforeEach(() => {
    state.tables.analyses = {
      select: { id: ID, user_id: USER, public_visible: true, svi: SVI },
    };
  });

  it("flips public_visible FIRST so the page stops resolving immediately", async () => {
    const result = await unpublishAnalysis({ analysisId: ID, userId: USER });
    expect(result).toEqual({ ok: true, status: 200 });
    const order = methods();
    expect(order.indexOf("analyses.update")).toBeLessThan(
      order.indexOf(`${PUBLISHED_TABLE}.update`),
    );
    const update = state.calls.find((c) => c.method === "analyses.update");
    expect(update?.args[0]).toEqual({ public_visible: false });
  });

  it("keeps the profile row so a republish returns the same URL", async () => {
    await unpublishAnalysis({ analysisId: ID, userId: USER });
    expect(methods()).not.toContain(`${PUBLISHED_TABLE}.delete`);
    const stamp = state.calls.find(
      (c) => c.method === `${PUBLISHED_TABLE}.update`,
    );
    expect(Object.keys(stamp?.args[0] as object)).toEqual(["unpublished_at"]);
  });

  it("refuses a caller who does not own the analysis", async () => {
    state.tables.analyses = { select: { id: ID, user_id: "other", svi: SVI } };
    expect(await unpublishAnalysis({ analysisId: ID, userId: USER })).toEqual({
      ok: false,
      status: 404,
    });
    expect(methods()).not.toContain("analyses.update");
  });

  it("reports a failed flag write rather than claiming success", async () => {
    state.tables.analyses = {
      select: { id: ID, user_id: USER, public_visible: true, svi: SVI },
      updateError: { message: "nope" },
    };
    expect(await unpublishAnalysis({ analysisId: ID, userId: USER })).toEqual({
      ok: false,
      status: 500,
    });
  });
});
