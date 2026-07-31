import { describe, it, expect, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  populateFromTemplate,
  populateFromAtlassian,
  TEMPLATE_MIME_MARKER,
  type PopulateResult,
  type PopulateError,
  type TemplateRowOverride,
} from "./populate";
import type { DataRoomTemplateRow } from "./atlassian-template";
import { ATLASSIAN_DATAROOM_TEMPLATE } from "./atlassian-template";

// ---------------------------------------------------------------------------
// In-memory fake Supabase — handles the three query shapes populate.ts uses:
//   1. .from(t).select(...).eq("user_id", uid)                 (fetch existing)
//   2. .from(t).insert(rows).select("id")                      (insert new)
//   3. .from(t).update(...).eq().eq().neq("status","archived").select("id")
//      (replace-mode archive)
// Failures are injected via `state.fail = { fetch?|insert?|archive? }`.
// ---------------------------------------------------------------------------

// Declared as a type alias (not an interface) so it carries an implicit index
// signature and stays assignable to the `Record<string, unknown>` constraint on
// applyFilters() below — interfaces do not get one.
type DbRow = {
  id: string;
  user_id: string;
  email: string;
  svi_dimension: string;
  file_name: string;
  status: string;
  drive_file_url: string | null;
  mime_type: string;
  storage_path?: string | null;
  template_slug?: string | null;
  template_version?: string | null;
};

interface FakeState {
  rows: DbRow[];
  fail: {
    fetch?: string;
    insert?: string;
    archive?: string;
  };
  /** Records the last insert payload for shape assertions. */
  lastInsertPayload: Array<Record<string, unknown>> | null;
}

function makeSupabase(state: FakeState): SupabaseClient {
  // Chain-builder shared shape — a filter-accumulating thenable that resolves
  // to a Supabase-style { data, error } based on the accumulated mode.
  function makeChain(
    table: string,
    initialMode: "select" | "insert" | "update",
    initialPayload?: unknown,
  ) {
    const filters: Array<{ col: string; op: "eq" | "neq"; val: unknown }> = [];
    let mode = initialMode;
    let insertPayload: Array<Record<string, unknown>> | null =
      mode === "insert"
        ? (Array.isArray(initialPayload)
            ? (initialPayload as Array<Record<string, unknown>>)
            : [initialPayload as Record<string, unknown>])
        : null;
    const updatePayload: Record<string, unknown> | null =
      mode === "update" ? (initialPayload as Record<string, unknown>) : null;

    function resolveNow(): { data: unknown; error: { message: string } | null } {
      if (mode === "select") {
        if (state.fail.fetch) {
          return { data: null, error: { message: state.fail.fetch } };
        }
        const applied = applyFilters(state.rows, filters);
        return {
          data: applied.map((r) => ({
            id: r.id,
            svi_dimension: r.svi_dimension,
            file_name: r.file_name,
            status: r.status,
            mime_type: r.mime_type,
          })),
          error: null,
        };
      }
      if (mode === "insert") {
        if (state.fail.insert) {
          return { data: null, error: { message: state.fail.insert } };
        }
        const payload = insertPayload ?? [];
        state.lastInsertPayload = payload;
        const inserted: DbRow[] = payload.map((p, i) => ({
          id: `row-${state.rows.length + i}`,
          user_id: String(p.user_id ?? ""),
          email: String(p.email ?? ""),
          svi_dimension: String(p.svi_dimension ?? ""),
          file_name: String(p.file_name ?? ""),
          status: String(p.status ?? ""),
          drive_file_url:
            (p.drive_file_url as string | null | undefined) ?? null,
          mime_type: String(p.mime_type ?? ""),
          storage_path: p.storage_path as string | null | undefined,
          template_slug: p.template_slug as string | null | undefined,
          template_version: p.template_version as string | null | undefined,
        }));
        state.rows.push(...inserted);
        return {
          data: inserted.map((r) => ({ id: r.id })),
          error: null,
        };
      }
      // update mode
      if (state.fail.archive) {
        return { data: null, error: { message: state.fail.archive } };
      }
      const applied = applyFilters(state.rows, filters);
      for (const r of applied) {
        Object.assign(r, updatePayload ?? {});
      }
      return {
        data: applied.map((r) => ({ id: r.id })),
        error: null,
      };
    }

    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        filters.push({ col, op: "eq", val });
        return chain;
      },
      neq(col: string, val: unknown) {
        filters.push({ col, op: "neq", val });
        return chain;
      },
      // `.select("id")` on an insert/update chain is terminal — it triggers
      // resolution. On a select chain it's the initial call so we ignore
      // (already in select mode from `.from()`).
      select(_cols: string) {
        return chain;
      },
      then(
        resolve: (v: { data: unknown; error: { message: string } | null }) => void,
      ) {
        resolve(resolveNow());
      },
    };
    void table;
    return chain;
  }

  function from(table: string) {
    // Root shape — `.from(t)` returns something that supports `.select()` (starts
    // a SELECT chain), `.insert()` (starts an INSERT chain), `.update()`
    // (starts an UPDATE chain).
    return {
      select(_cols: string) {
        return makeChain(table, "select");
      },
      insert(payload: unknown) {
        return makeChain(table, "insert", payload);
      },
      update(payload: Record<string, unknown>) {
        return makeChain(table, "update", payload);
      },
    };
  }

  return { from } as unknown as SupabaseClient;
}

function applyFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: Array<{ col: string; op: "eq" | "neq"; val: unknown }>,
): T[] {
  return rows.filter((r) =>
    filters.every((f) =>
      f.op === "eq" ? r[f.col] === f.val : r[f.col] !== f.val,
    ),
  );
}

function makeState(): FakeState {
  return { rows: [], fail: {}, lastInsertPayload: null };
}

// Minimal 3-row template we can reason about without loading the full fixture.
const MINI_TEMPLATE: DataRoomTemplateRow[] = [
  {
    category: "1. Corporate & Legal",
    title: "Certificate of Incorporation",
    phaseSlug: "1",
    sourceUrl: "https://example.com/certificate",
    status_in_reference: "present",
  },
  {
    category: "1. Corporate & Legal",
    title: "Board Minutes L12M",
    phaseSlug: "8",
    status_in_reference: "inferred",
  },
  {
    category: "3. Financial Projections",
    title: "P&L Statement Historical",
    phaseSlug: "5",
    sourceUrl: "https://example.com/pnl",
    status_in_reference: "present",
  },
];

const OK_ARGS = {
  userId: "u-1",
  email: "founder@example.com",
  mode: "append" as const,
};

function assertOk(r: PopulateResult | PopulateError): asserts r is PopulateResult {
  if (!r.ok) throw new Error(`expected ok, got error=${(r as PopulateError).error}`);
}
function assertErr(
  r: PopulateResult | PopulateError,
): asserts r is PopulateError {
  if (r.ok) throw new Error(`expected error, got ok`);
}

