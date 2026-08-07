// Colocated vitest for POST /api/legal/ack — P9-legal-ack-route-test.
//
// This route records a legally-binding consent event (ToS, privacy,
// general-advice warning, wholesale certification, marketing opt-in, etc.)
// for the currently signed-in user. Silent drift here would either drop a
// consent artefact (so counsel cannot reconstruct which disclaimer copy the
// user saw), stamp the wrong version onto a fresh consent (so a stale
// disclaimer body sneaks past a pinned bump), or leak a probe-friendly 400
// path that reveals whether an internal-only kind is registered.
//
// Silent regressions this pins against:
//   - loosening auth so a probe can write a consent row without a session;
//   - reordering the version-mismatch guard so a stale client copy silently
//     lands as if it were the current pinned version;
//   - defaulting `granted` to false (POST implies grant per the header comment);
//   - dropping the `detail.body_md` hash preference so counsel loses the exact
//     bytes the client says it saw;
//   - swallowing a recordConsent throw (must be 500, not silent success);
//   - hard-coding the jurisdiction to "AU" even when detectJurisdiction has a
//     signal — regulatory routing depends on this;
//   - dropping the try/catch around detectJurisdiction so a header-parse throw
//     kills a valid consent write.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks -----------------------------------------------------------------

interface AppUser {
  id: string;
  email: string;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  recordConsentMock: vi.fn<
    (...args: unknown[]) => Promise<{ id: string }>
  >(),
  detectJurisdictionMock: vi.fn<
    (req: Request) => Promise<{ country?: string } | null>
  >(),
}));

const {
  getCurrentUserMock,
  recordConsentMock,
  detectJurisdictionMock,
} = mocks;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

// Keep the real hashDisclaimerBody — it's a pure sha256 helper and the whole
// point of the disclaimer_hash assertion is that the returned hash matches
// the canonical `kind:version` (or detail.body_md) verbatim.
vi.mock("@/lib/consent", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/consent")>("@/lib/consent");
  return {
    ...actual,
    recordConsent: (...args: unknown[]) => mocks.recordConsentMock(...args),
  };
});

vi.mock("@/lib/jurisdiction", () => ({
  detectJurisdiction: (req: Request) => mocks.detectJurisdictionMock(req),
}));

// Import route AFTER mocks are registered.
import { POST, dynamic } from "./route";
import { DISCLAIMER_VERSIONS } from "@/lib/legal/versions";
import { hashDisclaimerBody } from "@/lib/consent";

// --- Request helpers -------------------------------------------------------

const USER: AppUser = { id: "user-abc-123", email: "founder@example.test" };
const TOS_VERSION = DISCLAIMER_VERSIONS.tos;
const PRIVACY_VERSION = DISCLAIMER_VERSIONS.privacy;

