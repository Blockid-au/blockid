// email-queue (S-R5): queue stamp (no-op when sent / not migrated), and
// the sweep — oldest first, owner via projects.user_id, expiry, unretryable
// reasons clear the queue, transient failures stay queued, dry run.

import { describe, expect, it, vi } from "vitest";
import { queueReportEmail, sweepReportEmails, type EmailQueueDb } from "./email-queue";

type Row = Record<string, unknown>;

function makeDb(snapshots: Row[], projects: Row[] = [], opts: { missingColumn?: boolean } = {}) {
  const err = opts.missingColumn ? { message: 'column svi_snapshots.report_email_queued_at does not exist', code: "42703" } : null;
  const db: EmailQueueDb = {
    from: (table: string) => ({
      update: (patch: Row) => ({
        eq: (_c: string, id: string) => ({
          is: () => ({
            select: () => ({
              maybeSingle: async () => {
                if (err) return { data: null, error: err };
                const row = snapshots.find((s) => s.id === id && !s.report_email_sent_at);
                if (!row) return { data: null, error: null };
                Object.assign(row, patch);
                return { data: { id }, error: null };
              },
            }),
          }),
        }),
      }),
      select: () => ({
        not: () => ({
          is: () => ({
            order: () => ({
              limit: async (n: number) => {
                if (err) return { data: null, error: err };
                const rows = snapshots.filter((s) => s.report_email_queued_at && !s.report_email_sent_at).sort((a, b) => String(a.report_email_queued_at).localeCompare(String(b.report_email_queued_at)));
                return { data: rows.slice(0, n), error: null };
              },
            }),
          }),
        }),
        eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: (table === "projects" ? projects : snapshots).find((r) => r.id === id) ?? null, error: null }) }),
      }),
    }),
  };
  return db;
}

const NOW = new Date("2026-09-16T10:00:00Z");

describe("queueReportEmail", () => {
  it("stamps report_email_queued_at on an unsent snapshot; already sent / missing → not queued; missing column → not_migrated", async () => {
    const rows = [{ id: "s1", report_email_sent_at: null }, { id: "s2", report_email_sent_at: "2026-09-15T00:00:00Z" }];
    expect(await queueReportEmail(makeDb(rows), "s1", NOW)).toEqual({ queued: true });
    expect(rows[0].report_email_queued_at).toBe(NOW.toISOString());
    expect(await queueReportEmail(makeDb(rows), "s2", NOW)).toEqual({ queued: false, reason: "already_sent" });
    expect(await queueReportEmail(makeDb(rows), null, NOW)).toEqual({ queued: false, reason: "no_snapshot" });
    expect(await queueReportEmail(makeDb(rows, [], { missingColumn: true }), "s1", NOW)).toMatchObject({ queued: false, reason: "not_migrated" });
  });
});