// ---------------------------------------------------------------------------
describe("populateFromTemplate — guards", () => {
  it("returns user_missing when userId is blank", async () => {
    const state = makeState();
    const r = await populateFromTemplate({
      ...OK_ARGS,
      userId: "",
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertErr(r);
    expect(r.error).toBe("user_missing");
  });

  it("returns user_missing when email is blank", async () => {
    const state = makeState();
    const r = await populateFromTemplate({
      ...OK_ARGS,
      email: "",
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertErr(r);
    expect(r.error).toBe("user_missing");
  });

  it("returns ok with zero counts when template is empty", async () => {
    const state = makeState();
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: [],
      supabase: makeSupabase(state),
    });
    assertOk(r);
    expect(r.created).toBe(0);
    expect(r.updated).toBe(0);
    expect(r.skipped).toBe(0);
    expect(r.summary_by_phase).toEqual({});
    // No DB write occurred.
    expect(state.rows.length).toBe(0);
    expect(state.lastInsertPayload).toBeNull();
  });

  it("returns fetch_failed when the initial SELECT errors", async () => {
    const state = makeState();
    state.fail.fetch = "boom-fetch";
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertErr(r);
    expect(r.error).toBe("fetch_failed");
    expect(r.detail).toBe("boom-fetch");
  });
});

// ---------------------------------------------------------------------------
describe("populateFromTemplate — append mode", () => {
  it("inserts every template row on a clean DB with template-marker mime + status=missing", async () => {
    const state = makeState();
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    expect(r.created).toBe(MINI_TEMPLATE.length);
    expect(r.updated).toBe(0);
    expect(r.skipped).toBe(0);
    expect(state.rows.length).toBe(MINI_TEMPLATE.length);
    for (const row of state.rows) {
      expect(row.status).toBe("missing");
      expect(row.mime_type).toBe(TEMPLATE_MIME_MARKER);
      expect(row.user_id).toBe("u-1");
      expect(row.email).toBe("founder@example.com");
    }
  });

  it("stamps svi_dimension=category, file_name=title, drive_file_url=sourceUrl (null when absent)", async () => {
    const state = makeState();
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    const cert = state.rows.find((r) => r.file_name === "Certificate of Incorporation");
    const boardMinutes = state.rows.find((r) => r.file_name === "Board Minutes L12M");
    expect(cert?.svi_dimension).toBe("1. Corporate & Legal");
    expect(cert?.drive_file_url).toBe("https://example.com/certificate");
    // sourceUrl omitted → drive_file_url = null
    expect(boardMinutes?.drive_file_url).toBeNull();
  });

  it("aggregates summary_by_phase keyed on phaseSlug with count+missing incremented per row", async () => {
    const state = makeState();
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    // 3 template rows across phases 1, 8, 5
    expect(Object.keys(r.summary_by_phase).sort()).toEqual(["1", "5", "8"]);
    for (const bucket of Object.values(r.summary_by_phase)) {
      expect(bucket.count).toBe(1);
      expect(bucket.missing).toBe(1);
      expect(bucket.present).toBe(0);
    }
  });

  it("is idempotent — second call yields created=0, skipped=N, no duplicate rows", async () => {
    const state = makeState();
    const supabase = makeSupabase(state);
    const first = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      supabase,
    });
    assertOk(first);
    expect(first.created).toBe(MINI_TEMPLATE.length);

    const second = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      supabase,
    });
    assertOk(second);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(MINI_TEMPLATE.length);
    // No duplicates on natural key.
    expect(state.rows.length).toBe(MINI_TEMPLATE.length);
    // Existing template placeholders still count as "missing" in the summary.
    for (const bucket of Object.values(second.summary_by_phase)) {
      expect(bucket.missing).toBe(1);
      expect(bucket.present).toBe(0);
    }
  });

  it("counts a pre-existing user upload as present (not missing) and never overwrites it", async () => {
    const state = makeState();
    state.rows.push({
      id: "user-upload-1",
      user_id: "u-1",
      email: "founder@example.com",
      svi_dimension: "1. Corporate & Legal",
      file_name: "Certificate of Incorporation",
      status: "present",
      drive_file_url: "https://founder.example.com/real-cert.pdf",
      // Non-template mime marker: this row is a real user upload.
      mime_type: "application/pdf",
    });
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    // 3 template rows; 1 already-present as user upload, 2 fresh inserts.
    expect(r.created).toBe(2);
    expect(r.skipped).toBe(1);
    // The user upload is untouched.
    const preserved = state.rows.find((r) => r.id === "user-upload-1");
    expect(preserved?.mime_type).toBe("application/pdf");
    expect(preserved?.status).toBe("present");
    // Summary: phase 1 has count=1, present=1, missing=0 (the user already uploaded it).
    expect(r.summary_by_phase["1"]).toEqual({ count: 1, missing: 0, present: 1 });
  });

  it("counts a pre-existing template-placeholder row as missing in the summary", async () => {
    const state = makeState();
    state.rows.push({
      id: "existing-placeholder-1",
      user_id: "u-1",
      email: "founder@example.com",
      svi_dimension: "1. Corporate & Legal",
      file_name: "Certificate of Incorporation",
      status: "missing",
      drive_file_url: null,
      mime_type: TEMPLATE_MIME_MARKER,
    });
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    expect(r.summary_by_phase["1"]).toEqual({ count: 1, missing: 1, present: 0 });
    expect(r.skipped).toBeGreaterThanOrEqual(1);
  });

  it("returns insert_failed with detail when the insert errors", async () => {
    const state = makeState();
    state.fail.insert = "boom-insert";
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertErr(r);
    expect(r.error).toBe("insert_failed");
    expect(r.detail).toBe("boom-insert");
  });

  it("skips the insert call entirely when every template row already exists", async () => {
    const state = makeState();
    // Pre-seed every template row as a user upload so nothing to insert.
    for (const tpl of MINI_TEMPLATE) {
      state.rows.push({
        id: `seed-${tpl.title}`,
        user_id: "u-1",
        email: "founder@example.com",
        svi_dimension: tpl.category,
        file_name: tpl.title,
        status: "present",
        drive_file_url: null,
        mime_type: "application/pdf",
      });
    }
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(MINI_TEMPLATE.length);
    // The insert branch was never entered — payload never captured.
    expect(state.lastInsertPayload).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("populateFromTemplate — dry_run mode", () => {
  it("returns preview[] without inserting rows", async () => {
    const state = makeState();
    const r = await populateFromTemplate({
      ...OK_ARGS,
      mode: "dry_run",
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    expect(r.created).toBe(0);
    expect(r.updated).toBe(0);
    expect(r.preview?.length).toBe(MINI_TEMPLATE.length);
    // Preview mirrors (category, title, phaseSlug) only.
    for (const p of r.preview ?? []) {
      const found = MINI_TEMPLATE.find(
        (t) => t.title === p.title && t.category === p.category,
      );
      expect(found).toBeTruthy();
      expect(p.phaseSlug).toBe(found?.phaseSlug);
    }
    // No DB rows written.
    expect(state.rows.length).toBe(0);
    expect(state.lastInsertPayload).toBeNull();
  });

  it("dry_run preview excludes rows that already exist", async () => {
    const state = makeState();
    state.rows.push({
      id: "existing-1",
      user_id: "u-1",
      email: "founder@example.com",
      svi_dimension: "1. Corporate & Legal",
      file_name: "Certificate of Incorporation",
      status: "present",
      drive_file_url: null,
      mime_type: "application/pdf",
    });
    const r = await populateFromTemplate({
      ...OK_ARGS,
      mode: "dry_run",
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    expect(r.preview?.some((p) => p.title === "Certificate of Incorporation")).toBe(
      false,
    );
    expect(r.preview?.length).toBe(MINI_TEMPLATE.length - 1);
    expect(r.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe("populateFromTemplate — replace mode", () => {
  it("archives template-marker rows first, preserves user uploads, then inserts fresh placeholders", async () => {
    const state = makeState();
    // 1 stale template placeholder (will be archived), 1 user upload (preserved),
    // 1 already-archived template row (should NOT be re-archived — neq filter).
    state.rows.push(
      {
        id: "stale-placeholder-1",
        user_id: "u-1",
        email: "founder@example.com",
        svi_dimension: "6. Team & Advisors",
        file_name: "Some Stale Placeholder",
        status: "missing",
        drive_file_url: null,
        mime_type: TEMPLATE_MIME_MARKER,
      },
      {
        id: "user-upload-1",
        user_id: "u-1",
        email: "founder@example.com",
        svi_dimension: "3. Financial Projections",
        file_name: "Real Investor Deck.pdf",
        status: "present",
        drive_file_url: null,
        mime_type: "application/pdf",
      },
      {
        id: "already-archived-1",
        user_id: "u-1",
        email: "founder@example.com",
        svi_dimension: "1. Corporate & Legal",
        file_name: "Old Constitution",
        status: "archived",
        drive_file_url: null,
        mime_type: TEMPLATE_MIME_MARKER,
      },
    );
    const r = await populateFromTemplate({
      ...OK_ARGS,
      mode: "replace",
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    // The stale placeholder was archived (1 update).
    expect(r.updated).toBe(1);
    const stillMissing = state.rows.find((r) => r.id === "stale-placeholder-1");
    expect(stillMissing?.status).toBe("archived");
    // The user upload is untouched.
    const preserved = state.rows.find((r) => r.id === "user-upload-1");
    expect(preserved?.status).toBe("present");
    expect(preserved?.mime_type).toBe("application/pdf");
    // The already-archived row was NOT re-touched (neq("status","archived") filter).
    const alreadyArchived = state.rows.find((r) => r.id === "already-archived-1");
    expect(alreadyArchived?.status).toBe("archived");
    // Fresh inserts happened.
    expect(r.created).toBeGreaterThan(0);
  });

  it("returns archive_failed when the archive UPDATE errors", async () => {
    const state = makeState();
    state.fail.archive = "boom-archive";
    // Need at least one placeholder to attempt archiving.
    state.rows.push({
      id: "stale-1",
      user_id: "u-1",
      email: "founder@example.com",
      svi_dimension: "1. Corporate & Legal",
      file_name: "Old Placeholder",
      status: "missing",
      drive_file_url: null,
      mime_type: TEMPLATE_MIME_MARKER,
    });
    const r = await populateFromTemplate({
      ...OK_ARGS,
      mode: "replace",
      template: MINI_TEMPLATE,
      supabase: makeSupabase(state),
    });
    assertErr(r);
    expect(r.error).toBe("archive_failed");
    expect(r.detail).toBe("boom-archive");
  });
});

// ---------------------------------------------------------------------------
describe("populateFromTemplate — overrides map", () => {
  it("applies status='present' + mime_type override + storage_path + template_slug + template_version", async () => {
    const state = makeState();
    const overrides = new Map<string, TemplateRowOverride>([
      [
        `${MINI_TEMPLATE[0].category}::${MINI_TEMPLATE[0].title}`,
        {
          status: "present",
          mime_type: "application/pdf",
          storage_path: "startup-p1/templates/v1/cert.pdf",
          template_slug: "au-certificate-of-incorporation",
          template_version: "v1",
        },
      ],
    ]);
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      overrides,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    const overridden = state.rows.find(
      (r) => r.file_name === MINI_TEMPLATE[0].title,
    );
    expect(overridden?.status).toBe("present");
    expect(overridden?.mime_type).toBe("application/pdf");
    expect(overridden?.storage_path).toBe("startup-p1/templates/v1/cert.pdf");
    expect(overridden?.template_slug).toBe("au-certificate-of-incorporation");
    expect(overridden?.template_version).toBe("v1");
    // Un-overridden rows still fall back to the template-marker defaults.
    const other = state.rows.find(
      (r) => r.file_name === MINI_TEMPLATE[1].title,
    );
    expect(other?.status).toBe("missing");
    expect(other?.mime_type).toBe(TEMPLATE_MIME_MARKER);
    expect(other?.storage_path).toBeUndefined();
  });

  it("omits storage/template columns when the override is undefined or has falsy fields", async () => {
    const state = makeState();
    const overrides = new Map<string, TemplateRowOverride>([
      [
        `${MINI_TEMPLATE[0].category}::${MINI_TEMPLATE[0].title}`,
        {
          // Only status supplied — storage/template columns should NOT be set.
          status: "present",
        },
      ],
    ]);
    const r = await populateFromTemplate({
      ...OK_ARGS,
      template: MINI_TEMPLATE,
      overrides,
      supabase: makeSupabase(state),
    });
    assertOk(r);
    const row = state.rows.find(
      (r) => r.file_name === MINI_TEMPLATE[0].title,
    );
    expect(row?.status).toBe("present");
    // mime_type falls back to the template marker (override.mime_type undefined).
    expect(row?.mime_type).toBe(TEMPLATE_MIME_MARKER);
    expect(row?.storage_path).toBeUndefined();
    expect(row?.template_slug).toBeUndefined();
    expect(row?.template_version).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("populateFromAtlassian — convenience wrapper", () => {
  let state: FakeState;
  let supabase: SupabaseClient;

  beforeEach(() => {
    state = makeState();
    supabase = makeSupabase(state);
  });

  it("delegates to populateFromTemplate with ATLASSIAN_DATAROOM_TEMPLATE", async () => {
    const r = await populateFromAtlassian({
      userId: "u-1",
      email: "founder@example.com",
      mode: "dry_run",
      supabase,
    });
    assertOk(r);
    // Every preview row must correspond to a row in the shipped template.
    for (const p of r.preview ?? []) {
      const match = ATLASSIAN_DATAROOM_TEMPLATE.find(
        (t) => t.category === p.category && t.title === p.title,
      );
      expect(match).toBeTruthy();
    }
    // Preview length equals the shipped template length on a clean DB.
    expect(r.preview?.length).toBe(ATLASSIAN_DATAROOM_TEMPLATE.length);
  });

  it("summary_by_phase covers every phase that appears in the shipped template", async () => {
    const r = await populateFromAtlassian({
      userId: "u-1",
      email: "founder@example.com",
      mode: "append",
      supabase,
    });
    assertOk(r);
    const templatePhases = new Set(
      ATLASSIAN_DATAROOM_TEMPLATE.map((t) => t.phaseSlug),
    );
    const summaryPhases = new Set(Object.keys(r.summary_by_phase));
    expect(summaryPhases).toEqual(templatePhases);
    // Row count invariant: rows created + skipped = template length on a clean DB.
    expect(r.created + r.skipped).toBe(ATLASSIAN_DATAROOM_TEMPLATE.length);
  });
});
