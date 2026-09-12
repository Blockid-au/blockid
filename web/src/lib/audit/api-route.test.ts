import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import {
  apiRoute,
  auditNote,
  buildAuditRecord,
  isAuditedHandler,
  setAuditSink,
  type AuditRecord,
} from "./api-route";
import { getAuditContext, newAuditContext, setAuditActor, setAuditProject } from "./context";

// S20-A — the apiRoute wrapper: one audit row per invocation, for 2xx, 4xx
// AND 5xx (and thrown errors, rethrown untouched); the sink can never throw
// into the handler; body never read; ids only.

const ROUTE = "api/projects/[id]/members/route.ts";
const UID = "11111111-2222-4333-8444-555555555555";
const PID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function req(url = "https://blockid.au/api/projects/x/members?token=SECRET", init?: RequestInit) {
  return new Request(url, {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "user-agent": "Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
      ...(init?.headers as Record<string, string> | undefined),
    },
    ...init,
  });
}

let records: AuditRecord[];

beforeEach(() => {
  records = [];
  setAuditSink(async (r) => {
    records.push(r);
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  setAuditSink(null);
  vi.restoreAllMocks();
});

describe("apiRoute — records every outcome", () => {
  it("2xx: one row with method/route/family/status, actor from context, params ids only", async () => {
    const POST = apiRoute({ route: ROUTE, method: "POST" }, async (_r: Request, ctx: { params: Promise<{ id: string }> }) => {
      setAuditActor({ userId: UID, kind: "user", role: "user" });
      setAuditProject({ projectId: PID, role: "owner" });
      auditNote(null, { invited_count: 2, email: "leak@example.com" });
      await ctx.params;
      return NextResponse.json({ ok: true }, { status: 201 });
    });
    const res = await POST(req(), { params: Promise.resolve({ id: PID }) });
    expect(res.status).toBe(201);
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.user_id).toBe(UID);
    expect(r.actor).toBe("user");
    expect(r.action).toBe("project.member.invited"); // manifest override wins
    expect(r.resource_type).toBe("project_member");
    expect(r.resource_id).toBe(PID);
    expect(r.detail.method).toBe("POST");
    expect(r.detail.route).toBe("/api/projects/:id/members");
    expect(r.detail.family).toBe("projects.members");
    expect(r.detail.status).toBe(201);
    expect(r.detail.project_id).toBe(PID);
    expect(r.detail.actor_role).toBe("owner");
    expect(r.detail.params).toEqual({ id: PID });
    expect(r.detail.ua_family).toBe("chrome");
    expect(r.detail.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    // note is redacted: email key dropped, numbers kept
    expect(r.detail.note).toEqual({ invited_count: 2 });
    // nothing from the query string / body is ever stored
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(JSON.stringify(r)).not.toContain("203.0.113.9");
    expect(JSON.stringify(r)).not.toContain("leak@example.com");
  });

  it("4xx: recorded with status and anonymous actor when nobody authenticated", async () => {
    const DELETE = apiRoute({ route: "api/keys/[id]/route.ts", method: "DELETE" }, async () =>
      NextResponse.json({ ok: false }, { status: 401 }),
    );
    await DELETE(req("https://blockid.au/api/keys/abc", { method: "DELETE" }));
    expect(records[0].detail.status).toBe(401);
    expect(records[0].user_id).toBeNull();
    expect(records[0].actor).toBe("anonymous");
    expect(records[0].action).toBe("api_key.revoked");
  });

  it("5xx: recorded with status 500", async () => {
    const PUT = apiRoute({ route: "api/svi/answers/route.ts", method: "PUT" }, async () =>
      NextResponse.json({ ok: false }, { status: 500 }),
    );
    await PUT(req());
    expect(records[0].detail.status).toBe(500);
    expect(records[0].action).toBe("svi.answers.update");
    expect(records[0].resource_type).toBe("answer");
  });

  it("thrown error: recorded as 500 + threw, error rethrown untouched", async () => {
    const boom = new Error("boom");
    const PATCH = apiRoute({ route: "api/evidence/[id]/route.ts", method: "PATCH" }, async () => {
      throw boom;
    });
    await expect(PATCH(req())).rejects.toBe(boom);
    expect(records).toHaveLength(1);
    expect(records[0].detail.status).toBe(500);
    expect(records[0].detail.threw).toBe(true);
    expect(records[0].action).toBe("evidence.update");
  });

  it("handler returning nothing is recorded as 500 (Next will 500) and passed through", async () => {
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => undefined);
    const out = await POST(req());
    expect(out).toBeUndefined();
    expect(records[0].detail.status).toBe(500);
  });

  it("explicit action/entity/redact overrides", async () => {
    const POST = apiRoute(
      {
        route: "api/svi/score/route.ts",
        method: "POST",
        action: "svi.rescore",
        entity: "svi_account",
        redact: (d) => ({ ...d, ua_family: "none" }),
      },
      async () => new Response("ok", { status: 200 }),
    );
    await POST(req());
    expect(records[0].action).toBe("svi.rescore");
    expect(records[0].resource_type).toBe("svi_account");
    expect(records[0].detail.ua_family).toBe("none");
  });
});

describe("apiRoute — never throws into the handler", () => {
  it("sink rejection is swallowed and the response still returns", async () => {
    setAuditSink(async () => {
      throw new Error("db down");
    });
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => NextResponse.json({ ok: true }));
    const res = await POST(req());
    expect(res.status).toBe(200);
  });

  it("sink that hangs is bounded by the write timeout", async () => {
    vi.useFakeTimers();
    setAuditSink(() => new Promise<void>(() => undefined));
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => NextResponse.json({ ok: true }));
    const p = POST(req());
    await vi.advanceTimersByTimeAsync(1600);
    const res = await p;
    expect(res.status).toBe(200);
    vi.useRealTimers();
  });

  it("broken redact() keeps the row", async () => {
    const POST = apiRoute(
      {
        route: "api/x/route.ts",
        method: "POST",
        redact: () => {
          throw new Error("nope");
        },
      },
      async () => NextResponse.json({ ok: true }),
    );
    await POST(req());
    expect(records).toHaveLength(1);
  });

  it("rejects a GET meta at wrap time (never at request time)", () => {
    expect(() =>
      apiRoute({ route: "api/x/route.ts", method: "GET" as unknown as "POST" }, async () => new Response()),
    ).toThrow(/not a mutation method/);
  });
});

