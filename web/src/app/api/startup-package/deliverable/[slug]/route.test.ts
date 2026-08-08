// Unit tests for POST /api/startup-package/deliverable/[slug] —
// P5-deliverable-slug-route-test. Completes the P5 startup-package
// route-test slate alongside P5-analyze/save-answer/reservation/svi-snapshot.
//
// This is the founder-triggered auto-fill entry point on top of the
// deliverable registry (covered by deliverable-registry.test.ts). Sits
// directly on the [[project_startup_package_ship1]] guided-founder journey
// — a founder just A$149-committed to the Startup Package clicks
// "Auto-fill Pitch Deck" and hits this route. Silent regressions we pin:
//   - dropping the auth gate so anonymous callers can burn credits;
//   - dropping the ownership check on `getProjectById` so a founder can
//     upload a PDF into another founder's dataroom_files row;
//   - flipping the rate-limit bucket / limit / window off the shipped
//     (20/hour) contract the transport SLA depends on;
//   - dropping the pre-flight `canAfford` so the founder is charged after
//     an insufficient-credit render (breaks the "never charge on failure"
//     contract at route.ts:225);
//   - dropping the storage-upload-before-DB-write ordering so a broken
//     dataroom_files row survives a storage failure;
//   - dropping the (user_id, template_slug) natural-key idempotency so a
//     re-click writes a duplicate PDF row + burns credits twice;
//   - dropping the "half-success" 402 envelope on credit_spend_failed
//     which is the only branch that surfaces `dataroomFileId` alongside
//     the credit error so the UI can still open the PDF the founder just
//     rendered;
//   - dropping the storage path shape (`startup-<projectId>/package/<templateSlug>-v1.pdf`)
//     — the /workspace/dataroom UI resolves the founder's PDFs by this key.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth";
import type { Project } from "@/lib/projects";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn<() => Promise<AppUser | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const consumeRateLimitMock =
  vi.fn<(opts: Record<string, unknown>) => Promise<Record<string, unknown>>>();
vi.mock("@/lib/rate-limit/persistent", () => ({
  consumeRateLimit: (opts: Record<string, unknown>) => consumeRateLimitMock(opts),
}));

const getProjectByIdMock = vi.fn<(id: string) => Promise<Project | null>>();
vi.mock("@/lib/projects", () => ({
  getProjectById: (id: string) => getProjectByIdMock(id),
}));

const canAffordMock =
  vi.fn<(userId: string, feature: string) => Promise<Record<string, unknown>>>();
