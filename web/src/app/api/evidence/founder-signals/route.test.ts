// Colocated vitest for /api/evidence/founder-signals (S-R5): member access
// (editor+ to write, viewer+ to read), the three input modes (PDF upload,
// pasted text, URL), validation (bad URL, nothing to parse, non-PDF, too
// large), the not-migrated 503, and the audit row.

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", role: "user" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", async () => {
  const ctx = await import("@/lib/audit/context");
  return {
    getCurrentUser: async () => {
      if (auth.user) ctx.setAuditActor({ userId: String(auth.user.id), kind: "user", role: "user" });
      return auth.user;
    },
  };
});

const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], insertError: null as { message: string } | null, client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.client }));

import { GET, POST, domainKeywordsFor } from "./route";
import { flushAudits, setAuditSink, type AuditRecord } from "@/lib/audit/api-route";

const FIX = path.join(process.cwd(), "test-fixtures", "linkedin");
const PDF = readFileSync(path.join(FIX, "jane-doe.pdf"));
const TEXT = readFileSync(path.join(FIX, "sam-lee.txt"), "utf8");

function makeClient() {
  return {
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          maybeSingle: async () => {
            if (db.insertError) return { data: null, error: db.insertError };
            db.rows.unshift({ id: `fs-${db.rows.length + 1}`, ...row });
            return { data: { id: db.rows[0].id }, error: null };
          },
        }),
      }),
      select: () => ({ eq: (_c: string, v: string) => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: db.rows.find((r) => r.project_id === v) ?? null, error: null }) }) }) }) }),
    }),
  };
}

function jsonPost(body: unknown) {
  return new Request("http://x/api/evidence/founder-signals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
function formPost(parts: { file?: { bytes: Buffer; name: string; type: string }; text?: string; profileUrl?: string }) {
  const fd = new FormData();
  if (parts.file) fd.set("file", new File([new Uint8Array(parts.file.bytes)], parts.file.name, { type: parts.file.type }));
  if (parts.text !== undefined) fd.set("text", parts.text);
  if (parts.profileUrl !== undefined) fd.set("profileUrl", parts.profileUrl);
  return new Request("http://x/api/evidence/founder-signals", { method: "POST", body: fd });
}

function reset() {
  Object.assign(scopeState, { projectId: "proj-1", role: "owner", nonMember: false, calls: [] });
  auth.user = { id: "user-caller", email: "caller@x.test", role: "user" };
  db.rows = [];
  db.insertError = null;
  db.client = makeClient();
}

let records: AuditRecord[];
beforeEach(() => {
  reset();
  records = [];
  setAuditSink(async (r) => {
    records.push(r);
  });
});
afterEach(() => setAuditSink(null));

describeMemberAccess("POST /api/evidence/founder-signals", {
  state: scopeState,
  kind: "write",
  reset,
  okStatus: 201,
  run: () => POST(jsonPost({ profileUrl: "https://www.linkedin.com/in/jane-doe-au" })),
});

describe("POST — input modes", () => {
  it("PDF upload (multipart) parses through pdf-parse v2, saves the row under the project, audits", async () => {
    const res = await POST(formPost({ file: { bytes: PDF, name: "Profile.pdf", type: "application/pdf" }, profileUrl: "linkedin.com/in/jane-doe-au" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; signals: Record<string, unknown>; extracted: { engine: string } };
    expect(body.ok).toBe(true);
    expect(body.extracted.engine).toBe("pdf-parse-v2");
    expect(body.signals).toMatchObject({ source: "linkedin_pdf", founderName: "Jane Doe", exits: 1, teamSizeOnPage: 14, profileUrl: "https://www.linkedin.com/in/jane-doe-au" });
    expect(db.rows[0]).toMatchObject({ project_id: "proj-1", source: "linkedin_pdf", founder_name: "Jane Doe" });
    expect(Object.keys(db.rows[0])).not.toContain("raw_text");
    await flushAudits();
    const rec = records.find((r) => r.action === "evidence.founder_signals_parsed");
    expect(rec?.detail.note).toMatchObject({ source: "linkedin_pdf", exits: 1 });
  }, 30_000);

  it("pasted text (JSON) — domain keywords come from the project industry", async () => {
    scopeState.projectExtra = { industry: "Clean Energy / Climate" };
    const res = await POST(jsonPost({ text: TEXT }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { signals: { founderName: string; exits: number; yearsInDomain: number; yearsExperience: number } };
    expect(body.signals.founderName).toBe("Sam Lee");
    expect(body.signals.exits).toBe(2);
    // "energy" matches GridEdge Energy + the current venture; Voltify / Spark carry no keyword → domain < total
    expect(body.signals.yearsInDomain).toBeLessThan(body.signals.yearsExperience);
    expect(domainKeywordsFor("Clean Energy / Climate")).toEqual(["clean", "energy", "climate"]);
    expect(domainKeywordsFor("Tech")).toEqual([]);
  });

  it("URL only — validated, stored, nothing fetched", async () => {
    const res = await POST(jsonPost({ profileUrl: "https://au.linkedin.com/in/minh-tran-vn?trk=x" }));
    expect(res.status).toBe(201);
    expect(db.rows[0]).toMatchObject({ source: "linkedin_url", profile_url: "https://www.linkedin.com/in/minh-tran-vn", roles: [] });
  });

  it("400 on a non-LinkedIn URL, nothing to parse, invalid JSON; 415 non-PDF; 413 too large", async () => {
    expect((await POST(jsonPost({ profileUrl: "https://twitter.com/jane" }))).status).toBe(400);
    expect((await POST(jsonPost({}))).status).toBe(400);
    expect((await POST(new Request("http://x/api/evidence/founder-signals", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).status).toBe(400);
    expect((await POST(formPost({ file: { bytes: Buffer.from("hello"), name: "notes.txt", type: "text/plain" } }))).status).toBe(415);
    expect((await POST(formPost({ file: { bytes: Buffer.alloc(5 * 1024 * 1024 + 1), name: "big.pdf", type: "application/pdf" } }))).status).toBe(413);
    expect(db.rows).toHaveLength(0);
  });

  it("503 not_migrated when founder_signals is missing; 400 without a project", async () => {
    db.insertError = { message: 'relation "public.founder_signals" does not exist' };
    const res = await POST(jsonPost({ profileUrl: "https://www.linkedin.com/in/jane-doe-au" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("not_migrated");
    scopeState.projectId = null;
    expect((await POST(jsonPost({ profileUrl: "https://www.linkedin.com/in/jane-doe-au" }))).status).toBe(400);
  });
});

describe("GET", () => {
  it("returns the latest signals for the project (viewer ok), null when none, 401 anonymous", async () => {
    await POST(jsonPost({ text: TEXT }));
    scopeState.role = "viewer";
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).signals).toMatchObject({ founderName: "Sam Lee", exits: 2 });
    db.rows = [];
    expect((await (await GET()).json()).signals).toBeNull();
    auth.user = null;
    expect((await GET()).status).toBe(401);
  });
});