describe("apiRoute — context isolation + shape preservation", () => {
  it("each invocation gets its own context (no actor bleed between requests)", async () => {
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async (r: Request) => {
      if (r.headers.get("x-who") === "a") setAuditActor({ userId: UID });
      return NextResponse.json({ ok: true });
    });
    await Promise.all([POST(req(undefined, { headers: { "x-who": "a" } })), POST(req(undefined, { headers: { "x-who": "b" } }))]);
    const actors = records.map((r) => r.user_id).sort();
    expect(actors).toEqual([null, UID].sort());
    expect(getAuditContext()).toBeUndefined();
  });

  it("preserves the handler arity and marks the export as audited", async () => {
    const zero = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => new Response());
    const two = apiRoute({ route: "api/x/route.ts", method: "POST" }, async (_r: Request, _c: { params: Promise<{ id: string }> }) => new Response());
    expect(zero.length).toBe(0);
    expect(two.length).toBe(2);
    expect(isAuditedHandler(zero)).toBe(true);
    expect(isAuditedHandler(() => undefined)).toBe(false);
  });

  it("actor set by a later null lookup never erases an earlier user", () => {
    const ctx = newAuditContext();
    ctx.actorUserId = UID;
    ctx.actorKind = "api_key";
    const rec = buildAuditRecord({
      meta: { route: "api/x/route.ts", method: "POST" },
      ctx,
      headers: new Headers(),
      status: 200,
      params: null,
      durationMs: 3.6,
    });
    expect(rec.user_id).toBe(UID);
    expect(rec.actor).toBe("api_key");
    expect(rec.detail.ip_hash).toBeNull();
    expect(rec.detail.ua_family).toBe("none");
    expect(rec.detail.duration_ms).toBe(4);
  });
});
