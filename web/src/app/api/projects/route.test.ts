// Colocated tests for POST /api/projects — release QA-2 F6.
//
// The apiRoute audit row for `project.create` must carry the NEW project's
// id in detail.project_id. Nothing upstream can set it (the project does
// not exist when the request starts), so the handler annotates the audit
// context itself after createProject() returns. Without that the row landed
// with project_id NULL and the project-scoped /workspace/audit-log hid it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  createProjectMock: vi.fn(),
  listProjectsMock: vi.fn(),
  getProjectLimitMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => hoisted.getCurrentUserMock(),
}));

vi.mock("@/lib/projects", () => ({
  createProject: (...a: unknown[]) => hoisted.createProjectMock(...a),
  listProjects: (...a: unknown[]) => hoisted.listProjectsMock(...a),
  getProjectLimit: (...a: unknown[]) => hoisted.getProjectLimitMock(...a),
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.1",
  extractUserAgent: () => "vitest",
}));

import { POST } from "./route";
import { flushAudits, setAuditSink, type AuditRecord } from "@/lib/audit/api-route";

const PID = "6452f5df-bb5b-4693-a0d9-61e556bb6572";

function req(body: unknown) {
  return new Request("http://x/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let records: AuditRecord[];

beforeEach(() => {
  hoisted.getCurrentUserMock.mockReset();
  hoisted.createProjectMock.mockReset();
  logUserActionMock.mockReset().mockResolvedValue({ ok: true });
  records = [];
  setAuditSink(async (r) => {
    records.push(r);
  });
});

afterEach(() => setAuditSink(null));

describe("POST /api/projects — audit project context (release QA-2 F6)", () => {
  it("201: the apiRoute row is project.create with detail.project_id = the new project's id", async () => {
    hoisted.getCurrentUserMock.mockResolvedValue({ id: "u1", email: "f@x.test", plan: "free" });
    hoisted.createProjectMock.mockResolvedValue({
      ok: true,
      project: { id: PID, name: "Acme", role: "owner" },
    });

    const res = await POST(req({ name: "Acme" }));
    expect(res.status).toBe(201);
    await flushAudits();

    expect(records).toHaveLength(1);
    const row = records[0];
    expect(row.action).toBe("project.create");
    expect(row.resource_type).toBe("project");
    expect(row.resource_id).toBe(PID);
    expect(row.detail.project_id).toBe(PID);
    expect(row.detail.actor_role).toBe("owner");
    expect(row.user_id).toBe("u1");
    expect(row.detail.status).toBe(201);

    // The legacy app_user_audit_log write still carries the id as subject.
    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    expect(logUserActionMock.mock.calls[0][0]).toMatchObject({
      action: "project.create",
      subjectType: "project",
      subjectId: PID,
    });
  });

  it("422 (create failed): no project id is stamped on the audit row", async () => {
    hoisted.getCurrentUserMock.mockResolvedValue({ id: "u1", email: "f@x.test", plan: "free" });
    hoisted.createProjectMock.mockResolvedValue({ ok: false, error: "Failed to create project" });

    const res = await POST(req({ name: "Acme" }));
    expect(res.status).toBe(422);
    await flushAudits();

    expect(records).toHaveLength(1);
    expect(records[0].detail.project_id).toBeNull();
    expect(records[0].detail.status).toBe(422);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("401: no project context, no legacy log", async () => {
    hoisted.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req({ name: "Acme" }));
    expect(res.status).toBe(401);
    await flushAudits();
    expect(records[0]?.detail.project_id ?? null).toBeNull();
    expect(hoisted.createProjectMock).not.toHaveBeenCalled();
  });
});
