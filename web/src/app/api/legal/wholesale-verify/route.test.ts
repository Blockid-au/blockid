// Colocated vitest for POST /api/legal/wholesale-verify — P9-legal-wholesale-verify-route-test.
//
// This route accepts a wholesale-investor certification upload and does three
// legally-material things in order: (1) records a consent event pinned to the
// current DISCLAIMER_VERSIONS.wholesale_certification, (2) flips the caller's
// app_users.wholesale_status to `wholesale_certified`, (3) appends a
// hash-chained audit row. Silent drift here would either mis-classify a
// non-wholesale founder as certified (unlocking wholesale-only UI + carrying
// legal exposure under Corporations Act 2001 s708(8) / s761G(7)), or drop the
// consent artefact so counsel cannot reconstruct which disclaimer copy the
// user saw. Both are hard-to-detect regressions once shipped — hence the
// dense case grid below.
//
// Silent regressions this pins against:
//   - loosening auth so a probe can upload cert bytes without a session;
//   - dropping the size cap and letting an arbitrary MB blob into memory
//     (the route pulls the whole payload with `arrayBuffer()`);
//   - dropping the ALLOWED_TYPES gate and letting an .exe / .html slip past;
//   - swallowing a recordConsent throw (must be 500, not silent success);
//   - swallowing an app_users update error (would leave consent + audit rows
//     with no reflected wholesale_status flag);
//   - promoting the appendAudit throw to fatal (audit is best-effort — a
//     transient audit outage must not block the compliance path);
//   - re-using the wrong DISCLAIMER_VERSIONS key or a hard-coded version
//     string so the pinned canonical body drifts from what the client saw;
//   - dropping the sha256 file_hash so the returned artefact cannot be
//     matched to a bucket upload later.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// --- Mocks -----------------------------------------------------------------

interface AppUser {
  id: string;
  email: string;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  recordConsentMock: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(),
  appendAuditMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  detectJurisdictionMock: vi.fn<
    (req: Request) => Promise<{ country?: string } | null>
  >(),
}));

const {
  getCurrentUserMock,
  getSupabaseAdminMock,
  recordConsentMock,
  appendAuditMock,
  detectJurisdictionMock,
} = mocks;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

// Keep the real hashDisclaimerBody — it's a pure sha256 helper and the whole
// point of the disclaimer_hash assertion below is that the client-visible
// hash matches the canonical version-tagged token verbatim.
vi.mock("@/lib/consent", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/consent")>("@/lib/consent");
  return {
    ...actual,
    recordConsent: (...args: unknown[]) => mocks.recordConsentMock(...args),
  };
});

vi.mock("@/lib/audit", () => ({
  appendAudit: (...args: unknown[]) => mocks.appendAuditMock(...args),
}));

vi.mock("@/lib/jurisdiction", () => ({
  detectJurisdiction: (req: Request) => mocks.detectJurisdictionMock(req),
}));

// Import route AFTER mocks are registered.
import { POST, dynamic, runtime } from "./route";
import { DISCLAIMER_VERSIONS } from "@/lib/legal/versions";
import { hashDisclaimerBody } from "@/lib/consent";

// --- Supabase fake ---------------------------------------------------------

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  eqCol: string;
  eqVal: unknown;
}

interface FakeState {
  updates: UpdateCall[];
  updateError: { message: string } | null;
}

const state: FakeState = { updates: [], updateError: null };

function makeFakeSupabase() {
  return {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              state.updates.push({ table, patch, eqCol: col, eqVal: val });
              return Promise.resolve({ error: state.updateError });
            },
          };
        },
      };
    },
  };
}

// --- Request helpers -------------------------------------------------------

const USER: AppUser = { id: "user-abc-123", email: "founder@example.test" };