const spendCreditsMock =
  vi.fn<
    (
      userId: string,
      feature: string,
      meta?: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>
  >();
vi.mock("@/lib/credits", () => ({
  canAfford: (u: string, f: string) => canAffordMock(u, f),
  spendCredits: (u: string, f: string, m?: Record<string, unknown>) =>
    spendCreditsMock(u, f, m),
  FEATURE_COSTS: {
    pitch_deck: 3,
    svi_report: 2,
    valuation_detailed: 5,
  } as Record<string, number>,
}));

// Storage + DB double — call-shape assertions live on `state`.
type StorageBehaviour = {
  uploadResult: { data?: unknown; error?: { message: string } | null };
  signedThrows?: boolean;
  signedResult?: { data?: { signedUrl: string } | null };
};

type SupabaseState = {
  fromCalls: string[];
  storagePathUploaded: string | null;
  uploadOptions: Record<string, unknown> | null;
  uploadedBufferSize: number | null;
  signedPath: string | null;
  signedExpires: number | null;
  existingRow: { id: string } | null;
  existingRowError: { message: string } | null;
  updatePayload: Record<string, unknown> | null;
  updateFilterId: string | null;
  updateResult: { data?: { id: string } | null; error?: { message: string } | null };
  insertPayload: Record<string, unknown> | null;
  insertResult: { data?: { id: string } | null; error?: { message: string } | null };
  storage: StorageBehaviour;
};

let supabaseState: SupabaseState;
let supabaseAdminValue: unknown | null;

function resetSupabase() {
  supabaseState = {
    fromCalls: [],
    storagePathUploaded: null,
    uploadOptions: null,
    uploadedBufferSize: null,
    signedPath: null,
    signedExpires: null,
    existingRow: null,
    existingRowError: null,
    updatePayload: null,
    updateFilterId: null,
    updateResult: { data: { id: "row-1" } },
    insertPayload: null,
    insertResult: { data: { id: "row-1" } },
    storage: {
      uploadResult: { data: { path: "ignored" }, error: null },
      signedThrows: false,
      signedResult: { data: { signedUrl: "https://signed.example/x?token=abc" } },
    },
  };
  supabaseAdminValue = makeSupabase();
}

function makeSupabase(): unknown {
  const makeChain = (tableName: string) => {
    let mode: "select" | "update" | "insert" = "select";

    const terminalResolve = () => {
      if (tableName === "dataroom_files") {
        if (mode === "select") {
          if (supabaseState.existingRowError) {
            return { data: null, error: supabaseState.existingRowError };
          }
          return { data: supabaseState.existingRow ?? null, error: null };
        }
        if (mode === "update") return supabaseState.updateResult;
        if (mode === "insert") return supabaseState.insertResult;
      }
      // Other tables — buildInputContext + loadLatestSvi tolerate `null`.
      return { data: null, error: null };
    };

    const chain: Record<string, unknown> = {
      select() {
        return chain;
      },
      eq() {
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      maybeSingle() {
        return Promise.resolve(terminalResolve());
      },
      single() {
        return Promise.resolve(terminalResolve());
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        try {
          return Promise.resolve(terminalResolve()).then(onFulfilled, onRejected);
        } catch (err) {
          return Promise.reject(err).then(onFulfilled, onRejected);
        }
      },
      update(payload: Record<string, unknown>) {
        mode = "update";
        if (tableName === "dataroom_files") {
          supabaseState.updatePayload = payload;
          return {
            eq: (col: string, val: string) => {
              if (col === "id") supabaseState.updateFilterId = val;
              return {
                select: () => ({
                  maybeSingle: () =>
                    Promise.resolve(supabaseState.updateResult),
                }),
              };
            },
          };
        }
        return chain;
      },
      insert(payload: Record<string, unknown>) {
        mode = "insert";
        if (tableName === "dataroom_files") {
          supabaseState.insertPayload = payload;
          return {
            select: () => ({
              maybeSingle: () => Promise.resolve(supabaseState.insertResult),
            }),
          };
        }
        return chain;
      },
    };
    return chain;
  };

  return {
    from(tableName: string) {
      supabaseState.fromCalls.push(tableName);
      return makeChain(tableName);
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(
            path: string,
            buffer: Buffer,
            options: Record<string, unknown>,
          ) {
            supabaseState.storagePathUploaded = path;
            supabaseState.uploadOptions = { bucket, ...options };
            supabaseState.uploadedBufferSize = buffer.length;
            return supabaseState.storage.uploadResult;
          },
          async createSignedUrl(path: string, expires: number) {
            supabaseState.signedPath = path;
            supabaseState.signedExpires = expires;
            if (supabaseState.storage.signedThrows) {
              throw new Error("signed url broken");
            }
            return supabaseState.storage.signedResult ?? { data: null };
          },
        };
      },
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => supabaseAdminValue,
}));

// PDF generator dependencies — only pitch-deck is exercised on the happy
// path, so we stub `renderToBuffer` + `PitchDeckPDF` here and swap the
// registry to a single-entry fixture below.
const renderToBufferMock = vi.fn<() => Promise<Buffer>>();
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: () => renderToBufferMock(),
}));

vi.mock("@/lib/pdf/pitch-deck-pdf", () => ({
  PitchDeckPDF: () => ({ type: "Document" }),
}));

// Single-entry registry fixture — every test uses `pitch_deck` so the
// route dispatch always lands on the pitch-deck generator branch.
const getDeliverableMock = vi.fn<
  (key: string) => {
    key: string;
    featureKey: string;
    templateSlug: string;
    dataroomFolder: string;
    pdfGenerator: string;
    inputBuilder: () => unknown;
  } | null
>();
vi.mock("@/lib/startup-package/deliverable-registry", () => ({
  getDeliverable: (key: string) => getDeliverableMock(key),
}));

import { POST } from "./route";

const DEFAULT_ENTRY = {
  key: "pitch_deck",
  featureKey: "pitch_deck",
  templateSlug: "package_vision_pitch_deck",
  dataroomFolder: "pitch",
  pdfGenerator: "pitch-deck",
  inputBuilder: () => ({}),
};

function makeUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "u-1",
    email: "founder@example.com",
    displayName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    role: "user",
    plan: "free",
    googleId: null,
    avatarUrl: null,
    discountPct: null,
    startupName: null,
    startupStage: null,
    industry: null,
    onboardingCompleted: true,
    ...overrides,
  } as AppUser;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    userId: "u-1",
    name: "Test",
    slug: "test",
    description: null,
    industry: null,
    stage: 0,
    isDefault: true,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    growth_phase_current: null,
    ...overrides,
  };
}

