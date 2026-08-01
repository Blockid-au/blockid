// Unit tests for /api/dataroom/setup — POST + GET route contract (P1-setup-route-test).
//
// The setup route is the P1_dataroom_map "auto-provision the founder's
// Google Drive with the shipped taxonomy" surface. It gates on
// `share_management`, then dynamic-imports googleapis, verifies the two
// service-account env vars, creates (or reuses) a "Data Room" subfolder
// under the founder's root folder, iterates DATA_ROOM_STRUCTURE and creates
// (or reuses) each section subfolder + uploads any template body that
// hasn't been uploaded yet. It also persists the resulting data-room folder
// id onto svi_accounts.drive_folder_id so downstream cron jobs and the
// clone/populate routes can find it without another Drive round-trip.
//
// A silent regression here (e.g. dropping the `?.replace(/\\n/g, "\n")`
// on the private key so PEM decoding fails in prod; skipping the "already
// exists" branch so every founder invocation creates a duplicate Data Room
// folder; letting the permission share throw and 500 the whole tick;
// dropping the templateContent guard so upload-only rows get uploaded as
// empty Google Docs; skipping the svi_accounts persist so the clone route
// keeps 400ing on `no drive_folder_id`) breaks the guided-founder journey
// this endpoint anchors.
//
// Assertions pin:
//   1. GET returns the DATA_ROOM_STRUCTURE projection verbatim with
//      { name, stage, priority, description, documents[] } per folder and
//      { name, type, format, description, hasTemplate, connectTo } per
//      document. hasTemplate is true iff type === "template" AND
//      templateContent is truthy (both branches asserted).
//   2. POST 401 when the feature gate rejects — env is not read, drive is
//      not called, supabase is not called.
//   3. POST 402 when the feature gate flags feature_locked — same short
//      circuit.
//   4. Feature key is "share_management" (matches route.ts:18).
//   5. POST 503 when GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL is missing.
//   6. POST 503 when GOOGLE_DRIVE_PRIVATE_KEY is missing.
//   7. GoogleAuth is constructed with the env client_email + normalised
//      private_key (`\\n` → `\n`) + the drive scope.
//   8. POST creates the "Data Room" folder when none exists, sharing it
//      with the founder's email as writer (permissions.create fires).
//   9. POST reuses the existing "Data Room" folder when one is found —
//      no drive.files.create for the DR level, and no permissions.create.
//  10. permissions.create failure is swallowed (via .catch) so a share
//      hiccup doesn't 500 the whole tick.
//  11. Section folders reuse existing rows (no create) when found.
//  12. Section folders are created (with parents + description) when
//      not found — one per taxonomy row.
//  13. Templates without templateContent are NOT uploaded (upload/connect/
//      auto rows are skipped entirely by the `doc.type !== "template" ||
//      !doc.templateContent` guard).
//  14. Templates that already exist on Drive are skipped and still counted
//      into templatesCreated (matches route.ts:122-126 behaviour so the
//      founder-facing count reflects "templates present", not "templates
//      newly created").
//  15. New templates are created as `application/vnd.google-apps.document`
//      with the "(Template)" suffix in the name and the taxonomy
//      description forwarded.
//  16. Supabase svi_accounts is UPDATE'd with drive_folder_id filtered by
//      user email — the persist step downstream routes depend on.
//  17. Supabase persist is SKIPPED when getSupabaseAdmin returns null (the
//      graceful-degrade when the service-role env is missing).
//  18. Response envelope shape: { ok, dataRoomFolderId, dataRoomFolderUrl,
//      rootFolderId, rootFolderUrl, folders[], totalTemplates } — with
//      totalTemplates aggregated across every folder result.
//  19. 500 error envelope { ok:false, error } on an unexpected throw from
//      the Drive layer (e.g. quota exhausted mid-run).

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { DataRoomFolder } from "@/lib/data-room-templates";

// ── Feature gate ────────────────────────────────────────────
const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

// ── Google Drive helper (user-folder resolver) ──────────────
const getOrCreateUserFolderMock = vi.fn<
  (email: string, displayName?: string | null) => Promise<{ folderId: string; folderUrl: string }>
>();
vi.mock("@/lib/google-drive", () => ({
  getOrCreateUserFolder: (email: string, displayName?: string | null) =>
    getOrCreateUserFolderMock(email, displayName),
}));

