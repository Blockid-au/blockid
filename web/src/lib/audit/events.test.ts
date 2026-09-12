import { beforeEach, describe, expect, it, vi } from "vitest";

// S20-A — viewer scoping, filter → query, CSV formula guard, reader wiring.

const fromMock = vi.fn();
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

import {
  auditActionFamilies,
  auditEventsToCsv,
  buildAuditQuery,
  csvCellGuarded,
  listAuditEvents,
  resolveAuditViewerScope,
  type AuditEventRow,
} from "./events";

const ME = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const PID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_PID = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PAGE = { limit: 50, offset: 0 };

describe("resolveAuditViewerScope", () => {
  it("owner → project mode, can export", () => {
    const v = resolveAuditViewerScope({ id: ME }, { projectId: PID, role: "owner", isOwner: true });
    expect(v).toEqual({ mode: "project", projectId: PID, role: "owner", forcedActorUserId: null, canExport: true });
  });
  it("admin → project mode, cannot export", () => {
    const v = resolveAuditViewerScope({ id: ME }, { projectId: PID, role: "admin", isOwner: false });
    expect(v.mode).toBe("project");
    expect(v.canExport).toBe(false);
  });
  it.each(["editor", "viewer"])("%s → own actions only", (role) => {
    const v = resolveAuditViewerScope({ id: ME }, { projectId: PID, role, isOwner: false });
    expect(v.mode).toBe("own");
    expect(v.forcedActorUserId).toBe(ME);
    expect(v.canExport).toBe(false);
  });
  it("no project → own actions only", () => {
    const v = resolveAuditViewerScope({ id: ME }, null);
    expect(v).toEqual({ mode: "own", projectId: null, role: null, forcedActorUserId: ME, canExport: false });
  });
});

describe("buildAuditQuery — scope always wins over URL filters", () => {
  const owner = resolveAuditViewerScope({ id: ME }, { projectId: PID, role: "owner", isOwner: true });
  const viewer = resolveAuditViewerScope({ id: ME }, { projectId: PID, role: "viewer", isOwner: false });

  it("owner: project pinned to the scope even when the URL names another project", () => {
    const q = buildAuditQuery(owner, { project: OTHER_PID, actor: OTHER, action: "svi" }, PAGE);
    expect(q.projectId).toBe(PID);
    expect(q.actorUserId).toBe(OTHER);
    expect(q.actionPrefix).toBe("svi");
  });

  it("viewer: actor forced to self; another project id is ignored", () => {
    const q = buildAuditQuery(viewer, { project: OTHER_PID, actor: OTHER, action: "projects" }, PAGE);
    expect(q.actorUserId).toBe(ME);
    expect(q.projectId).toBeNull();
    expect(q.actionPrefix).toBe("projects");
  });

  it("viewer may narrow to the current project", () => {
    expect(buildAuditQuery(viewer, { project: PID }, PAGE).projectId).toBe(PID);
  });

  it("garbage filters are dropped, paging clamped", () => {
    const q = buildAuditQuery(owner, { actor: "not-a-uuid", action: "DROP TABLE;" }, { limit: 9999, offset: -5 });
    expect(q.actorUserId).toBeNull();
    expect(q.actionPrefix).toBeNull();
    expect(q.limit).toBe(5000);
    expect(q.offset).toBe(0);
  });
});

describe("listAuditEvents", () => {
  let chain: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    chain = {};
    const self = new Proxy({} as Record<string, unknown>, {
      get(_t, key: string) {
        if (key === "then") return (res: (v: unknown) => void) => res({ data: [{ id: 1 }], error: null });
        chain[key] ??= vi.fn(() => self);
        return chain[key];
      },
    });
    fromMock.mockReturnValue(self);
  });

  it("applies project (jsonb path), actor and action-prefix filters + paging", async () => {
    const rows = await listAuditEvents({ projectId: PID, actorUserId: ME, actionPrefix: "svi", limit: 50, offset: 100 });
    expect(rows).toEqual([{ id: 1 }]);
    expect(fromMock).toHaveBeenCalledWith("audit_events");
    expect(chain.eq).toHaveBeenCalledWith("detail->>project_id", PID);
    expect(chain.eq).toHaveBeenCalledWith("user_id", ME);
    expect(chain.like).toHaveBeenCalledWith("action", "svi%");
    expect(chain.range).toHaveBeenCalledWith(100, 149);
    expect(chain.order).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("skips filters that are null", async () => {
    await listAuditEvents({ projectId: null, actorUserId: ME, actionPrefix: null, limit: 10, offset: 0 });
    expect(chain.eq).toHaveBeenCalledTimes(1);
    expect(chain.like).toBeUndefined();
  });

  // S20-A review P2-4: the 0338 indexes are ((detail->>'project_id'), id DESC)
  // and (user_id, id DESC). The query must order by id — and ONLY id — or
  // the planner cannot walk them in output order.
  it("orders by id DESC only (matches the 0338 indexes; never ts)", async () => {
    await listAuditEvents({ projectId: PID, actorUserId: null, actionPrefix: null, limit: 50, offset: 0 });
    expect(chain.order).toHaveBeenCalledTimes(1);
    expect(chain.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(chain.order.mock.calls.some(([col]) => col === "ts")).toBe(false);
    // project filter uses the exact expression the index is built on
    expect(chain.eq).toHaveBeenCalledWith("detail->>project_id", PID);
  });
});

describe("CSV", () => {
  it("formula-guards = + - @ and tab/CR prefixes, RFC-4180 quotes", () => {
    expect(csvCellGuarded("=1+1")).toBe("'=1+1");
    expect(csvCellGuarded("+cmd")).toBe("'+cmd");
    expect(csvCellGuarded("-1")).toBe("'-1");
    expect(csvCellGuarded("@x")).toBe("'@x");
    expect(csvCellGuarded("\tx")).toBe("'\tx");
    expect(csvCellGuarded('a,"b"')).toBe('"a,""b"""');
    expect(csvCellGuarded(null)).toBe("");
    expect(csvCellGuarded(42)).toBe("42");
  });

  it("renders the columns from row + detail", () => {
    const rows: AuditEventRow[] = [
      {
        id: 7,
        ts: "2026-09-12T01:02:03.000Z",
        user_id: ME,
        actor: "user",
        action: "=projects.create",
        resource_type: "project",
        resource_id: "p1",
        detail: { method: "POST", route: "/api/projects", status: 201, actor_role: "owner", project_id: PID, ua_family: "chrome" },
      },
    ];
    const csv = auditEventsToCsv(rows);
    const [header, line] = csv.split("\r\n");
    expect(header).toBe("id,ts,actor_user_id,actor_kind,actor_role,project_id,action,entity,entity_id,method,route,status,ua_family");
    expect(line).toBe(`7,2026-09-12T01:02:03.000Z,${ME},user,owner,${PID},'=projects.create,project,p1,POST,/api/projects,201,chrome`);
  });
});

describe("auditActionFamilies", () => {
  it("lists sorted, unique top-level families from the catalogue", () => {
    const fams = auditActionFamilies();
    expect(fams.length).toBeGreaterThan(20);
    expect(fams).toEqual([...new Set(fams)].sort());
    expect(fams).toContain("projects");
    expect(fams).toContain("svi");
    expect(fams).not.toContain("cron");
  });
});
