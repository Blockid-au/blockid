// Colocated regression suite for `web/src/lib/google-drive.ts` — the
// googleapis wrapper that owns evidence-vault uploads, per-user Drive
// folder provisioning, and the SVI-report Google-Doc conversion path.
// A silent regression here has an outsized blast radius:
//   - drop the `\n` restoration in the private-key normaliser and every
//     Drive call rejects at auth with an invalid-key error;
//   - drop the missing-cred guard in `getDriveClient()` and every entry
//     point tries to hit googleapis without an auth object, corrupting
//     the outer request with a cryptic 500;
//   - drop the `'` → `\'` escape in `getOrCreateUserFolder`'s search
//     query and a founder email containing a single quote crashes the
//     Drive-list call with an unclosed-string error;
//   - drop the `.catch(() => {})` on the two `permissions.create` calls
//     and a single expired user email breaks folder provisioning for
//     every subsequent evidence upload;
//   - drop the `mimeType: application/vnd.google-apps.document`
//     conversion in `createReportGoogleDoc` and reports land as raw
//     text files instead of native Google Docs;
//   - drop the outer try/catch on `createReportGoogleDoc` and any Drive
//     transient error propagates out of the report-order route and 500s
//     the whole SVI report render.
//
// P9_ship autonomous-loop tick — first test coverage for
// `src/lib/google-drive.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted; capture the googleapis surface so we can assert
// requestBody shapes, script per-call responses, and observe the auth
// options without touching the network.
const {
  driveFilesCreate,
  driveFilesList,
  drivePermissionsCreate,
  driveFactory,
  googleAuthCtor,
} = vi.hoisted(() => ({
  driveFilesCreate: vi.fn(),
  driveFilesList: vi.fn(),
  drivePermissionsCreate: vi.fn(),
  driveFactory: vi.fn(),
  googleAuthCtor: vi.fn(),
}));

vi.mock("googleapis", () => {
  class FakeGoogleAuth {
    constructor(opts: unknown) {
      googleAuthCtor(opts);
    }
  }
  return {
    google: {
      auth: { GoogleAuth: FakeGoogleAuth },
      drive: (opts: unknown) => {
        driveFactory(opts);
        return {
          files: { create: driveFilesCreate, list: driveFilesList },
          permissions: { create: drivePermissionsCreate },
        };
      },
    },
  };
});

// ─── env snapshot helpers ────────────────────────────────────────────────────

const ENV_KEYS = [
  "GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_DRIVE_PRIVATE_KEY",
  "GOOGLE_DRIVE_FOLDER_ID",
  "ADMIN_EMAIL",
] as const;

const savedEnv: Record<string, string | undefined> = {};

function clearEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
}

function primeEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}): void {
  process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL = "svc@example.iam.gserviceaccount.com";
  // `\\n` literal in the env value simulates how PEM keys are typically
  // stored (dotenv/.env cannot express real newlines).
  process.env.GOOGLE_DRIVE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
  process.env.GOOGLE_DRIVE_FOLDER_ID = "root-folder-123";
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k as (typeof ENV_KEYS)[number]];
    else process.env[k as (typeof ENV_KEYS)[number]] = v;
  }
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  clearEnv();
  driveFilesCreate.mockReset();
  driveFilesList.mockReset();
  drivePermissionsCreate.mockReset();
  driveFactory.mockReset();
  googleAuthCtor.mockReset();
  // Default: permissions.create resolves so `.catch(...)` never fires.
  drivePermissionsCreate.mockResolvedValue({ data: {} });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

async function importModule() {
  return await import("./google-drive");
}

// A minimal RndReport + SVIAnalysis pair for buildReportPlainText paths.
// Only the fields the plain-text builder actually reads are populated.
function makeReport() {
  return {
    version: "1.0.0" as const,
    inputType: "url" as const,
    pages: [
      {
        pageId: "executive",
        pageNum: 1,
        title: "Executive Summary",
        subtitle: "Overall",
        content: "Body text.",
        highlights: ["High A", "High B"],
        dataPoints: { rev: "$1M" },
        extendedSections: [
          { title: "Deep", content: "Extended body.", type: "market_data" as const },
        ],
      },
      {
        pageId: "market",
        pageNum: 2,
        title: "Market",
        subtitle: "",
        content: "Market body.",
      },
    ],
    overallScore: 78,
    createdAt: "2026-08-06T00:00:00.000Z",
    tier: "standard" as const,
  };
}

function makeAnalysis() {
  return {
    totalSVI: 620,
    stageLabel: "Growth",
  } as unknown as import("./svi-analysis").SVIAnalysis;
}

// ─────────────────────────────────────────────────────────────────────────────
// getDriveClient (exercised via every public entry point)
// ─────────────────────────────────────────────────────────────────────────────

