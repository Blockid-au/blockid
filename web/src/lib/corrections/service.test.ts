// Corrections service on a purpose-built chainable fake: the row written on
// file, the open-cap, the admin e-mail, and the accept path that NEVER
// overwrites data — only a wrong_sector_stage correction with a proposal
// reaches `updateProject`, and the resolution says exactly what happened.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileCorrection, listCorrections, listProjectCorrections, resolveCorrection } from "./service";
import type { CorrectionRow } from "./model";

vi.mock("server-only", () => ({}));

const PID = "11111111-2222-4333-8444-555555555555";
const CID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

interface Call { table: string; op: string; args: unknown[] }

/** Chainable stub: every table has `rows`; `single`/`maybeSingle` return the first row merged with the last write. */
function makeDb(seed: Record<string, Record<string, unknown>[]>) {
  const calls: Call[] = [];
  const rows = { ...seed };
  function chain(table: string, write: Record<string, unknown> | null) {
    const t: Record<string, unknown> = {};
    const p: unknown = new Proxy(t, {
      get(_o, prop: string) {
        if (prop === "then") {
          const data = rows[table] ?? [];
          const pr = Promise.resolve({ data, error: null, count: data.length });
          return pr.then.bind(pr);
        }
        if (prop === "single" || prop === "maybeSingle") {
          return () => {
            calls.push({ table, op: prop, args: [] });
            const base = (rows[table] ?? [])[0] ?? null;
            if (write) {
              const merged = { ...(base ?? {}), ...write };
              if (base) rows[table] = [merged, ...(rows[table] ?? []).slice(1)];
              return Promise.resolve({ data: merged, error: null });
            }
            return Promise.resolve({ data: base, error: null });
          };
        }
        return (...args: unknown[]) => {
          calls.push({ table, op: prop, args });
          if (prop === "insert" || prop === "update") return chain(table, { ...(write ?? {}), ...(args[0] as Record<string, unknown>) });
          return chain(table, write);
        };
      },
    });
    return p;
  }
  return { from: (table: string) => chain(table, null), calls, rows };
}

const OPEN: CorrectionRow = {
  id: CID,
  project_id: PID,
  kind: "wrong_sector_stage",
  target_ref: "profile:sector",
  message: "We are fintech, not saas.",
  proposed: { industry: "fintech" },
  status: "open",
  submitted_by: "u-founder",
  resolved_by: null,
  resolution: null,
  resolved_at: null,
  created_at: "2026-09-20T00:00:00.000Z",
  updated_at: "2026-09-20T00:00:00.000Z",
};

const sendEmail = vi.fn(async () => ({ ok: true }));
const updateProject = vi.fn(async () => ({ ok: true }));
const deps = { sendEmail, updateProject, adminEmail: "admin@blockid.au", siteUrl: "https://blockid.au", now: () => new Date("2026-09-20T10:00:00.000Z") };

beforeEach(() => {
  sendEmail.mockClear();
  updateProject.mockClear();
});

