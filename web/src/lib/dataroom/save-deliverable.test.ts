// Colocated tests for saveDeliverable (T0244) — the upload + dataroom_files
// upsert extracted from the accelerator-apply route. Pins the storage path
// shape, upsert:true on upload, update-when-exists vs insert-when-missing on
// (user_id, template_slug), the error codes / statuses the routes map, and
// the best-effort signed URL.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  configured: true,
  uploadError: null as null | { message: string },
  existing: null as null | { id: string },
  updateError: null as null | { message: string },
  insertError: null as null | { message: string },
  signedUrl: "https://signed.example/x" as string | null,
  uploads: [] as Array<{ path: string; opts: Row }>,
  updates: [] as Row[],
  inserts: [] as Row[],
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => state.configured,
  getSupabaseAdmin: () =>
    state.configured
      ? {
          storage: {
            from: (bucket: string) => ({
              upload: async (path: string, _buf: unknown, opts: Row) => {
                state.uploads.push({ path: `${bucket}:${path}`, opts });
                return { error: state.uploadError, data: state.uploadError ? null : { path } };
              },
              createSignedUrl: async () => ({ data: state.signedUrl ? { signedUrl: state.signedUrl } : null }),
            }),
          },
          from: (table: string) => {
            if (table !== "dataroom_files") throw new Error(`unexpected table ${table}`);
            const filters: Row = {};
            const q = {
              select: () => q,
              eq: (k: string, v: unknown) => {
                filters[k] = v;
                return q;
              },
              maybeSingle: async () => ({ data: state.existing, error: null }),
              update: (patch: Row) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      state.updates.push(patch);
                      return state.updateError ? { data: null, error: state.updateError } : { data: { id: state.existing?.id }, error: null };
                    },
                  }),
                }),
              }),
              insert: (row: Row) => ({
                select: () => ({
                  maybeSingle: async () => {
                    state.inserts.push(row);
                    return state.insertError ? { data: null, error: state.insertError } : { data: { id: "new-row" }, error: null };
                  },
                }),
              }),
            };
            return q;
          },
        }
      : null,
}));

import { extensionForMime, saveDeliverable } from "./save-deliverable";

const BASE = {
  userId: "user-1",
  email: "f@acme.io",
  projectId: "proj-1",
  buffer: Buffer.from("%PDF"),
  mime: "application/pdf",
  template_slug: "package_pitch_accelerator_apply_startmate",
};

beforeEach(() => {
  state.configured = true;
  state.uploadError = null;
  state.existing = null;
  state.updateError = null;
  state.insertError = null;
  state.signedUrl = "https://signed.example/x";
  state.uploads = [];
  state.updates = [];
  state.inserts = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("saveDeliverable", () => {
  it("uploads with upsert to startup-<project>/package/<slug>-v1.pdf and inserts a present row when none exists", async () => {
    const res = await saveDeliverable(BASE);
    expect(res).toEqual({
      ok: true,
      dataroomFileId: "new-row",
      storagePath: "startup-proj-1/package/package_pitch_accelerator_apply_startmate-v1.pdf",
      downloadUrl: "https://signed.example/x",
    });
    expect(state.uploads).toEqual([
      {
        path: "dataroom:startup-proj-1/package/package_pitch_accelerator_apply_startmate-v1.pdf",
        opts: { contentType: "application/pdf", upsert: true },
      },
    ]);
    expect(state.inserts).toEqual([
      {
        user_id: "user-1",
        email: "f@acme.io",
        svi_dimension: "package",
        file_name: "package_pitch_accelerator_apply_startmate.pdf",
        status: "present",
        mime_type: "application/pdf",
        storage_path: "startup-proj-1/package/package_pitch_accelerator_apply_startmate-v1.pdf",
        template_slug: "package_pitch_accelerator_apply_startmate",
        template_version: "v1",
      },
    ]);
    expect(state.updates).toEqual([]);
  });

  it("updates the existing (user, slug) row instead of inserting, and honours folder / dimension / filename overrides", async () => {
    state.existing = { id: "df-9" };
    const res = await saveDeliverable({
      ...BASE,
      template_slug: "funding_money_finder_report",
      filename: "money-finder-report-1111.pdf",
      folder: "funding",
      svi_dimension: "funding",
      template_version: "v2",
    });
    expect(res).toMatchObject({ ok: true, dataroomFileId: "df-9", storagePath: "startup-proj-1/funding/funding_money_finder_report-v2.pdf" });
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([
      {
        storage_path: "startup-proj-1/funding/funding_money_finder_report-v2.pdf",
        mime_type: "application/pdf",
        status: "present",
        template_version: "v2",
        file_name: "money-finder-report-1111.pdf",
      },
    ]);
  });

  it("returns the route-mapped error codes", async () => {
    state.configured = false;
    expect(await saveDeliverable(BASE)).toEqual({ ok: false, error: "service_unavailable", status: 503 });
    state.configured = true;

    state.uploadError = { message: "bucket missing" };
    expect(await saveDeliverable(BASE)).toEqual({ ok: false, error: "storage_upload_failed", status: 502 });
    state.uploadError = null;

    state.insertError = { message: "rls" };
    expect(await saveDeliverable(BASE)).toEqual({ ok: false, error: "dataroom_row_insert_failed", status: 500 });
    state.insertError = null;

    state.existing = { id: "df-1" };
    state.updateError = { message: "rls" };
    expect(await saveDeliverable(BASE)).toEqual({ ok: false, error: "dataroom_row_update_failed", status: 500 });
  });

  it("signed URL is best-effort", async () => {
    state.signedUrl = null;
    const res = await saveDeliverable(BASE);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.downloadUrl).toBeNull();
  });

  it("maps mime → extension", () => {
    expect(extensionForMime("application/pdf")).toBe("pdf");
    expect(extensionForMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
    expect(extensionForMime("application/octet-stream")).toBe("bin");
  });
});