describe("sweepReportEmails", () => {
  const projects = [{ id: "p1", user_id: "owner-1" }];

  it("sends queued snapshots oldest first through the sender with the owner from projects.user_id; unretryable reasons clear the queue; transient failures stay", async () => {
    const rows: Row[] = [
      { id: "s-new", project_id: "p1", analysis_json: { industry: "SaaS", stageLabel: "Seed" }, report_email_queued_at: "2026-09-16T09:00:00Z", report_email_sent_at: null },
      { id: "s-old", project_id: "p1", analysis_json: {}, report_email_queued_at: "2026-09-16T08:00:00Z", report_email_sent_at: null },
      { id: "s-noemail", project_id: "p1", analysis_json: {}, report_email_queued_at: "2026-09-16T08:30:00Z", report_email_sent_at: null },
      { id: "s-flaky", project_id: "p1", analysis_json: {}, report_email_queued_at: "2026-09-16T08:45:00Z", report_email_sent_at: null },
      { id: "s-sent", project_id: "p1", analysis_json: {}, report_email_queued_at: "2026-09-16T07:00:00Z", report_email_sent_at: "2026-09-16T07:05:00Z" },
    ];
    const sender = vi.fn(async (args: { snapshotId?: string | null }) => {
      if (args.snapshotId === "s-noemail") return { ok: false, reason: "no_email" };
      if (args.snapshotId === "s-flaky") return { ok: false, reason: "send_failed" };
      const row = rows.find((r) => r.id === args.snapshotId)!;
      row.report_email_sent_at = NOW.toISOString();
      return { ok: true, sentTo: "owner@x.test" };
    });
    const s = await sweepReportEmails(makeDb(rows, projects), {}, { sender: sender as never, now: () => NOW });
    expect(s.ok).toBe(true);
    expect(s.candidates).toBe(4);
    expect(sender.mock.calls.map((c) => c[0].snapshotId)).toEqual(["s-old", "s-noemail", "s-flaky", "s-new"]);
    expect(sender.mock.calls[0][0]).toMatchObject({ userId: "owner-1", projectId: "p1", snapshotId: "s-old", dimResults: {}, criterionResults: [] });
    expect(sender.mock.calls[3][0]).toMatchObject({ industry: "SaaS", stage: "Seed" });
    expect(s.sent).toEqual(["s-old", "s-new"]);
    expect(s.skipped).toEqual([{ id: "s-noemail", reason: "no_email" }]);
    expect(s.failed).toEqual([{ id: "s-flaky", reason: "send_failed" }]);
    expect(rows.find((r) => r.id === "s-noemail")!.report_email_queued_at).toBeNull();
    expect(rows.find((r) => r.id === "s-flaky")!.report_email_queued_at).toBe("2026-09-16T08:45:00Z");
  });

  it("expired (> 48 h) and owner-less snapshots are dropped from the queue; dry run sends nothing and clears nothing", async () => {
    const rows: Row[] = [
      { id: "s-expired", project_id: "p1", analysis_json: {}, report_email_queued_at: "2026-09-13T09:00:00Z", report_email_sent_at: null },
      { id: "s-orphan", project_id: null, analysis_json: {}, report_email_queued_at: "2026-09-16T09:00:00Z", report_email_sent_at: null },
      { id: "s-ok", project_id: "p1", analysis_json: {}, report_email_queued_at: "2026-09-16T09:30:00Z", report_email_sent_at: null },
    ];
    const sender = vi.fn(async () => ({ ok: true }));
    const dry = await sweepReportEmails(makeDb(rows, projects), { dryRun: true }, { sender: sender as never, now: () => NOW });
    expect(dry.dryRun).toBe(true);
    expect(sender).not.toHaveBeenCalled();
    expect(dry.skipped).toEqual([{ id: "s-expired", reason: "expired" }, { id: "s-orphan", reason: "no_owner" }, { id: "s-ok", reason: "dry_run" }]);
    expect(rows[0].report_email_queued_at).toBe("2026-09-13T09:00:00Z");
    const live = await sweepReportEmails(makeDb(rows, projects), {}, { sender: sender as never, now: () => NOW });
    expect(live.sent).toEqual(["s-ok"]);
    expect(rows[0].report_email_queued_at).toBeNull();
    expect(rows[1].report_email_queued_at).toBeNull();
  });

  it("not migrated → ok with error=not_migrated and no candidates; a thrown sender is a failed row, not a thrown sweep", async () => {
    const nm = await sweepReportEmails(makeDb([], [], { missingColumn: true }), {}, { sender: vi.fn() as never });
    expect(nm).toMatchObject({ ok: true, error: "not_migrated", candidates: 0 });
    const rows: Row[] = [{ id: "s1", project_id: "p1", analysis_json: {}, report_email_queued_at: "2026-09-16T09:00:00Z", report_email_sent_at: null }];
    const boom = vi.fn(async () => {
      throw new Error("smtp down");
    });
    const s = await sweepReportEmails(makeDb(rows, projects), {}, { sender: boom as never, now: () => NOW });
    expect(s.failed).toEqual([{ id: "s1", reason: "smtp down" }]);
  });
});