// ── Supabase admin ──────────────────────────────────────────
const supabaseUpdateEqMock = vi.fn<(col: string, val: unknown) => Promise<{ error: null }>>(
  async () => ({ error: null }),
);
const supabaseUpdateMock = vi.fn((_patch: Record<string, unknown>) => ({
  eq: (col: string, val: unknown) => supabaseUpdateEqMock(col, val),
}));
const supabaseFromMock = vi.fn((_table: string) => ({
  update: (patch: Record<string, unknown>) => supabaseUpdateMock(patch),
}));
type SupabaseFake = { from: typeof supabaseFromMock } | null;
const getSupabaseAdminMock = vi.fn<() => SupabaseFake>(() => ({ from: supabaseFromMock }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ── DATA_ROOM_STRUCTURE fixture ─────────────────────────────
// Mock a controlled 2-folder taxonomy so the POST branches don't have to
// walk the full shipped 12-folder / 102-doc set on every test. Each folder
// carries a mix of doc types so the "skip non-template", "skip no-content
// template", "upload template" branches all fire in a single POST call.
// Declared via vi.hoisted so both the mock factory (hoisted to the top of
// the module) and the test body can reference the same fixture without
// tripping the "top-level variables in vi.mock factory" ReferenceError.
const hoistedFixture = vi.hoisted(() => {
  const contentA = "# Executive Summary — [STARTUP_NAME]\n[PROBLEM]\n";
  const contentB = "# Cap Table — [STARTUP_NAME]\n";
  const fixture = [
    {
      name: "1. Corporate & Legal",
      section: "corporate",
      stage: "idea" as const,
      priority: "P0" as const,
      description: "ASIC registration, company structure",
      investorImpact: "critical" as const,
      documents: [
        {
          name: "Executive Summary",
          type: "template" as const,
          format: "pdf",
          priority: "P0" as const,
          description: "1-page company overview",
          templateContent: contentA,
        },
        {
          name: "Pitch Deck",
          type: "upload" as const,
          format: "pdf",
          priority: "P0" as const,
          description: "10-slide investor deck",
        },
        {
          name: "Placeholder Template Without Body",
          type: "template" as const,
          format: "pdf",
          priority: "P1" as const,
          description: "Template row with no shipped content — must be skipped",
        },
      ],
    },
    {
      name: "2. Cap Table & Equity",
      section: "cap",
      stage: "mvp" as const,
      priority: "P0" as const,
      description: "Founder equity split + option pool",
      investorImpact: "high" as const,
      documents: [
        {
          name: "Cap Table",
          type: "template" as const,
          format: "xlsx",
          priority: "P0" as const,
          description: "Current + post-raise cap table",
          templateContent: contentB,
        },
        {
          name: "Register of Members",
          type: "connect" as const,
          format: "auto",
          priority: "P0" as const,
          description: "Pulled from projects.members",
          connectTo: "/api/cap-table",
        },
      ],
    },
  ] satisfies DataRoomFolder[];
  return { FIXTURE_STRUCTURE: fixture, TEMPLATE_CONTENT_A: contentA, TEMPLATE_CONTENT_B: contentB };
});
const FIXTURE_STRUCTURE = hoistedFixture.FIXTURE_STRUCTURE;

vi.mock("@/lib/data-room-templates", () => ({
  DATA_ROOM_STRUCTURE: hoistedFixture.FIXTURE_STRUCTURE,
}));

// ── googleapis dynamic import ───────────────────────────────
type ListCall = { q: string };
type CreateCall = {
  requestBody?: Record<string, unknown>;
  media?: { mimeType?: string; body?: unknown };
};
type PermCall = {
  fileId?: string;
  requestBody?: Record<string, unknown>;
  sendNotificationEmail?: boolean;
};
type GoogleAuthArgs = {
  credentials?: { client_email?: string; private_key?: string };
  scopes?: string[];
};

const filesListMock = vi.fn<(args: ListCall) => Promise<{ data: { files: Array<{ id?: string; webViewLink?: string }> } }>>();
const filesCreateMock = vi.fn<(args: CreateCall) => Promise<{ data: { id?: string; webViewLink?: string } }>>();
const permissionsCreateMock = vi.fn<(args: PermCall) => Promise<unknown>>();
const googleAuthCtor = vi.fn<(args: GoogleAuthArgs) => void>();
const driveFactoryMock = vi.fn<(args: { version: string; auth: unknown }) => unknown>();

vi.mock("googleapis", () => {
  class GoogleAuth {
    constructor(args: GoogleAuthArgs) {
      googleAuthCtor(args);
    }
  }
  return {
    google: {
      auth: { GoogleAuth },
      drive: (args: { version: string; auth: unknown }) => {
        driveFactoryMock(args);
        return {
          files: {
            list: (a: ListCall) => filesListMock(a),
            create: (a: CreateCall) => filesCreateMock(a),
          },
          permissions: {
            create: (a: PermCall) => permissionsCreateMock(a),
          },
        };
      },
    },
  };
});

import { GET, POST } from "./route";

const USER = { id: "u-42", email: "founder@x.co", displayName: "Ada Founder" };

function gateOk() {
  return {
    ok: true,
    user: USER,
    uwp: { id: USER.id, plan: "free", segment: "founder" },
  };
}
function gateFail(status: number, error: string) {
  return { ok: false, response: NextResponse.json({ ok: false, error }, { status }) };
}

// Setup helper: install default happy-path mocks (Data Room + section
// folders don't exist yet, templates don't exist yet → everything gets
// created). Tests override individual mocks after this.
function primeHappyDrive() {
  filesListMock.mockReset();
  filesCreateMock.mockReset();
  permissionsCreateMock.mockReset();
  filesListMock.mockResolvedValue({ data: { files: [] } });
  let createSeq = 0;
  filesCreateMock.mockImplementation(async () => {
    createSeq += 1;
    return { data: { id: `new-id-${createSeq}`, webViewLink: `https://link/${createSeq}` } };
  });
  permissionsCreateMock.mockResolvedValue({});
}

beforeEach(() => {
  gateMock.mockReset();
  getOrCreateUserFolderMock.mockReset();
  getOrCreateUserFolderMock.mockResolvedValue({
    folderId: "root-folder-id",
    folderUrl: "https://drive.google.com/drive/folders/root-folder-id",
  });
  supabaseFromMock.mockClear();
  supabaseUpdateMock.mockClear();
  supabaseUpdateEqMock.mockClear();
  supabaseUpdateEqMock.mockResolvedValue({ error: null });
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue({ from: supabaseFromMock });
  filesListMock.mockReset();
  filesCreateMock.mockReset();
  permissionsCreateMock.mockReset();
  googleAuthCtor.mockReset();
  driveFactoryMock.mockReset();
  process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL = "svc@blockid.iam.gserviceaccount.com";
  process.env.GOOGLE_DRIVE_PRIVATE_KEY =
    "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkq\\n-----END PRIVATE KEY-----";
});

afterEach(() => {
  delete process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_DRIVE_PRIVATE_KEY;
});

// ─────────────────────────────────────────────────────────────
describe("GET /api/dataroom/setup", () => {
  it("returns ok:true with a structure array projected from DATA_ROOM_STRUCTURE", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.structure)).toBe(true);
    expect(body.structure).toHaveLength(FIXTURE_STRUCTURE.length);
  });

  it("projects each folder with { name, stage, priority, description, documents[] }", async () => {
    const res = await GET();
    const body = await res.json();
    const first = body.structure[0];
    expect(first).toEqual({
      name: "1. Corporate & Legal",
      stage: "idea",
      priority: "P0",
      description: "ASIC registration, company structure",
      documents: expect.any(Array),
    });
    // Explicitly ensure sensitive template bodies do NOT leak in GET.
    expect(JSON.stringify(first)).not.toContain("[PROBLEM]");
    // And investorImpact / section (internal fields) are not projected.
    expect(first).not.toHaveProperty("investorImpact");
    expect(first).not.toHaveProperty("section");
  });

  it("projects each document with { name, type, format, description, hasTemplate, connectTo }", async () => {
    const res = await GET();
    const body = await res.json();
    // Pick the connect-typed doc (Register of Members) so `connectTo` is
    // truthy and survives the JSON round-trip (JSON.stringify drops
    // undefined keys, so the shape check has to use a row that populates
    // every optional field).
    const doc = body.structure[1].documents.find(
      (d: { name: string }) => d.name === "Register of Members",
    );
    expect(Object.keys(doc).sort()).toEqual(
      ["connectTo", "description", "format", "hasTemplate", "name", "type"].sort(),
    );
  });

  it("hasTemplate is true iff type === 'template' AND templateContent is truthy", async () => {
    const res = await GET();
    const body = await res.json();
    const corp = body.structure[0].documents;
    const cap = body.structure[1].documents;
    // Executive Summary — template + body → true.
    expect(corp.find((d: { name: string }) => d.name === "Executive Summary").hasTemplate).toBe(true);
    // Pitch Deck — upload type → false.
    expect(corp.find((d: { name: string }) => d.name === "Pitch Deck").hasTemplate).toBe(false);
    // Placeholder — template type but NO body → false (the branch the setup
    // POST route also skips).
    expect(
      corp.find((d: { name: string }) => d.name === "Placeholder Template Without Body").hasTemplate,
    ).toBe(false);
    // Cap Table — template + body → true.
    expect(cap.find((d: { name: string }) => d.name === "Cap Table").hasTemplate).toBe(true);
    // Register of Members — connect type → false.
    expect(cap.find((d: { name: string }) => d.name === "Register of Members").hasTemplate).toBe(false);
  });

  it("connectTo passes through for connect-typed docs and is undefined for others", async () => {
    const res = await GET();
    const body = await res.json();
    const register = body.structure[1].documents.find(
      (d: { name: string }) => d.name === "Register of Members",
    );
    expect(register.connectTo).toBe("/api/cap-table");
    const exec = body.structure[0].documents.find(
      (d: { name: string }) => d.name === "Executive Summary",
    );
    expect(exec.connectTo).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
describe("POST /api/dataroom/setup", () => {
  it("401s when the feature gate rejects and does NOT touch env, drive, or supabase", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
    expect(getOrCreateUserFolderMock).not.toHaveBeenCalled();
    expect(filesListMock).not.toHaveBeenCalled();
    expect(filesCreateMock).not.toHaveBeenCalled();
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it("402 feature_locked passes through from the gate and short-circuits identically", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST();
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("feature_locked");
    expect(getOrCreateUserFolderMock).not.toHaveBeenCalled();
    expect(filesListMock).not.toHaveBeenCalled();
  });

  it("passes the feature key 'share_management' to the gate", async () => {
    gateMock.mockResolvedValue(gateFail(401, "nope"));
    await POST();
    expect(gateMock).toHaveBeenCalledWith("share_management");
  });

  it("503s when GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL is missing", async () => {
    delete process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
    gateMock.mockResolvedValue(gateOk());
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Google Drive not configured");
    expect(googleAuthCtor).not.toHaveBeenCalled();
    expect(getOrCreateUserFolderMock).not.toHaveBeenCalled();
  });

  it("503s when GOOGLE_DRIVE_PRIVATE_KEY is missing", async () => {
    delete process.env.GOOGLE_DRIVE_PRIVATE_KEY;
    gateMock.mockResolvedValue(gateOk());
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Google Drive not configured");
    expect(googleAuthCtor).not.toHaveBeenCalled();
  });

  it("constructs GoogleAuth with client_email + newline-normalised private_key + drive scope", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    await POST();
    expect(googleAuthCtor).toHaveBeenCalledTimes(1);
    const args = googleAuthCtor.mock.calls[0][0];
    expect(args.credentials?.client_email).toBe("svc@blockid.iam.gserviceaccount.com");
    // The env holds a literal backslash-n; the route must convert it to a
    // real newline so google-auth-library can PEM-decode the key. Silent
    // regression here breaks every prod Drive call.
    expect(args.credentials?.private_key).toContain("\n");
    expect(args.credentials?.private_key).not.toContain("\\n");
    expect(args.scopes).toEqual(["https://www.googleapis.com/auth/drive"]);
  });

  it("creates the 'Data Room' folder when none exists and shares it with the founder", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    const res = await POST();
    expect(res.status).toBe(200);
    // First files.list call is the DR-lookup — nothing found → create fires.
    const drCreate = filesCreateMock.mock.calls.find(
      (c) =>
        (c[0].requestBody as { name?: string } | undefined)?.name === "Data Room" &&
        (c[0].requestBody as { mimeType?: string } | undefined)?.mimeType ===
          "application/vnd.google-apps.folder",
    );
    expect(drCreate).toBeTruthy();
    expect((drCreate![0].requestBody as { parents?: string[] })?.parents).toEqual([
      "root-folder-id",
    ]);
    // Permission share fires with writer role + founder's email.
    expect(permissionsCreateMock).toHaveBeenCalledTimes(1);
    const permArgs = permissionsCreateMock.mock.calls[0][0];
    expect(permArgs.requestBody).toMatchObject({
      type: "user",
      role: "writer",
      emailAddress: "founder@x.co",
    });
    expect(permArgs.sendNotificationEmail).toBe(false);
  });

  it("reuses the existing 'Data Room' folder when one is already present (no create, no share)", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    // First list-call = DR lookup → return an existing folder. All later
    // list calls (section lookups + template lookups) still return empty.
    filesListMock.mockReset();
    let listCall = 0;
    filesListMock.mockImplementation(async () => {
      listCall += 1;
      if (listCall === 1) {
        return {
          data: {
            files: [{ id: "existing-dr-id", webViewLink: "https://drive/existing-dr" }],
          },
        };
      }
      return { data: { files: [] } };
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dataRoomFolderId).toBe("existing-dr-id");
    expect(body.dataRoomFolderUrl).toBe("https://drive/existing-dr");
    // permissions.create must NOT fire — that only happens on fresh create.
    expect(permissionsCreateMock).not.toHaveBeenCalled();
    // No create call for a "Data Room" folder either.
    const drCreate = filesCreateMock.mock.calls.find(
      (c) => (c[0].requestBody as { name?: string } | undefined)?.name === "Data Room",
    );
    expect(drCreate).toBeUndefined();
  });

  it("swallows permissions.create failures without 500ing the whole tick", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    permissionsCreateMock.mockRejectedValue(new Error("permission share throttled"));
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("reuses existing section folders (no create call for that name)", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    filesListMock.mockReset();
    filesListMock.mockImplementation(async ({ q }) => {
      // DR lookup — empty (fresh create).
      if (q.includes("name = 'Data Room'")) return { data: { files: [] } };
      // Existing section folder for "1. Corporate & Legal" — return it.
      if (q.includes("name = '1. Corporate & Legal'")) {
        return {
          data: { files: [{ id: "existing-corp-id", webViewLink: "https://drive/existing-corp" }] },
        };
      }
      // Everything else empty.
      return { data: { files: [] } };
    });
    await POST();
    // No folder-create call whose name is "1. Corporate & Legal" — we
    // reused the existing row.
    const corpCreate = filesCreateMock.mock.calls.find(
      (c) => (c[0].requestBody as { name?: string } | undefined)?.name === "1. Corporate & Legal",
    );
    expect(corpCreate).toBeUndefined();
    // The other section (Cap Table & Equity) still gets created.
    const capCreate = filesCreateMock.mock.calls.find(
      (c) => (c[0].requestBody as { name?: string } | undefined)?.name === "2. Cap Table & Equity",
    );
    expect(capCreate).toBeTruthy();
  });

  it("creates a folder per taxonomy row when none exist, with parents + description forwarded", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    await POST();
    // Every taxonomy folder gets a create call with its exact name and
    // mimeType application/vnd.google-apps.folder.
    for (const folder of FIXTURE_STRUCTURE) {
      const call = filesCreateMock.mock.calls.find(
        (c) =>
          (c[0].requestBody as { name?: string } | undefined)?.name === folder.name &&
          (c[0].requestBody as { mimeType?: string } | undefined)?.mimeType ===
            "application/vnd.google-apps.folder",
      );
      expect(call, `missing folder create for ${folder.name}`).toBeTruthy();
      expect((call![0].requestBody as { description?: string })?.description).toBe(
        folder.description,
      );
    }
  });

  it("skips upload / connect / template-without-body documents entirely", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    await POST();
    // Neither "Pitch Deck" (upload), "Register of Members" (connect), nor
    // the "Placeholder Template Without Body" (template but no content)
    // should trigger a template list OR create call.
    const skipNames = [
      "Pitch Deck (Template)",
      "Register of Members (Template)",
      "Placeholder Template Without Body (Template)",
    ];
    for (const name of skipNames) {
      const listed = filesListMock.mock.calls.find((c) => c[0].q.includes(`name = '${name}'`));
      expect(listed, `template lookup should not fire for ${name}`).toBeUndefined();
      const created = filesCreateMock.mock.calls.find(
        (c) => (c[0].requestBody as { name?: string } | undefined)?.name === name,
      );
      expect(created, `template create should not fire for ${name}`).toBeUndefined();
    }
  });

  it("counts existing templates toward templatesCreated without re-uploading", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    filesListMock.mockReset();
    filesListMock.mockImplementation(async ({ q }) => {
      // Executive Summary template already exists.
      if (q.includes("name = 'Executive Summary (Template)'")) {
        return { data: { files: [{ id: "existing-exec-id" }] } };
      }
      return { data: { files: [] } };
    });
    const res = await POST();
    const body = await res.json();
    // Corporate & Legal folder: 1 template already existed (counts as 1)
    // + placeholder-no-content skipped + Pitch Deck upload skipped
    // → templatesCreated = 1.
    const corp = body.folders.find(
      (f: { name: string }) => f.name === "1. Corporate & Legal",
    );
    expect(corp.templatesCreated).toBe(1);
    // Ensure we did NOT re-upload — no create call for the Executive
    // Summary template row.
    const execCreate = filesCreateMock.mock.calls.find(
      (c) =>
        (c[0].requestBody as { name?: string } | undefined)?.name === "Executive Summary (Template)",
    );
    expect(execCreate).toBeUndefined();
  });

  it("uploads new templates as application/vnd.google-apps.document with '(Template)' suffix", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    await POST();
    const execUpload = filesCreateMock.mock.calls.find(
      (c) =>
        (c[0].requestBody as { name?: string } | undefined)?.name === "Executive Summary (Template)",
    );
    expect(execUpload).toBeTruthy();
    expect((execUpload![0].requestBody as { mimeType?: string })?.mimeType).toBe(
      "application/vnd.google-apps.document",
    );
    expect((execUpload![0].requestBody as { description?: string })?.description).toBe(
      "1-page company overview",
    );
    // Media body is a Readable stream with the template content — assert
    // the mimeType wrapper at least matches the "text/plain → convert to
    // Google Doc" contract at route.ts:141-144.
    expect(execUpload![0].media?.mimeType).toBe("text/plain");
    expect(execUpload![0].media?.body).toBeTruthy();
  });

  it("persists dataRoomFolderId to svi_accounts filtered by user email", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    await POST();
    expect(supabaseFromMock).toHaveBeenCalledWith("svi_accounts");
    const [patch] = supabaseUpdateMock.mock.calls[0];
    expect(patch).toEqual({ drive_folder_id: expect.any(String) });
    expect(supabaseUpdateEqMock).toHaveBeenCalledWith("email", "founder@x.co");
  });

  it("skips the supabase persist when getSupabaseAdmin returns null (env-degraded mode)", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST();
    expect(res.status).toBe(200);
    // No table access + no update payload.
    expect(supabaseFromMock).not.toHaveBeenCalled();
    expect(supabaseUpdateMock).not.toHaveBeenCalled();
    expect(supabaseUpdateEqMock).not.toHaveBeenCalled();
  });

  it("returns the full response envelope with a totalTemplates aggregate", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    const res = await POST();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.dataRoomFolderId).toBe("string");
    expect(typeof body.dataRoomFolderUrl).toBe("string");
    expect(body.rootFolderId).toBe("root-folder-id");
    expect(body.rootFolderUrl).toBe("https://drive.google.com/drive/folders/root-folder-id");
    expect(Array.isArray(body.folders)).toBe(true);
    expect(body.folders).toHaveLength(FIXTURE_STRUCTURE.length);
    // Two shipped templates with content (Executive Summary + Cap Table)
    // → totalTemplates = 2 on a clean Drive (both freshly uploaded).
    expect(body.totalTemplates).toBe(2);
    // And it's the arithmetic sum of the per-folder counts.
    const summed = body.folders.reduce(
      (acc: number, f: { templatesCreated: number }) => acc + f.templatesCreated,
      0,
    );
    expect(body.totalTemplates).toBe(summed);
  });

  it("returns { ok:false, error } with status 500 when the Drive layer throws unexpectedly", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    // Blow up mid-run — the getOrCreateUserFolder call is the first
    // Drive-adjacent operation the outer try covers.
    getOrCreateUserFolderMock.mockRejectedValue(new Error("drive quota exceeded"));
    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("drive quota exceeded");
  });

  it("passes user.email and user.displayName into the root-folder resolver", async () => {
    gateMock.mockResolvedValue(gateOk());
    primeHappyDrive();
    await POST();
    expect(getOrCreateUserFolderMock).toHaveBeenCalledWith("founder@x.co", "Ada Founder");
  });
});