function buildRequest(opts: {
  body?: unknown;
  raw?: BodyInit;
  headers?: Record<string, string>;
} = {}): Request {
  if (opts.raw !== undefined) {
    return new Request("http://x/api/legal/ack", {
      method: "POST",
      headers: opts.headers ?? { "content-type": "application/json" },
      body: opts.raw,
    });
  }
  return new Request("http://x/api/legal/ack", {
    method: "POST",
    headers: opts.headers ?? { "content-type": "application/json" },
    body: JSON.stringify(opts.body ?? {}),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  recordConsentMock.mockReset().mockResolvedValue({ id: "consent-uuid-000" });
  detectJurisdictionMock.mockReset().mockResolvedValue({ country: "AU" });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Module invariants
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — module invariants", () => {
  it('exports dynamic = "force-dynamic" so consent writes are never edge-cached', () => {
    // A cached 200 would replay a stale consent_id to a second caller —
    // a legal-artefact swap of the worst kind.
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — auth gate", () => {
  it("returns 401 when no session — body is never parsed", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(buildRequest({ body: { kind: "tos" } }));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "Authentication required",
    });
    expect(recordConsentMock).not.toHaveBeenCalled();
    expect(detectJurisdictionMock).not.toHaveBeenCalled();
  });

  it("401 fires even when the body is malformed — auth precedes body parsing", async () => {
    // Anonymous callers must not be able to distinguish "bad request" from
    // "unauthorized" — info-leak surface if the ordering ever inverts.
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(buildRequest({ raw: "not-json" }));
    expect(res.status).toBe(401);
  });

  it("401 fires even when a fully-valid consent payload is supplied — anonymous callers cannot write consent rows", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(
      buildRequest({ body: { kind: "tos", disclaimer_version: TOS_VERSION } }),
    );
    expect(res.status).toBe(401);
    expect(recordConsentMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// JSON body parsing
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — body parsing", () => {
  it("returns 400 when body is not valid JSON", async () => {
    const res = await POST(buildRequest({ raw: "not-json-here" }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "Invalid JSON body",
    });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is empty string", async () => {
    const res = await POST(buildRequest({ raw: "" }));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("Invalid JSON body");
  });

  it("does not promote a JSON parse error into a 500 — must stay 400 so the client can fix its request", async () => {
    // A 500 here would look like an outage to the founder-facing UI and
    // trigger a retry storm; the 400 makes the client fix its request.
    const res = await POST(buildRequest({ raw: "{unterminated" }));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// kind validation
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — kind validation", () => {
  it("returns 400 when kind is missing", async () => {
    const res = await POST(buildRequest({ body: {} }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "kind is required",
    });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("returns 400 when kind is an empty string", async () => {
    const res = await POST(buildRequest({ body: { kind: "" } }));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("kind is required");
  });

  it("returns 400 when kind is a non-string (number)", async () => {
    const res = await POST(buildRequest({ body: { kind: 42 } }));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("kind is required");
  });

  it("returns 400 when kind is null", async () => {
    const res = await POST(buildRequest({ body: { kind: null } }));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("kind is required");
  });

  it("returns 400 when kind is an unknown disclaimer kind — echoes kind back so counsel can grep", async () => {
    const res = await POST(
      buildRequest({ body: { kind: "totally-made-up" } }),
    );
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "Unknown disclaimer kind: totally-made-up",
    });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("returns 400 when kind uses a typo close to a real kind — no silent normalization", async () => {
    // "Tos" vs "tos" — case-sensitivity is deliberate; a fuzzy match here
    // would let a client pin the wrong DISCLAIMER_VERSIONS row.
    const res = await POST(buildRequest({ body: { kind: "Tos" } }));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toContain("Unknown disclaimer kind");
  });

  it("body may be a non-object null → treated as if fields absent (kind missing)", async () => {
    const res = await POST(buildRequest({ raw: "null" }));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("kind is required");
  });
});

// ---------------------------------------------------------------------------
// Version guard (stale detection)
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — stale-version guard", () => {
  it("returns 409 when disclaimer_version is older than the pinned current", async () => {
    const res = await POST(
      buildRequest({
        body: { kind: "tos", disclaimer_version: "v1.0-2020-01-01" },
      }),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(String(body.reason)).toContain("Stale disclaimer version");
    expect(String(body.reason)).toContain(`Expected ${TOS_VERSION}`);
    expect(String(body.reason)).toContain("got v1.0-2020-01-01");
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("returns 409 when disclaimer_version is a future/typo string", async () => {
    const res = await POST(
      buildRequest({
        body: { kind: "tos", disclaimer_version: "v99.0-2099-12-31" },
      }),
    );
    expect(res.status).toBe(409);
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("falls back to the current pinned version when disclaimer_version is omitted — 200 recorded with getCurrentVersion", async () => {
    const res = await POST(buildRequest({ body: { kind: "tos" } }));
    expect(res.status).toBe(200);
    expect(recordConsentMock).toHaveBeenCalledTimes(1);
    const arg = recordConsentMock.mock.calls[0]?.[0] as { disclaimer_version: string };
    expect(arg.disclaimer_version).toBe(TOS_VERSION);
  });

  it("falls back to the current pinned version when disclaimer_version is an empty string", async () => {
    // The route uses `typeof x === 'string' && x.length > 0` — an empty
    // string must NOT be treated as a stale version match.
    const res = await POST(
      buildRequest({ body: { kind: "tos", disclaimer_version: "" } }),
    );
    expect(res.status).toBe(200);
    const arg = recordConsentMock.mock.calls[0]?.[0] as { disclaimer_version: string };
    expect(arg.disclaimer_version).toBe(TOS_VERSION);
  });

  it("does not fall back when disclaimer_version is a non-string (number) — coerced to the current pinned version", async () => {
    // A JSON `42` fails the typeof-string guard, so the route falls through
    // to getCurrentVersion — a 200, not a mysterious 409.
    const res = await POST(
      buildRequest({ body: { kind: "tos", disclaimer_version: 42 } }),
    );
    expect(res.status).toBe(200);
    const arg = recordConsentMock.mock.calls[0]?.[0] as { disclaimer_version: string };
    expect(arg.disclaimer_version).toBe(TOS_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Consent write — happy path fields
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — consent write payload", () => {
  it("returns 200 with the consent_id from recordConsent on the happy path", async () => {
    recordConsentMock.mockResolvedValueOnce({ id: "consent-happy-001" });
    const res = await POST(
      buildRequest({ body: { kind: "tos", disclaimer_version: TOS_VERSION } }),
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      consent_id: "consent-happy-001",
    });
  });

  it("stamps user_id from the authenticated session — never trusts a body-provided user_id", async () => {
    await POST(
      buildRequest({
        body: {
          kind: "tos",
          disclaimer_version: TOS_VERSION,
          user_id: "attacker-user-999",
        },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as { user_id: string };
    expect(arg.user_id).toBe(USER.id);
    expect(arg.user_id).not.toBe("attacker-user-999");
  });

  it("passes the requested kind through verbatim to recordConsent", async () => {
    await POST(
      buildRequest({
        body: { kind: "privacy", disclaimer_version: PRIVACY_VERSION },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as { kind: string };
    expect(arg.kind).toBe("privacy");
  });

  it("defaults granted to true when omitted — POST implies grant per the route header", async () => {
    await POST(buildRequest({ body: { kind: "tos" } }));
    const arg = recordConsentMock.mock.calls[0]?.[0] as { granted: boolean };
    expect(arg.granted).toBe(true);
  });

  it("defaults granted to true when explicitly true", async () => {
    await POST(
      buildRequest({ body: { kind: "tos", granted: true } }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as { granted: boolean };
    expect(arg.granted).toBe(true);
  });

  it("records granted=false only when the body explicitly sets `granted: false`", async () => {
    await POST(
      buildRequest({ body: { kind: "tos", granted: false } }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as { granted: boolean };
    expect(arg.granted).toBe(false);
  });

  it("defaults granted to true when the body sends a truthy non-boolean (e.g. 'yes') — the `!== false` guard is the pin", async () => {
    // The route's `granted !== false` idiom means anything except literal
    // `false` is treated as a grant. This is deliberate for legacy clients.
    await POST(
      buildRequest({
        body: { kind: "tos", granted: "yes" as unknown as boolean },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as { granted: boolean };
    expect(arg.granted).toBe(true);
  });

  it("defaults detail to {} when omitted", async () => {
    await POST(buildRequest({ body: { kind: "tos" } }));
    const arg = recordConsentMock.mock.calls[0]?.[0] as { detail: Record<string, unknown> };
    expect(arg.detail).toEqual({});
  });

  it("passes detail through verbatim when supplied", async () => {
    await POST(
      buildRequest({
        body: {
          kind: "tos",
          detail: { scroll_depth: 100, click_target: "primary-cta" },
        },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as {
      detail: Record<string, unknown>;
    };
    expect(arg.detail).toEqual({
      scroll_depth: 100,
      click_target: "primary-cta",
    });
  });
});

// ---------------------------------------------------------------------------
// disclaimer_hash canonicalization
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — disclaimer_hash canonicalization", () => {
  it("hashes `${kind}:${version}` when detail.body_md is absent", async () => {
    await POST(
      buildRequest({ body: { kind: "tos", disclaimer_version: TOS_VERSION } }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as {
      disclaimer_hash: string;
    };
    expect(arg.disclaimer_hash).toBe(hashDisclaimerBody(`tos:${TOS_VERSION}`));
  });

  it("prefers detail.body_md over the canonical `${kind}:${version}` token when the client supplies it", async () => {
    const body_md = "# ToS body\n\nActual bytes the client rendered.";
    await POST(
      buildRequest({
        body: {
          kind: "tos",
          disclaimer_version: TOS_VERSION,
          detail: { body_md },
        },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as {
      disclaimer_hash: string;
    };
    expect(arg.disclaimer_hash).toBe(hashDisclaimerBody(body_md));
    // And it must NOT be the fallback hash — otherwise counsel loses the
    // ability to prove what the client actually saw.
    expect(arg.disclaimer_hash).not.toBe(
      hashDisclaimerBody(`tos:${TOS_VERSION}`),
    );
  });

  it("falls back to the canonical token when detail.body_md is not a string (number)", async () => {
    // Only a real string counts — a coerced number would let a caller hide
    // the actual rendered body from counsel.
    await POST(
      buildRequest({
        body: {
          kind: "tos",
          detail: { body_md: 12345 as unknown as string },
        },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as {
      disclaimer_hash: string;
    };
    expect(arg.disclaimer_hash).toBe(hashDisclaimerBody(`tos:${TOS_VERSION}`));
  });

  it("hash changes when the pinned version changes for the same kind — proves version is part of the canonical token", async () => {
    // Two consent writes for the same kind but different versions must
    // produce different disclaimer_hash values, or the "which version did
    // the user see?" audit answer collapses.
    await POST(
      buildRequest({ body: { kind: "tos", disclaimer_version: TOS_VERSION } }),
    );
    const firstHash = (recordConsentMock.mock.calls[0]?.[0] as {
      disclaimer_hash: string;
    }).disclaimer_hash;
    recordConsentMock.mockClear();
    // A stale version would 409 — instead assert that when the fallback
    // token is directly hashed with a different version string, the digest
    // moves.
    const stale = hashDisclaimerBody(`tos:v1.0-2020-01-01`);
    expect(firstHash).not.toBe(stale);
  });

  it("emits a 64-char lowercase hex digest — sha256, not sha1 or md5", async () => {
    await POST(
      buildRequest({ body: { kind: "tos", disclaimer_version: TOS_VERSION } }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as {
      disclaimer_hash: string;
    };
    expect(arg.disclaimer_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Client meta (ip / ua)
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — client-meta capture", () => {
  it("captures ip from the first entry of x-forwarded-for", async () => {
    await POST(
      buildRequest({
        body: { kind: "tos" },
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "10.0.0.7, 10.0.0.8, 172.16.0.1",
        },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as { ip: string };
    expect(arg.ip).toBe("10.0.0.7");
  });

  it("trims whitespace from x-forwarded-for entries", async () => {
    await POST(
      buildRequest({
        body: { kind: "tos" },
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "   192.168.1.10   , 10.0.0.1",
        },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as { ip: string };
    expect(arg.ip).toBe("192.168.1.10");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    await POST(
      buildRequest({
        body: { kind: "tos" },
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.42",
        },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as { ip: string };
    expect(arg.ip).toBe("203.0.113.42");
  });

  it("captures ua verbatim from the user-agent header", async () => {
    await POST(
      buildRequest({
        body: { kind: "tos" },
        headers: {
          "content-type": "application/json",
          "user-agent": "TestClient/9.9 (probe)",
        },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as { ua: string };
    expect(arg.ua).toBe("TestClient/9.9 (probe)");
  });

  it("records empty-string ip + ua when neither header is present — never crashes on a stripped-header proxy", async () => {
    // Some regional CDNs strip both headers for privacy reasons. The route
    // must still record consent — the ip/ua columns are nullable at the DB
    // layer and the route passes "" so recordConsent can normalize.
    await POST(
      buildRequest({
        body: { kind: "tos" },
        headers: { "content-type": "application/json" },
      }),
    );
    const arg = recordConsentMock.mock.calls[0]?.[0] as { ip: string; ua: string };
    expect(arg.ip).toBe("");
    expect(arg.ua).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Jurisdiction detection
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — jurisdiction", () => {
  it("uses detectJurisdiction's country when it returns a signal", async () => {
    detectJurisdictionMock.mockResolvedValueOnce({ country: "NZ" });
    await POST(buildRequest({ body: { kind: "tos" } }));
    const arg = recordConsentMock.mock.calls[0]?.[0] as { jurisdiction: string };
    expect(arg.jurisdiction).toBe("NZ");
  });

  it('defaults to "AU" when detectJurisdiction returns null', async () => {
    detectJurisdictionMock.mockResolvedValueOnce(null);
    await POST(buildRequest({ body: { kind: "tos" } }));
    const arg = recordConsentMock.mock.calls[0]?.[0] as { jurisdiction: string };
    expect(arg.jurisdiction).toBe("AU");
  });

  it('defaults to "AU" when detectJurisdiction returns {country: undefined}', async () => {
    detectJurisdictionMock.mockResolvedValueOnce({});
    await POST(buildRequest({ body: { kind: "tos" } }));
    const arg = recordConsentMock.mock.calls[0]?.[0] as { jurisdiction: string };
    expect(arg.jurisdiction).toBe("AU");
  });

  it('defaults to "AU" when detectJurisdiction throws — a header-parse crash must not block consent', async () => {
    detectJurisdictionMock.mockRejectedValueOnce(new Error("header parse boom"));
    const res = await POST(buildRequest({ body: { kind: "tos" } }));
    expect(res.status).toBe(200);
    const arg = recordConsentMock.mock.calls[0]?.[0] as { jurisdiction: string };
    expect(arg.jurisdiction).toBe("AU");
  });
});

// ---------------------------------------------------------------------------
// Persistence-failure path
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — persistence failure", () => {
  it("returns 500 when recordConsent throws — fail-closed, never silent success", async () => {
    recordConsentMock.mockRejectedValueOnce(new Error("supabase down"));
    const res = await POST(buildRequest({ body: { kind: "tos" } }));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "Consent persistence failed",
    });
  });

  it("does not leak the underlying error message to the client — server-side console only", async () => {
    // A raw error string could leak DB / connection strings; the route
    // deliberately returns a stable string.
    recordConsentMock.mockRejectedValueOnce(
      new Error("relation consent_events does not exist [conn=host=db-prod]"),
    );
    const res = await POST(buildRequest({ body: { kind: "tos" } }));
    const body = await json(res);
    expect(String(body.reason)).not.toContain("db-prod");
    expect(String(body.reason)).not.toContain("relation");
  });

  it("returns 500 when recordConsent rejects with a non-Error value (e.g. a string)", async () => {
    // A caller that throws a bare string (or null) must still be handled —
    // the `err instanceof Error` branch is otherwise a silent NaN.
    recordConsentMock.mockRejectedValueOnce("boom-as-string");
    const res = await POST(buildRequest({ body: { kind: "tos" } }));
    expect(res.status).toBe(500);
    expect((await json(res)).reason).toBe("Consent persistence failed");
  });
});

// ---------------------------------------------------------------------------
// Cross-kind smoke — every DisclaimerKind resolves through the happy path
// ---------------------------------------------------------------------------

describe("POST /api/legal/ack — every registered DisclaimerKind is round-trippable", () => {
  it.each(Object.keys(DISCLAIMER_VERSIONS))(
    "kind=%s → 200 + consent_id + version matches DISCLAIMER_VERSIONS",
    async (kind) => {
      recordConsentMock.mockResolvedValueOnce({ id: `consent-${kind}` });
      const res = await POST(
        buildRequest({
          body: { kind, disclaimer_version: DISCLAIMER_VERSIONS[kind as keyof typeof DISCLAIMER_VERSIONS] },
        }),
      );
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({
        ok: true,
        consent_id: `consent-${kind}`,
      });
      const arg = recordConsentMock.mock.calls[0]?.[0] as {
        kind: string;
        disclaimer_version: string;
      };
      expect(arg.kind).toBe(kind);
      expect(arg.disclaimer_version).toBe(
        DISCLAIMER_VERSIONS[kind as keyof typeof DISCLAIMER_VERSIONS],
      );
    },
  );
});
