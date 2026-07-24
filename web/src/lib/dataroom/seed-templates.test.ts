import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedDataroomTemplates } from "./seed-templates";
import {
  DATAROOM_TEMPLATE_MANIFEST,
  templateStoragePath,
} from "./template-manifest";

// ---------------------------------------------------------------------------
// Fake Supabase — records storage uploads + dataroom_files inserts in memory.
// ---------------------------------------------------------------------------

type UploadState = {
  paths: Set<string>;
  failNext: string | null; // slug whose next upload should fail with this reason
};

type DbState = {
  rows: Array<Record<string, unknown>>;
};

function makeFake(
  storage: UploadState,
  db: DbState,
): SupabaseClient {
  const client = {
    storage: {
      from(_bucket: string) {
        return {
          async upload(
            p: string,
            _bytes: Buffer,
            _opts: { upsert: boolean; contentType: string },
          ) {
            if (storage.failNext) {
              const reason = storage.failNext;
              storage.failNext = null;
              return { error: { message: reason } };
            }
            if (storage.paths.has(p)) {
              // Mimic Supabase "Duplicate" response for upsert:false collision.
              return { error: { message: "The resource already exists" } };
            }
            storage.paths.add(p);
            return { error: null };
          },
        };
      },
    },
    from(_table: string) {
      const builder = {
        _op: "select" as "select" | "insert",
        _payload: null as unknown,
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        insert(payload: unknown) {
          builder._op = "insert";
          builder._payload = payload;
          return builder;
        },
        // Terminal that populate.ts calls: `.select("id")` returns { data, error }.
        // We fulfil both flows: for the initial SELECT (fetch existing rows) we
        // return the current DB rows; for INSERT we push and return ids.
        async then(resolve: (v: { data: unknown; error: null }) => void) {
          if (builder._op === "insert") {
            const arr = Array.isArray(builder._payload)
              ? (builder._payload as Array<Record<string, unknown>>)
              : [builder._payload as Record<string, unknown>];
            const inserted = arr.map((r, i) => {
              const row = { ...r, id: `row-${db.rows.length + i}` };
              db.rows.push(row);
              return { id: row.id };
            });
            resolve({ data: inserted, error: null });
          } else {
            // Select existing rows (used by populate.ts to build the dedupe map).
            resolve({
              data: db.rows.map((r) => ({
                id: r.id,
                svi_dimension: r.svi_dimension,
                file_name: r.file_name,
                status: r.status,
                mime_type: r.mime_type,
              })),
              error: null,
            });
          }
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return client;
}

const TEMPLATES_DIR = path.join(process.cwd(), "public", "templates");

describe("seedDataroomTemplates", () => {
  let storage: UploadState;
  let db: DbState;
  let supabase: SupabaseClient;

  beforeEach(() => {
    storage = { paths: new Set(), failNext: null };
    db = { rows: [] };
    supabase = makeFake(storage, db);
  });

  it("uploads all 10 templates and inserts 10 rows on a clean project", async () => {
    const result = await seedDataroomTemplates({
      projectId: "p1",
      userId: "u1",
      email: "founder@example.com",
      supabase,
      templatesDir: TEMPLATES_DIR,
    });

    expect(result.ok).toBe(true);
    expect(result.uploaded).toBe(10);
    expect(result.skipped).toBe(0);
    expect(result.failed).toEqual([]);
    // 10 paths written to storage under the tenant prefix.
    expect(storage.paths.size).toBe(10);
    for (const entry of DATAROOM_TEMPLATE_MANIFEST) {
      expect(storage.paths.has(templateStoragePath("p1", entry))).toBe(true);
    }
    // 10 dataroom_files rows inserted with status='present' + template metadata.
    expect(db.rows.length).toBe(10);
    for (const row of db.rows) {
      expect(row.status).toBe("present");
      expect(row.template_slug).toBeTruthy();
      expect(row.template_version).toBe("v1");
      expect(row.storage_path).toMatch(/^startup-p1\/templates\/v1\//);
    }
  });

  it("is idempotent — second call yields uploaded=0, skipped=10, failed=[]", async () => {
    const first = await seedDataroomTemplates({
      projectId: "p1",
      userId: "u1",
      email: "founder@example.com",
      supabase,
      templatesDir: TEMPLATES_DIR,
    });
    expect(first.ok).toBe(true);

    const second = await seedDataroomTemplates({
      projectId: "p1",
      userId: "u1",
      email: "founder@example.com",
      supabase,
      templatesDir: TEMPLATES_DIR,
    });
    expect(second.ok).toBe(true);
    expect(second.uploaded).toBe(0);
    expect(second.skipped).toBe(10);
    expect(second.failed).toEqual([]);
    // Storage still holds exactly 10 paths.
    expect(storage.paths.size).toBe(10);
    // No duplicate DB rows on the natural key (svi_dimension, file_name).
    expect(db.rows.length).toBe(10);
  });

  it("returns ok:false with failed[] populated on partial upload failure", async () => {
    storage.failNext = "storage_boom";
    const result = await seedDataroomTemplates({
      projectId: "p1",
      userId: "u1",
      email: "founder@example.com",
      supabase,
      templatesDir: TEMPLATES_DIR,
    });
    expect(result.ok).toBe(false);
    // 9 of 10 uploaded, 1 failed.
    expect(result.uploaded).toBe(9);
    expect(result.failed.length).toBe(1);
    expect(DATAROOM_TEMPLATE_MANIFEST.map((t) => t.slug)).toContain(
      result.failed[0],
    );
  });

  it("returns ok:false when supabase is missing", async () => {
    const result = await seedDataroomTemplates({
      projectId: "p1",
      userId: "u1",
      email: "founder@example.com",
      supabase: undefined,
      templatesDir: TEMPLATES_DIR,
    });
    // No admin client available in vitest env — expect deferred posture.
    expect(result.ok).toBe(false);
    expect(result.failed.length).toBe(10);
  });
});