function allowRate() {
  return {
    allowed: true,
    limit: 20,
    remaining: 19,
    reset_at: "2026-08-08T01:00:00.000Z",
  };
}

function denyRate(retry: number | null) {
  return {
    allowed: false,
    limit: 20,
    remaining: 0,
    reset_at: "2026-08-08T01:00:00.000Z",
    ...(retry != null ? { retry_after_seconds: retry } : {}),
  };
}

function makeRequest(slug: string, body: unknown | "raw", raw?: string): Request {
  return new Request(`http://x/api/startup-package/deliverable/${slug}`, {
    method: "POST",
    body: body === "raw" ? raw : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function makeCtx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

async function invoke(
  slug: string,
  body: unknown | "raw",
  raw?: string,
): Promise<Response> {
  return POST(makeRequest(slug, body, raw), makeCtx(slug));
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  consumeRateLimitMock.mockReset();
  getProjectByIdMock.mockReset();
  canAffordMock.mockReset();
  spendCreditsMock.mockReset();
  renderToBufferMock.mockReset();
  getDeliverableMock.mockReset();
  resetSupabase();

  // Defaults that keep the happy path green — individual tests override.
  getDeliverableMock.mockImplementation((key) =>
    key === DEFAULT_ENTRY.key ? DEFAULT_ENTRY : null,
  );
  renderToBufferMock.mockResolvedValue(Buffer.from("%PDF-1.4\n%…"));
});

describe("POST /api/startup-package/deliverable/[slug]", () => {
  it("returns 401 for anonymous callers and short-circuits before rate-limit + registry + supabase", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await invoke("pitch_deck", { projectId: "proj-1" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(getDeliverableMock).not.toHaveBeenCalled();
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(renderToBufferMock).not.toHaveBeenCalled();
  });

  it("consumes the rate-limit bucket with the shipped contract (bucket, actorId, limit=20, window=3600)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-42" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-42" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });

    await invoke("pitch_deck", { projectId: "proj-1", deliverableKey: "pitch_deck" });
    expect(consumeRateLimitMock).toHaveBeenCalledTimes(1);
    expect(consumeRateLimitMock.mock.calls[0][0]).toEqual({
      bucket: "startup_package.deliverable",
      actorId: "u-42",
      limit: 20,
      windowSeconds: 3600,
    });
  });

  it("429 rate_limited passes retry_after_seconds into body AND Retry-After header", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(denyRate(456));
    const res = await invoke("pitch_deck", { projectId: "proj-1" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("456");
    expect(await res.json()).toEqual({
      ok: false,
      error: "rate_limited",
      retry_after_seconds: 456,
    });
    expect(getDeliverableMock).not.toHaveBeenCalled();
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(canAffordMock).not.toHaveBeenCalled();
  });

  it("429 defaults body + Retry-After to 60 when retry_after_seconds is absent", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(denyRate(null));
    const res = await invoke("pitch_deck", { projectId: "proj-1" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = await res.json();
    expect(body.retry_after_seconds).toBe(60);
  });

  it("400 invalid_json on unparseable body — skips registry + project lookup + render", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await invoke("pitch_deck", "raw", "{not-json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_json" });
    expect(getDeliverableMock).not.toHaveBeenCalled();
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(renderToBufferMock).not.toHaveBeenCalled();
  });

  it("400 when projectId is missing — deliverableKey alone is not enough", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await invoke("pitch_deck", { deliverableKey: "pitch_deck" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "projectId and deliverableKey are required",
    });
    expect(getDeliverableMock).not.toHaveBeenCalled();
  });

  it("400 when projectId is whitespace-only after trim", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await invoke("pitch_deck", { projectId: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "projectId and deliverableKey are required",
    );
  });

  it("deliverableKey falls back to the URL slug when the body omits it", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });

    const res = await invoke("pitch_deck", { projectId: "proj-1" });
    expect(res.status).toBe(200);
    expect(getDeliverableMock).toHaveBeenCalledWith("pitch_deck");
  });

  it("404 unknown_deliverable when the registry has no entry for the slug", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getDeliverableMock.mockReturnValue(null);
    const res = await invoke("not_a_real_key", {
      projectId: "proj-1",
      deliverableKey: "not_a_real_key",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "unknown_deliverable" });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
  });

  it("404 unknown_deliverable when entry.key does NOT match the URL slug (registry drift guard)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getDeliverableMock.mockReturnValue({
      ...DEFAULT_ENTRY,
      key: "some_other_key",
    });
    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("unknown_deliverable");
    expect(getProjectByIdMock).not.toHaveBeenCalled();
  });

  it("403 project_not_found_or_forbidden when the project does not exist", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(null);
    const res = await invoke("pitch_deck", {
      projectId: "proj-missing",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      ok: false,
      error: "project_not_found_or_forbidden",
    });
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(renderToBufferMock).not.toHaveBeenCalled();
  });

  it("403 project_not_found_or_forbidden when the project belongs to another user (ownership guard)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-999" }));
    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("project_not_found_or_forbidden");
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("402 insufficient_credits when canAfford denies — never renders + never charges", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({
      allowed: false,
      balance: 0.5,
      cost: 3,
      reason: "insufficient_credits",
    });
    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      ok: false,
      error: "insufficient_credits",
      creditsRequired: 3,
      balance: 0.5,
    });
    expect(renderToBufferMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("503 service_unavailable when getSupabaseAdmin returns null — no render, no spend", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    supabaseAdminValue = null;
    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "service_unavailable" });
    expect(renderToBufferMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("500 pdf_render_failed when renderToBuffer throws — never uploads, never charges", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    renderToBufferMock.mockRejectedValueOnce(new Error("boom"));

    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "pdf_render_failed" });
    expect(supabaseState.storagePathUploaded).toBeNull();
    expect(supabaseState.insertPayload).toBeNull();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("502 storage_upload_failed when supabase.storage.upload returns an error — never writes dataroom row, never charges", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    supabaseState.storage.uploadResult = { error: { message: "quota" } };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "storage_upload_failed" });
    expect(supabaseState.insertPayload).toBeNull();
    expect(supabaseState.updatePayload).toBeNull();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("uploads the rendered PDF buffer to `startup-<projectId>/package/<templateSlug>-v1.pdf` in the dataroom bucket with upsert=true + application/pdf", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });
    const buf = Buffer.from("%PDF-1.4\n%deadbeef", "utf8");
    renderToBufferMock.mockResolvedValueOnce(buf);

    await invoke("pitch_deck", {
      projectId: "proj-XYZ",
      deliverableKey: "pitch_deck",
    });
    expect(supabaseState.storagePathUploaded).toBe(
      "startup-proj-XYZ/package/package_vision_pitch_deck-v1.pdf",
    );
    expect(supabaseState.uploadOptions).toEqual({
      bucket: "dataroom",
      contentType: "application/pdf",
      upsert: true,
    });
    expect(supabaseState.uploadedBufferSize).toBe(buf.length);
  });

  it("insert branch (no existing row) writes the dataroom_files row with the shipped natural-key columns", async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({ id: "u-1", email: "founder@example.com" }),
    );
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });

    await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(supabaseState.insertPayload).toEqual({
      user_id: "u-1",
      email: "founder@example.com",
      svi_dimension: "pitch",
      file_name: "package_vision_pitch_deck.pdf",
      status: "present",
      mime_type: "application/pdf",
      storage_path: "startup-proj-1/package/package_vision_pitch_deck-v1.pdf",
      template_slug: "package_vision_pitch_deck",
      template_version: "v1",
    });
    expect(supabaseState.updatePayload).toBeNull();
  });

  it("update branch (existing row) targets the row by id and bumps storage_path + mime + status + template_version (no insert)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });
    supabaseState.existingRow = { id: "existing-abc" };
    supabaseState.updateResult = { data: { id: "existing-abc" } };

    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(200);
    expect(supabaseState.updatePayload).toEqual({
      storage_path: "startup-proj-1/package/package_vision_pitch_deck-v1.pdf",
      mime_type: "application/pdf",
      status: "present",
      template_version: "v1",
    });
    expect(supabaseState.updateFilterId).toBe("existing-abc");
    expect(supabaseState.insertPayload).toBeNull();
    const body = await res.json();
    expect(body.dataroomFileId).toBe("existing-abc");
  });

  it("500 dataroom_row_insert_failed when the insert errors — credits are NOT spent", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    supabaseState.insertResult = { error: { message: "unique_violation" } };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: "dataroom_row_insert_failed",
    });
    expect(spendCreditsMock).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("500 dataroom_row_update_failed when the update errors — credits are NOT spent", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    supabaseState.existingRow = { id: "existing-abc" };
    supabaseState.updateResult = { error: { message: "rls_violation" } };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: "dataroom_row_update_failed",
    });
    expect(spendCreditsMock).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("spendCredits is called AFTER the successful upload + DB write with the shipped metadata shape", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });
    supabaseState.insertResult = { data: { id: "new-file-id" } };

    await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    const [userId, feature, meta] = spendCreditsMock.mock.calls[0];
    expect(userId).toBe("u-1");
    expect(feature).toBe("pitch_deck");
    expect(meta).toEqual({
      project_id: "proj-1",
      deliverable: "pitch_deck",
      template_slug: "package_vision_pitch_deck",
      dataroom_file_id: "new-file-id",
    });
  });

  it("402 credit_spend_failed surfaces dataroomFileId + creditsRequired + balance so the founder can still open the PDF (half-success)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 3, cost: 3 });
    supabaseState.insertResult = { data: { id: "new-file-id" } };
    spendCreditsMock.mockResolvedValue({ ok: false, balance: 0 });

    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      ok: false,
      error: "credit_spend_failed",
      creditsRequired: 3,
      balance: 0,
      dataroomFileId: "new-file-id",
    });
  });

  it("happy-path 200 returns {ok, dataroomFileId, storagePath, downloadUrl, creditsCharged, balance}", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    supabaseState.insertResult = { data: { id: "new-file-id" } };
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });

    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      dataroomFileId: "new-file-id",
      storagePath: "startup-proj-1/package/package_vision_pitch_deck-v1.pdf",
      downloadUrl: "https://signed.example/x?token=abc",
      creditsCharged: 3,
      balance: 7,
    });
    expect(supabaseState.signedPath).toBe(
      "startup-proj-1/package/package_vision_pitch_deck-v1.pdf",
    );
    expect(supabaseState.signedExpires).toBe(3600);
  });

  it("downloadUrl falls back to null when createSignedUrl throws (never 500s a successful upload+charge)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    supabaseState.insertResult = { data: { id: "new-file-id" } };
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });
    supabaseState.storage.signedThrows = true;

    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.downloadUrl).toBeNull();
    expect(body.dataroomFileId).toBe("new-file-id");
  });

  it("downloadUrl is null when createSignedUrl resolves without a signedUrl", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    supabaseState.insertResult = { data: { id: "new-file-id" } };
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });
    supabaseState.storage.signedResult = { data: null };

    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.downloadUrl).toBeNull();
  });

  it("canAfford is called with (user.id, entry.featureKey) — not with the URL slug", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-77" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-77" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });
    getDeliverableMock.mockReturnValue({
      ...DEFAULT_ENTRY,
      featureKey: "svi_report",
    });

    await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(canAffordMock).toHaveBeenCalledTimes(1);
    expect(canAffordMock.mock.calls[0]).toEqual(["u-77", "svi_report"]);
  });

  it("insufficient_credits response falls back to affordCheck.cost when FEATURE_COSTS[featureKey] is undefined", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    getDeliverableMock.mockReturnValue({
      ...DEFAULT_ENTRY,
      featureKey: "not_in_costs",
    });
    canAffordMock.mockResolvedValue({
      allowed: false,
      balance: 1,
      cost: 99,
      reason: "insufficient_credits",
    });
    const res = await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.creditsRequired).toBe(99);
    expect(body.balance).toBe(1);
  });

  it("deliverableKey passed in body is trimmed before the registry lookup", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });

    await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "  pitch_deck  ",
    });
    expect(getDeliverableMock).toHaveBeenCalledWith("pitch_deck");
  });

  it("projectId passed in body is trimmed before the project ownership check", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ id: "proj-abc", userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });

    await invoke("pitch_deck", {
      projectId: "  proj-abc  ",
      deliverableKey: "pitch_deck",
    });
    expect(getProjectByIdMock).toHaveBeenCalledWith("proj-abc");
  });

  it("existence probe + insert both hit `dataroom_files` — exactly 2 dataroom_files touches per request", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });

    await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    // Both writes go to dataroom_files (existence probe + insert). Other
    // tables (startup_package_interview + svi_accounts) are fetched in
    // buildInputContext and are outside the dataroom-row contract.
    const dfHits = supabaseState.fromCalls.filter((t) => t === "dataroom_files");
    expect(dfHits.length).toBe(2);
  });

  it("email defaults to '' on the inserted row when the user has no email (defensive against a citext-null insert)", async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({ id: "u-1", email: "" as unknown as string }),
    );
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });

    await invoke("pitch_deck", {
      projectId: "proj-1",
      deliverableKey: "pitch_deck",
    });
    expect((supabaseState.insertPayload ?? {}).email).toBe("");
  });
});