describe("fileCorrection", () => {
  it("inserts an open row for the project, e-mails the admin with the kind + target + queue link", async () => {
    const db = makeDb({ corrections: [] });
    const r = await fileCorrection(db as never, { projectId: PID, kind: "stale_data", targetRef: "dimension:tre", message: "MRR is A$12k now.", proposed: {}, submittedBy: "u-founder", submitterEmail: "f@x.io", projectName: "Acme" }, deps);
    expect(r.ok).toBe(true);
    const insert = db.calls.find((c) => c.table === "corrections" && c.op === "insert");
    expect(insert?.args[0]).toEqual({ project_id: PID, kind: "stale_data", target_ref: "dimension:tre", message: "MRR is A$12k now.", proposed: {}, status: "open", submitted_by: "u-founder" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0]![0] as unknown as { to: string; subject: string; text: string; html: string };
    expect(mail.to).toBe("admin@blockid.au");
    expect(mail.subject).toContain("Stale data");
    expect(mail.subject).toContain("Acme");
    expect(mail.text).toContain("Traction & Revenue Evidence");
    expect(mail.text).toContain("https://blockid.au/admin/corrections");
    expect(mail.html).not.toContain("<script");
  });

  it("caps open corrections per project (429) and counts only status = open", async () => {
    const db = makeDb({ corrections: Array.from({ length: 10 }, (_, i) => ({ ...OPEN, id: `c${i}` })) });
    const r = await fileCorrection(db as never, { projectId: PID, kind: "stale_data", targetRef: null, message: "x", proposed: {}, submittedBy: "u", submitterEmail: null, projectName: null }, deps);
    expect(r).toMatchObject({ ok: false, error: "too_many_open", status: 429 });
    expect(db.calls.some((c) => c.table === "corrections" && c.op === "eq" && c.args[0] === "status" && c.args[1] === "open")).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a failed admin e-mail is a warning, not a failure", async () => {
    const db = makeDb({ corrections: [] });
    const r = await fileCorrection(db as never, { projectId: PID, kind: "incorrect_data", targetRef: null, message: "x", proposed: {}, submittedBy: "u", submitterEmail: null, projectName: null }, { ...deps, sendEmail: async () => { throw new Error("smtp down"); } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings[0]).toContain("smtp down");
  });
});

describe("listProjectCorrections / listCorrections", () => {
  it("founder list is keyed on project_id; admin list joins project name + founder e-mail and filters by status", async () => {
    const db = makeDb({ corrections: [OPEN], projects: [{ id: PID, name: "Acme" }], app_users: [{ id: "u-founder", email: "f@x.io" }] });
    const mine = await listProjectCorrections(db as never, PID);
    expect(mine).toHaveLength(1);
    expect(db.calls.some((c) => c.table === "corrections" && c.op === "eq" && c.args[0] === "project_id" && c.args[1] === PID)).toBe(true);
    const queue = await listCorrections(db as never, { status: "open" });
    expect(queue[0]).toMatchObject({ id: CID, project_name: "Acme", founder_email: "f@x.io" });
    expect(db.calls.some((c) => c.table === "corrections" && c.op === "eq" && c.args[0] === "status" && c.args[1] === "open")).toBe(true);
  });
});

describe("resolveCorrection — never overwrites", () => {
  it("accept on a wrong_sector_stage correction writes ONLY through updateProject, records it in the resolution, e-mails the founder", async () => {
    const db = makeDb({ corrections: [OPEN], app_users: [{ id: "u-founder", email: "f@x.io" }] });
    const r = await resolveCorrection(db as never, { id: CID, decision: "accept", note: "Confirmed with ABR.", adminId: "u-admin" }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(updateProject).toHaveBeenCalledWith(PID, { industry: "fintech" });
    expect(r.applied).toBe(true);
    expect(r.change).toEqual({ field: "industry", value: "fintech" });
    const update = db.calls.find((c) => c.table === "corrections" && c.op === "update");
    expect(update?.args[0]).toMatchObject({ status: "accepted", resolved_by: "u-admin", resolved_at: "2026-09-20T10:00:00.000Z" });
    expect((update?.args[0] as { resolution: string }).resolution).toBe("Confirmed with ABR. Accepted — industry → fintech written through the project update path (versioned, audit-logged).");
    // No direct write to `projects` from the service — only updateProject.
    expect(db.calls.some((c) => c.table === "projects" && (c.op === "update" || c.op === "upsert"))).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0]![0] as unknown as { to: string; subject: string; text: string };
    expect(mail.to).toBe("f@x.io");
    expect(mail.subject).toContain("accepted");
    expect(mail.text).toContain("Nothing was overwritten silently");
  });

  it("accept on any other kind changes no record — resolution says the data is corrected by re-upload / re-run", async () => {
    const db = makeDb({ corrections: [{ ...OPEN, kind: "unsupported_statement", target_ref: "report:r1#valuation", proposed: {} }], app_users: [{ id: "u-founder", email: "f@x.io" }] });
    const r = await resolveCorrection(db as never, { id: CID, decision: "accept", note: null, adminId: "u-admin" }, deps);
    expect(r.ok).toBe(true);
    expect(updateProject).not.toHaveBeenCalled();
    if (r.ok) {
      expect(r.applied).toBe(false);
      expect(r.row.resolution).toContain("no value was overwritten");
    }
  });

  it("a failed updateProject is recorded honestly ('could NOT be written') and surfaces as a warning", async () => {
    const db = makeDb({ corrections: [OPEN], app_users: [] });
    const r = await resolveCorrection(db as never, { id: CID, decision: "accept", note: null, adminId: "u-admin" }, { ...deps, updateProject: async () => ({ ok: false, error: "Failed to update project" }) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.applied).toBe(false);
      expect(r.row.resolution).toContain("could NOT be written");
      expect(r.warnings[0]).toContain("Failed to update project");
    }
  });

  it("reject stores the note, touches no project, e-mails nobody", async () => {
    const db = makeDb({ corrections: [OPEN] });
    const r = await resolveCorrection(db as never, { id: CID, decision: "reject", note: "Evidence contradicts it.", adminId: "u-admin" }, deps);
    expect(r).toMatchObject({ ok: true, applied: false, change: null });
    expect(updateProject).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    const update = db.calls.find((c) => c.table === "corrections" && c.op === "update");
    expect(update?.args[0]).toMatchObject({ status: "rejected", resolution: "Evidence contradicts it." });
  });

  it("404 unknown · 409 already resolved", async () => {
    expect(await resolveCorrection(makeDb({ corrections: [] }) as never, { id: CID, decision: "accept", note: null, adminId: "a" }, deps)).toMatchObject({ ok: false, error: "not_found", status: 404 });
    expect(await resolveCorrection(makeDb({ corrections: [{ ...OPEN, status: "rejected" }] }) as never, { id: CID, decision: "accept", note: null, adminId: "a" }, deps)).toMatchObject({ ok: false, error: "not_open", status: 409 });
  });
});