describe("getDriveClient (via uploadToGoogleDrive)", () => {
  it("throws when GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL is missing", async () => {
    primeEnv({ GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL: undefined });
    const mod = await importModule();
    await expect(
      mod.uploadToGoogleDrive(Buffer.from("x"), "n.txt", "text/plain"),
    ).rejects.toThrow(/Google Drive credentials are not fully configured/);
    expect(driveFilesCreate).not.toHaveBeenCalled();
  });

  it("throws when GOOGLE_DRIVE_PRIVATE_KEY is missing", async () => {
    primeEnv({ GOOGLE_DRIVE_PRIVATE_KEY: undefined });
    const mod = await importModule();
    await expect(
      mod.uploadToGoogleDrive(Buffer.from("x"), "n.txt", "text/plain"),
    ).rejects.toThrow(/not fully configured/);
  });

  it("throws when GOOGLE_DRIVE_FOLDER_ID is missing", async () => {
    primeEnv({ GOOGLE_DRIVE_FOLDER_ID: undefined });
    const mod = await importModule();
    await expect(
      mod.uploadToGoogleDrive(Buffer.from("x"), "n.txt", "text/plain"),
    ).rejects.toThrow(/not fully configured/);
  });

  it("normalises the `\\n` escape sequence in the private key to real newlines", async () => {
    primeEnv();
    driveFilesCreate.mockResolvedValue({ data: { id: "f", webViewLink: "url" } });
    const mod = await importModule();
    await mod.uploadToGoogleDrive(Buffer.from("x"), "n.txt", "text/plain");
    const authArgs = googleAuthCtor.mock.calls[0]?.[0] as {
      credentials: { private_key: string };
    };
    expect(authArgs.credentials.private_key).toBe(
      "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    );
    expect(authArgs.credentials.private_key).not.toContain("\\n");
  });

  it("passes the drive scope to GoogleAuth", async () => {
    primeEnv();
    driveFilesCreate.mockResolvedValue({ data: {} });
    const mod = await importModule();
    await mod.uploadToGoogleDrive(Buffer.from("x"), "n.txt", "text/plain");
    const opts = googleAuthCtor.mock.calls[0]?.[0] as { scopes: string[] };
    expect(opts.scopes).toEqual(["https://www.googleapis.com/auth/drive"]);
  });

  it("targets Drive API v3", async () => {
    primeEnv();
    driveFilesCreate.mockResolvedValue({ data: {} });
    const mod = await importModule();
    await mod.uploadToGoogleDrive(Buffer.from("x"), "n.txt", "text/plain");
    expect(driveFactory).toHaveBeenCalledWith(
      expect.objectContaining({ version: "v3" }),
    );
  });

  it("passes the service account email through as client_email", async () => {
    primeEnv({ GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL: "custom@example.iam.gserviceaccount.com" });
    driveFilesCreate.mockResolvedValue({ data: {} });
    const mod = await importModule();
    await mod.uploadToGoogleDrive(Buffer.from("x"), "n.txt", "text/plain");
    const opts = googleAuthCtor.mock.calls[0]?.[0] as {
      credentials: { client_email: string };
    };
    expect(opts.credentials.client_email).toBe("custom@example.iam.gserviceaccount.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadToGoogleDrive
// ─────────────────────────────────────────────────────────────────────────────

describe("uploadToGoogleDrive", () => {
  beforeEach(() => primeEnv());

  it("returns response.data from drive.files.create", async () => {
    driveFilesCreate.mockResolvedValue({
      data: { id: "abc", webViewLink: "vlink", webContentLink: "clink" },
    });
    const mod = await importModule();
    const out = await mod.uploadToGoogleDrive(Buffer.from("payload"), "n.pdf", "application/pdf");
    expect(out).toEqual({ id: "abc", webViewLink: "vlink", webContentLink: "clink" });
  });

  it("names the file with the supplied fileName", async () => {
    driveFilesCreate.mockResolvedValue({ data: {} });
    const mod = await importModule();
    await mod.uploadToGoogleDrive(Buffer.from("x"), "invoice-2026.pdf", "application/pdf");
    const args = driveFilesCreate.mock.calls[0]?.[0] as { requestBody: { name: string } };
    expect(args.requestBody.name).toBe("invoice-2026.pdf");
  });

  it("places the file under GOOGLE_DRIVE_FOLDER_ID", async () => {
    driveFilesCreate.mockResolvedValue({ data: {} });
    const mod = await importModule();
    await mod.uploadToGoogleDrive(Buffer.from("x"), "n.pdf", "application/pdf");
    const args = driveFilesCreate.mock.calls[0]?.[0] as { requestBody: { parents: string[] } };
    expect(args.requestBody.parents).toEqual(["root-folder-123"]);
  });

  it("propagates the supplied mimeType to the media block", async () => {
    driveFilesCreate.mockResolvedValue({ data: {} });
    const mod = await importModule();
    await mod.uploadToGoogleDrive(Buffer.from("x"), "n.png", "image/png");
    const args = driveFilesCreate.mock.calls[0]?.[0] as { media: { mimeType: string } };
    expect(args.media.mimeType).toBe("image/png");
  });

  it("requests the id, webViewLink, and webContentLink fields", async () => {
    driveFilesCreate.mockResolvedValue({ data: {} });
    const mod = await importModule();
    await mod.uploadToGoogleDrive(Buffer.from("x"), "n.pdf", "application/pdf");
    const args = driveFilesCreate.mock.calls[0]?.[0] as { fields: string };
    expect(args.fields).toBe("id, webViewLink, webContentLink");
  });

  it("passes the file bytes as a Readable stream", async () => {
    driveFilesCreate.mockResolvedValue({ data: {} });
    const mod = await importModule();
    await mod.uploadToGoogleDrive(Buffer.from("hello"), "n.txt", "text/plain");
    const args = driveFilesCreate.mock.calls[0]?.[0] as { media: { body: unknown } };
    // Readable duck-types: has a `read` function and is an EventEmitter.
    expect(typeof (args.media.body as { read?: unknown }).read).toBe("function");
  });

  it("propagates a rejected create back to the caller", async () => {
    driveFilesCreate.mockRejectedValue(new Error("boom"));
    const mod = await importModule();
    await expect(
      mod.uploadToGoogleDrive(Buffer.from("x"), "n.pdf", "application/pdf"),
    ).rejects.toThrow(/boom/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadAndShareWithAdmin
// ─────────────────────────────────────────────────────────────────────────────

describe("uploadAndShareWithAdmin", () => {
  beforeEach(() => primeEnv());

  it("prefixes the file name with [uploaderEmail]", async () => {
    driveFilesCreate.mockResolvedValue({ data: { id: "f" } });
    const mod = await importModule();
    await mod.uploadAndShareWithAdmin(
      Buffer.from("x"),
      "cap-table.pdf",
      "application/pdf",
      "founder@example.com",
    );
    const args = driveFilesCreate.mock.calls[0]?.[0] as { requestBody: { name: string } };
    expect(args.requestBody.name).toBe("[founder@example.com] cap-table.pdf");
  });

  it("puts the uploader email in the file description", async () => {
    driveFilesCreate.mockResolvedValue({ data: { id: "f" } });
    const mod = await importModule();
    await mod.uploadAndShareWithAdmin(
      Buffer.from("x"),
      "n.pdf",
      "application/pdf",
      "founder@example.com",
    );
    const args = driveFilesCreate.mock.calls[0]?.[0] as {
      requestBody: { description: string };
    };
    expect(args.requestBody.description).toBe(
      "Uploaded by founder@example.com via BlockID Evidence Vault",
    );
  });

  it("shares with admin@blockid.au by default", async () => {
    driveFilesCreate.mockResolvedValue({ data: { id: "fid-1" } });
    const mod = await importModule();
    await mod.uploadAndShareWithAdmin(Buffer.from("x"), "n.pdf", "application/pdf", "u@e.com");
    expect(drivePermissionsCreate).toHaveBeenCalledWith({
      fileId: "fid-1",
      requestBody: { type: "user", role: "writer", emailAddress: "admin@blockid.au" },
      sendNotificationEmail: false,
    });
  });

  it("honours ADMIN_EMAIL when set", async () => {
    primeEnv({ ADMIN_EMAIL: "ops@blockid.au" });
    driveFilesCreate.mockResolvedValue({ data: { id: "fid-2" } });
    const mod = await importModule();
    await mod.uploadAndShareWithAdmin(Buffer.from("x"), "n.pdf", "application/pdf", "u@e.com");
    const perm = drivePermissionsCreate.mock.calls[0]?.[0] as {
      requestBody: { emailAddress: string };
    };
    expect(perm.requestBody.emailAddress).toBe("ops@blockid.au");
  });

  it("skips permissions.create when the response has no file id", async () => {
    driveFilesCreate.mockResolvedValue({ data: { id: null } });
    const mod = await importModule();
    await mod.uploadAndShareWithAdmin(Buffer.from("x"), "n.pdf", "application/pdf", "u@e.com");
    expect(drivePermissionsCreate).not.toHaveBeenCalled();
  });

  it("returns response.data verbatim", async () => {
    driveFilesCreate.mockResolvedValue({
      data: { id: "fid-3", webViewLink: "v", webContentLink: "c" },
    });
    const mod = await importModule();
    const out = await mod.uploadAndShareWithAdmin(
      Buffer.from("x"),
      "n.pdf",
      "application/pdf",
      "u@e.com",
    );
    expect(out).toEqual({ id: "fid-3", webViewLink: "v", webContentLink: "c" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getOrCreateUserFolder
// ─────────────────────────────────────────────────────────────────────────────

describe("getOrCreateUserFolder", () => {
  beforeEach(() => primeEnv());

  it("returns the first existing folder without creating a new one", async () => {
    driveFilesList.mockResolvedValue({
      data: { files: [{ id: "existing-fid", webViewLink: "https://drive/existing" }] },
    });
    const mod = await importModule();
    const out = await mod.getOrCreateUserFolder("founder@example.com");
    expect(out).toEqual({ folderId: "existing-fid", folderUrl: "https://drive/existing" });
    expect(driveFilesCreate).not.toHaveBeenCalled();
    expect(drivePermissionsCreate).not.toHaveBeenCalled();
  });

  it("falls back to a canonical Drive URL when webViewLink is missing on an existing folder", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "existing-fid" }] } });
    const mod = await importModule();
    const out = await mod.getOrCreateUserFolder("founder@example.com");
    expect(out.folderUrl).toBe("https://drive.google.com/drive/folders/existing-fid");
  });

  it("uses `projectName — email` as the search name when a project is supplied", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "x", webViewLink: "u" }] } });
    const mod = await importModule();
    await mod.getOrCreateUserFolder("u@e.com", null, "Alpha Project");
    const args = driveFilesList.mock.calls[0]?.[0] as { q: string };
    expect(args.q).toContain("name = 'Alpha Project — u@e.com'");
    expect(args.q).toContain("'root-folder-123' in parents");
    expect(args.q).toContain("mimeType = 'application/vnd.google-apps.folder'");
    expect(args.q).toContain("trashed = false");
  });

  it("escapes single quotes in the folder search name", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "x", webViewLink: "u" }] } });
    const mod = await importModule();
    await mod.getOrCreateUserFolder("o'brien@example.com");
    const args = driveFilesList.mock.calls[0]?.[0] as { q: string };
    expect(args.q).toContain("name = 'o\\'brien@example.com'");
  });

  it("creates a new folder with the displayName + email when the search misses", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    driveFilesCreate.mockResolvedValue({
      data: { id: "new-fid", webViewLink: "https://drive/new" },
    });
    const mod = await importModule();
    const out = await mod.getOrCreateUserFolder("u@e.com", "Ursula Founder");
    const args = driveFilesCreate.mock.calls[0]?.[0] as { requestBody: { name: string } };
    expect(args.requestBody.name).toBe("Ursula Founder (u@e.com)");
    expect(out.folderId).toBe("new-fid");
  });

  it("prefixes the created folder name with projectName when supplied", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "fid", webViewLink: "u" } });
    const mod = await importModule();
    await mod.getOrCreateUserFolder("u@e.com", "Ursula", "Alpha");
    const args = driveFilesCreate.mock.calls[0]?.[0] as { requestBody: { name: string } };
    expect(args.requestBody.name).toBe("Alpha — Ursula");
  });

  it("falls back to email-only when no display name and no project name are supplied", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "fid", webViewLink: "u" } });
    const mod = await importModule();
    await mod.getOrCreateUserFolder("u@e.com");
    const args = driveFilesCreate.mock.calls[0]?.[0] as { requestBody: { name: string } };
    expect(args.requestBody.name).toBe("u@e.com");
  });

  it("marks the new folder as a Drive folder mimeType and roots it under GOOGLE_DRIVE_FOLDER_ID", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "fid", webViewLink: "u" } });
    const mod = await importModule();
    await mod.getOrCreateUserFolder("u@e.com");
    const args = driveFilesCreate.mock.calls[0]?.[0] as {
      requestBody: { mimeType: string; parents: string[] };
    };
    expect(args.requestBody.mimeType).toBe("application/vnd.google-apps.folder");
    expect(args.requestBody.parents).toEqual(["root-folder-123"]);
  });

  it("grants the user reader access and the admin writer access on a new folder", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "new-fid", webViewLink: "u" } });
    const mod = await importModule();
    await mod.getOrCreateUserFolder("founder@example.com");
    expect(drivePermissionsCreate).toHaveBeenCalledTimes(2);
    const calls = drivePermissionsCreate.mock.calls.map((c) => c[0]);
    const userPerm = calls.find(
      (p: { requestBody: { emailAddress: string } }) =>
        p.requestBody.emailAddress === "founder@example.com",
    ) as { requestBody: { role: string } };
    const adminPerm = calls.find(
      (p: { requestBody: { emailAddress: string } }) =>
        p.requestBody.emailAddress === "admin@blockid.au",
    ) as { requestBody: { role: string } };
    expect(userPerm.requestBody.role).toBe("reader");
    expect(adminPerm.requestBody.role).toBe("writer");
  });

  it("swallows a rejected permissions.create so a bad user email does not abort provisioning", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "new-fid", webViewLink: "u" } });
    drivePermissionsCreate
      .mockRejectedValueOnce(new Error("invalid email"))
      .mockResolvedValueOnce({ data: {} });
    const mod = await importModule();
    const out = await mod.getOrCreateUserFolder("bad-email");
    expect(out.folderId).toBe("new-fid");
  });

  it("returns a canonical Drive URL when the created folder has no webViewLink", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "fresh" } });
    const mod = await importModule();
    const out = await mod.getOrCreateUserFolder("u@e.com");
    expect(out.folderUrl).toBe("https://drive.google.com/drive/folders/fresh");
  });

  it("honours ADMIN_EMAIL for the writer permission on the new folder", async () => {
    primeEnv({ ADMIN_EMAIL: "ops@blockid.au" });
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "fid", webViewLink: "u" } });
    const mod = await importModule();
    await mod.getOrCreateUserFolder("u@e.com");
    const calls = drivePermissionsCreate.mock.calls.map((c) => c[0]);
    expect(
      calls.some(
        (p: { requestBody: { emailAddress: string; role: string } }) =>
          p.requestBody.emailAddress === "ops@blockid.au" && p.requestBody.role === "writer",
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadToUserFolder
// ─────────────────────────────────────────────────────────────────────────────

describe("uploadToUserFolder", () => {
  beforeEach(() => primeEnv());

  it("uploads under the resolved user folder id", async () => {
    driveFilesList.mockResolvedValue({
      data: { files: [{ id: "user-fid", webViewLink: "user-url" }] },
    });
    driveFilesCreate.mockResolvedValue({ data: { id: "file-1", webViewLink: "file-url" } });
    const mod = await importModule();
    await mod.uploadToUserFolder(Buffer.from("x"), "doc.pdf", "application/pdf", "u@e.com");
    const args = driveFilesCreate.mock.calls[0]?.[0] as {
      requestBody: { parents: string[] };
    };
    expect(args.requestBody.parents).toEqual(["user-fid"]);
  });

  it("returns { fileId, fileUrl, folderId, folderUrl } from a happy path", async () => {
    driveFilesList.mockResolvedValue({
      data: { files: [{ id: "user-fid", webViewLink: "user-url" }] },
    });
    driveFilesCreate.mockResolvedValue({ data: { id: "file-1", webViewLink: "file-url" } });
    const mod = await importModule();
    const out = await mod.uploadToUserFolder(
      Buffer.from("x"),
      "doc.pdf",
      "application/pdf",
      "u@e.com",
    );
    expect(out).toEqual({
      fileId: "file-1",
      fileUrl: "file-url",
      folderId: "user-fid",
      folderUrl: "user-url",
    });
  });

  it("shares the uploaded file with the user (reader) when it has an id", async () => {
    driveFilesList.mockResolvedValue({
      data: { files: [{ id: "user-fid", webViewLink: "user-url" }] },
    });
    driveFilesCreate.mockResolvedValue({ data: { id: "file-1" } });
    const mod = await importModule();
    await mod.uploadToUserFolder(Buffer.from("x"), "doc.pdf", "application/pdf", "u@e.com");
    const shareCall = drivePermissionsCreate.mock.calls.find(
      (c) => (c[0] as { fileId: string }).fileId === "file-1",
    );
    expect(shareCall).toBeDefined();
    const perm = shareCall![0] as {
      requestBody: { role: string; emailAddress: string };
      sendNotificationEmail: boolean;
    };
    expect(perm.requestBody.role).toBe("reader");
    expect(perm.requestBody.emailAddress).toBe("u@e.com");
    expect(perm.sendNotificationEmail).toBe(false);
  });

  it("skips the file-level share when the create returns no id", async () => {
    driveFilesList.mockResolvedValue({
      data: { files: [{ id: "user-fid", webViewLink: "user-url" }] },
    });
    driveFilesCreate.mockResolvedValue({ data: {} });
    const mod = await importModule();
    const out = await mod.uploadToUserFolder(
      Buffer.from("x"),
      "doc.pdf",
      "application/pdf",
      "u@e.com",
    );
    const shareCall = drivePermissionsCreate.mock.calls.find(
      (c) => (c[0] as { fileId: unknown }).fileId === undefined,
    );
    expect(shareCall).toBeUndefined();
    expect(out.fileId).toBeNull();
    expect(out.fileUrl).toBeNull();
  });

  it("returns null fileUrl when the create returns an id but no webViewLink", async () => {
    driveFilesList.mockResolvedValue({
      data: { files: [{ id: "user-fid", webViewLink: "user-url" }] },
    });
    driveFilesCreate.mockResolvedValue({ data: { id: "file-1" } });
    const mod = await importModule();
    const out = await mod.uploadToUserFolder(
      Buffer.from("x"),
      "doc.pdf",
      "application/pdf",
      "u@e.com",
    );
    expect(out.fileId).toBe("file-1");
    expect(out.fileUrl).toBeNull();
  });

  it("puts the uploader email in the file description", async () => {
    driveFilesList.mockResolvedValue({
      data: { files: [{ id: "user-fid", webViewLink: "user-url" }] },
    });
    driveFilesCreate.mockResolvedValue({ data: { id: "file-1" } });
    const mod = await importModule();
    await mod.uploadToUserFolder(Buffer.from("x"), "doc.pdf", "application/pdf", "u@e.com");
    const args = driveFilesCreate.mock.calls[0]?.[0] as {
      requestBody: { description: string };
    };
    expect(args.requestBody.description).toBe("Uploaded by u@e.com via BlockID.au");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listUserFolderFiles
// ─────────────────────────────────────────────────────────────────────────────

describe("listUserFolderFiles", () => {
  beforeEach(() => primeEnv());

  it("passes the folder-id + `trashed = false` query", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    const mod = await importModule();
    await mod.listUserFolderFiles("user-fid");
    const args = driveFilesList.mock.calls[0]?.[0] as { q: string };
    expect(args.q).toBe("'user-fid' in parents and trashed = false");
  });

  it("orders results by createdTime desc and requests up to 100 items", async () => {
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    const mod = await importModule();
    await mod.listUserFolderFiles("user-fid");
    const args = driveFilesList.mock.calls[0]?.[0] as { orderBy: string; pageSize: number };
    expect(args.orderBy).toBe("createdTime desc");
    expect(args.pageSize).toBe(100);
  });

  it("returns [] when the response contains no files field", async () => {
    driveFilesList.mockResolvedValue({ data: {} });
    const mod = await importModule();
    const out = await mod.listUserFolderFiles("user-fid");
    expect(out).toEqual([]);
  });

  it("maps files with all fields populated", async () => {
    driveFilesList.mockResolvedValue({
      data: {
        files: [
          {
            id: "f1",
            name: "invoice.pdf",
            webViewLink: "https://drive/f1",
            mimeType: "application/pdf",
            createdTime: "2026-08-01T00:00:00Z",
          },
        ],
      },
    });
    const mod = await importModule();
    const out = await mod.listUserFolderFiles("user-fid");
    expect(out).toEqual([
      {
        id: "f1",
        name: "invoice.pdf",
        webViewLink: "https://drive/f1",
        mimeType: "application/pdf",
        createdTime: "2026-08-01T00:00:00Z",
      },
    ]);
  });

  it("substitutes empty strings for missing webViewLink, mimeType, and createdTime", async () => {
    driveFilesList.mockResolvedValue({
      data: { files: [{ id: "f2", name: "n.pdf" }] },
    });
    const mod = await importModule();
    const out = await mod.listUserFolderFiles("user-fid");
    expect(out[0]).toEqual({
      id: "f2",
      name: "n.pdf",
      webViewLink: "",
      mimeType: "",
      createdTime: "",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createReportGoogleDoc
// ─────────────────────────────────────────────────────────────────────────────

describe("createReportGoogleDoc", () => {
  it("returns null when GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL is missing (no throw)", async () => {
    primeEnv({ GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL: undefined });
    const mod = await importModule();
    const out = await mod.createReportGoogleDoc(
      "u@e.com",
      "slug-1",
      makeReport(),
      makeAnalysis(),
    );
    expect(out).toBeNull();
    expect(driveFilesCreate).not.toHaveBeenCalled();
  });

  it("returns null when GOOGLE_DRIVE_PRIVATE_KEY is missing (no throw)", async () => {
    primeEnv({ GOOGLE_DRIVE_PRIVATE_KEY: undefined });
    const mod = await importModule();
    const out = await mod.createReportGoogleDoc(
      "u@e.com",
      "slug-1",
      makeReport(),
      makeAnalysis(),
    );
    expect(out).toBeNull();
  });

  it("returns null and swallows the error when getOrCreateUserFolder throws (via getDriveClient)", async () => {
    // GOOGLE_DRIVE_FOLDER_ID missing → outer creds-ok, but getDriveClient inside
    // getOrCreateUserFolder throws because folderId is missing. The outer
    // try/catch must swallow.
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL = "svc@example.iam.gserviceaccount.com";
    process.env.GOOGLE_DRIVE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await importModule();
    const out = await mod.createReportGoogleDoc(
      "u@e.com",
      "slug-1",
      makeReport(),
      makeAnalysis(),
    );
    expect(out).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns { docId, docUrl } on success", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockResolvedValue({
      data: { id: "doc-1", webViewLink: "https://docs.google.com/document/d/doc-1/edit" },
    });
    const mod = await importModule();
    const out = await mod.createReportGoogleDoc(
      "u@e.com",
      "slug-1",
      makeReport(),
      makeAnalysis(),
    );
    expect(out).toEqual({
      docId: "doc-1",
      docUrl: "https://docs.google.com/document/d/doc-1/edit",
    });
  });

  it("falls back to a canonical Docs URL when webViewLink is missing", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "doc-2" } });
    const mod = await importModule();
    const out = await mod.createReportGoogleDoc(
      "u@e.com",
      "slug-2",
      makeReport(),
      makeAnalysis(),
    );
    expect(out).toEqual({
      docId: "doc-2",
      docUrl: "https://docs.google.com/document/d/doc-2/edit",
    });
  });

  it("returns null when the create response has no id", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockResolvedValue({ data: {} });
    const mod = await importModule();
    const out = await mod.createReportGoogleDoc(
      "u@e.com",
      "slug-3",
      makeReport(),
      makeAnalysis(),
    );
    expect(out).toBeNull();
  });

  it("converts the upload to a native Google Doc via mimeType", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "doc-4", webViewLink: "url" } });
    const mod = await importModule();
    await mod.createReportGoogleDoc("u@e.com", "slug-4", makeReport(), makeAnalysis());
    // The user-folder-provisioning create call (folder mimeType) is skipped
    // because the search finds an existing folder — so the only create call
    // is the doc conversion.
    const args = driveFilesCreate.mock.calls[0]?.[0] as {
      requestBody: { mimeType: string };
      media: { mimeType: string };
    };
    expect(args.requestBody.mimeType).toBe("application/vnd.google-apps.document");
    expect(args.media.mimeType).toBe("text/plain");
  });

  it("names the doc with the slug and an ISO date prefix", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "doc-5", webViewLink: "url" } });
    const mod = await importModule();
    await mod.createReportGoogleDoc("u@e.com", "my-slug-42", makeReport(), makeAnalysis());
    const args = driveFilesCreate.mock.calls[0]?.[0] as { requestBody: { name: string } };
    expect(args.requestBody.name).toMatch(/^SVI Report — my-slug-42 — \d{4}-\d{2}-\d{2}$/);
  });

  it("targets the resolved user folder id as the parent of the doc", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({
      data: { files: [{ id: "user-fid-parent", webViewLink: "u" }] },
    });
    driveFilesCreate.mockResolvedValue({ data: { id: "doc-6", webViewLink: "url" } });
    const mod = await importModule();
    await mod.createReportGoogleDoc("u@e.com", "slug-6", makeReport(), makeAnalysis());
    const args = driveFilesCreate.mock.calls[0]?.[0] as {
      requestBody: { parents: string[] };
    };
    expect(args.requestBody.parents).toEqual(["user-fid-parent"]);
  });

  it("shares the doc with the user as a reader (fire-and-forget)", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "doc-7", webViewLink: "url" } });
    const mod = await importModule();
    await mod.createReportGoogleDoc("recipient@example.com", "slug-7", makeReport(), makeAnalysis());
    const shareCall = drivePermissionsCreate.mock.calls.find(
      (c) => (c[0] as { fileId: string }).fileId === "doc-7",
    );
    expect(shareCall).toBeDefined();
    const perm = shareCall![0] as {
      requestBody: { role: string; emailAddress: string };
    };
    expect(perm.requestBody.role).toBe("reader");
    expect(perm.requestBody.emailAddress).toBe("recipient@example.com");
  });

  it("still returns { docId, docUrl } when the user-share permissions.create rejects", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "doc-8", webViewLink: "https://docs/doc-8" } });
    // First reject → the doc-share call. (No folder-share calls fire because
    // the folder already existed.)
    drivePermissionsCreate.mockRejectedValueOnce(new Error("bad email"));
    const mod = await importModule();
    const out = await mod.createReportGoogleDoc(
      "bad@e.com",
      "slug-8",
      makeReport(),
      makeAnalysis(),
    );
    expect(out).toEqual({ docId: "doc-8", docUrl: "https://docs/doc-8" });
  });

  it("returns null and logs when drive.files.create rejects", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockRejectedValueOnce(new Error("quota exceeded"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await importModule();
    const out = await mod.createReportGoogleDoc(
      "u@e.com",
      "slug-9",
      makeReport(),
      makeAnalysis(),
    );
    expect(out).toBeNull();
    expect(errSpy).toHaveBeenCalledWith(
      "[google-drive] createReportGoogleDoc failed:",
      expect.any(Error),
    );
    errSpy.mockRestore();
  });

  it("puts the recipient email + slug in the file description", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "doc-a", webViewLink: "url" } });
    const mod = await importModule();
    await mod.createReportGoogleDoc(
      "recipient@example.com",
      "slug-desc",
      makeReport(),
      makeAnalysis(),
    );
    const args = driveFilesCreate.mock.calls[0]?.[0] as {
      requestBody: { description: string };
    };
    expect(args.requestBody.description).toBe(
      "BlockID.au SVI Report for recipient@example.com (slug-desc)",
    );
  });

  it("uploads the plain-text body as a Readable stream", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "doc-b", webViewLink: "url" } });
    const mod = await importModule();
    await mod.createReportGoogleDoc("u@e.com", "slug-stream", makeReport(), makeAnalysis());
    const args = driveFilesCreate.mock.calls[0]?.[0] as { media: { body: unknown } };
    expect(typeof (args.media.body as { read?: unknown }).read).toBe("function");
  });

  it("provisions a fresh folder (folder create + user + admin permissions + doc create + doc share) when the user has no folder yet", async () => {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [] } });
    driveFilesCreate
      .mockResolvedValueOnce({ data: { id: "fresh-folder", webViewLink: "u" } }) // folder
      .mockResolvedValueOnce({ data: { id: "doc-c", webViewLink: "docurl" } }); // doc
    const mod = await importModule();
    const out = await mod.createReportGoogleDoc(
      "new@e.com",
      "slug-fresh",
      makeReport(),
      makeAnalysis(),
    );
    expect(out).toEqual({ docId: "doc-c", docUrl: "docurl" });
    expect(driveFilesCreate).toHaveBeenCalledTimes(2);
    const docArgs = driveFilesCreate.mock.calls[1]?.[0] as {
      requestBody: { parents: string[] };
    };
    expect(docArgs.requestBody.parents).toEqual(["fresh-folder"]);
    // 2 folder permissions (user reader + admin writer) + 1 doc share.
    expect(drivePermissionsCreate).toHaveBeenCalledTimes(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildReportPlainText (observed via the createReportGoogleDoc upload body)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildReportPlainText (via createReportGoogleDoc upload body)", () => {
  async function capturePlainText(
    report: ReturnType<typeof makeReport>,
    analysis: ReturnType<typeof makeAnalysis>,
    slug = "cap-slug",
  ): Promise<string> {
    primeEnv();
    driveFilesList.mockResolvedValue({ data: { files: [{ id: "user-fid", webViewLink: "u" }] } });
    driveFilesCreate.mockResolvedValue({ data: { id: "doc-cap", webViewLink: "url" } });
    const mod = await importModule();
    await mod.createReportGoogleDoc("u@e.com", slug, report, analysis);
    const args = driveFilesCreate.mock.calls[0]?.[0] as {
      media: { body: import("stream").Readable };
    };
    // Drain the Readable synchronously — the module pushes the whole buffer
    // then null in one shot, so `.read()` returns the full payload.
    const chunk = args.media.body.read();
    return chunk == null ? "" : Buffer.from(chunk).toString("utf-8");
  }

  it("starts with the BlockID.au header line", async () => {
    const text = await capturePlainText(makeReport(), makeAnalysis());
    expect(text.split("\n")[0]).toBe("BlockID.au — Startup Value Index Report");
  });

  it("includes the report tier, overall score, SVI total, and stage label", async () => {
    const text = await capturePlainText(makeReport(), makeAnalysis());
    expect(text).toContain("Report Tier: standard | Overall Score: 78/100");
    expect(text).toContain("SVI Score: 620 | Stage: Growth");
  });

  it("includes the slug in the Report ID line", async () => {
    const text = await capturePlainText(makeReport(), makeAnalysis(), "my-unique-slug");
    expect(text).toContain("Report ID: my-unique-slug");
  });

  it("renders each page with pageNum, title, and subtitle", async () => {
    const text = await capturePlainText(makeReport(), makeAnalysis());
    expect(text).toContain("Page 1: Executive Summary");
    expect(text).toContain("Overall");
    expect(text).toContain("Page 2: Market");
  });

  it("prefixes highlights with `  - `", async () => {
    const text = await capturePlainText(makeReport(), makeAnalysis());
    expect(text).toContain("Key highlights:");
    expect(text).toContain("  - High A");
    expect(text).toContain("  - High B");
  });

  it("renders dataPoints as `  key: value`", async () => {
    const text = await capturePlainText(makeReport(), makeAnalysis());
    expect(text).toContain("Data points:");
    expect(text).toContain("  rev: $1M");
  });

  it("renders extendedSections with a `  >> title` marker", async () => {
    const text = await capturePlainText(makeReport(), makeAnalysis());
    expect(text).toContain("  >> Deep");
    expect(text).toContain("Extended body.");
  });

  it("appends the ACN + ABN disclaimer footer", async () => {
    const text = await capturePlainText(makeReport(), makeAnalysis());
    expect(text).toContain("Auschain PTY LTD, ACN 659 615 111, ABN 79 659 615 111");
    expect(text).toContain("The Startup Value Index (SVI) is NOT a financial valuation");
    expect(text).toContain("BlockID does not hold an Australian Financial Services Licence");
    expect(text.trimEnd().endsWith("https://blockid.au")).toBe(true);
  });

  it("omits highlights + dataPoints + extended sections when the page lacks them", async () => {
    const text = await capturePlainText(makeReport(), makeAnalysis());
    // Page 2 has no highlights/dataPoints/extended sections — count the
    // labels globally to confirm they were only emitted for page 1.
    expect(text.match(/Key highlights:/g)?.length ?? 0).toBe(1);
    expect(text.match(/Data points:/g)?.length ?? 0).toBe(1);
    expect(text.match(/  >> /g)?.length ?? 0).toBe(1);
  });

  it("omits dataPoints label when the object is present-but-empty", async () => {
    const report = makeReport();
    (report.pages[0] as { dataPoints: Record<string, string> }).dataPoints = {};
    const text = await capturePlainText(report, makeAnalysis());
    expect(text.match(/Data points:/g) ?? []).toHaveLength(0);
  });

  it("preserves the page.content markdown verbatim in the output", async () => {
    const report = makeReport();
    report.pages[0].content = "Line 1\nLine 2\n**bold**";
    const text = await capturePlainText(report, makeAnalysis());
    expect(text).toContain("Line 1\nLine 2\n**bold**");
  });
});