function buildRequest(opts: {
  file?: File | string | null;
  omitFile?: boolean;
  body?: BodyInit;
  headers?: Record<string, string>;
} = {}): Request {
  if (opts.body !== undefined) {
    return new Request("http://x/api/legal/wholesale-verify", {
      method: "POST",
      headers: opts.headers,
      body: opts.body,
    });
  }
  const fd = new FormData();
  if (!opts.omitFile) {
    if (opts.file === undefined) {
      fd.set(
        "file",
        new File([new Blob(["hello-cert-bytes"])], "cert.pdf", {
          type: "application/pdf",
        }),
      );
    } else if (opts.file !== null) {
      fd.set("file", opts.file as Blob | string);
    }
  }
  return new Request("http://x/api/legal/wholesale-verify", {
    method: "POST",
    body: fd,
    headers: opts.headers,
  });
}

function fileOfSize(bytes: number, type = "application/pdf", name = "big.pdf"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  state.updates = [];
  state.updateError = null;
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  getSupabaseAdminMock.mockReset().mockReturnValue(makeFakeSupabase());
  recordConsentMock
    .mockReset()
    .mockResolvedValue({ id: "consent-uuid-000" });
  appendAuditMock.mockReset().mockResolvedValue(undefined);
  detectJurisdictionMock.mockReset().mockResolvedValue({ country: "AU" });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Module invariants
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — module invariants", () => {
  it('exports dynamic = "force-dynamic" so cert uploads are never edge-cached', () => {
    // A cached 200 would let a second caller re-use the first caller's
    // consent_id + file_hash — a legal-artefact swap of the worst kind.
    expect(dynamic).toBe("force-dynamic");
  });

  it('exports runtime = "nodejs" — createHash + FormData multipart parsing require the Node runtime', () => {
    // The edge runtime lacks a stable File/FormData contract for large
    // multipart bodies; pinning the runtime prevents an accidental edge
    // migration from silently truncating uploads.
    expect(runtime).toBe("nodejs");
  });
});

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — auth gate", () => {
  it("returns 401 when no session — form is never parsed", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "Authentication required",
    });
    expect(recordConsentMock).not.toHaveBeenCalled();
    expect(appendAuditMock).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("401 fires even when the body is malformed — auth precedes multipart parsing", async () => {
    // Anonymous callers must not be able to distinguish "bad request" from
    // "unauthorized" — info-leak surface if the ordering ever inverts.
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(
      buildRequest({
        body: "not-a-multipart-body",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("401 fires even when the caller is anonymous but supplies a valid cert file", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    expect(state.updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FormData parsing
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — form-data parsing", () => {
  it("returns 400 when body cannot be parsed as multipart/form-data", async () => {
    const res = await POST(
      buildRequest({
        body: "raw-string-body",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "Expected multipart/form-data",
    });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("does not swallow the parse error into a 500 — must be 400 so the client can retry with a proper body", async () => {
    // A 500 here would look like an outage to the founder-facing UI and
    // trigger a retry storm; the 400 makes the client fix its request.
    const res = await POST(
      buildRequest({
        body: '{"json":true}',
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// File-field validation
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — file field validation", () => {
  it("returns 400 when the file field is entirely absent", async () => {
    const res = await POST(buildRequest({ omitFile: true }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "Missing 'file' field",
    });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the file field is a plain string (not a File)", async () => {
    // form.set("file", "some string") — the `instanceof File` guard is the
    // only thing stopping a string from being handed to arrayBuffer() below.
    const res = await POST(buildRequest({ file: "hi" }));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("Missing 'file' field");
  });

  it("returns 400 when the file is empty (size === 0)", async () => {
    const empty = new File([], "empty.pdf", { type: "application/pdf" });
    const res = await POST(buildRequest({ file: empty }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, reason: "Empty file" });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("returns 413 when the file exceeds MAX_UPLOAD_BYTES (8 MB + 1)", async () => {
    const oversized = fileOfSize(8 * 1024 * 1024 + 1);
    const res = await POST(buildRequest({ file: oversized }));
    expect(res.status).toBe(413);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(String(body.reason)).toContain("File too large");
    expect(String(body.reason)).toContain(String(8 * 1024 * 1024));
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("accepts a file exactly at MAX_UPLOAD_BYTES (8 MB) — off-by-one guard", async () => {
    // The comparison is strict `>` — 8 MB exactly must pass through so that a
    // future refactor to `>=` gets caught here.
    const atLimit = fileOfSize(8 * 1024 * 1024);
    const res = await POST(buildRequest({ file: atLimit }));
    expect(res.status).toBe(200);
    expect(recordConsentMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Content-type gate
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — content-type gate", () => {
  it("returns 415 for a disallowed content type (text/html)", async () => {
    const html = new File(["<html>"], "cert.html", { type: "text/html" });
    const res = await POST(buildRequest({ file: html }));
    expect(res.status).toBe(415);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(String(body.reason)).toContain("text/html");
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("returns 415 for a script-ish content type (application/javascript)", async () => {
    const js = new File(["alert(1)"], "cert.js", {
      type: "application/javascript",
    });
    const res = await POST(buildRequest({ file: js }));
    expect(res.status).toBe(415);
  });

  it.each([
    ["application/pdf", "cert.pdf"],
    ["image/png", "cert.png"],
    ["image/jpeg", "cert.jpg"],
    ["image/jpg", "cert.jpg"],
  ])("accepts allowed content type %s", async (type, name) => {
    const file = new File(["bytes"], name, { type });
    const res = await POST(buildRequest({ file }));
    expect(res.status).toBe(200);
    expect(recordConsentMock).toHaveBeenCalledTimes(1);
  });

  it("case-folds the content type before the ALLOWED_TYPES lookup", async () => {
    // A browser-sent `APPLICATION/PDF` must not be rejected as unsupported.
    const upper = new File(["bytes"], "cert.pdf", { type: "APPLICATION/PDF" });
    const res = await POST(buildRequest({ file: upper }));
    expect(res.status).toBe(200);
  });

  it("415 reason string echoes the offending content type so ops can debug without opening the payload", async () => {
    const bad = new File(["x"], "cert.svg", { type: "image/svg+xml" });
    const res = await POST(buildRequest({ file: bad }));
    expect(res.status).toBe(415);
    expect(String((await json(res)).reason)).toContain("image/svg+xml");
  });
});

// ---------------------------------------------------------------------------
// Supabase availability
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — supabase availability", () => {
  it("returns 503 when getSupabaseAdmin() returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(buildRequest());
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "Supabase unavailable",
    });
    expect(recordConsentMock).not.toHaveBeenCalled();
    expect(appendAuditMock).not.toHaveBeenCalled();
  });

  it("checks supabase availability BEFORE recording consent — a broken infra tick must not create dangling consent rows", async () => {
    // Consent + app_users + audit are meant to move together. If consent
    // fires but the app_users update cannot even try (no admin client),
    // the row is orphaned and the founder sees a 5xx anyway.
    getSupabaseAdminMock.mockReturnValue(null);
    await POST(buildRequest());
    expect(recordConsentMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Jurisdiction detection
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — jurisdiction detection", () => {
  it("passes the detected country through to recordConsent + appendAudit", async () => {
    detectJurisdictionMock.mockResolvedValue({ country: "US" });
    await POST(buildRequest());
    const consentArgs = recordConsentMock.mock.calls[0][0] as {
      jurisdiction: string;
    };
    expect(consentArgs.jurisdiction).toBe("US");
    const auditArgs = appendAuditMock.mock.calls[0][0] as {
      detail: { jurisdiction: string };
    };
    expect(auditArgs.detail.jurisdiction).toBe("US");
  });

  it("falls back to 'AU' when detectJurisdiction throws", async () => {
    detectJurisdictionMock.mockRejectedValue(new Error("geo lookup down"));
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    const consentArgs = recordConsentMock.mock.calls[0][0] as {
      jurisdiction: string;
    };
    expect(consentArgs.jurisdiction).toBe("AU");
  });

  it("falls back to 'AU' when detectJurisdiction resolves with no country field", async () => {
    detectJurisdictionMock.mockResolvedValue({});
    await POST(buildRequest());
    const consentArgs = recordConsentMock.mock.calls[0][0] as {
      jurisdiction: string;
    };
    expect(consentArgs.jurisdiction).toBe("AU");
  });

  it("falls back to 'AU' when detectJurisdiction resolves with null", async () => {
    detectJurisdictionMock.mockResolvedValue(null);
    await POST(buildRequest());
    const consentArgs = recordConsentMock.mock.calls[0][0] as {
      jurisdiction: string;
    };
    expect(consentArgs.jurisdiction).toBe("AU");
  });
});

// ---------------------------------------------------------------------------
// Consent recording
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — consent recording", () => {
  it("records consent with kind=wholesale_certification and the pinned DISCLAIMER_VERSIONS value", async () => {
    await POST(buildRequest());
    const args = recordConsentMock.mock.calls[0][0] as {
      user_id: string;
      kind: string;
      disclaimer_version: string;
      granted: boolean;
    };
    expect(args.user_id).toBe(USER.id);
    expect(args.kind).toBe("wholesale_certification");
    expect(args.disclaimer_version).toBe(
      DISCLAIMER_VERSIONS.wholesale_certification,
    );
    expect(args.granted).toBe(true);
  });

  it("hashes the canonical `wholesale_certification:<version>` token, not the file bytes", async () => {
    // The disclaimer_hash proves *what the user acknowledged*, not what they
    // uploaded — hashing the file bytes here would defeat the whole point
    // (file_hash lives in the detail bag for that).
    await POST(buildRequest());
    const args = recordConsentMock.mock.calls[0][0] as {
      disclaimer_hash: string;
    };
    const expected = hashDisclaimerBody(
      `wholesale_certification:${DISCLAIMER_VERSIONS.wholesale_certification}`,
    );
    expect(args.disclaimer_hash).toBe(expected);
  });

  it("passes file_hash + file_size + content_type + filename in detail", async () => {
    const file = new File(["bytes-of-a-cert"], "my-cert.pdf", {
      type: "application/pdf",
    });
    await POST(buildRequest({ file }));
    const args = recordConsentMock.mock.calls[0][0] as {
      detail: {
        file_hash: string;
        file_size: number;
        content_type: string;
        filename: string;
      };
    };
    const expectedHash = createHash("sha256")
      .update(new Uint8Array(await file.arrayBuffer()))
      .digest("hex");
    expect(args.detail.file_hash).toBe(expectedHash);
    expect(args.detail.file_size).toBe(file.size);
    expect(args.detail.content_type).toBe("application/pdf");
    expect(args.detail.filename).toBe("my-cert.pdf");
  });

  it("returns 500 when recordConsent throws — persistence is fail-closed", async () => {
    recordConsentMock.mockRejectedValue(new Error("consent write failed"));
    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "Consent persistence failed",
    });
    // The app_users update + audit MUST NOT run when consent failed.
    expect(state.updates).toHaveLength(0);
    expect(appendAuditMock).not.toHaveBeenCalled();
  });

  it("preserves the uploaded filename verbatim (no trim, no case-fold, no sanitisation)", async () => {
    // The filename lands in a JSON detail field, not a filesystem path — the
    // route deliberately does not mangle it so counsel can match support
    // tickets ("I uploaded My Cert 2026.pdf") to consent rows one-to-one.
    const spaced = new File(["b"], "My Cert 2026.pdf", {
      type: "application/pdf",
    });
    await POST(buildRequest({ file: spaced }));
    const args = recordConsentMock.mock.calls[0][0] as {
      detail: { filename: string };
    };
    expect(args.detail.filename).toBe("My Cert 2026.pdf");
  });
});

// ---------------------------------------------------------------------------
// app_users update
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — app_users update", () => {
  it("flips wholesale_status to 'wholesale_certified' filtered by user.id", async () => {
    await POST(buildRequest());
    expect(state.updates).toHaveLength(1);
    const call = state.updates[0];
    expect(call.table).toBe("app_users");
    expect(call.patch).toEqual({ wholesale_status: "wholesale_certified" });
    expect(call.eqCol).toBe("id");
    expect(call.eqVal).toBe(USER.id);
  });

  it("returns 500 when the app_users update surfaces an error", async () => {
    state.updateError = { message: "constraint violation" };
    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "Failed to update account status",
    });
  });

  it("still returns 500 (and skips audit) when consent succeeded but the status flip failed", async () => {
    // Consent + wholesale_status must move together. A silent-success 200
    // here would let counsel see the consent row but the founder-facing UI
    // still show 'pending' — dangerous compliance drift.
    state.updateError = { message: "conflict" };
    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
    expect(recordConsentMock).toHaveBeenCalledTimes(1);
    expect(appendAuditMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Audit append
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — audit append", () => {
  it("appends an audit row with actor=user, action=wholesale_certification_submitted, resource_type=app_users", async () => {
    await POST(buildRequest());
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    const args = appendAuditMock.mock.calls[0][0] as {
      user_id: string;
      actor: string;
      action: string;
      resource_type: string;
      resource_id: string;
    };
    expect(args.user_id).toBe(USER.id);
    expect(args.actor).toBe("user");
    expect(args.action).toBe("wholesale_certification_submitted");
    expect(args.resource_type).toBe("app_users");
    expect(args.resource_id).toBe(USER.id);
  });

  it("includes consent_event_id + file_hash + file_size + content_type + filename + jurisdiction in the audit detail", async () => {
    recordConsentMock.mockResolvedValue({ id: "consent-linked-42" });
    detectJurisdictionMock.mockResolvedValue({ country: "AU" });
    await POST(buildRequest());
    const args = appendAuditMock.mock.calls[0][0] as {
      detail: Record<string, unknown>;
    };
    expect(args.detail.consent_event_id).toBe("consent-linked-42");
    expect(args.detail.file_hash).toEqual(expect.any(String));
    expect(args.detail.file_size).toEqual(expect.any(Number));
    expect(args.detail.content_type).toBe("application/pdf");
    expect(args.detail.filename).toBe("cert.pdf");
    expect(args.detail.jurisdiction).toBe("AU");
  });

  it("swallows an appendAudit failure — audit is best-effort, the compliance path must still succeed", async () => {
    // The hash-chained audit table has a hot-path constraint (HMAC secret,
    // trigger-computed hash). A transient audit outage must NOT roll back
    // a valid wholesale certification the user just uploaded.
    appendAuditMock.mockRejectedValue(new Error("hmac secret missing"));
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.wholesale_certified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Happy-path response shape
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — happy path", () => {
  it("returns 200 with {ok, wholesale_certified, consent_id, file_hash}", async () => {
    recordConsentMock.mockResolvedValue({ id: "consent-final-777" });
    const file = new File(["stable-bytes"], "cert.pdf", {
      type: "application/pdf",
    });
    const res = await POST(buildRequest({ file }));
    expect(res.status).toBe(200);
    const body = await json(res);
    const expectedHash = createHash("sha256")
      .update(new Uint8Array(await file.arrayBuffer()))
      .digest("hex");
    expect(body).toEqual({
      ok: true,
      wholesale_certified: true,
      consent_id: "consent-final-777",
      file_hash: expectedHash,
    });
  });

  it("file_hash is a lowercase sha256 hex (64 chars, [0-9a-f])", async () => {
    // Pin the digest encoding — a switch to base64 or uppercase would break
    // every downstream consumer that greps for the hash in audit rows.
    const res = await POST(buildRequest());
    const body = await json(res);
    expect(String(body.file_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the consent_id exactly as recordConsent produced it — no re-wrapping", async () => {
    recordConsentMock.mockResolvedValue({ id: "verbatim-consent-id" });
    const res = await POST(buildRequest());
    const body = await json(res);
    expect(body.consent_id).toBe("verbatim-consent-id");
  });
});

// ---------------------------------------------------------------------------
// Client-meta parsing (ip + ua)
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — client meta", () => {
  it("uses the FIRST entry of x-forwarded-for (proxy chain semantics)", async () => {
    await POST(
      buildRequest({
        headers: {
          "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2",
          "user-agent": "Mozilla/5.0 test",
        },
      }),
    );
    const args = recordConsentMock.mock.calls[0][0] as {
      ip: string;
      ua: string;
    };
    expect(args.ip).toBe("203.0.113.7");
    expect(args.ua).toBe("Mozilla/5.0 test");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    await POST(
      buildRequest({
        headers: { "x-real-ip": "198.51.100.5" },
      }),
    );
    const args = recordConsentMock.mock.calls[0][0] as { ip: string };
    expect(args.ip).toBe("198.51.100.5");
  });

  it("records ip='' when neither x-forwarded-for nor x-real-ip is present", async () => {
    await POST(buildRequest());
    const args = recordConsentMock.mock.calls[0][0] as {
      ip: string;
      ua: string;
    };
    expect(args.ip).toBe("");
    expect(args.ua).toBe("");
  });

  it("trims whitespace around the first x-forwarded-for hop", async () => {
    await POST(
      buildRequest({
        headers: { "x-forwarded-for": "   192.0.2.9   , 10.0.0.1" },
      }),
    );
    const args = recordConsentMock.mock.calls[0][0] as { ip: string };
    expect(args.ip).toBe("192.0.2.9");
  });
});

// ---------------------------------------------------------------------------
// Gate precedence (documented ordering)
// ---------------------------------------------------------------------------

describe("POST /api/legal/wholesale-verify — gate precedence", () => {
  it("auth (401) precedes form-data parse (400)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(
      buildRequest({
        body: "raw",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("missing-file (400) precedes empty-file (400)", async () => {
    const res = await POST(buildRequest({ omitFile: true }));
    const body = await json(res);
    expect(body.reason).toBe("Missing 'file' field");
    expect(body.reason).not.toBe("Empty file");
  });

  it("empty-file (400) precedes size-limit (413) — an empty upload never reaches the size branch", async () => {
    const empty = new File([], "e.pdf", { type: "application/pdf" });
    const res = await POST(buildRequest({ file: empty }));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("Empty file");
  });

  it("size-limit (413) precedes content-type (415) — an oversize .exe returns 413, not 415", async () => {
    const oversized = new File(
      [new Uint8Array(8 * 1024 * 1024 + 1)],
      "big.exe",
      { type: "application/x-msdownload" },
    );
    const res = await POST(buildRequest({ file: oversized }));
    expect(res.status).toBe(413);
  });

  it("content-type (415) precedes supabase availability (503)", async () => {
    // A caller uploading text/html must always see 415, even if supabase
    // is down — the type check does not depend on the admin client.
    getSupabaseAdminMock.mockReturnValue(null);
    const bad = new File(["<h1>"], "cert.html", { type: "text/html" });
    const res = await POST(buildRequest({ file: bad }));
    expect(res.status).toBe(415);
  });

  it("supabase availability (503) precedes consent (500) — a broken admin client never triggers a consent write", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    recordConsentMock.mockRejectedValue(new Error("should never fire"));
    const res = await POST(buildRequest());
    expect(res.status).toBe(503);
    expect(recordConsentMock).not.toHaveBeenCalled();
  });
});
